import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, IconChip, nodeColor, emptyNote } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// Stacked tiers: each node is a full-width horizontal band, ordered top→bottom
// by `tier`. A pulse sweeps down through the layers to show traversal. Fits
// cache levels, the memory hierarchy, the network / OSI stack, CDN edge→origin,
// storage tiers.
export const LayersScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = [...scene.nodes].sort((a, b) => a.tier - b.tier);
  if (nodes.length < 1) return emptyNote(theme, "No layer data for this scene.");

  const n = nodes.length;
  const MX = 150;
  const TOP = 44;
  const BOT = CH - 44;
  const gap = 16;
  const bandH = (BOT - TOP - gap * (n - 1)) / n;
  const bandW = CW - 2 * MX;

  // A downward pulse highlighting the "current" layer over ~2.4s, then repeat.
  const cycle = (localFrame % Math.round(fps * 2.4)) / (fps * 2.4);
  const activeIdx = Math.min(n - 1, Math.floor(cycle * n));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {nodes.map((nd, i) => {
        const enter = spring({
          frame: localFrame - i * 6,
          fps,
          config: { damping: 17, stiffness: 150 },
        });
        const col = nodeColor(theme, nd);
        const lit = i === activeIdx;
        const depth = n > 1 ? i / (n - 1) : 0;
        const x = MX;
        const y = TOP + i * (bandH + gap);
        return (
          <div
            key={nd.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: bandW,
              height: bandH,
              opacity: Math.min(1, enter * 1.3),
              transform: `translateX(${interpolate(enter, [0, 1], [-30, 0])}px)`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "0 28px",
              boxSizing: "border-box",
              borderRadius: 16,
              background: `linear-gradient(90deg, ${theme.cardBg}, ${theme.canvasBg})`,
              border: `2px solid ${lit ? col : theme.gridColor}`,
              boxShadow: lit ? `0 0 34px ${col}44` : "none",
            }}
          >
            {/* left accent rail colored by depth */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 7,
                borderRadius: "16px 0 0 16px",
                background: col,
                opacity: 0.5 + 0.5 * (1 - depth),
              }}
            />
            <IconChip node={nd} theme={theme} size={Math.min(60, bandH - 28)} color={col} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: theme.fontHeading,
                  fontSize: 30,
                  fontWeight: 800,
                  color: theme.textPrimary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {nd.label}
              </div>
              {nd.sublabel ? (
                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 17,
                    color: theme.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 3,
                  }}
                >
                  {nd.sublabel}
                </div>
              ) : null}
            </div>
            <div
              style={{
                fontFamily: theme.fontMono,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 2,
                color: lit ? col : theme.textMuted,
                border: `1px solid ${lit ? col : theme.gridColor}`,
                borderRadius: 8,
                padding: "6px 12px",
                flex: "0 0 auto",
              }}
            >
              L{i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
};
