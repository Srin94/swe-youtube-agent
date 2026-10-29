import React, { useMemo } from "react";
import { interpolate, spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { computeLayeredLayout, NODE_WIDTH, NODE_HEIGHT } from "../../utils/elkLayout";
import { getIcon } from "./icons";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// Analytic cubic bezier point (matches cubicPath control points in elkLayout).
const bezier = (
  t: number,
  p0: [number, number],
  c1: [number, number],
  c2: [number, number],
  p3: [number, number],
): [number, number] => {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * c1[0] + w2 * c2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * c1[1] + w2 * c2[1] + w3 * p3[1],
  ];
};

export const SystemGraphScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const layout = useMemo(
    () => computeLayeredLayout(scene.nodes, scene.edges),
    [scene.nodes, scene.edges],
  );

  const focusNode = scene.camera_focus_node_id
    ? layout.byId[scene.camera_focus_node_id]
    : null;

  // Adjacency for dimming when a camera focus is active.
  const adjacent = useMemo(() => {
    const set = new Set<string>();
    if (focusNode) {
      set.add(focusNode.id);
      scene.edges.forEach((e) => {
        if (e.source === focusNode.id) set.add(e.target);
        if (e.target === focusNode.id) set.add(e.source);
      });
    }
    return set;
  }, [focusNode, scene.edges]);

  // Camera: interpolate the viewBox from full-graph to a 1.3x zoom on focus.
  const zoom = focusNode ? 1.3 : 1;
  const fullVB = { x: 0, y: 0, w: layout.width, h: layout.height };
  const targetVB = focusNode
    ? {
        w: layout.width / zoom,
        h: layout.height / zoom,
        x: focusNode.cx - layout.width / zoom / 2,
        y: focusNode.cy - layout.height / zoom / 2,
      }
    : fullVB;
  const k = interpolate(localFrame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vb = {
    x: fullVB.x + (targetVB.x - fullVB.x) * k,
    y: fullVB.y + (targetVB.y - fullVB.y) * k,
    w: fullVB.w + (targetVB.w - fullVB.w) * k,
    h: fullVB.h + (targetVB.h - fullVB.h) * k,
  };

  return (
    <div style={{ width: "100%", height: "100%", padding: 24 }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edges */}
        {layout.edges.map((e) => {
          const dx = Math.max(40, (e.tx - e.sx) * 0.5);
          const c1: [number, number] = [e.sx + dx, e.sy];
          const c2: [number, number] = [e.tx - dx, e.ty];
          const stroke = theme.packetColors[e.packet_color] ?? theme.accentPrimary;
          const dim =
            focusNode && !(adjacent.has(e.source) && adjacent.has(e.target));
          return (
            <g key={e.id} style={{ opacity: dim ? 0.3 : 1 }}>
              <path
                d={e.path}
                fill="none"
                stroke={stroke}
                strokeWidth={2.5}
                strokeOpacity={0.7}
              />
              {e.animate_packets &&
                [0, 0.33, 0.66].map((off) => {
                  const t = (((localFrame * 0.012) + off) % 1 + 1) % 1;
                  const [px, py] = bezier(
                    t,
                    [e.sx, e.sy],
                    c1,
                    c2,
                    [e.tx, e.ty],
                  );
                  return (
                    <rect
                      key={off}
                      x={px - 4}
                      y={py - 4}
                      width={8}
                      height={8}
                      fill={stroke}
                      rx={1}
                    />
                  );
                })}
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((n, i) => {
          const enter = spring({
            frame: localFrame - i * 4,
            fps,
            config: { damping: 15, stiffness: 140 },
          });
          const dim = focusNode && !adjacent.has(n.id);
          const statusColor = theme.statusColors[n.status];
          const icon = getIcon(n.icon_slug);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y}) scale(${0.85 + enter * 0.15})`}
              style={{ opacity: (dim ? 0.35 : 1) * enter }}
            >
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={10}
                fill={theme.cardBg}
                stroke={statusColor}
                strokeWidth={n.status === "normal" ? 1.5 : 3}
              />
              {/* status rail */}
              <rect width={6} height={NODE_HEIGHT} rx={3} fill={statusColor} />
              {/* icon */}
              {icon ? (
                <g transform="translate(16, 20) scale(1.6)">
                  <path d={icon.path} fill={statusColor} />
                </g>
              ) : null}
              <text
                x={54}
                y={38}
                fontFamily={theme.fontHeading}
                fontSize={19}
                fontWeight={700}
                fill={theme.textPrimary}
              >
                {n.label.slice(0, 16)}
              </text>
              <text
                x={54}
                y={62}
                fontFamily={theme.fontMono}
                fontSize={14}
                fill={theme.textMuted}
              >
                {n.sublabel.slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
