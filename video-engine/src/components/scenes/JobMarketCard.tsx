import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// JobMarketCard visualizes SWE hiring / layoff / compensation data. It is
// driven by `benchmarks` (metric tiles) and, when present, `timeline_events`
// (notable hiring/layoff moments) — no bespoke payload field is required.
export const JobMarketCard: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const metrics = scene.benchmarks;
  const events = scene.timeline_events;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "28px 40px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {metrics.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)`,
            gap: 18,
          }}
        >
          {metrics.map((m, i) => {
            const appear = spring({
              frame: localFrame - i * 8,
              fps,
              config: { damping: 16, stiffness: 130 },
            });
            const color = m.is_winner ? theme.accentPrimary : theme.textPrimary;
            const dec = Number.isInteger(m.value) ? 0 : 1;
            const shownVal = (m.value * appear).toLocaleString("en-US", {
              minimumFractionDigits: dec,
              maximumFractionDigits: dec,
            });
            return (
              <div
                key={m.label + i}
                style={{
                  background: theme.cardBg,
                  border: theme.borderStyle,
                  borderTop: `5px solid ${color}`,
                  borderRadius: 12,
                  padding: "28px 26px",
                  opacity: appear,
                  transform: `translateY(${interpolate(appear, [0, 1], [18, 0])}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 14,
                    letterSpacing: 1,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontFamily: theme.fontHeading,
                    fontSize: 54,
                    fontWeight: 800,
                    color,
                    lineHeight: 1.1,
                    marginTop: 8,
                  }}
                >
                  {shownVal}
                  <span style={{ fontSize: 22, color: theme.textMuted, marginLeft: 6 }}>
                    {m.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map((ev, i) => {
            const appear = spring({
              frame: localFrame - (metrics.length + i) * 8,
              fps,
              config: { damping: 16, stiffness: 130 },
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: theme.cardBg,
                  border: theme.borderStyle,
                  borderRadius: 8,
                  padding: "10px 16px",
                  opacity: appear,
                }}
              >
                <span
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 14,
                    fontWeight: 700,
                    color: theme.accentSecondary,
                    minWidth: 90,
                  }}
                >
                  {ev.timestamp_label}
                </span>
                <span
                  style={{
                    fontFamily: theme.fontHeading,
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.textPrimary,
                  }}
                >
                  {ev.title}
                </span>
                <span
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 15,
                    color: theme.textMuted,
                  }}
                >
                  {ev.detail}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {metrics.length === 0 && events.length === 0 && (
        <div style={{ fontFamily: theme.fontMono, color: theme.textMuted }}>
          No job-market metrics for this scene.
        </div>
      )}
    </div>
  );
};
