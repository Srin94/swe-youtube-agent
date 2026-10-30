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

// On-screen channel brand (keep in sync with agent-backend config CHANNEL_NAME).
const CHANNEL_NAME = "Blast Radius";
// Clean look: captions OFF by default (narration carries the words).
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
  const { fps, durationInFrames } = useVideoConfig();
  const theme = getTheme(payload.theme_id);
  const active = useActiveScene(payload, fps, frame);
  const isBookend =
    active.scene.visual_type === "Intro" || active.scene.visual_type === "Outro";

  const hasAudio = payload.words.length > 0 || payload.total_duration_sec > 0;

  // Per-scene header kicker: the chapter title rises + fades in on each cut.
  const kicker = spring({
    frame: active.localFrame,
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  // Scene ENTER transition (replaces the hard PPT cut): fade + slight rise +
  // subtle scale over the first ~14 frames of every scene.
  const enter = interpolate(active.localFrame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const stageOpacity = enter;
  const stageY = interpolate(enter, [0, 1], [26, 0]);
  const stageScale = interpolate(enter, [0, 1], [0.985, 1]);

  // A thin accent line sweeps across the frame on each cut.
  const sweepX = interpolate(active.localFrame, [0, 16], [-10, 110], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweepOpacity = interpolate(active.localFrame, [0, 10, 16], [0, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow background drift so the canvas is never static.
  const gx = (frame * 0.25) % 48;
  const gy = (frame * 0.12) % 48;
  const orb1x = 20 + 6 * Math.sin(frame * 0.012);
  const orb1y = 24 + 5 * Math.cos(frame * 0.009);
  const orb2x = 80 + 7 * Math.cos(frame * 0.01);
  const orb2y = 70 + 6 * Math.sin(frame * 0.013);

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.canvasBg,
        fontFamily: theme.fontHeading,
        color: theme.textPrimary,
        overflow: "hidden",
      }}
    >
      {hasAudio ? <Audio src={staticFile("assets/narration.wav")} /> : null}

      {/* Drifting grid layer */}
      <AbsoluteFill
        style={{
          ...gridBackground(theme),
          backgroundColor: "transparent",
          backgroundPosition: `${gx}px ${gy}px`,
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />

      {/* Two slowly-moving accent glow orbs for depth */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: `${orb1x}%`,
            top: `${orb1y}%`,
            width: 760,
            height: 760,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${theme.accentPrimary}14 0%, transparent 62%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${orb2x}%`,
            top: `${orb2y}%`,
            width: 680,
            height: 680,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${theme.accentSecondary}12 0%, transparent 62%)`,
          }}
        />
      </AbsoluteFill>

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
            {CHANNEL_NAME.toUpperCase()}
          </div>
          {!isBookend ? (
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
          ) : null}
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
          top: isBookend ? 150 : 186,
          left: 100,
          right: 100,
          bottom: SHOW_CAPTIONS ? 150 : 96,
          zIndex: 2,
          opacity: stageOpacity,
          transform: `translateY(${stageY}px) scale(${stageScale})`,
        }}
      >
        <ZoneAStage
          scene={active.scene}
          theme={theme}
          localFrame={active.localFrame}
          fps={fps}
          videoTitle={payload.youtube_title}
          channelName={CHANNEL_NAME}
        />
      </div>

      {/* Accent sweep on each cut */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${sweepX}%`,
          width: 3,
          background: theme.accentPrimary,
          opacity: sweepOpacity,
          boxShadow: `0 0 24px ${theme.accentPrimary}`,
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {SHOW_CAPTIONS ? (
        <div
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            bottom: 60,
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

      {/* Progress bar along the very bottom */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 5,
          background: "rgba(255,255,255,0.08)",
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: theme.accentPrimary,
            boxShadow: `0 0 12px ${theme.accentPrimary}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
