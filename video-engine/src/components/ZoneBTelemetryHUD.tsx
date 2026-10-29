import React from "react";
import { interpolate } from "remotion";
import type { SceneSpec } from "../types/schema";
import type { Theme } from "../styles/themes";

interface Props {
  scene: SceneSpec;
  prevScene: SceneSpec | null;
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

const lerp = (localFrame: number, from: number, to: number): number =>
  interpolate(localFrame, [0, 30], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Gauge: React.FC<{
  label: string;
  value: number;
  unit: string;
  color: string;
  theme: Theme;
}> = ({ label, value, unit, color, theme }) => (
  <div style={{ marginBottom: 10 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: theme.fontMono,
        fontSize: 13,
        color: theme.textMuted,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      <span>{label}</span>
    </div>
    <div
      style={{
        fontFamily: theme.fontMono,
        fontSize: 30,
        fontWeight: 800,
        color,
        lineHeight: 1.1,
      }}
    >
      {value.toLocaleString()}
      <span style={{ fontSize: 15, color: theme.textMuted, marginLeft: 4 }}>{unit}</span>
    </div>
  </div>
);

// A deterministic sparkline that spikes harder when status is CRITICAL.
const Sparkline: React.FC<{ localFrame: number; critical: boolean; theme: Theme }> = ({
  localFrame,
  critical,
  theme,
}) => {
  const points: string[] = [];
  const width = 260;
  const height = 48;
  const n = 32;
  const amp = critical ? 18 : 7;
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * width;
    const phase = (i + localFrame * 0.6) * (critical ? 0.9 : 0.5);
    const noise = Math.sin(phase) + (critical ? Math.sin(phase * 2.3) * 0.6 : 0);
    const y = height / 2 - noise * amp;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={critical ? theme.accentCritical : theme.accentPrimary}
        strokeWidth={2}
      />
    </svg>
  );
};

export const ZoneBTelemetryHUD: React.FC<Props> = ({
  scene,
  prevScene,
  theme,
  localFrame,
}) => {
  const t = scene.telemetry;
  const p = prevScene?.telemetry ?? t;

  const rps = Math.round(lerp(localFrame, p.rps, t.rps));
  const p99 = Math.round(lerp(localFrame, p.p99_latency_ms, t.p99_latency_ms));
  const err = lerp(localFrame, p.error_rate_pct, t.error_rate_pct);
  const statusColor = theme.systemStatusColors[t.system_status];
  const critical = t.system_status === "CRITICAL";

  // Pulsing status badge opacity.
  const pulse = 0.65 + 0.35 * Math.abs(Math.sin(localFrame * 0.18));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
      }}
    >
      {/* Panel 1 — Incident / system clock + status */}
      <div style={panelStyle(theme)}>
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 12,
            letterSpacing: 2,
            color: theme.textMuted,
            textTransform: "uppercase",
          }}
        >
          Incident Clock
        </div>
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 34,
            fontWeight: 800,
            color: theme.textPrimary,
            margin: "2px 0 10px",
          }}
        >
          {t.incident_clock}
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
          {t.system_status}
        </div>
      </div>

      {/* Panel 2 — Live interpolated gauges + sparkline */}
      <div style={{ ...panelStyle(theme), flex: 1 }}>
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 12,
            letterSpacing: 2,
            color: theme.textMuted,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Live Telemetry
        </div>
        <Gauge label="RPS" value={rps} unit="/s" color={theme.accentPrimary} theme={theme} />
        <Gauge
          label="p99 Latency"
          value={p99}
          unit="ms"
          color={theme.accentSecondary}
          theme={theme}
        />
        <Gauge
          label="Error Rate"
          value={Number(err.toFixed(2))}
          unit="%"
          color={critical ? theme.accentCritical : theme.textPrimary}
          theme={theme}
        />
        <div style={{ marginTop: 6 }}>
          <Sparkline localFrame={localFrame} critical={critical} theme={theme} />
        </div>
      </div>

      {/* Panel 3 — Architectural trade-off callout */}
      <div
        style={{
          ...panelStyle(theme),
          borderLeft: `4px solid ${theme.accentPrimary}`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 12,
            letterSpacing: 2,
            color: theme.textMuted,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Trade-off
        </div>
        <div
          style={{
            fontFamily: theme.fontHeading,
            fontSize: 18,
            fontWeight: 700,
            color: theme.textPrimary,
            lineHeight: 1.25,
          }}
        >
          {t.tradeoff_badge}
        </div>
      </div>
    </div>
  );
};
