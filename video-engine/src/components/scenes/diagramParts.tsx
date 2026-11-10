import React from "react";
import type { GraphNode } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { getIcon } from "./icons";

// Shared building blocks for the topic-shaped illustration renderers
// (Tree / Pipeline / Layers / Mesh). They all draw the same GraphNode[] + edges
// the script already produces, just arranged by a layout that matches the
// topic's shape. Everything is a pure function of `frame` so headless Chromium
// renders it deterministically on the CI runner.

// A shared virtual canvas (≈ the Zone-A stage at 1920x1080). Renderers lay out
// in these coordinates; the SVG viewBox + the HTML container share them so
// edges and cards stay aligned.
export const CW = 1720;
export const CH = 798;

export const nodeColor = (theme: Theme, n: GraphNode): string =>
  n.status === "normal" ? theme.accentPrimary : theme.statusColors[n.status];

// One icon chip (brand logo if the slug resolves, else the node's initial).
export const IconChip: React.FC<{
  node: GraphNode;
  theme: Theme;
  size: number;
  color: string;
}> = ({ node, theme, size, color }) => {
  const icon = getIcon(node.icon_slug);
  const inner = Math.round(size * 0.6);
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: Math.round(size * 0.26),
        background: icon ? `${icon.hex}22` : `${color}22`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? (
        <svg width={inner} height={inner} viewBox="0 0 24 24" style={{ fill: icon.hex }}>
          <path d={icon.path} />
        </svg>
      ) : (
        <span
          style={{
            fontFamily: theme.fontHeading,
            fontWeight: 800,
            fontSize: Math.round(size * 0.45),
            color,
          }}
        >
          {(node.label || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
};

// An absolutely-positioned node card (centered on x,y). Used by Tree / Pipeline
// / Mesh; `enter` (0..1) drives the stagger-in.
export const NodeCard: React.FC<{
  node: GraphNode;
  theme: Theme;
  x: number;
  y: number;
  w: number;
  h: number;
  enter: number;
  chip?: number;
  labelSize?: number;
}> = ({ node, theme, x, y, w, h, enter, chip = 46, labelSize = 22 }) => {
  const active = node.status !== "normal";
  const col = nodeColor(theme, node);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `translate(-50%,-50%) translateY(${(1 - enter) * 16}px)`,
        opacity: Math.min(1, enter * 1.3),
        background: theme.cardBg,
        border: `2px solid ${active ? col : theme.gridColor}`,
        borderRadius: 16,
        boxShadow: active ? `0 0 26px ${col}55` : theme.cardShadow,
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "0 16px",
        boxSizing: "border-box",
      }}
    >
      <IconChip node={node} theme={theme} size={chip} color={col} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: theme.fontHeading,
            fontSize: labelSize,
            fontWeight: 700,
            color: theme.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.label}
        </div>
        {node.sublabel ? (
          <div
            style={{
              fontFamily: theme.fontMono,
              fontSize: Math.round(labelSize * 0.62),
              color: theme.textMuted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {node.sublabel}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// One edge as an SVG group: a dim line/curve + a few glowing packets flowing
// along it. Pass a control point `c` for a quadratic curve (tree/mesh), omit it
// for a straight line (pipeline/layers).
export const Edge: React.FC<{
  p0: [number, number];
  p1: [number, number];
  c?: [number, number];
  color: string;
  frame: number;
  animate?: boolean;
  width?: number;
  speed?: number;
}> = ({ p0, p1, c, color, frame, animate = true, width = 2.5, speed = 0.011 }) => {
  const d = c
    ? `M${p0[0]},${p0[1]} Q${c[0]},${c[1]} ${p1[0]},${p1[1]}`
    : `M${p0[0]},${p0[1]} L${p1[0]},${p1[1]}`;
  const at = (t: number): [number, number] => {
    if (c) {
      const u = 1 - t;
      return [
        u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
      ];
    }
    return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  };
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={width + 4} strokeOpacity={0.12} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeOpacity={0.5} strokeLinecap="round" />
      {animate
        ? [0, 0.34, 0.68].map((off, i) => {
            const t = (((frame * speed + off) % 1) + 1) % 1;
            const [px, py] = at(t);
            const fade = Math.min(1, Math.min(t, 1 - t) * 8);
            return (
              <g key={i} style={{ opacity: fade }}>
                <circle cx={px} cy={py} r={9} fill={color} opacity={0.2} />
                <circle cx={px} cy={py} r={4} fill={color} />
              </g>
            );
          })
        : null}
    </g>
  );
};

// Group node indices by their `tier` value, returning ordered [tier, idxs][].
export const byTier = (nodes: GraphNode[]): [number, number[]][] => {
  const m = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    const t = Number.isFinite(n.tier) ? n.tier : 1;
    if (!m.has(t)) m.set(t, []);
    m.get(t)!.push(i);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};

export const emptyNote = (theme: Theme, text: string): React.ReactElement => (
  <div style={{ padding: 24, fontFamily: theme.fontMono, color: theme.textMuted }}>{text}</div>
);
