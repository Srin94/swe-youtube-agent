import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
  channelName?: string;
}

// Subscribe CTA + recap. Closes every video with a clear ask.
export const OutroScene: React.FC<Props> = ({
  scene,
  theme,
  localFrame,
  fps,
  channelName,
}) => {
  const recap = scene.agenda_items ?? [];
  const titleIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 110 } });
  const btnIn = spring({ frame: localFrame - 20, fps, config: { damping: 12, stiffness: 140 } });
  // Gentle breathing pulse on the subscribe button.
  const pulse = 1 + 0.035 * Math.sin(localFrame * 0.16);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: theme.fontHeading,
          fontSize: 66,
          fontWeight: 800,
          letterSpacing: -1,
          color: theme.textPrimary,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [20, 0])}px)`,
        }}
      >
        Thanks for watching
      </div>

      {/* Recap checklist */}
      {recap.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          {recap.map((item, i) => {
            const appear = spring({
              frame: localFrame - 10 - i * 7,
              fps,
              config: { damping: 16, stiffness: 140 },
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: appear,
                  transform: `translateX(${interpolate(appear, [0, 1], [-18, 0])}px)`,
                }}
              >
                <span style={{ color: theme.systemStatusColors.HEALTHY, fontSize: 28 }}>✓</span>
                <span
                  style={{
                    fontFamily: theme.fontHeading,
                    fontSize: 28,
                    fontWeight: 600,
                    color: theme.textMuted,
                  }}
                >
                  {item}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Subscribe button (pulsing) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          background: "#FF0033",
          color: "#FFFFFF",
          padding: "20px 44px",
          borderRadius: 14,
          marginTop: 8,
          boxShadow: `0 0 40px rgba(255,0,51,0.45)`,
          opacity: btnIn,
          transform: `scale(${interpolate(btnIn, [0, 1], [0.7, 1]) * pulse})`,
        }}
      >
        {/* YouTube play glyph in a white rounded square */}
        <div
          style={{
            width: 46,
            height: 34,
            background: "#FFFFFF",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "9px solid transparent",
              borderBottom: "9px solid transparent",
              borderLeft: "15px solid #FF0033",
              marginLeft: 3,
            }}
          />
        </div>
        <span style={{ fontFamily: theme.fontHeading, fontSize: 34, fontWeight: 800, letterSpacing: 0.5 }}>
          SUBSCRIBE
        </span>
      </div>

      <div
        style={{
          fontFamily: theme.fontMono,
          fontSize: 22,
          color: theme.textMuted,
          opacity: btnIn,
        }}
      >
        @{(channelName || "Blast Radius").replace(/\s+/g, "")} · new deep dives every week
      </div>
    </div>
  );
};
