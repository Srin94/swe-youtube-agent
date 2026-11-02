import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ARCHITECT_PAPER, WAR_ROOM_HUD } from "../styles/themes";
import { IconWorld } from "./IconWorld";
import type { GlyphKind } from "./IconCrowd";
import type { Formation } from "./crowdFormations";

// Standalone probe: renders IconWorld from flat props so each formation/unit can
// be inspected with `remotion still ... --props='{...}'`. Not used by the real
// video — purely a look-dev harness.
// All optional so the component type stays assignable to Remotion's loose
// component type; sensible defaults fill anything a --props call omits.
export interface IconWorldProbeProps {
  formation?: Formation;
  unit?: GlyphKind;
  population?: number;
  activeFraction?: number;
  status?: "normal" | "warning" | "critical";
  headline1?: string;
  headline2?: string;
  sectionLabel?: string;
  sectionValue?: string;
  gateLabel?: string;
  metricPrefix?: string;
  beat?: string;
  warRoom?: boolean;
}

export const IconWorldProbe: React.FC<IconWorldProbeProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <IconWorld
      theme={p.warRoom ? WAR_ROOM_HUD : ARCHITECT_PAPER}
      frame={frame}
      localFrame={frame}
      fps={fps}
      channelName="Blast Radius"
      sectionLabel={p.sectionLabel ?? "the setup"}
      sectionValue={p.sectionValue}
      headlineLines={[p.headline1 ?? "100,000 fans,", p.headline2 ?? "one entrance"]}
      unit={p.unit ?? "person"}
      formation={p.formation ?? "rush"}
      population={p.population ?? 100000}
      activeFraction={p.activeFraction ?? 0.18}
      status={p.status ?? "critical"}
      metricPrefix={p.metricPrefix ?? "inside"}
      gateLabel={p.gateLabel ?? "entrance"}
      actors={[]}
      beatText={p.beat}
      progress={durationInFrames > 1 ? frame / (durationInFrames - 1) : 0}
      selfContained
    />
  );
};
