import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec, Severity } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

const severityColor = (theme: Theme, sev: Severity): string => {
  switch (sev) {
    case "critical":
      return theme.accentCritical;
    case "warning":
      return theme.accentSecondary;
    case "resolved":
      return theme.systemStatusColors.HEALTHY;
    default:
      return theme.accentPrimary;
  }
};

export const IncidentTimeline: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const events = scene.timeline_events;
  if (events.length === 0) {
    return (
      <div style={{ padding: 24, fontFamily: theme.fontMono, color: theme.textMuted }}>
        No timeline events for this scene.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: "28px 40px", position: "relative" }}>
      {/* vertical spine */}
      <div
        style={{
          position: "absolute",
          left: 58,
          top: 36,
          bottom: 36,
          width: 3,
          background: theme.textMuted,
          opacity: 0.4,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {events.map((ev, i) => {
          const appear = spring({
            frame: localFrame - i * 10,
            fps,
            config: { damping: 16, stiffness: 130 },
          });
          const color = severityColor(theme, ev.severity);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [-20, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 15,
                  fontWeight: 700,
                  color: theme.textMuted,
                  width: 30,
                  textAlign: "right",
                  paddingTop: 4,
                }}
              >
                {ev.timestamp_label}
              </div>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: color,
                  border: `3px solid ${theme.cardBg}`,
                  boxShadow: `0 0 0 2px ${color}`,
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  flex: 1,
                  background: theme.cardBg,
                  border: theme.borderStyle,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: 8,
                  padding: "10px 16px",
                }}
              >
                <div
                  style={{
                    fontFamily: theme.fontHeading,
                    fontSize: 20,
                    fontWeight: 700,
                    color: theme.textPrimary,
                  }}
                >
                  {ev.title}
                </div>
                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 15,
                    color: theme.textMuted,
                    marginTop: 2,
                  }}
                >
                  {ev.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
