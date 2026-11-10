import React from "react";
import { scaleLinear } from "d3-scale";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A full-bleed comparison chart: ranked, color-coded bars that fill the stage,
// each with a rank chip, big count-up value, and a glowing WINNER highlight.
// (Replaces the old two-muted-bars-in-a-void look that made every chart scene
// read as empty.)
export const BenchmarkChart: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const items = scene.benchmarks;
  if (items.length === 0) {
    return (
      <div style={{ padding: 24, fontFamily: theme.fontMono, color: theme.textMuted }}>
        No benchmark data for this scene.
      </div>
    );
  }

  // Scale by absolute magnitude so negative values (e.g. -4% headcount) still
  // render a sensible bar length; the sign stays visible in the value label.
  const maxVal = Math.max(1, ...items.map((b) => Math.abs(b.value)));
  const x = scaleLinear().domain([0, maxVal]).range([0, 100]);

  // Rank by magnitude so the biggest bar reads as #1 (winner flag breaks ties).
  const order = items
    .map((b, i) => ({ b, i }))
    .sort((a, z) => Math.abs(z.b.value) - Math.abs(a.b.value) || Number(z.b.is_winner) - Number(a.b.is_winner));
  const rankOf = new Map<number, number>(order.map((r, pos) => [r.i, pos]));

  // A distinct color per non-winner bar so bars never wash out into flat gray.
  const palette = [
    theme.accentPrimary,
    theme.accentSecondary,
    theme.packetColors.cyan,
    theme.packetColors.emerald,
    theme.accentCritical,
  ];

  const n = items.length;
  const barH = Math.min(118, Math.max(62, Math.round(560 / n)));
  const rowGap = Math.min(40, Math.max(18, Math.round(120 / n)));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "20px 48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: rowGap,
      }}
    >
      {items.map((b, i) => {
        const grow = spring({
          frame: localFrame - i * 8,
          fps,
          config: { damping: 18, stiffness: 120 },
        });
        const widthPct = Math.max(2, x(Math.abs(b.value)) * grow);
        const rank = rankOf.get(i) ?? i;
        const color = b.is_winner ? theme.accentPrimary : palette[rank % palette.length];
        const dec = Number.isInteger(b.value) ? 0 : 1;
        const shownVal = (b.value * grow).toLocaleString("en-US", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        });
        return (
          <div
            key={b.label + i}
            style={{
              opacity: Math.min(1, grow * 1.4),
              transform: `translateX(${interpolate(grow, [0, 1], [-30, 0])}px)`,
            }}
          >
            {/* label row: rank chip + name (+ winner badge) ..... value + unit */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: `${color}22`,
                    border: `1px solid ${color}`,
                    color,
                    fontFamily: theme.fontMono,
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  {rank + 1}
                </span>
                <span
                  style={{
                    fontFamily: theme.fontHeading,
                    fontSize: 30,
                    fontWeight: b.is_winner ? 800 : 700,
                    color: b.is_winner ? color : theme.textPrimary,
                  }}
                >
                  {b.label}
                </span>
                {b.is_winner ? (
                  <span
                    style={{
                      fontFamily: theme.fontMono,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: 2,
                      color,
                      border: `1px solid ${color}`,
                      borderRadius: 6,
                      padding: "3px 10px",
                      boxShadow: `0 0 14px ${color}55`,
                    }}
                  >
                    ★ WINNER
                  </span>
                ) : null}
              </div>
              <span
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 34,
                  fontWeight: 800,
                  color: b.is_winner ? color : theme.textPrimary,
                }}
              >
                {shownVal}
                <span style={{ fontSize: 22, color: theme.textMuted, marginLeft: 6 }}>
                  {b.unit}
                </span>
              </span>
            </div>

            {/* bar track with faint gridlines + a glowing colored fill */}
            <div
              style={{
                position: "relative",
                height: barH,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                border: theme.borderStyle,
                overflow: "hidden",
              }}
            >
              {[25, 50, 75].map((g) => (
                <div
                  key={g}
                  style={{
                    position: "absolute",
                    left: `${g}%`,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
              ))}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${widthPct}%`,
                  background: `linear-gradient(90deg, ${color}CC, ${color})`,
                  borderRadius: 12,
                  boxShadow: b.is_winner ? `0 0 26px ${color}aa` : `0 0 14px ${color}55`,
                }}
              >
                {/* bright leading edge */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: "#FFFFFF",
                    opacity: 0.6,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
