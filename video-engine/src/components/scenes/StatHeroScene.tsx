import React from "react";
import { spring, interpolate } from "remotion";
import type { SceneSpec } from "../../types/schema";
import type { Theme } from "../../styles/themes";

interface Props {
  scene: SceneSpec;
  theme: Theme;
  localFrame: number;
  fps: number;
}

// Split "$180k" / "125ms" / "20%" / "3.2x" into prefix, number, suffix so the
// number can count up while the unit stays put.
const parseStat = (raw: string) => {
  const m = (raw || "").match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return { prefix: "", target: 0, suffix: raw || "", decimals: 0, ok: false };
  const prefix = m[1];
  const numStr = m[2].replace(/,/g, "");
  const suffix = m[3];
  const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
  return { prefix, target: parseFloat(numStr), suffix, decimals, ok: true };
};

// A single oversized metric that counts up — the most dramatic beat of the video.
export const StatHeroScene: React.FC<Props> = ({ scene, theme, localFrame, fps }) => {
  const { prefix, target, suffix, decimals, ok } = parseStat(scene.hero_stat_value || "");

  const count = interpolate(localFrame, [8, 46], [0, target], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shown = ok
    ? count.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : scene.hero_stat_value || "";

  const pop = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 120 } });
  const labelIn = spring({
    frame: localFrame - 24,
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        position: "relative",
      }}
    >
      {/* Radial glow behind the number */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accentPrimary}22 0%, transparent 60%)`,
          opacity: pop,
        }}
      />
      <div
        style={{
          fontFamily: theme.fontHeading,
          fontSize: 240,
          fontWeight: 800,
          lineHeight: 0.95,
          letterSpacing: -4,
          color: theme.accentPrimary,
          textShadow: `0 0 60px ${theme.accentPrimary}55`,
          opacity: pop,
          transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})`,
          zIndex: 1,
        }}
      >
        {prefix}
        {shown}
        <span style={{ fontSize: 110, color: theme.textPrimary }}>{suffix}</span>
      </div>
      {scene.hero_stat_label ? (
        <div
          style={{
            fontFamily: theme.fontHeading,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: theme.textPrimary,
            opacity: labelIn,
            transform: `translateY(${interpolate(labelIn, [0, 1], [16, 0])}px)`,
            zIndex: 1,
            textAlign: "center",
          }}
        >
          {scene.hero_stat_label}
        </div>
      ) : null}
      {scene.hero_stat_sub ? (
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 24,
            color: theme.textMuted,
            opacity: labelIn,
            zIndex: 1,
            textAlign: "center",
            maxWidth: 1200,
          }}
        >
          {scene.hero_stat_sub}
        </div>
      ) : null}
    </div>
  );
};
