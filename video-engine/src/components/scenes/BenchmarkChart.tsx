import React from "react";
import { scaleLinear } from "d3-scale";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

export const BenchmarkChart: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const items = scene.benchmarks;
  // Scale by absolute magnitude so negative values (e.g. -4% headcount) still
  // render a sensible bar length; the sign is shown in the value label.
  const maxVal = Math.max(1, ...items.map((b) => Math.abs(b.value)));
  const x = scaleLinear().domain([0, maxVal]).range([0, 100]);

  if (items.length === 0) {
    return (
      <div style={{ padding: 24, fontFamily: theme.fontMono, color: theme.textMuted }}>
        No benchmark data for this scene.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "28px 36px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {items.map((b, i) => {
        const grow = spring({
          frame: localFrame - i * 8,
          fps,
          config: { damping: 18, stiffness: 120 },
        });
        const widthPct = x(Math.abs(b.value)) * grow;
        const barColor = b.is_winner ? theme.accentPrimary : theme.textMuted;
        return (
          <div key={b.label + i}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                fontFamily: theme.fontHeading,
                fontSize: 20,
                fontWeight: b.is_winner ? 800 : 600,
                color: b.is_winner ? theme.accentPrimary : theme.textPrimary,
              }}
            >
              <span>
                {b.is_winner ? "★ " : ""}
                {b.label}
              </span>
              <span style={{ fontFamily: theme.fontMono }}>
                {b.value.toLocaleString()} {b.unit}
              </span>
            </div>
            <div
              style={{
                height: 34,
                background: theme.id === "WAR_ROOM_HUD" ? "#1A1F2B" : "#ECE7DC",
                borderRadius: 6,
                border: theme.borderStyle,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: barColor,
                  boxShadow: b.is_winner ? `0 0 16px ${theme.accentPrimary}` : "none",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
