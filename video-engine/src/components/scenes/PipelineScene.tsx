import React from "react";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, NodeCard, Edge, emptyNote } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A sequential process: stages in a single left-to-right lane, data flowing
// between them. Fits parser/compiler stages, a request lifecycle, CI/CD, an
// ETL / data pipeline. Stages are ordered by `tier`.
export const PipelineScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = [...scene.nodes].sort((a, b) => a.tier - b.tier);
  if (nodes.length < 2) return emptyNote(theme, "No pipeline data for this scene.");

  const n = nodes.length;
  const MX = 130;
  const y = CH / 2;
  const xs = nodes.map((_, i) => (n === 1 ? CW / 2 : MX + (CW - 2 * MX) * (i / (n - 1))));
  const w = Math.max(190, Math.min(300, (CW - 2 * MX) / n - 26));
  const h = 118;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* connect consecutive stages so the flow always reads cleanly */}
        {nodes.slice(0, -1).map((nd, i) => (
          <Edge
            key={`flow-${i}`}
            p0={[xs[i] + w / 2, y]}
            p1={[xs[i + 1] - w / 2, y]}
            color={theme.accentPrimary}
            frame={localFrame}
            animate
            width={3}
            speed={0.014}
          />
        ))}
      </svg>
      {/* stage number tags above each card */}
      {nodes.map((nd, i) => {
        const enter = spring({
          frame: localFrame - i * 7,
          fps,
          config: { damping: 16, stiffness: 150 },
        });
        return (
          <div
            key={`tag-${nd.id}`}
            style={{
              position: "absolute",
              left: xs[i],
              top: y - h / 2 - 34,
              transform: "translate(-50%,-50%)",
              fontFamily: theme.fontMono,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 3,
              color: theme.textMuted,
              opacity: enter,
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
        );
      })}
      {nodes.map((nd, i) => {
        const enter = spring({
          frame: localFrame - i * 7,
          fps,
          config: { damping: 16, stiffness: 150 },
        });
        return (
          <NodeCard
            key={nd.id}
            node={nd}
            theme={theme}
            x={xs[i]}
            y={y}
            w={w}
            h={h}
            enter={enter}
            chip={54}
            labelSize={24}
          />
        );
      })}
    </div>
  );
};
