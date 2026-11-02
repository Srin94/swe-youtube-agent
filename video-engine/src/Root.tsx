import React from "react";
import { Composition, staticFile } from "remotion";
import "./global.css";
import { MasterComposition } from "./MasterComposition";
import { ScenarioWorldDemo } from "./components/ScenarioWorldDemo";
import { IconCrowdDemo } from "./components/IconCrowdDemo";
import { IconWorldProbe } from "./components/IconWorldProbe";
import type { VideoRenderPayload } from "./types/schema";
import { FALLBACK_PAYLOAD } from "./fallbackPayload";

const FPS = 60;
const WIDTH = 1920;
const HEIGHT = 1080;

// Load the render payload that the Python pipeline copies into
// public/assets/render_payload.json. Falls back to the bundled mock so the
// studio / render always has something valid to draw.
const loadPayload = async (): Promise<VideoRenderPayload> => {
  try {
    const res = await fetch(staticFile("assets/render_payload.json"));
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as VideoRenderPayload;
    if (!json.scenes || json.scenes.length === 0) throw new Error("no scenes");
    return json;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[Root] Using fallback payload:", err);
    return FALLBACK_PAYLOAD;
  }
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SWEMasterVideo"
        component={MasterComposition}
        durationInFrames={Math.ceil(FALLBACK_PAYLOAD.total_duration_sec * FPS)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ payload: FALLBACK_PAYLOAD }}
        calculateMetadata={async () => {
          const payload = await loadPayload();
          const duration = Math.max(
            1,
            Math.ceil((payload.total_duration_sec || 1) * FPS),
          );
          return {
            durationInFrames: duration,
            props: { payload },
          };
        }}
      />

      {/* Stage-2 proving ground: the animated CSS faux-3D scenario world driven
          through a two-beat mini-story. Rendered on its own so it can be
          iterated without touching the main video. */}
      <Composition
        id="ScenarioWorldDemo"
        component={ScenarioWorldDemo}
        durationInFrames={9 * FPS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ payload: FALLBACK_PAYLOAD }}
        calculateMetadata={async () => {
          const payload = await loadPayload();
          return { props: { payload } };
        }}
      />

      {/* Literal icon-crowd proof: 150 person-glyphs rush one gate, then jam
          when crowd control is removed. Self-contained (no payload needed). */}
      <Composition
        id="IconCrowdDemo"
        component={IconCrowdDemo}
        durationInFrames={9 * FPS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Look-dev probe: drive IconWorld in any formation via --props. */}
      <Composition
        id="IconWorldProbe"
        component={IconWorldProbe}
        durationInFrames={8 * FPS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          formation: "rush" as const,
          unit: "person" as const,
          population: 100000,
          activeFraction: 0.18,
          status: "critical" as const,
          headline1: "100,000 fans,",
          headline2: "one entrance",
          sectionLabel: "flash sale",
          sectionValue: "12:00 PM",
          gateLabel: "entrance",
          metricPrefix: "inside",
          beat: "One gate can't drain the surge — the crush builds.",
          warRoom: false,
        }}
      />
    </>
  );
};
