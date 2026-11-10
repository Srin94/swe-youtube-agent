import React from "react";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, NodeCard, Edge, byTier, emptyNote } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A hierarchy: nodes placed in rows by their `tier` (= depth), parents linked to
// children with curved edges. Fits DOM trees, B-trees, file systems, dependency
// / call trees, decision trees.
export const TreeScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = scene.nodes;
  if (nodes.length < 2) return emptyNote(theme, "No tree data for this scene.");

  const levels = byTier(nodes);
  const MX = 150;
  const TOP = 78;
  const BOT = CH - 70;
  const rowGap = levels.length > 1 ? (BOT - TOP) / (levels.length - 1) : 0;

  const pos: Record<string, { x: number; y: number }> = {};
  const placed: { id: string; i: number; x: number; y: number }[] = [];
  levels.forEach(([, idxs], li) => {
    const y = levels.length > 1 ? TOP + li * rowGap : CH / 2;
    const k = idxs.length;
    idxs.forEach((i, j) => {
      const x = k === 1 ? CW / 2 : MX + (CW - 2 * MX) * (j / (k - 1));
      pos[nodes[i].id] = { x, y };
      placed.push({ id: nodes[i].id, i, x, y });
    });
  });

  const widest = Math.max(1, ...levels.map((l) => l[1].length));
  const w = Math.max(188, Math.min(300, (CW - 2 * MX) / widest - 18));
  const h = 68;
  const colorOf = (pc: string) =>
    theme.packetColors[pc as keyof typeof theme.packetColors] ?? theme.accentPrimary;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {scene.edges.map((e) => {
          const s = pos[e.source];
          const t = pos[e.target];
          if (!s || !t) return null;
          const c: [number, number] = [(s.x + t.x) / 2, (s.y + t.y) / 2];
          return (
            <Edge
              key={e.id}
              p0={[s.x, s.y + h / 2]}
              p1={[t.x, t.y - h / 2]}
              c={c}
              color={colorOf(e.packet_color)}
              frame={localFrame}
              animate={e.animate_packets}
            />
          );
        })}
      </svg>
      {placed.map(({ id, i, x, y }, idx) => {
        const enter = spring({
          frame: localFrame - idx * 5,
          fps,
          config: { damping: 16, stiffness: 150 },
        });
        return (
          <NodeCard
            key={id}
            node={nodes[i]}
            theme={theme}
            x={x}
            y={y}
            w={w}
            h={h}
            enter={enter}
            chip={40}
            labelSize={19}
          />
        );
      })}
    </div>
  );
};
