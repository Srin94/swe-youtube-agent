import React from "react";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, NodeCard, emptyNote, byTier, Arrow } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A FLOWCHART / STATE MACHINE with branches and loops. States are laid out in
// columns by `tier` (rank); nodes sharing a tier stack vertically to branch.
// Transitions carry a labelled condition, and an edge back to an earlier tier
// arcs up and over to read as a loop. Fits control flow, retry/backoff, a
// session/auth lifecycle, consensus roles.
export const FlowScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = scene.nodes;
  if (nodes.length < 2) return emptyNote(theme, "No flow data for this scene.");

  const tiers = byTier(nodes); // [tier, idxs][]
  const cols = tiers.length;
  const MX = 180;
  const MY = 110;
  const colX = (ci: number) => (cols === 1 ? CW / 2 : MX + (CW - 2 * MX) * (ci / (cols - 1)));

  const pos: { x: number; y: number }[] = new Array(nodes.length);
  tiers.forEach(([, idxs], ci) => {
    const x = colX(ci);
    const m = idxs.length;
    idxs.forEach((idx, ri) => {
      const y = m === 1 ? CH / 2 : MY + (CH - 2 * MY) * (ri / (m - 1));
      pos[idx] = { x, y };
    });
  });

  const byId: Record<string, number> = {};
  nodes.forEach((nd, i) => (byId[nd.id] = i));
  const tierOf = (idx: number) => nodes[idx].tier;
  const w = Math.min(258, Math.max(178, (CW - 2 * MX) / Math.max(1, cols) - 28));
  const h = 92;
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
          const si = byId[e.source];
          const ti = byId[e.target];
          if (si === undefined || ti === undefined) return null;
          const s = pos[si];
          const t = pos[ti];
          if (!s || !t) return null;
          const back = tierOf(ti) <= tierOf(si); // a loop / branch-back
          const sgn = Math.sign(t.x - s.x) || 1;
          const p0: [number, number] = [s.x + sgn * (w / 2), s.y];
          const p1: [number, number] = [t.x - sgn * (w / 2), t.y];
          const midX = (p0[0] + p1[0]) / 2;
          const midY = (p0[1] + p1[1]) / 2;
          // Back-edges arc up and over; forward edges bow only slightly.
          const c: [number, number] = back
            ? [midX, Math.min(s.y, t.y) - 130]
            : [midX, midY - 28];
          return (
            <Arrow
              key={e.id}
              p0={p0}
              p1={p1}
              c={c}
              color={back ? theme.statusColors.warning : colorOf(e.packet_color)}
              frame={localFrame}
              animate={e.animate_packets}
              label={e.label}
              theme={theme}
              width={2.6}
            />
          );
        })}
      </svg>
      {nodes.map((nd, i) => {
        const enter = spring({
          frame: localFrame - i * 6,
          fps,
          config: { damping: 16, stiffness: 150 },
        });
        return (
          <NodeCard
            key={nd.id}
            node={nd}
            theme={theme}
            x={pos[i].x}
            y={pos[i].y}
            w={w}
            h={h}
            enter={enter}
            chip={46}
            labelSize={21}
          />
        );
      })}
    </div>
  );
};
