import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneSpec, VideoRenderPayload } from "./types/schema";
import { getTheme, gridBackground } from "./styles/themes";
import { ZoneAStage } from "./components/ZoneAStage";
import { ZoneBTelemetryHUD } from "./components/ZoneBTelemetryHUD";
import { ZoneCAudioTicker } from "./components/ZoneCAudioTicker";

export type MasterProps = {
  payload: VideoRenderPayload;
};

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

  const outerStyle = useMemo<React.CSSProperties>(
    () => ({
      ...gridBackground(theme),
      padding: 16,
      fontFamily: theme.fontHeading,
      color: theme.textPrimary,
    }),
    [theme],
  );

  return (
    <AbsoluteFill style={outerStyle}>
      {hasAudio ? (
        <Audio src={staticFile("assets/narration.wav")} />
      ) : null}

      {/* Bento grid: 90% top row (Zone A 74% | Zone B 26%), 10% bottom (Zone C). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "74fr 26fr",
          gridTemplateRows: "1fr 112px",
          gap: 16,
          width: "100%",
          height: "100%",
        }}
      >
        <div style={{ gridColumn: "1 / 2", gridRow: "1 / 2", minHeight: 0 }}>
          <ZoneAStage
            scene={active.scene}
            theme={theme}
            localFrame={active.localFrame}
            fps={fps}
          />
        </div>

        <div style={{ gridColumn: "2 / 3", gridRow: "1 / 2", minHeight: 0 }}>
          <ZoneBTelemetryHUD
            scene={active.scene}
            theme={theme}
            localFrame={active.localFrame}
            fps={fps}
          />
        </div>

        <div style={{ gridColumn: "1 / 3", gridRow: "2 / 3", minHeight: 0 }}>
          <ZoneCAudioTicker
            payload={payload}
            scene={active.scene}
            sceneIndex={active.index}
            theme={theme}
            frame={frame}
            fps={fps}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
