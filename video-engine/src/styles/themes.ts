// Bespoke dual-theme token map (requirement section 7.3).
// ARCHITECT_PAPER = warm archival drafting paper (system design / deep dives).
// WAR_ROOM_HUD    = matte carbon SRE console (outages / incidents / job news).

import type React from "react";
import type { ThemeId } from "../types/schema";

export interface Theme {
  id: ThemeId;
  canvasBg: string;
  gridColor: string;
  gridKind: "rule" | "dot";
  cardBg: string;
  cardShadow: string;
  borderStyle: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  accentCritical: string;
  fontHeading: string;
  fontMono: string;
  // node status -> color
  statusColors: Record<"normal" | "active" | "warning" | "critical", string>;
  // system status -> color
  systemStatusColors: Record<
    "HEALTHY" | "DEGRADED" | "CRITICAL" | "RECOVERING",
    string
  >;
  packetColors: Record<"cyan" | "orange" | "crimson" | "emerald", string>;
  shikiTheme: string;
}

// Dark "blueprint" variant (system design / deep dives / new releases). Blue +
// violet accents on a deep navy stage — the clean, glowing ByteMonk look.
export const ARCHITECT_PAPER: Theme = {
  id: "ARCHITECT_PAPER",
  canvasBg: "#0A0E16",
  gridColor: "#1A2233",
  gridKind: "dot",
  cardBg: "#121A28",
  cardShadow: "0 10px 30px rgba(0,0,0,0.5)",
  borderStyle: "1px solid #223049",
  textPrimary: "#EAF0F8",
  textMuted: "#8092AC",
  accentPrimary: "#4EA8FF",
  accentSecondary: "#7C5CFF",
  accentCritical: "#FF5C7A",
  fontHeading: "'Space Grotesk', 'Segoe UI', sans-serif",
  fontMono: "'IBM Plex Mono', 'Consolas', monospace",
  statusColors: {
    normal: "#8092AC",
    active: "#4EA8FF",
    warning: "#F2B84B",
    critical: "#FF5C7A",
  },
  systemStatusColors: {
    HEALTHY: "#2BD4A0",
    DEGRADED: "#F2B84B",
    CRITICAL: "#FF5C7A",
    RECOVERING: "#4EA8FF",
  },
  packetColors: {
    cyan: "#38E8D0",
    orange: "#F2B84B",
    crimson: "#FF5C7A",
    emerald: "#2BD4A0",
  },
  shikiTheme: "github-dark",
};

export const WAR_ROOM_HUD: Theme = {
  id: "WAR_ROOM_HUD",
  canvasBg: "#0B0C10",
  gridColor: "#1F2430",
  gridKind: "dot",
  cardBg: "#12151E",
  cardShadow: "0 0 28px rgba(0,245,212,0.10)",
  borderStyle: "1px solid #2A303C",
  textPrimary: "#F3F4F6",
  textMuted: "#8A93A6",
  accentPrimary: "#00F5D4",
  accentSecondary: "#FFB000",
  accentCritical: "#FF2A54",
  fontHeading: "'JetBrains Mono', 'Consolas', monospace",
  fontMono: "'JetBrains Mono', 'Consolas', monospace",
  statusColors: {
    normal: "#8A93A6",
    active: "#00F5D4",
    warning: "#FFB000",
    critical: "#FF2A54",
  },
  systemStatusColors: {
    HEALTHY: "#00F5D4",
    DEGRADED: "#FFB000",
    CRITICAL: "#FF2A54",
    RECOVERING: "#38BDF8",
  },
  packetColors: {
    cyan: "#00F5D4",
    orange: "#FFB000",
    crimson: "#FF2A54",
    emerald: "#34D399",
  },
  shikiTheme: "vesper",
};

export const THEMES: Record<ThemeId, Theme> = {
  ARCHITECT_PAPER,
  WAR_ROOM_HUD,
};

export const getTheme = (id: ThemeId): Theme => THEMES[id] ?? ARCHITECT_PAPER;

// CSS background-image for the canvas grid, given a theme.
export const gridBackground = (theme: Theme): React.CSSProperties => {
  if (theme.gridKind === "dot") {
    return {
      backgroundColor: theme.canvasBg,
      backgroundImage: `radial-gradient(${theme.gridColor} 1.5px, transparent 1.5px)`,
      backgroundSize: "24px 24px",
    };
  }
  return {
    backgroundColor: theme.canvasBg,
    backgroundImage: `linear-gradient(${theme.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${theme.gridColor} 1px, transparent 1px)`,
    backgroundSize: "24px 24px",
  };
};
