import React from "react";
import { interpolate, spring } from "remotion";
import type { HudLevel, SceneSpec } from "../types/schema";
import type { Theme } from "../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

const panelStyle = (theme: Theme): React.CSSProperties => ({
  background: theme.cardBg,
  border: theme.borderStyle,
  borderRadius: 10,
  padding: "14px 16px",
  boxShadow: theme.cardShadow,
});

const levelColor = (theme: Theme, level: HudLevel): string => {
  switch (level) {
    case "good":
      return theme.systemStatusColors.HEALTHY;
    case "warning":
      return theme.accentSecondary;
    case "critical":
      return theme.accentCritical;
    default:
      return theme.accentPrimary;
  }
};

const labelStyle = (theme: Theme): React.CSSProperties => ({
  fontFamily: theme.fontMono,
  fontSize: 12,
  letterSpacing: 2,
  color: theme.textMuted,
  textTransform: "uppercase",
});

// A deterministic "signal" sparkline; spikes harder when the scene is critical.
const Sparkline: React.FC<{ localFrame: number; critical: boolean; theme: Theme }> = ({
  localFrame,
  critical,
  theme,
}) => {
  const width = 260;
  const height = 42;
  const n = 32;
  const amp = critical ? 16 : 6;
  const pts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * width;
    const phase = (i + localFrame * 0.6) * (critical ? 0.9 : 0.5);
    const noise = Math.sin(phase) + (critical ? Math.sin(phase * 2.3) * 0.6 : 0);
    pts.push(`${x.toFixed(1)},${(height / 2 - noise * amp).toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={critical ? theme.accentCritical : theme.accentPrimary}
        strokeWidth={2}
      />
    </svg>
  );
};

export const ZoneBTelemetryHUD: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const hud = scene.hud;
  const statusColor = levelColor(theme, hud.status_level);
  const critical = hud.status_level === "critical";
  const pulse = 0.65 + 0.35 * Math.abs(Math.sin(localFrame * 0.18));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {/* Panel 1 — context readout + status */}
      <div style={panelStyle(theme)}>
        <div style={labelStyle(theme)}>{hud.context_label}</div>
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 32,
            fontWeight: 800,
            color: theme.textPrimary,
            margin: "2px 0 10px",
            lineHeight: 1.05,
            wordBreak: "break-word",
          }}
        >
          {hud.context_value}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 6,
            background: statusColor,
            color: "#0B0C10",
            fontFamily: theme.fontMono,
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: 1,
            opacity: pulse,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#0B0C10",
              display: "inline-block",
            }}
          />
          {hud.status_text}
        </div>
      </div>

      {/* Panel 2 — category-appropriate metrics + signal */}
      <div style={{ ...panelStyle(theme), flex: 1 }}>
        <div style={{ ...labelStyle(theme), marginBottom: 10 }}>Metrics</div>
        {hud.stats.slice(0, 4).map((s, i) => {
          const appear = spring({
            frame: localFrame - i * 6,
            fps,
            config: { damping: 18, stiffness: 150 },
          });
          return (
            <div
              key={s.label + i}
              style={{
                marginBottom: 12,
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [14, 0])}px)`,
              }}
            >
              <div style={{ ...labelStyle(theme), fontSize: 11 }}>{s.label}</div>
              <div
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 28,
                  fontWeight: 800,
                  color: levelColor(theme, s.emphasis),
                  lineHeight: 1.1,
                }}
              >
                {s.value}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 4 }}>
          <Sparkline localFrame={localFrame} critical={critical} theme={theme} />
        </div>
      </div>

      {/* Panel 3 — insight / trade-off */}
      <div style={{ ...panelStyle(theme), borderLeft: `4px solid ${theme.accentPrimary}` }}>
        <div style={{ ...labelStyle(theme), marginBottom: 6 }}>Insight</div>
        <div
          style={{
            fontFamily: theme.fontHeading,
            fontSize: 18,
            fontWeight: 700,
            color: theme.textPrimary,
            lineHeight: 1.25,
          }}
        >
          {hud.insight}
        </div>
      </div>
    </div>
  );
};
