import React from "react";
import { spring } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";
import { CW, CH, IconChip, nodeColor, emptyNote, Arrow } from "./diagramParts";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// A UML-style SEQUENCE diagram: participants as columns, time flowing DOWN,
// each edge a message arrow (with its label) at the next time step. Messages
// reveal one at a time. Fits handshakes (TCP/TLS), auth flows (OAuth), an API
// request lifecycle, a 2-phase commit, DNS resolution.
export const SequenceScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const nodes = scene.nodes;
  if (nodes.length < 2) return emptyNote(theme, "No sequence data for this scene.");

  const byId: Record<string, number> = {};
  nodes.forEach((nd, i) => (byId[nd.id] = i));
  const msgs = scene.edges.filter(
    (e) => byId[e.source] !== undefined && byId[e.target] !== undefined,
  );

  const n = nodes.length;
  const MX = 170;
  const colW = (CW - 2 * MX) / Math.max(1, n - 1);
  const xOf = (i: number) => (n === 1 ? CW / 2 : MX + i * colW);
  const headY = 60;
  const headH = 72;
  const lifeTop = headY + headH;
  const rowTop = lifeTop + 54;
  const rowGap = Math.min(88, (CH - rowTop - 44) / Math.max(1, msgs.length));
  const colorOf = (pc: string) =>
    theme.packetColors[pc as keyof typeof theme.packetColors] ?? theme.accentPrimary;
  const revealEach = Math.max(6, Math.round(fps * 0.5));
  const liveIdx = Math.min(msgs.length - 1, Math.floor(localFrame / revealEach));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* lifelines */}
        {nodes.map((nd, i) => (
          <line
            key={`life-${nd.id}`}
            x1={xOf(i)}
            y1={lifeTop}
            x2={xOf(i)}
            y2={CH - 28}
            stroke={theme.gridColor}
            strokeWidth={2}
            strokeDasharray="4 8"
          />
        ))}
        {/* messages, revealed over time */}
        {msgs.map((e, i) => {
          const si = byId[e.source];
          const ti = byId[e.target];
          const y = rowTop + i * rowGap;
          const reveal = Math.max(0, Math.min(1, (localFrame - i * revealEach) / 10));
          if (reveal <= 0) return null;
          const col = colorOf(e.packet_color);
          if (si === ti) {
            // self-message: a small loop off the lifeline
            const x = xOf(si);
            return (
              <g key={e.id} style={{ opacity: reveal }}>
                <path
                  d={`M${x},${y} h48 v26 h-48`}
                  fill="none"
                  stroke={col}
                  strokeWidth={2.5}
                  strokeOpacity={0.6}
                />
                <path d={`M${x},${y + 26} l12,-5 l0,10 Z`} fill={col} />
                {e.label ? (
                  <text
                    x={x + 58}
                    y={y + 17}
                    fill={theme.textPrimary}
                    style={{ fontFamily: theme.fontMono, fontSize: 15, fontWeight: 700 }}
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          }
          return (
            <Arrow
              key={e.id}
              p0={[xOf(si), y]}
              p1={[xOf(ti), y]}
              color={col}
              frame={localFrame}
              animate={i === liveIdx}
              label={e.label}
              theme={theme}
              reveal={reveal}
              width={2.75}
            />
          );
        })}
      </svg>
      {/* participant headers */}
      {nodes.map((nd, i) => {
        const enter = spring({
          frame: localFrame - i * 5,
          fps,
          config: { damping: 16, stiffness: 150 },
        });
        const c = nodeColor(theme, nd);
        return (
          <div
            key={nd.id}
            style={{
              position: "absolute",
              left: xOf(i),
              top: headY,
              width: Math.min(colW - 18, 250),
              height: headH,
              transform: "translateX(-50%)",
              opacity: enter,
              background: theme.cardBg,
              border: `2px solid ${nd.status !== "normal" ? c : theme.gridColor}`,
              borderRadius: 14,
              boxShadow: theme.cardShadow,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 14px",
              boxSizing: "border-box",
            }}
          >
            <IconChip node={nd} theme={theme} size={40} color={c} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: theme.fontHeading,
                  fontSize: 20,
                  fontWeight: 700,
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
                    fontSize: 12,
                    color: theme.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {nd.sublabel}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
