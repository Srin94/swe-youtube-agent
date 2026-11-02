import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ARCHITECT_PAPER } from "../styles/themes";
import { GlyphField, hash01, type PlacedGlyph } from "./IconCrowd";

// PROOF-OF-LOOK: one narration beat rendered literally. The line is
// "100,000 fans rush one entrance; without crowd control, the jam — nobody gets
// to their seat." We draw 150 person-glyphs (each ≈ 667 real fans) streaming to
// a single gate. The gate drains slowly (no crowd control), so the backlog
// physically piles into a growing red crush while the "inside" counter crawls.
// All motion is a pure function of frame → deterministic on the CI runner.

const theme = ARCHITECT_PAPER;

const N = 150; // visible glyphs
const POP = 100_000;
const SCALE = POP / N; // real fans per glyph

// field geometry (screen px)
const FIELD_TOP = 392;
const FIELD_BOTTOM = 956;
const GATE_X = 1484;
const GATE_CY = (FIELD_TOP + FIELD_BOTTOM) / 2;
const OPENING = 84; // half-height of the gate opening

// timeline (seconds)
const ARRIVE_START = 0.3;
const ARRIVE_WINDOW = 2.7; // all glyphs enter within this
const T_TRAVEL = 1.3; // time to cross from start to gate
const GATE_OPEN = 1.5; // gate starts admitting here
const GATE_RATE = 4; // glyphs/sec the single gate can admit (the bottleneck)

const lane = (i: number) => hash01(i * 3.7); // 0 (far/top) .. 1 (near/bottom)
const laneY = (i: number) => interpolate(lane(i), [0, 1], [FIELD_TOP, FIELD_BOTTOM]);
const laneScale = (i: number) => interpolate(lane(i), [0, 1], [0.72, 1.14]);
const startX = (i: number) => -50 - hash01(i) * 300;
const transitStart = (i: number) => ARRIVE_START + (i / N) * ARRIVE_WINDOW;
const reachGate = (i: number) => transitStart(i) + T_TRAVEL;

// how many have ARRIVED at the gate by time t (reachGate is monotonic in i)
const arrivedCount = (t: number) =>
  Math.max(0, Math.min(N, Math.floor(((t - ARRIVE_START - T_TRAVEL) / ARRIVE_WINDOW) * N) + 1));

// how many the gate has ADMITTED by time t. The gate is always backlogged once
// the rush hits, so it simply drains at GATE_RATE and never banks idle capacity.
const admitted = (t: number) => Math.max(0, GATE_RATE * (t - GATE_OPEN));

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const smooth = (a: number, b: number, x: number) =>
  interpolate(x, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const IconCrowdDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  const A = arrivedCount(t);
  const passCount = Math.max(0, Math.min(A, Math.floor(admitted(t))));
  const stuckVisible = A - passCount;

  const insideReal = passCount * SCALE;
  const stuckReal = stuckVisible * SCALE;
  const status: "normal" | "warning" | "critical" =
    stuckReal > 15000 ? "critical" : stuckReal > 4000 ? "warning" : "normal";
  const statusColor =
    status === "critical" ? theme.accentCritical : status === "warning" ? "#F2B84B" : theme.accentPrimary;

  // headline crossfades to "the jam" as the backlog grows (driven by the crush
  // itself, not an arbitrary clock).
  const phase2 = smooth(8000, 22000, stuckReal);

  // --- place every glyph for this frame ------------------------------------
  const glyphs: PlacedGlyph[] = [];
  for (let i = 0; i < N; i += 1) {
    const size = 30 * laneScale(i);
    let x: number;
    let y: number;
    let opacity = 1;
    let color = theme.accentPrimary;
    let glow = 0.55;

    if (i < passCount) {
      // ADMITTED: walked through the gate, drifting into the stadium + fading.
      const exitRank = passCount - i; // 1 = just passed
      x = Math.min(GATE_X + 46 + exitRank * 11, 1890);
      y = GATE_CY + (hash01(i * 5.1) - 0.5) * 70;
      opacity = interpolate(exitRank, [0, 18], [1, 0], { extrapolateRight: "clamp" });
      glow = 0.35;
    } else if (i < A) {
      // STUCK: pressed into the jam just left of the gate, jittering under load.
      const slot = i - passCount; // 0 = front of the crush
      const ROWS = 7;
      const col = Math.floor(slot / ROWS);
      const row = slot % ROWS;
      const jx = 7 * Math.sin(frame * 0.26 + i * 1.3);
      const jy = 7 * Math.cos(frame * 0.22 + i * 0.9);
      x = GATE_X - 46 - col * 29 + jx;
      y = GATE_CY + (row - (ROWS - 1) / 2) * 58 + jy;
      color = statusColor;
      glow = status === "critical" ? 0.85 : 0.6;
    } else {
      // IN TRANSIT: streaming rightward toward the gate, funneling to the opening.
      if (t < transitStart(i)) {
        continue; // not on the field yet
      }
      const p = smooth(transitStart(i), reachGate(i), t);
      x = interpolate(p, [0, 1], [startX(i), GATE_X - 70]);
      const funnel = smooth(0.55, 1, p);
      y = interpolate(funnel, [0, 1], [laneY(i), GATE_CY + (hash01(i * 2.3) - 0.5) * OPENING * 1.6]);
      opacity = smooth(0, 0.12, p); // fade in as it enters frame
    }

    glyphs.push({ key: i, kind: "person", x, y, size, color, opacity, glow });
  }
  // paint far (top) first so near (bottom) glyphs overlap them
  glyphs.sort((a, b) => a.y - b.y);

  // --- chrome ---------------------------------------------------------------
  const headIn = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  // subtle perspective floor for depth
  const floor = (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 640,
        width: 2200,
        height: 1100,
        transform: "translateX(-50%) perspective(1200px) rotateX(62deg)",
        transformOrigin: "top center",
        backgroundImage: `linear-gradient(${theme.gridColor}80 1px, transparent 1px), linear-gradient(90deg, ${theme.gridColor}80 1px, transparent 1px)`,
        backgroundSize: "70px 70px",
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 70%)",
        pointerEvents: "none",
      }}
    />
  );

  // crush glow backdrop that intensifies with the jam
  const crushGlow = smooth(4000, 40000, stuckReal);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.canvasBg, fontFamily: theme.fontHeading, color: theme.textPrimary, overflow: "hidden" }}>
      {/* dot grid + accent wash */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${theme.gridColor} 1.5px, transparent 1.5px)`, backgroundSize: "26px 26px" }} />
      <div style={{ position: "absolute", left: "30%", top: "30%", width: 900, height: 900, transform: "translate(-50%,-50%)", background: `radial-gradient(circle, ${statusColor}14, transparent 62%)` }} />
      {floor}

      {/* crush glow at the gate */}
      <div style={{ position: "absolute", left: GATE_X - 240, top: GATE_CY - 260, width: 480, height: 520, background: `radial-gradient(circle, ${statusColor}${Math.round(crushGlow * 40).toString(16).padStart(2, "0")}, transparent 66%)`, pointerEvents: "none" }} />

      {/* the crowd */}
      <GlyphField glyphs={glyphs} />

      {/* the gate: two glowing posts with the opening + label */}
      {[-1, 1].map((s) => (
        <div
          key={s}
          style={{
            position: "absolute",
            left: GATE_X - 7,
            top: s < 0 ? FIELD_TOP - 30 : GATE_CY + OPENING,
            width: 14,
            height: s < 0 ? GATE_CY - OPENING - (FIELD_TOP - 30) : FIELD_BOTTOM + 30 - (GATE_CY + OPENING),
            background: statusColor,
            borderRadius: 7,
            boxShadow: `0 0 26px ${statusColor}`,
          }}
        />
      ))}
      <div style={{ position: "absolute", left: GATE_X - 92, top: FIELD_TOP - 78, width: 200, textAlign: "center", fontFamily: theme.fontMono, fontSize: 24, letterSpacing: 4, fontWeight: 700, color: statusColor }}>
        ENTRANCE
      </div>
      {/* admit beam through the opening (thin — one gate's worth of throughput) */}
      <div
        style={{
          position: "absolute",
          left: GATE_X,
          top: GATE_CY - 10,
          width: 200,
          height: 20,
          background: `linear-gradient(90deg, ${theme.accentPrimary}55, transparent)`,
          filter: "blur(3px)",
          pointerEvents: "none",
        }}
      />

      {/* wordmark */}
      <div style={{ position: "absolute", top: 58, left: 108, fontFamily: theme.fontMono, fontSize: 22, letterSpacing: 7, fontWeight: 700, color: theme.textMuted }}>
        BLAST RADIUS
      </div>

      {/* mono kicker */}
      <div style={{ position: "absolute", top: 150, left: 110, fontFamily: theme.fontMono, fontSize: 28, color: theme.textMuted }}>
        {"// 100,000 arrive  ·  "}
        <b style={{ color: statusColor, fontWeight: 700 }}>1 gate</b>
      </div>

      {/* headline — swaps to "the jam" as the crush builds */}
      <div style={{ position: "absolute", top: 196, left: 108, fontSize: 104, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, maxWidth: 1160, opacity: headIn, transform: `translateY(${interpolate(headIn, [0, 1], [18, 0])}px)` }}>
        <div style={{ position: "relative", height: 206 }}>
          <div style={{ position: "absolute", opacity: 1 - phase2 }}>
            <div style={{ color: theme.textPrimary }}>100,000 fans,</div>
            <div style={{ color: theme.accentPrimary }}>one entrance</div>
          </div>
          <div style={{ position: "absolute", opacity: phase2 }}>
            <div style={{ color: theme.textPrimary }}>no crowd control —</div>
            <div style={{ color: theme.accentCritical }}>the jam</div>
          </div>
        </div>
      </div>

      {/* live pill: inside / total */}
      <div style={{ position: "absolute", top: 150, right: 110, display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 30px", borderRadius: 16, background: "rgba(18,21,30,0.72)", border: theme.borderStyle, fontFamily: theme.fontMono, fontSize: 34, fontWeight: 600, boxShadow: `0 0 34px ${theme.accentPrimary}22` }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: theme.accentPrimary, boxShadow: `0 0 16px ${theme.accentPrimary}` }} />
        inside <b style={{ marginLeft: 4 }}>{fmt(insideReal)}</b>
        <span style={{ color: theme.textMuted }}>/ {fmt(POP)}</span>
      </div>

      {/* stuck-at-gate chip: grows + reddens as the jam builds */}
      <div
        style={{
          position: "absolute",
          top: 232,
          right: 110,
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 22px",
          borderRadius: 14,
          background: "rgba(18,21,30,0.72)",
          border: `1px solid ${statusColor}66`,
          fontFamily: theme.fontMono,
          fontSize: 26,
          fontWeight: 600,
          color: statusColor,
          opacity: smooth(300, 2000, stuckReal),
          boxShadow: status === "critical" ? `0 0 30px ${statusColor}44` : "none",
        }}
      >
        <span style={{ width: 13, height: 13, borderRadius: 7, background: statusColor, boxShadow: `0 0 14px ${statusColor}` }} />
        stuck at gate <b style={{ marginLeft: 2 }}>{fmt(stuckReal)}</b>
      </div>

      {/* story beat */}
      <div style={{ position: "absolute", left: 110, bottom: 84, fontFamily: theme.fontMono, fontSize: 30, color: "#C8D0DE", background: "rgba(18,21,30,0.6)", border: theme.borderStyle, padding: "16px 26px", borderRadius: 14, display: "inline-flex", alignItems: "center", gap: 16, maxWidth: 1160 }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: statusColor, boxShadow: `0 0 12px ${statusColor}`, flex: "0 0 auto" }} />
        {stuckReal > 15000
          ? "One gate can't drain the surge — the crush builds and nobody gets to their seat."
          : "100,000 fans hit one entrance at once, faster than it can let them in."}
      </div>

      {/* vignette + progress */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(130% 120% at 50% 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.70) 100%)" }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${progress * 100}%`, background: statusColor, boxShadow: `0 0 14px ${statusColor}` }} />
    </AbsoluteFill>
  );
};
