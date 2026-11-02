import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { VideoRenderPayload } from "../types/schema";
import { getTheme } from "../styles/themes";
import { ScenarioWorld, type WorldStatus } from "./ScenarioWorld";

// Stage-2 proving ground: drives ScenarioWorld through a two-beat mini-story so
// we can see the camera drift, the count-up, and the world REACTING to the
// narrative (the crowd tints red and goes dark when the cache key expires).
// Actors + story beats come from the real payload; the per-beat headline copy
// is demo-authored for now (a later step moves it into the scene schema).

const CHANNEL = "Blast Radius";

export const ScenarioWorldDemo: React.FC<{ payload: VideoRenderPayload }> = ({ payload }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const theme = getTheme(payload.theme_id);
  const scenario = payload.scenario;

  // Crowd size: first number in the scenario setting (e.g. "42,000"), else 500.
  const popMatch = (scenario?.setting || "").match(/[\d,]{2,}/);
  const population = popMatch ? parseInt(popMatch[0].replace(/,/g, ""), 10) : 500;

  const actors = (scenario?.actors || []).map((a) => ({ name: a.name, role: a.role }));
  const beatA = payload.scenes.find((s) => s.story_beat)?.story_beat || "The system runs calmly under normal load.";
  const beatB =
    payload.scenes.filter((s) => s.story_beat)[2]?.story_beat ||
    "Then the failure hits and everything changes at once.";

  // Two beats: setup (normal) -> stampede (critical).
  const SPLIT = Math.round(durationInFrames * 0.44);
  const inA = frame < SPLIT;
  const localFrame = inA ? frame : frame - SPLIT;

  const status: WorldStatus = inA ? "normal" : "critical";
  const onlineFraction = inA
    ? 1
    : // crowd collapses from full to a sliver as the beat plays
      interpolate(localFrame, [8, 46], [1, 0.08], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const headlineLines: [string, string] = inA
    ? ["42,000 shoppers,", "one cache key"]
    : ["The key expires,", "everyone misses"];

  const sectionLabel = inA ? "the setup" : "the stampede";
  const sectionValue = inA ? "flash sale, 12:00 PM" : "12:00 PM sharp";

  return (
    <AbsoluteFill style={{ backgroundColor: theme.canvasBg }}>
      <ScenarioWorld
        theme={theme}
        frame={frame}
        localFrame={localFrame}
        fps={useVideoConfig().fps}
        channelName={CHANNEL}
        sectionLabel={sectionLabel}
        sectionValue={sectionValue}
        headlineLines={headlineLines}
        accentLine={1}
        population={population}
        onlineFraction={onlineFraction}
        status={status}
        pillPrefix="online"
        actors={actors}
        beatText={inA ? beatA : beatB}
        progress={durationInFrames > 1 ? frame / (durationInFrames - 1) : 0}
        selfContained
      />
    </AbsoluteFill>
  );
};
