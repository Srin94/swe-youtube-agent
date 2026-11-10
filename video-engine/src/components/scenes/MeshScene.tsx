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

// An interconnected network: nodes on a ring, linked by their edges, packets
// flowing both ways. Fits distributed systems, replication, service meshes,
// peer-to-peer / gossip, consensus clusters.
export const MeshScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = scene.nodes;
  if (nodes.length < 2) return emptyNote(theme, "No network data for this scene.");

  const cx = CW / 2;
  const cy = CH / 2 + 8;
  const rx = Math.min(560, 360 + nodes.length * 22);
  const ry = Math.min(300, 230 + nodes.length * 10);

  const pos = nodes.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    return { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry };
  });
  const byId: Record<string, number> = {};
  nodes.forEach((n, i) => (byId[n.id] = i));

  const w = 210;
  const h = 64;
  const colorOf = (pc: string) =>
    theme.packetColors[pc as keyof typeof theme.packetColors] ?? theme.accentPrimary;

  const ringPulse = 0.5 + 0.5 * Math.sin(localFrame * 0.08);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* faint guide ring */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={theme.gridColor}
          strokeWidth={2}
          strokeDasharray="4 10"
          opacity={0.6 + 0.3 * ringPulse}
        />
        {scene.edges.map((e) => {
          const s = pos[byId[e.source]];
          const t = pos[byId[e.target]];
          if (!s || !t) return null;
          // Bow each chord slightly toward the center so parallel links separate.
          const c: [number, number] = [(s.x + t.x) / 2 + (cx - (s.x + t.x) / 2) * 0.28, (s.y + t.y) / 2 + (cy - (s.y + t.y) / 2) * 0.28];
          return (
            <Edge
              key={e.id}
              p0={[s.x, s.y]}
              p1={[t.x, t.y]}
              c={c}
              color={colorOf(e.packet_color)}
              frame={localFrame}
              animate={e.animate_packets}
              width={2}
            />
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const enter = spring({
          frame: localFrame - i * 4,
          fps,
          config: { damping: 15, stiffness: 150 },
        });
        return (
          <NodeCard
            key={n.id}
            node={n}
            theme={theme}
            x={pos[i].x}
            y={pos[i].y}
            w={w}
            h={h}
            enter={enter}
            chip={38}
            labelSize={18}
          />
        );
      })}
    </div>
  );
};
