import React from "react";
import { interpolate, spring } from "remotion";
import type { Theme } from "../styles/themes";

// A persistent CSS faux-3D "living world": an isometric crowd of glowing units
// (the scenario's mass actor) on a dark stage, with a 2-line headline, a mono
// kicker, a live count-up pill, the scenario-actor rail, and the story beat.
//
// Pure DOM/CSS so it renders deterministically in headless Chromium on the free
// CI runner — no WebGL. All motion is a pure function of `frame`/`localFrame`
// (never Math.random at render time), so every frame is reproducible.

export type WorldStatus = "normal" | "warning" | "critical";

export interface WorldActor {
  name: string;
  role: string;
}

export interface ScenarioWorldProps {
  theme: Theme;
  frame: number; // global frame — drives the slow continuous camera drift
  localFrame: number; // frames since this beat started — drives enters/count-ups
  fps: number;
  channelName: string;
  sectionLabel: string; // e.g. "the setup"
  sectionValue?: string; // e.g. "flash sale, 12:00 PM"
  headlineLines: [string, string];
  accentLine?: 0 | 1; // which headline line gets the accent color (default 1)
  population: number; // size of the crowd metric (e.g. 42000)
  onlineFraction: number; // 0..1 of the crowd currently "online"/lit
  status: WorldStatus;
  pillPrefix?: string; // e.g. "online"
  actors: WorldActor[];
  beatText?: string;
  progress?: number; // 0..1 bottom progress bar
  selfContained?: boolean; // render own bg/vignette (standalone) vs overlay-only
}

const COLS = 22;
const ROWS = 12;
const CELL_COUNT = COLS * ROWS;

// Deterministic per-index hash in [0,1) — a stable stand-in for Math.random that
// is safe to call during render (same input -> same output every frame).
const hash = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const statusColor = (theme: Theme, status: WorldStatus): string =>
  status === "critical"
    ? theme.accentCritical
    : status === "warning"
      ? theme.accentSecondary
      : theme.accentPrimary;

export const ScenarioWorld: React.FC<ScenarioWorldProps> = ({
  theme,
  frame,
  localFrame,
  fps,
  channelName,
  sectionLabel,
  sectionValue,
  headlineLines,
  accentLine = 1,
  population,
  onlineFraction,
  status,
  pillPrefix = "online",
  actors,
  beatText,
  progress = 0,
  selfContained = true,
}) => {
  const accent = statusColor(theme, status);

  // --- camera: slow continuous drift + a per-beat enter move ---------------
  const enter = interpolate(localFrame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftZ = -42 + 2.4 * Math.sin(frame * 0.011);
  const driftScale = 1 + 0.015 * Math.sin(frame * 0.007);
  const enterScale = interpolate(enter, [0, 1], [0.94, 1]);
  const enterY = interpolate(enter, [0, 1], [46, 0]);
  const planeTransform = `rotateX(59deg) rotateZ(${driftZ}deg) scale(${driftScale * enterScale})`;

  // --- headline + kicker enters --------------------------------------------
  const headIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 120 } });
  const kickIn = interpolate(localFrame, [2, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // --- live count-up pill ---------------------------------------------------
  const onlineTarget = Math.round(population * onlineFraction);
  const online = Math.round(
    interpolate(localFrame, [8, 46], [population, onlineTarget], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const fmt = (n: number) => n.toLocaleString("en-US");

  // How many crowd cells are lit (the rest go dark — "switched off").
  const litCount = Math.round(CELL_COUNT * onlineFraction);

  // --- crowd cells (deterministic brightness + per-cell twinkle) ------------
  const cells = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const h = hash(i);
    const lit = i < litCount || onlineFraction >= 1;
    // Subtle, deterministic shimmer so the world feels alive.
    const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.08 + i * 0.7);
    const base = h < 0.12 ? 0.18 : h < 0.3 ? 0.36 : 0.62;
    const g = lit ? base * (0.72 + 0.28 * twinkle) : 0.06;
    const fillA = lit ? (h < 0.3 ? 0.08 : 0.16) : 0.02;
    cells.push(
      <div
        key={i}
        style={{
          width: 50,
          height: 34,
          borderRadius: 7,
          border: "1px solid",
          borderColor: lit
            ? `${accent}${Math.round(g * 255).toString(16).padStart(2, "0")}`
            : "rgba(120,130,150,0.12)",
          background: lit ? `${accent}${Math.round(fillA * 255).toString(16).padStart(2, "0")}` : "rgba(120,130,150,0.03)",
          boxShadow: lit ? `0 0 10px ${accent}${Math.round(g * 0.8 * 255).toString(16).padStart(2, "0")}` : "none",
        }}
      />,
    );
  }

  const actorColors = [theme.accentPrimary, theme.accentSecondary, theme.textPrimary, theme.accentCritical];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: theme.fontHeading, color: theme.textPrimary }}>
      {selfContained ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: theme.canvasBg,
              backgroundImage: `radial-gradient(${theme.gridColor} 1.5px, transparent 1.5px)`,
              backgroundSize: "26px 26px",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "18%",
              top: "26%",
              width: 760,
              height: 760,
              transform: "translate(-50%,-50%)",
              background: `radial-gradient(circle, ${accent}14, transparent 62%)`,
            }}
          />
        </>
      ) : null}

      {/* Isometric crowd stage */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 430,
          bottom: -120,
          perspective: 1700,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          transform: `translateY(${enterY}px)`,
          opacity: enter,
        }}
      >
        <div style={{ position: "relative", marginTop: 40 }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 1500,
              height: 1050,
              transform: "translate(-50%,-50%)",
              filter: "blur(48px)",
              background: `radial-gradient(ellipse at center, ${accent}33, transparent 60%)`,
            }}
          />
          <div style={{ transform: planeTransform, transformStyle: "preserve-3d" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 50px)`, gap: 12 }}>
              {cells}
            </div>
          </div>
        </div>
      </div>

      {/* Depth fade: the far (upper) edge of the plane dissolves into the bg. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 400,
          height: 260,
          background: `linear-gradient(to bottom, ${theme.canvasBg} 10%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Wordmark */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 110,
          fontFamily: theme.fontMono,
          fontSize: 22,
          letterSpacing: 7,
          fontWeight: 700,
          color: theme.textMuted,
        }}
      >
        {channelName.toUpperCase()}
      </div>

      {/* Mono kicker */}
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 110,
          fontFamily: theme.fontMono,
          fontSize: 28,
          color: theme.textMuted,
          opacity: kickIn,
        }}
      >
        {"// "}
        {sectionLabel}
        {sectionValue ? (
          <>
            {"  ·  "}
            <b style={{ color: accent, fontWeight: 700 }}>{sectionValue}</b>
          </>
        ) : null}
      </div>

      {/* 2-line headline, last line accented */}
      <div
        style={{
          position: "absolute",
          top: 196,
          left: 108,
          fontSize: 104,
          fontWeight: 800,
          lineHeight: 0.98,
          letterSpacing: -2,
          maxWidth: 1180,
          opacity: headIn,
          transform: `translateY(${interpolate(headIn, [0, 1], [18, 0])}px)`,
        }}
      >
        <div style={{ color: accentLine === 0 ? accent : theme.textPrimary }}>{headlineLines[0]}</div>
        <div style={{ color: accentLine === 1 ? accent : theme.textPrimary }}>{headlineLines[1]}</div>
      </div>

      {/* Live count-up pill */}
      <div
        style={{
          position: "absolute",
          top: 150,
          right: 110,
          display: "inline-flex",
          alignItems: "center",
          gap: 16,
          padding: "18px 30px",
          borderRadius: 16,
          background: "rgba(18,21,30,0.72)",
          border: theme.borderStyle,
          fontFamily: theme.fontMono,
          fontSize: 34,
          fontWeight: 600,
          boxShadow: `0 0 34px ${accent}26`,
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 8, background: accent, boxShadow: `0 0 16px ${accent}` }} />
        {pillPrefix} <b style={{ marginLeft: 6 }}>{fmt(online)}</b>
        <span style={{ color: theme.textMuted }}>/ {fmt(population)}</span>
      </div>

      {/* Scenario-actor rail */}
      <div style={{ position: "absolute", right: 110, top: 470, display: "flex", flexDirection: "column", gap: 24 }}>
        {actors.slice(0, 4).map((a, idx) => {
          const c = actorColors[idx % actorColors.length];
          const rowIn = interpolate(localFrame, [10 + idx * 4, 24 + idx * 4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={a.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 22px",
                background: "rgba(18,21,30,0.68)",
                border: theme.borderStyle,
                borderRadius: 14,
                minWidth: 360,
                opacity: rowIn,
                transform: `translateX(${interpolate(rowIn, [0, 1], [24, 0])}px)`,
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 8, background: c, boxShadow: `0 0 14px ${c}`, flex: "0 0 auto" }} />
              <div>
                <div style={{ fontFamily: theme.fontMono, fontSize: 26, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 21, color: theme.textMuted, marginTop: 2 }}>{a.role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Story beat */}
      {beatText ? (
        <div
          style={{
            position: "absolute",
            left: 110,
            bottom: 84,
            fontFamily: theme.fontMono,
            fontSize: 30,
            color: "#C8D0DE",
            background: "rgba(18,21,30,0.6)",
            border: theme.borderStyle,
            padding: "16px 26px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            maxWidth: 1180,
            opacity: interpolate(localFrame, [16, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 12px ${accent}`, flex: "0 0 auto" }} />
          {beatText}
        </div>
      ) : null}

      {selfContained ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "radial-gradient(130% 120% at 50% 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.70) 100%)",
            }}
          />
          <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${progress * 100}%`, background: accent, boxShadow: `0 0 14px ${accent}` }} />
        </>
      ) : null}
    </div>
  );
};
