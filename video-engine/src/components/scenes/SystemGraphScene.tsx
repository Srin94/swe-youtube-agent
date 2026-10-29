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

const CHIP = 56; // logo chip size inside each node
const PACKET_OFFSETS = [0, 0.2, 0.4, 0.6, 0.8]; // five packets per edge -> a stream

// Fit a label to the available width: scale the font down toward a floor, and
// if it still would not fit, return a textLength so SVG compresses it exactly
// to `avail`. Guarantees text never spills past the card edge.
const fitText = (
  text: string,
  avail: number,
  maxFont: number,
  minFont: number,
  ratio: number,
): { font: number; textLength?: number } => {
  const natural = text.length * ratio * maxFont;
  if (natural <= avail) return { font: maxFont };
  const font = Math.max(minFont, avail / (text.length * ratio));
  const stillOver = text.length * ratio * font > avail + 0.5;
  return { font, textLength: stillOver ? avail : undefined };
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

  // Camera: interpolate the viewBox from full-graph to a gentle push on focus.
  const zoom = focusNode ? 1.28 : 1;
  const fullVB = { x: 0, y: 0, w: layout.width, h: layout.height };
  const targetVB = focusNode
    ? {
        w: layout.width / zoom,
        h: layout.height / zoom,
        x: focusNode.cx - layout.width / zoom / 2,
        y: focusNode.cy - layout.height / zoom / 2,
      }
    : fullVB;
  const k = interpolate(localFrame, [0, 30], [0, 1], {
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
    <div style={{ width: "100%", height: "100%", padding: 8 }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* ---- Edges: a dim track + a brighter line + a glowing packet stream ---- */}
        {layout.edges.map((e) => {
          const dx = Math.max(40, (e.tx - e.sx) * 0.5);
          const c1: [number, number] = [e.sx + dx, e.sy];
          const c2: [number, number] = [e.tx - dx, e.ty];
          const color = theme.packetColors[e.packet_color] ?? theme.accentPrimary;
          const dim =
            focusNode && !(adjacent.has(e.source) && adjacent.has(e.target));
          return (
            <g key={e.id} style={{ opacity: dim ? 0.22 : 1 }}>
              {/* dim track */}
              <path
                d={e.path}
                fill="none"
                stroke={color}
                strokeWidth={6}
                strokeOpacity={0.14}
                strokeLinecap="round"
              />
              {/* bright line */}
              <path
                d={e.path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeOpacity={0.5}
                strokeLinecap="round"
              />
              {/* flowing packets (glow halo + bright core) */}
              {e.animate_packets &&
                PACKET_OFFSETS.map((off) => {
                  const t = ((localFrame * 0.0095 + off) % 1 + 1) % 1;
                  const [px, py] = bezier(t, [e.sx, e.sy], c1, c2, [e.tx, e.ty]);
                  // fade in/out at the ends so packets don't pop.
                  const edgeFade = Math.min(1, Math.min(t, 1 - t) * 8);
                  return (
                    <g key={off} style={{ opacity: edgeFade }}>
                      <circle cx={px} cy={py} r={11} fill={color} opacity={0.18} />
                      <circle cx={px} cy={py} r={4.5} fill={color} />
                    </g>
                  );
                })}
            </g>
          );
        })}

        {/* ---- Nodes: depth shadow + card + logo chip + labels ---- */}
        {layout.nodes.map((n, i) => {
          const enter = spring({
            frame: localFrame - i * 5,
            fps,
            config: { damping: 16, stiffness: 150 },
          });
          const dim = focusNode && !adjacent.has(n.id);
          const statusColor = theme.statusColors[n.status];
          const isAccent = n.status !== "normal";
          const icon = getIcon(n.icon_slug);
          const s = 0.92 + enter * 0.08;
          const rise = (1 - enter) * 20;
          // Text area to the right of the chip, and labels fitted to it.
          const labelX = 16 + CHIP + 16;
          const avail = NODE_WIDTH - labelX - 16;
          const labelStr = n.label.slice(0, 26);
          const subStr = n.sublabel.slice(0, 30);
          const lf = fitText(labelStr, avail, 21, 14, 0.58);
          const sf = fitText(subStr, avail, 14, 11, 0.54);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y - rise})`}
              style={{ opacity: (dim ? 0.3 : 1) * Math.min(1, enter * 1.2) }}
            >
              <g
                transform={`translate(${NODE_WIDTH / 2}, ${NODE_HEIGHT / 2}) scale(${s}) translate(${-NODE_WIDTH / 2}, ${-NODE_HEIGHT / 2})`}
              >
                {/* soft glow ring for accented (active/warning/critical) nodes */}
                {isAccent ? (
                  <rect
                    x={-5}
                    y={-5}
                    width={NODE_WIDTH + 10}
                    height={NODE_HEIGHT + 10}
                    rx={18}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth={10}
                    strokeOpacity={0.16}
                  />
                ) : null}
                {/* depth shadow */}
                <rect
                  x={0}
                  y={8}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={14}
                  fill="#000000"
                  opacity={0.38}
                />
                {/* card */}
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={14}
                  fill={theme.cardBg}
                  stroke={isAccent ? statusColor : theme.gridColor}
                  strokeWidth={isAccent ? 2.5 : 1.5}
                />
                {/* top sheen */}
                <rect
                  x={1}
                  y={1}
                  width={NODE_WIDTH - 2}
                  height={14}
                  rx={13}
                  fill="#FFFFFF"
                  opacity={0.05}
                />
                {/* logo chip */}
                <rect
                  x={16}
                  y={(NODE_HEIGHT - CHIP) / 2}
                  width={CHIP}
                  height={CHIP}
                  rx={13}
                  fill={icon ? icon.hex : statusColor}
                  opacity={0.16}
                />
                {icon ? (
                  <g
                    transform={`translate(${16 + (CHIP - 32) / 2}, ${(NODE_HEIGHT - CHIP) / 2 + (CHIP - 32) / 2}) scale(${32 / 24})`}
                  >
                    <path d={icon.path} fill={icon.hex} />
                  </g>
                ) : (
                  <text
                    x={16 + CHIP / 2}
                    y={NODE_HEIGHT / 2 + 9}
                    textAnchor="middle"
                    fontFamily={theme.fontHeading}
                    fontSize={26}
                    fontWeight={800}
                    fill={statusColor}
                  >
                    {n.label.slice(0, 1).toUpperCase()}
                  </text>
                )}
                {/* labels (auto-fit so long names never spill past the card) */}
                <text
                  x={labelX}
                  y={NODE_HEIGHT / 2 - 4}
                  fontFamily={theme.fontHeading}
                  fontSize={lf.font}
                  fontWeight={700}
                  fill={theme.textPrimary}
                  textLength={lf.textLength}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {labelStr}
                </text>
                <text
                  x={labelX}
                  y={NODE_HEIGHT / 2 + 20}
                  fontFamily={theme.fontMono}
                  fontSize={sf.font}
                  fill={theme.textMuted}
                  textLength={sf.textLength}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {subStr}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
