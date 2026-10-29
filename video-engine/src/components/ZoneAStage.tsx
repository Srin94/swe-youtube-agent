import React from "react";
import type { SceneSpec } from "../types/schema";
import type { Theme } from "../styles/themes";
import { SystemGraphScene } from "./scenes/SystemGraphScene";
import { CodeDiffScene } from "./scenes/CodeDiffScene";
import { BenchmarkChart } from "./scenes/BenchmarkChart";
import { IncidentTimeline } from "./scenes/IncidentTimeline";
import { JobMarketCard } from "./scenes/JobMarketCard";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

export const ZoneAStage: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const breadcrumb = `SCENE ${String(scene.scene_id).padStart(2, "0")} // ${scene.visual_type}`;

  const renderScene = () => {
    switch (scene.visual_type) {
      case "SystemGraph":
        return <SystemGraphScene scene={scene} theme={theme} localFrame={localFrame} fps={fps} />;
      case "CodeDiff":
        return <CodeDiffScene scene={scene} theme={theme} localFrame={localFrame} fps={fps} />;
      case "BenchmarkChart":
        return <BenchmarkChart scene={scene} theme={theme} localFrame={localFrame} fps={fps} />;
      case "IncidentTimeline":
        return <IncidentTimeline scene={scene} theme={theme} localFrame={localFrame} fps={fps} />;
      case "JobMarketCard":
        return <JobMarketCard scene={scene} theme={theme} localFrame={localFrame} fps={fps} />;
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: theme.cardBg,
        border: theme.borderStyle,
        boxShadow: theme.cardShadow,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Top-left breadcrumb */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 18,
          zIndex: 5,
          fontFamily: theme.fontMono,
          fontSize: 16,
          letterSpacing: 2,
          color: theme.textMuted,
          textTransform: "uppercase",
        }}
      >
        {breadcrumb}
      </div>

      {/* Chapter title badge, top-right of the stage */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 18,
          zIndex: 5,
          fontFamily: theme.fontHeading,
          fontSize: 18,
          fontWeight: 700,
          color: theme.accentPrimary,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {scene.chapter_title}
      </div>

      <div style={{ position: "absolute", inset: 0, paddingTop: 48 }}>
        {renderScene()}
      </div>
    </div>
  );
};
