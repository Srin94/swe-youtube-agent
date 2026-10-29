import React from "react";
import type { SceneSpec, VideoRenderPayload } from "../types/schema";
import type { Theme } from "../styles/themes";

interface Props {
  payload: VideoRenderPayload;
  scene: SceneSpec;
  sceneIndex: number;
  theme: Theme;
  frame: number;
  fps: number;
}

const WINDOW = 9; // words visible around the active word

export const ZoneCAudioTicker: React.FC<Props> = ({
  payload,
  scene,
  sceneIndex,
  theme,
  frame,
  fps,
}) => {
  const timeSec = frame / fps;
  const callouts = new Set(
    scene.callout_keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );

  // Find the active word index for karaoke.
  const words = payload.words;
  let activeIdx = -1;
  for (let i = 0; i < words.length; i += 1) {
    if (timeSec >= words[i].start_sec) activeIdx = i;
  }

  const start = Math.max(0, activeIdx - 2);
  const visible = words.slice(start, start + WINDOW);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(380px, 38%) 1fr",
        gap: 16,
        height: "100%",
      }}
    >
      {/* Left — chapter stepper */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: theme.cardBg,
          border: theme.borderStyle,
          borderRadius: 10,
          boxShadow: theme.cardShadow,
          padding: "0 16px",
          overflow: "hidden",
        }}
      >
        {payload.scenes.map((s, i) => {
          const active = i === sceneIndex;
          return (
            <div
              key={s.scene_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: active ? 1 : 0.4,
              }}
            >
              <span
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 14,
                  fontWeight: 800,
                  color: active ? theme.accentPrimary : theme.textMuted,
                  border: `1px solid ${active ? theme.accentPrimary : theme.textMuted}`,
                  borderRadius: 4,
                  padding: "2px 6px",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: theme.fontHeading,
                  fontSize: 14,
                  fontWeight: 700,
                  color: active ? theme.textPrimary : theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {s.chapter_title}
              </span>
              {i < payload.scenes.length - 1 && (
                <span style={{ color: theme.textMuted, margin: "0 2px" }}>›</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Right — karaoke caption */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: theme.cardBg,
          border: theme.borderStyle,
          borderRadius: 10,
          boxShadow: theme.cardShadow,
          padding: "0 20px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: theme.fontHeading,
            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          {visible.length > 0 ? (
            visible.map((w, i) => {
              const globalIdx = start + i;
              const isActive = globalIdx === activeIdx;
              const clean = w.word.toLowerCase().replace(/[^a-z0-9]/g, "");
              const isCallout = callouts.has(clean);
              const color = isCallout
                ? theme.accentCritical
                : isActive
                  ? theme.accentPrimary
                  : theme.textPrimary;
              return (
                <span
                  key={globalIdx}
                  style={{
                    color,
                    fontWeight: isActive || isCallout ? 800 : 500,
                    opacity: globalIdx < activeIdx ? 0.55 : 1,
                    marginRight: 10,
                  }}
                >
                  {w.word}
                </span>
              );
            })
          ) : (
            <span style={{ color: theme.textPrimary }}>{scene.narration_text}</span>
          )}
        </div>
      </div>
    </div>
  );
};
