import React from "react";
import { interpolate, spring } from "remotion";
import type { Theme } from "../styles/themes";
import { Glyph, GlyphField, type GlyphKind } from "./IconCrowd";
import { computeCrowd, type CrowdColors, type Formation } from "./crowdFormations";

// The generic, data-driven "living world" scene. It draws whatever the script
// chose for this narration line — a unit glyph + a formation + live counts —
// with the shared chrome (wordmark, kicker, headline, pill, stuck chip, actor
// rail, story beat). Nothing topic-specific lives here; all of that arrives as
// props from the render payload. This replaces the abstract tile-grid world.

export interface IconWorldActor {
  name: string;
  role: string;
}

export interface IconWorldProps {
  theme: Theme;
  frame: number; // global frame (ambient jitter / twinkle)
  localFrame: number; // frames since this beat started (enters / count-ups)
  fps: number;
  channelName: string;
  sectionLabel: string;
  sectionValue?: string;
  headlineLines: [string, string];
  accentLine?: 0 | 1;
  unit: GlyphKind;
  formation: Formation;
  population: number;
  activeFraction: number;
  status: "normal" | "warning" | "critical";
  metricPrefix: string; // pill prefix, e.g. "inside" / "parked" / "active"
  gateLabel?: string;
  actors: IconWorldActor[];
  beatText?: string;
  progress?: number;
  selfContained?: boolean;
}

const statusColor = (theme: Theme, status: IconWorldProps["status"]): string =>
  status === "critical" ? theme.accentCritical : status === "warning" ? "#F2B84B" : theme.accentPrimary;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const smooth = (a: number, b: number, x: number) =>
  interpolate(x, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const IconWorld: React.FC<IconWorldProps> = ({
  theme,
  frame,
  localFrame,
  fps,
  channelName,
  sectionLabel,
  sectionValue,
  headlineLines,
  accentLine = 1,
  unit,
  formation,
  population,
  activeFraction,
  status,
  metricPrefix,
  gateLabel,
  actors,
  beatText,
  progress = 0,
  selfContained = true,
}) => {
  const accent = statusColor(theme, status);
  const colors: CrowdColors = {
    accent: theme.accentPrimary,
    status: accent,
    dim: theme.textMuted,
    critical: status === "critical",
  };

  const crowd = computeCrowd({ formation, unit, population, activeFraction }, colors, localFrame, frame, fps);
  const activeReal = crowd.activeCount * crowd.scale;
  const stuckReal = crowd.stuckCount * crowd.scale;

  const headIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 120 } });
  const kickIn = smooth(2 / fps, 16 / fps, localFrame / fps);
  const crushGlow = smooth(0.04, 0.4, crowd.stuckCount / Math.max(1, crowd.activeCount + crowd.stuckCount));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: theme.fontHeading, color: theme.textPrimary }}>
      {selfContained ? (
        <>
          <div style={{ position: "absolute", inset: 0, backgroundColor: theme.canvasBg, backgroundImage: `radial-gradient(${theme.gridColor} 1.5px, transparent 1.5px)`, backgroundSize: "26px 26px" }} />
          <div style={{ position: "absolute", left: "30%", top: "30%", width: 900, height: 900, transform: "translate(-50%,-50%)", background: `radial-gradient(circle, ${accent}14, transparent 62%)` }} />
        </>
      ) : null}

      {/* perspective floor for depth */}
      <div
        style={{
          position: "absolute",
          left: "56%",
          top: 648,
          width: 2200,
          height: 1100,
          transform: "translateX(-50%) perspective(1200px) rotateX(62deg)",
          transformOrigin: "top center",
          backgroundImage: `linear-gradient(${theme.gridColor}80 1px, transparent 1px), linear-gradient(90deg, ${theme.gridColor}80 1px, transparent 1px)`,
          backgroundSize: "70px 70px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* crush / load glow */}
      {crowd.gate ? (
        <div style={{ position: "absolute", left: crowd.gate.x - 280, top: crowd.gate.cy - 270, width: 520, height: 540, background: `radial-gradient(circle, ${accent}${Math.round(crushGlow * 40).toString(16).padStart(2, "0")}, transparent 66%)`, pointerEvents: "none" }} />
      ) : null}

      {/* scatter hub */}
      {crowd.hub ? (
        <div style={{ position: "absolute", left: crowd.hub.x, top: crowd.hub.y, transform: "translate(-50%,-50%)", filter: `drop-shadow(0 0 20px ${accent})` }}>
          <Glyph kind="server" size={crowd.hub.size} color={accent} glow={1} />
        </div>
      ) : null}

      {/* the crowd */}
      <GlyphField glyphs={crowd.glyphs} />

      {/* gate posts + label */}
      {crowd.gate ? (
        <>
          <div style={{ position: "absolute", left: crowd.gate.x - 7, top: F_TOP_POST, width: 14, height: crowd.gate.cy - crowd.gate.opening - F_TOP_POST, background: accent, borderRadius: 7, boxShadow: `0 0 26px ${accent}` }} />
          <div style={{ position: "absolute", left: crowd.gate.x - 7, top: crowd.gate.botTop, width: 14, height: F_BOT_POST - crowd.gate.botTop, background: accent, borderRadius: 7, boxShadow: `0 0 26px ${accent}` }} />
          <div style={{ position: "absolute", left: crowd.gate.x - 110, top: 374, width: 236, textAlign: "center", fontFamily: theme.fontMono, fontSize: 24, letterSpacing: 4, fontWeight: 700, color: accent }}>
            {(gateLabel || "GATE").toUpperCase()}
          </div>
          <div style={{ position: "absolute", left: crowd.gate.x, top: crowd.gate.cy - 10, width: 200, height: 20, background: `linear-gradient(90deg, ${theme.accentPrimary}55, transparent)`, filter: "blur(3px)", pointerEvents: "none" }} />
        </>
      ) : null}

      {/* wordmark */}
      <div style={{ position: "absolute", top: 58, left: 108, fontFamily: theme.fontMono, fontSize: 22, letterSpacing: 7, fontWeight: 700, color: theme.textMuted }}>
        {channelName.toUpperCase()}
      </div>

      {/* kicker */}
      <div style={{ position: "absolute", top: 150, left: 110, fontFamily: theme.fontMono, fontSize: 28, color: theme.textMuted, opacity: kickIn }}>
        {"// "}
        {sectionLabel}
        {sectionValue ? (
          <>
            {"  ·  "}
            <b style={{ color: accent, fontWeight: 700 }}>{sectionValue}</b>
          </>
        ) : null}
      </div>

      {/* headline */}
      <div style={{ position: "absolute", top: 196, left: 108, fontSize: 100, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, maxWidth: 1080, opacity: headIn, transform: `translateY(${interpolate(headIn, [0, 1], [18, 0])}px)` }}>
        <div style={{ color: accentLine === 0 ? accent : theme.textPrimary }}>{headlineLines[0]}</div>
        <div style={{ color: accentLine === 1 ? accent : theme.textPrimary }}>{headlineLines[1]}</div>
      </div>

      {/* live pill */}
      <div style={{ position: "absolute", top: 150, right: 110, display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 30px", borderRadius: 16, background: "rgba(18,21,30,0.72)", border: theme.borderStyle, fontFamily: theme.fontMono, fontSize: 34, fontWeight: 600, boxShadow: `0 0 34px ${theme.accentPrimary}22` }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: theme.accentPrimary, boxShadow: `0 0 16px ${theme.accentPrimary}` }} />
        {metricPrefix} <b style={{ marginLeft: 4 }}>{fmt(activeReal)}</b>
        <span style={{ color: theme.textMuted }}>/ {fmt(population)}</span>
      </div>

      {/* stuck / idle / dropped chip */}
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
          border: `1px solid ${accent}66`,
          fontFamily: theme.fontMono,
          fontSize: 26,
          fontWeight: 600,
          color: accent,
          opacity: smooth(0.01, 0.05, crowd.stuckCount / Math.max(1, crowd.activeCount + crowd.stuckCount)),
          boxShadow: status === "critical" ? `0 0 30px ${accent}44` : "none",
        }}
      >
        <span style={{ width: 13, height: 13, borderRadius: 7, background: accent, boxShadow: `0 0 14px ${accent}` }} />
        {crowd.stuckLabel} <b style={{ marginLeft: 2 }}>{fmt(stuckReal)}</b>
      </div>

      {/* actor rail */}
      <div style={{ position: "absolute", left: 110, top: 470, display: "flex", flexDirection: "column", gap: 20 }}>
        {actors.slice(0, 3).map((a, idx) => {
          const c = [theme.accentPrimary, theme.accentSecondary, theme.textPrimary][idx % 3];
          const rowIn = smooth((10 + idx * 4) / fps, (24 + idx * 4) / fps, localFrame / fps);
          return (
            <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: "rgba(18,21,30,0.68)", border: theme.borderStyle, borderRadius: 14, minWidth: 320, maxWidth: 420, opacity: rowIn, transform: `translateX(${interpolate(rowIn, [0, 1], [-24, 0])}px)` }}>
              <span style={{ width: 15, height: 15, borderRadius: 8, background: c, boxShadow: `0 0 14px ${c}`, flex: "0 0 auto" }} />
              <div>
                <div style={{ fontFamily: theme.fontMono, fontSize: 24, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 19, color: theme.textMuted, marginTop: 2 }}>{a.role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* story beat */}
      {beatText ? (
        <div style={{ position: "absolute", left: 110, bottom: 84, fontFamily: theme.fontMono, fontSize: 30, color: "#C8D0DE", background: "rgba(18,21,30,0.6)", border: theme.borderStyle, padding: "16px 26px", borderRadius: 14, display: "inline-flex", alignItems: "center", gap: 16, maxWidth: 1160, opacity: smooth(16 / fps, 30 / fps, localFrame / fps) }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 12px ${accent}`, flex: "0 0 auto" }} />
          {beatText}
        </div>
      ) : null}

      {selfContained ? (
        <>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(130% 120% at 50% 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.70) 100%)" }} />
          <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${progress * 100}%`, background: accent, boxShadow: `0 0 14px ${accent}` }} />
        </>
      ) : null}
    </div>
  );
};

// Gate post top/bottom extents (must bracket the crowd field in crowdFormations).
const F_TOP_POST = 422;
const F_BOT_POST = 970;
