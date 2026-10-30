import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
  videoTitle?: string;
}

// Cold-open / agenda card: a bold headline + an animated "what we'll cover"
// checklist. Establishes the promise of the video in the first ~8 seconds.
export const IntroScene: React.FC<Props> = ({
  scene,
  theme,
  localFrame,
  fps,
  videoTitle,
}) => {
  const title = (videoTitle || scene.chapter_title || "").trim();
  const words = title.split(" ");
  const agenda = scene.agenda_items ?? [];

  const titleIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 110 } });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 44,
        paddingLeft: 24,
      }}
    >
      {/* Kicker */}
      <div
        style={{
          fontFamily: theme.fontMono,
          fontSize: 22,
          letterSpacing: 6,
          fontWeight: 700,
          color: theme.accentPrimary,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [14, 0])}px)`,
        }}
      >
        ▸ IN THIS BREAKDOWN
      </div>

      {/* Headline (accent the final word) */}
      <div
        style={{
          fontFamily: theme.fontHeading,
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1.04,
          letterSpacing: -1.5,
          maxWidth: 1400,
          color: theme.textPrimary,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [26, 0])}px) scale(${interpolate(
            titleIn,
            [0, 1],
            [0.97, 1],
          )})`,
          transformOrigin: "left center",
        }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            style={{ color: i === words.length - 1 ? theme.accentPrimary : theme.textPrimary }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>

      {/* Agenda checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
        {agenda.map((item, i) => {
          const appear = spring({
            frame: localFrame - 18 - i * 9,
            fps,
            config: { damping: 16, stiffness: 140 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [-26, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 11,
                  background: theme.cardBg,
                  border: `2px solid ${theme.accentPrimary}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.fontMono,
                  fontSize: 20,
                  fontWeight: 800,
                  color: theme.accentPrimary,
                  flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontFamily: theme.fontHeading,
                  fontSize: 32,
                  fontWeight: 600,
                  color: theme.textPrimary,
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
