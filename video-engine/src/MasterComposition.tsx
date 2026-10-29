import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneSpec, VideoRenderPayload } from "./types/schema";
import { getTheme, gridBackground } from "./styles/themes";
import { ZoneAStage } from "./components/ZoneAStage";

export type MasterProps = {
  payload: VideoRenderPayload;
};

// Channel wordmark shown top-left on every frame.
const WORDMARK = "STACK SIGNALS";
// ByteMonk-clean: captions OFF by default. Flip to true for a single calm
// bottom line (no karaoke / keyword boxes).
const SHOW_CAPTIONS = false;

interface ActiveScene {
  scene: SceneSpec;
  prev: SceneSpec | null;
  index: number;
  localFrame: number;
  sceneStartFrame: number;
}

const useActiveScene = (
  payload: VideoRenderPayload,
  fps: number,
  frame: number,
): ActiveScene => {
  const timeSec = frame / fps;
  let index = 0;
  for (let i = 0; i < payload.scenes.length; i += 1) {
    const s = payload.scenes[i];
    if (timeSec >= s.start_sec) index = i;
  }
  const scene = payload.scenes[index];
  const prev = index > 0 ? payload.scenes[index - 1] : null;
  const sceneStartFrame = Math.round(scene.start_sec * fps);
  return { scene, prev, index, localFrame: frame - sceneStartFrame, sceneStartFrame };
};

export const MasterComposition: React.FC<MasterProps> = ({ payload }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = getTheme(payload.theme_id);
  const active = useActiveScene(payload, fps, frame);

  const hasAudio = payload.words.length > 0 || payload.total_duration_sec > 0;

  // Per-scene header kicker: the chapter title rises + fades in on each cut.
  const kicker = spring({
    frame: active.localFrame,
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  return (
    <AbsoluteFill
      style={{
        ...gridBackground(theme),
        fontFamily: theme.fontHeading,
        color: theme.textPrimary,
      }}
    >
      {hasAudio ? <Audio src={staticFile("assets/narration.wav")} /> : null}

      {/* Cinematic vignette for depth (darkens the corners). */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(130% 120% at 50% 38%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Header: wordmark + per-scene chapter title, inside the safe zone. */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 100,
          right: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          zIndex: 3,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: theme.fontMono,
              fontSize: 20,
              letterSpacing: 7,
              fontWeight: 700,
              color: theme.textMuted,
            }}
          >
            {WORDMARK}
          </div>
          <div
            style={{
              marginTop: 16,
              fontFamily: theme.fontHeading,
              fontSize: 48,
              fontWeight: 800,
              letterSpacing: -0.5,
              color: theme.textPrimary,
              opacity: kicker,
              transform: `translateY(${interpolate(kicker, [0, 1], [16, 0])}px)`,
            }}
          >
            {active.scene.chapter_title}
          </div>
        </div>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            background: theme.accentPrimary,
            marginTop: 8,
            boxShadow: `0 0 16px ${theme.accentPrimary}`,
          }}
        />
      </div>

      {/* Stage: full-bleed with a generous safe margin so nothing ever clips. */}
      <div
        style={{
          position: "absolute",
          top: 186,
          left: 100,
          right: 100,
          bottom: SHOW_CAPTIONS ? 150 : 92,
          zIndex: 2,
        }}
      >
        <ZoneAStage
          scene={active.scene}
          theme={theme}
          localFrame={active.localFrame}
          fps={fps}
        />
      </div>

      {SHOW_CAPTIONS ? (
        <div
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            bottom: 56,
            textAlign: "center",
            fontFamily: theme.fontHeading,
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.3,
            color: theme.textPrimary,
            opacity: 0.9 * kicker,
            zIndex: 3,
          }}
        >
          {active.scene.narration_text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
