import { interpolate } from "remotion";
import { hash01, type GlyphKind, type PlacedGlyph } from "./IconCrowd";

// The generic motion engine. Given a formation + data (unit, population, how
// much got through, status), it returns the exact on-screen placement of every
// glyph for a frame, plus the two live counts (active / stuck) and an optional
// gate to draw. Nothing here is topic-specific: the script layer picks the
// formation and unit per narration line, and this draws it the same way every
// time. All motion is a pure function of frame → deterministic on the CI runner.

export type Formation = "rush" | "queue" | "jam" | "field" | "scatter";

export interface CrowdColors {
  accent: string; // positive / in-flow color
  status: string; // status-driven color (normal=accent, warn, crit)
  dim: string; // idle / not-yet color
  critical: boolean;
}

export interface CrowdInput {
  formation: Formation;
  unit: GlyphKind;
  population: number;
  activeFraction: number; // 0..1 — share that got through / is active
  n?: number; // visible glyph count override
}

export interface CrowdGate {
  x: number;
  topH: number; // post heights around the opening
  botTop: number;
  cy: number;
  opening: number;
}

export interface CrowdResult {
  glyphs: PlacedGlyph[];
  gate?: CrowdGate;
  activeCount: number; // visible glyphs that got through / are active
  stuckCount: number; // visible glyphs waiting / idle / dropped
  scale: number; // real units per glyph
  stuckLabel: string; // chip label for the stuck count
  hub?: { x: number; y: number; size: number }; // scatter source node
}

// ---- shared geometry (screen px, 1920x1080 stage) --------------------------
const GATE_X = 1560;
const F_TOP = 452;
const F_BOT = 940;
const CY = (F_TOP + F_BOT) / 2;
const OPENING = 88;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) =>
  interpolate(x, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const laneH = (i: number) => hash01(i * 3.7); // 0 far/top .. 1 near/bottom
const laneY = (i: number) => F_TOP + (F_BOT - F_TOP) * laneH(i);
const laneScale = (i: number) => 0.72 + 0.42 * laneH(i);
const startX = (i: number) => -50 - hash01(i) * 300;

// ---- gate formations: rush (messy), jam (instant crush), queue (orderly) ---
const gateFormation = (
  input: CrowdInput,
  colors: CrowdColors,
  localFrame: number,
  frame: number,
  fps: number,
  opts: { instant: boolean; orderly: boolean; stuckLabel: string },
): CrowdResult => {
  const t = localFrame / fps;
  const n = input.n ?? 150;
  const scale = input.population / n;
  const af = clamp01(input.activeFraction);

  const transitStart = (i: number) => (opts.instant ? 0.02 * hash01(i) : 0.3 + (i / n) * 2.7);
  const reachGate = (i: number) => transitStart(i) + (opts.instant ? 0.5 : 1.3);

  const arrivedFrac = opts.instant ? smooth(0, 0.7, t) : smooth(0.3, 3.0, t);
  const arrived = Math.floor(n * arrivedFrac);
  const admitTarget = n * af;
  const admitted = Math.floor(admitTarget * smooth(opts.instant ? 0.6 : 1.4, opts.instant ? 3.2 : 5.6, t));
  const pass = Math.max(0, Math.min(arrived, admitted));
  const stuck = Math.max(0, arrived - pass);

  const L = 6; // queue lanes
  const glyphs: PlacedGlyph[] = [];
  for (let i = 0; i < n; i += 1) {
    const size = 28 * laneScale(i);
    let x: number;
    let y: number;
    let opacity = 1;
    let color = colors.accent;
    let glow = 0.55;

    if (i < pass) {
      // through the gate: drift in + fade (entered)
      const exitRank = pass - i;
      if (opts.orderly) {
        const lane = i % L;
        x = Math.min(GATE_X + 44 + exitRank * 12, 1880);
        y = CY + (lane - (L - 1) / 2) * 84;
      } else {
        x = Math.min(GATE_X + 44 + exitRank * 11, 1880);
        y = CY + (hash01(i * 5.1) - 0.5) * 72;
      }
      opacity = interpolate(exitRank, [0, 18], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      glow = 0.35;
    } else if (i < arrived) {
      // waiting
      const slot = i - pass;
      color = colors.status;
      glow = colors.critical ? 0.85 : 0.6;
      if (opts.orderly) {
        const lane = slot % L;
        const pos = Math.floor(slot / L);
        const jx = 2 * Math.sin(frame * 0.12 + i);
        x = GATE_X - 62 - pos * 44 + jx;
        y = CY + (lane - (L - 1) / 2) * 84;
      } else {
        const ROWS = 7;
        const col = Math.floor(slot / ROWS);
        const row = slot % ROWS;
        const jx = 7 * Math.sin(frame * 0.26 + i * 1.3);
        const jy = 7 * Math.cos(frame * 0.22 + i * 0.9);
        x = GATE_X - 46 - col * 29 + jx;
        y = CY + (row - (ROWS - 1) / 2) * 58 + jy;
      }
    } else if (!opts.orderly && t >= transitStart(i)) {
      // streaming toward the gate (rush/jam only)
      const p = smooth(transitStart(i), reachGate(i), t);
      x = interpolate(p, [0, 1], [startX(i), GATE_X - 70]);
      const funnel = smooth(0.55, 1, p);
      y = interpolate(funnel, [0, 1], [laneY(i), CY + (hash01(i * 2.3) - 0.5) * OPENING * 1.6]);
      opacity = smooth(0, 0.12, p);
    } else {
      continue; // not on the field yet
    }

    glyphs.push({ key: i, kind: input.unit, x, y, size, color, opacity, glow });
  }
  glyphs.sort((a, b) => a.y - b.y);

  return {
    glyphs,
    gate: { x: GATE_X, topH: CY - OPENING - (F_TOP - 30), botTop: CY + OPENING, cy: CY, opening: OPENING },
    activeCount: pass,
    stuckCount: stuck,
    scale,
    stuckLabel: opts.stuckLabel,
  };
};

// ---- field: units fill a grid/lot; a fraction is lit/active ----------------
const fieldFormation = (input: CrowdInput, colors: CrowdColors, localFrame: number, frame: number, fps: number): CrowdResult => {
  const t = localFrame / fps;
  const COLS = 20;
  const ROWS = 12;
  const total = COLS * ROWS;
  const scale = input.population / total;
  const af = clamp01(input.activeFraction);
  const litTarget = Math.round(total * af);
  const lit = Math.round(litTarget * smooth(0.3, 2.6, t));

  const gx0 = 884;
  const gx1 = 1800;
  const gy0 = 474;
  const gy1 = 922;

  const glyphs: PlacedGlyph[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const idx = r * COLS + c;
      const depth = r / (ROWS - 1);
      const size = 20 + 12 * depth;
      const x = interpolate(c, [0, COLS - 1], [gx0, gx1]);
      const y = interpolate(r, [0, ROWS - 1], [gy0, gy1]);
      const isLit = idx < lit;
      const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.07 + idx * 0.6);
      glyphs.push({
        key: idx,
        kind: input.unit,
        x,
        y,
        size,
        color: isLit ? colors.status : colors.dim,
        opacity: isLit ? 0.6 + 0.4 * twinkle : 0.2,
        glow: isLit ? 0.5 : 0,
      });
    }
  }
  return { glyphs, activeCount: lit, stuckCount: total - lit, scale, stuckLabel: "idle" };
};

// ---- scatter: units fan out from a central hub -----------------------------
const scatterFormation = (input: CrowdInput, colors: CrowdColors, localFrame: number, frame: number, fps: number): CrowdResult => {
  const t = localFrame / fps;
  const n = input.n ?? 140;
  const scale = input.population / n;
  const af = clamp01(input.activeFraction);
  const cx = 1310;
  const GOLDEN = 2.399963229;

  const thr = smooth(0.4, 4.8, t) * af; // share flown out so far
  const reached = Math.floor(n * thr);

  const glyphs: PlacedGlyph[] = [];
  for (let i = 0; i < n; i += 1) {
    const ang = i * GOLDEN;
    const out = i / n < thr;
    const indiv = out ? smooth(i / n, i / n + 0.14, thr) : 0;
    const rad = (60 + 540 * (0.72 + 0.28 * hash01(i * 1.7))) * indiv;
    const x = cx + Math.cos(ang) * rad * 1.7;
    const y = CY + Math.sin(ang) * rad + 6 * Math.sin(frame * 0.05 + i);
    glyphs.push({
      key: i,
      kind: input.unit,
      x,
      y,
      size: 24 * (0.82 + 0.4 * hash01(i)),
      color: out ? colors.accent : colors.dim,
      opacity: out ? interpolate(indiv, [0, 0.2], [0.2, 1], { extrapolateRight: "clamp" }) : 0.35,
      glow: out ? 0.6 : 0.15,
    });
  }
  glyphs.sort((a, b) => a.y - b.y);
  return {
    glyphs,
    activeCount: reached,
    stuckCount: n - reached,
    scale,
    stuckLabel: "dropped",
    hub: { x: cx, y: CY, size: 74 },
  };
};

export const computeCrowd = (
  input: CrowdInput,
  colors: CrowdColors,
  localFrame: number,
  frame: number,
  fps: number,
): CrowdResult => {
  switch (input.formation) {
    case "jam":
      return gateFormation(input, colors, localFrame, frame, fps, { instant: true, orderly: false, stuckLabel: "stuck at gate" });
    case "queue":
      return gateFormation(input, colors, localFrame, frame, fps, { instant: false, orderly: true, stuckLabel: "waiting" });
    case "field":
      return fieldFormation(input, colors, localFrame, frame, fps);
    case "scatter":
      return scatterFormation(input, colors, localFrame, frame, fps);
    case "rush":
    default:
      return gateFormation(input, colors, localFrame, frame, fps, { instant: false, orderly: false, stuckLabel: "stuck at gate" });
  }
};
