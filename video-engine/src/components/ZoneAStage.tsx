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

// Full-bleed scene renderer. No breadcrumb, no chapter badge, no card frame —
// the visual owns the whole stage (the header lives in MasterComposition).
export const ZoneAStage: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {renderScene()}
    </div>
  );
};
