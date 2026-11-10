import React from "react";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, IconChip, nodeColor, emptyNote } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A regular GRID / MATRIX of cells — hash-table buckets, shards/partitions,
// memory cells/pages, a comparison matrix. Nodes fill slots left→right,
// top→bottom; a scan cursor sweeps cell to cell. Reuses GraphNode[] as-is.
export const GridScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = scene.nodes;
  if (nodes.length < 2) return emptyNote(theme, "No grid data for this scene.");

  const n = nodes.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const MX = 120;
  const MY = 60;
  const gap = 18;
  const cw = (CW - 2 * MX - gap * (cols - 1)) / cols;
  const ch = Math.min(176, (CH - 2 * MY - gap * (rows - 1)) / rows);
  const gridH = rows * ch + gap * (rows - 1);
  const topY = (CH - gridH) / 2;

  // Scan cursor: one cell every ~0.5s, so the grid reads as something traversed.
  const step = Math.floor(localFrame / Math.max(1, Math.round(fps * 0.5))) % n;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {nodes.map((nd, i) => {
        const r = Math.floor(i / cols);
        const col = i % cols;
        const x = MX + col * (cw + gap);
        const y = topY + r * (ch + gap);
        const enter = spring({
          frame: localFrame - i * 3,
          fps,
          config: { damping: 16, stiffness: 160 },
        });
        const c = nodeColor(theme, nd);
        const lit = i === step || nd.status !== "normal";
        return (
          <div
            key={nd.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cw,
              height: ch,
              opacity: Math.min(1, enter * 1.3),
              transform: `scale(${0.9 + 0.1 * enter})`,
              transformOrigin: "center",
              background: theme.cardBg,
              border: `2px solid ${lit ? c : theme.gridColor}`,
              borderRadius: 14,
              boxShadow: lit ? `0 0 26px ${c}44` : theme.cardShadow,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 11,
                fontFamily: theme.fontMono,
                fontSize: 13,
                fontWeight: 700,
                color: theme.textMuted,
              }}
            >
              [{i}]
            </div>
            <IconChip node={nd} theme={theme} size={Math.min(52, ch * 0.33)} color={c} />
            <div
              style={{
                fontFamily: theme.fontHeading,
                fontSize: Math.min(23, cw * 0.15),
                fontWeight: 800,
                color: theme.textPrimary,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {nd.label}
            </div>
            {nd.sublabel ? (
              <div
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 13,
                  color: theme.textMuted,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {nd.sublabel}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
