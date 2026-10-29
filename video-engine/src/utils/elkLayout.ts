// Deterministic layered graph layout.
//
// Remotion renders every frame independently and synchronously, so the async
// elkjs `.layout()` promise is a poor fit (non-deterministic timing, re-layout
// churn per frame). Instead we compute a layered layout synchronously that
// mirrors ELK's `algorithm: 'layered'`, `elk.direction: 'RIGHT'` with the
// requested spacing (nodeNodeBetweenLayers: 130, nodeNode: 75). Layers come
// straight from each node's `tier` (1=Edge .. 5=Storage), so the architecture
// reads left-to-right and nodes never overlap.

import type { GraphEdge, GraphNode } from "../types/schema";

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 96;
const LAYER_GAP = 130; // elk.layered.spacing.nodeNodeBetweenLayers
const NODE_GAP = 75; // elk.spacing.nodeNode
const PAD = 40;

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number; // center x
  cy: number; // center y
}

export interface RoutedEdge extends GraphEdge {
  path: string; // SVG cubic bezier path
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  width: number;
  height: number;
  byId: Record<string, PositionedNode>;
}

function cubicPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(40, (tx - sx) * 0.5);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

export function computeLayeredLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): LayoutResult {
  // Group nodes by tier (the layer index). Nodes without a sensible tier fall
  // into a derived column based on insertion order.
  const tiers = new Map<number, GraphNode[]>();
  nodes.forEach((n, i) => {
    const tier = Number.isFinite(n.tier) && n.tier > 0 ? n.tier : i + 1;
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier)!.push(n);
  });

  const sortedTiers = [...tiers.keys()].sort((a, b) => a - b);
  const columnCount = sortedTiers.length;

  // Tallest column determines the canvas height so we can vertically center
  // every (shorter) column.
  const maxRows = Math.max(1, ...sortedTiers.map((t) => tiers.get(t)!.length));
  const contentHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * NODE_GAP;
  const contentWidth =
    columnCount * NODE_WIDTH + (columnCount - 1) * LAYER_GAP;

  const positioned: PositionedNode[] = [];
  sortedTiers.forEach((tier, colIdx) => {
    const col = tiers.get(tier)!;
    const colHeight = col.length * NODE_HEIGHT + (col.length - 1) * NODE_GAP;
    const yStart = PAD + (contentHeight - colHeight) / 2;
    const x = PAD + colIdx * (NODE_WIDTH + LAYER_GAP);
    col.forEach((n, rowIdx) => {
      const y = yStart + rowIdx * (NODE_HEIGHT + NODE_GAP);
      positioned.push({
        ...n,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        cx: x + NODE_WIDTH / 2,
        cy: y + NODE_HEIGHT / 2,
      });
    });
  });

  const byId: Record<string, PositionedNode> = {};
  positioned.forEach((n) => (byId[n.id] = n));

  const routed: RoutedEdge[] = edges
    .filter((e) => byId[e.source] && byId[e.target])
    .map((e) => {
      const s = byId[e.source];
      const t = byId[e.target];
      // Exit the right edge of the source, enter the left edge of the target
      // (RIGHT direction). If they share a column, route center-to-center.
      const forward = t.x >= s.x;
      const sx = forward ? s.x + s.width : s.cx;
      const sy = s.cy;
      const tx = forward ? t.x : t.cx;
      const ty = t.cy;
      return { ...e, path: cubicPath(sx, sy, tx, ty), sx, sy, tx, ty };
    });

  return {
    nodes: positioned,
    edges: routed,
    width: contentWidth + PAD * 2,
    height: contentHeight + PAD * 2,
    byId,
  };
}
