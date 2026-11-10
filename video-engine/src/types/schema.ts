// TypeScript mirror of the Python Pydantic VideoRenderPayload contract in
// agent-backend/src/script_generator.py. These two MUST stay in lock-step.

export interface WordTimestamp {
  word: string;
  start_sec: number;
  end_sec: number;
}

export type HudLevel = "info" | "good" | "warning" | "critical";

export interface HudStat {
  label: string;
  value: string;
  emphasis: HudLevel;
}

// Category-adaptive right-rail HUD (replaces the old incident-only telemetry).
export interface SceneHud {
  context_label: string;
  context_value: string;
  status_text: string;
  status_level: HudLevel;
  stats: HudStat[];
  insight: string;
}

export type NodeStatus = "normal" | "active" | "warning" | "critical";

export interface GraphNode {
  id: string;
  label: string;
  sublabel: string;
  icon_slug: string;
  tier: number; // 1=Edge,2=Gateway,3=Compute,4=Cache/Queue,5=Storage
  status: NodeStatus;
}

export type PacketColor = "cyan" | "orange" | "crimson" | "emerald";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  packet_color: PacketColor;
  animate_packets: boolean;
}

export interface CodeDiffPayload {
  language: string;
  filename: string;
  before_code: string;
  after_code: string;
  highlight_explanation: string;
}

export interface BenchmarkItem {
  label: string;
  value: number;
  unit: string;
  is_winner: boolean;
}

export type Severity = "info" | "warning" | "critical" | "resolved";

export interface TimelineEventItem {
  timestamp_label: string;
  title: string;
  detail: string;
  severity: Severity;
}

export type VisualType =
  | "Intro"
  | "StatHero"
  | "ScenarioWorld"
  | "SystemGraph"
  | "Tree"
  | "Pipeline"
  | "Layers"
  | "Mesh"
  | "CodeDiff"
  | "BenchmarkChart"
  | "IncidentTimeline"
  | "JobMarketCard"
  | "Outro";

// Drives the ScenarioWorld visual: the animated CSS faux-3D "living world".
// The crowd of glowing units is the scenario's mass actor; online_fraction
// lights/darkens them and status recolors the whole stage.
export type CrowdUnit =
  | "person"
  | "car"
  | "ticket"
  | "server"
  | "box"
  | "request"
  | "database"
  | "file";

export type CrowdFormation = "rush" | "queue" | "jam" | "field" | "scatter";

export interface SceneWorld {
  // What the countable thing in this line literally is + how it moves. Optional
  // for back-compat with older payloads (MasterComposition falls back).
  unit_icon?: CrowdUnit;
  formation?: CrowdFormation;
  gate_label?: string | null;
  headline_line1: string;
  headline_line2: string;
  section_label: string;
  metric_prefix: string;
  population: number;
  online_fraction: number; // 0..1 — share that got through / is active / lit
  status: "normal" | "warning" | "critical";
}

// One concrete, named participant that recurs across scenes (e.g. "450
// drivers", "the pricing engine"). The viewer follows characters, not boxes.
export interface ScenarioActor {
  name: string;
  role: string;
  icon_slug: string;
}

// Ties one technical term to its plain real-world meaning inside the scenario.
export interface ConceptMapping {
  term: string;
  plain_meaning: string;
}

// The single concrete real-world story the WHOLE video is built around. Stage-2
// rendering animates this as a persistent world; keep it concrete + quantitative.
export interface Scenario {
  setting: string;
  analogy: string;
  actors: ScenarioActor[];
  concept_mappings: ConceptMapping[];
  plain_takeaway: string;
}

export interface SceneSpec {
  scene_id: number;
  chapter_title: string;
  narration_text: string;
  // One concrete sentence of what happens in the scenario during this scene.
  story_beat?: string | null;
  start_sec: number;
  duration_sec: number;
  visual_type: VisualType;
  camera_focus_node_id?: string | null;
  hud: SceneHud;
  nodes: GraphNode[];
  edges: GraphEdge[];
  code_diff?: CodeDiffPayload | null;
  benchmarks: BenchmarkItem[];
  timeline_events: TimelineEventItem[];
  callout_keywords: string[];
  // Intro: the "what we'll cover" agenda lines. Outro: recap lines.
  agenda_items?: string[];
  // StatHero: one oversized count-up metric (the punchy hook / mid-roll beat).
  hero_stat_value?: string | null;
  hero_stat_label?: string | null;
  hero_stat_sub?: string | null;
  // ScenarioWorld scene only: data driving the animated living-world visual.
  world?: SceneWorld | null;
}

export type ConnectorStyle = "vs_bolt" | "broken_arrow" | "upgrade_arrow";

export interface ThumbnailSpec {
  headline_text: string;
  badge_text: string;
  left_icon_slug: string;
  right_icon_slug: string;
  connector_style: ConnectorStyle;
}

export type TopicCategory =
  | "INCIDENT_POSTMORTEM"
  | "SYSTEM_DESIGN"
  | "JOB_MARKET"
  | "NEW_TECH_RELEASE";

export type ThemeId = "ARCHITECT_PAPER" | "WAR_ROOM_HUD";

export interface VideoRenderPayload {
  topic_category: TopicCategory;
  theme_id: ThemeId;
  youtube_title: string;
  youtube_description: string;
  youtube_tags: string[];
  pinned_comment: string;
  source_url: string;
  // The single concrete real-world scenario the whole video is built around.
  scenario?: Scenario | null;
  thumbnail: ThumbnailSpec;
  scenes: SceneSpec[];
  words: WordTimestamp[];
  total_duration_sec: number;
}
