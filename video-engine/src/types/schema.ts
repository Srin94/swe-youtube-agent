// TypeScript mirror of the Python Pydantic VideoRenderPayload contract in
// agent-backend/src/script_generator.py. These two MUST stay in lock-step.

export interface WordTimestamp {
  word: string;
  start_sec: number;
  end_sec: number;
}

export type SystemStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "RECOVERING";

export interface TelemetrySnapshot {
  incident_clock: string;
  rps: number;
  p99_latency_ms: number;
  error_rate_pct: number;
  system_status: SystemStatus;
  tradeoff_badge: string;
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
  | "SystemGraph"
  | "CodeDiff"
  | "BenchmarkChart"
  | "IncidentTimeline"
  | "JobMarketCard";

export interface SceneSpec {
  scene_id: number;
  chapter_title: string;
  narration_text: string;
  start_sec: number;
  duration_sec: number;
  visual_type: VisualType;
  camera_focus_node_id?: string | null;
  telemetry: TelemetrySnapshot;
  nodes: GraphNode[];
  edges: GraphEdge[];
  code_diff?: CodeDiffPayload | null;
  benchmarks: BenchmarkItem[];
  timeline_events: TimelineEventItem[];
  callout_keywords: string[];
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
  thumbnail: ThumbnailSpec;
  scenes: SceneSpec[];
  words: WordTimestamp[];
  total_duration_sec: number;
}
