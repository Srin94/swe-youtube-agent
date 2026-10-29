"""Structured script + telemetry AST generation via Gemini 2.5 Flash.

This module owns two LLM calls:

1. `select_topic(candidates)` — hands Gemini the scored shortlist and asks it
   to pick the single highest-retention, most-visualizable story.
2. `generate_script(topic, article_md)` — produces a fully-typed
   `VideoRenderPayload` (the strict JSON contract shared with Remotion) using
   `response_schema=VideoRenderPayload` for native structured output.

The Pydantic models below ARE the canonical data contract. The TypeScript
interfaces in `video-engine/src/types/schema.ts` mirror them one-to-one.
"""

from __future__ import annotations

import json
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

try:
    from . import config
except ImportError:  # pragma: no cover
    import config  # type: ignore


# ===========================================================================
# Strict data contract (mirrors video-engine/src/types/schema.ts)
# ===========================================================================
class WordTimestamp(BaseModel):
    word: str
    start_sec: float
    end_sec: float


class HudStat(BaseModel):
    """One metric tile in the right-rail HUD."""

    label: str = Field(
        description="Short metric name fit to the topic: 'RPS','p99','MEDIAN TC',"
        "'ROLES CUT','STARS','ADOPTION'"
    )
    value: str = Field(
        description="Formatted value WITH any unit: '82k','110ms','$180k','4.2M','+38%'"
    )
    emphasis: Literal["normal", "good", "warning", "critical"] = "normal"


class SceneHud(BaseModel):
    """Category-adaptive right-rail HUD.

    This replaces the old incident-only telemetry. The metrics shown MUST fit
    the topic — never force RPS / p99 / error-rate onto a job-market or release
    video. The LLM picks a context readout, a status, and 2-4 real metrics.
    """

    context_label: str = Field(
        description="Readout label fit to the topic: 'INCIDENT CLOCK' (outage), "
        "'AS OF' (job market), 'VERSION' (release), 'SCALE' (system design)"
    )
    context_value: str = Field(
        description="e.g. 'T+00:06:00', 'Jul 2025', 'v1.0.0', '10M users'"
    )
    status_text: str = Field(
        description="Short status fit to topic. Outage: HEALTHY/DEGRADED/CRITICAL/"
        "RECOVERING. Job market: HIRING/FROZEN/LAYOFFS/REBOUND. Release: ALPHA/BETA/"
        "STABLE/SHIPPING. System design: STABLE/SCALING/BOTTLENECK/SOLVED"
    )
    status_level: Literal["info", "good", "warning", "critical"] = "info"
    stats: List[HudStat] = Field(
        default_factory=list,
        description="2 to 4 metrics that genuinely fit THIS topic. Outage: RPS, "
        "p99, error rate. Job market: roles cut, severance, hiring delta, comp. "
        "Release: stars, version, benchmark win, adoption. NEVER invent RPS or "
        "latency for a non-technical topic.",
    )
    insight: str = Field(
        description="One-line trade-off or takeaway for this beat, e.g. "
        "'Headcount Cost vs AI Capex'"
    )


class GraphNode(BaseModel):
    id: str
    label: str
    sublabel: str = Field(description="e.g., 'p99: 12ms' or 'Shard 01'")
    icon_slug: str = Field(
        description="Simple-icons slug e.g. 'postgresql', 'redis', 'cloudflare', 'rust', 'docker'"
    )
    tier: int = Field(
        description="1=Edge/Client, 2=Gateway/Auth, 3=Compute/Service, 4=Cache/Queue, 5=Storage"
    )
    status: Literal["normal", "active", "warning", "critical"] = "normal"


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    packet_color: Literal["cyan", "orange", "crimson", "emerald"] = "cyan"
    animate_packets: bool = True


class CodeDiffPayload(BaseModel):
    language: str = Field(description="e.g., 'typescript', 'rust', 'go', 'python', 'sql'")
    filename: str
    before_code: str
    after_code: str
    highlight_explanation: str


class BenchmarkItem(BaseModel):
    label: str
    value: float
    unit: str
    is_winner: bool = False


class TimelineEventItem(BaseModel):
    timestamp_label: str
    title: str
    detail: str
    severity: Literal["info", "warning", "critical", "resolved"]


class SceneSpec(BaseModel):
    scene_id: int
    chapter_title: str = Field(description="Short 2-4 word HUD chapter title")
    narration_text: str = Field(description="Spoken script for this scene (15 to 30 words)")
    start_sec: float = 0.0
    duration_sec: float = 7.0
    visual_type: Literal[
        "SystemGraph", "CodeDiff", "BenchmarkChart", "IncidentTimeline", "JobMarketCard"
    ]
    camera_focus_node_id: Optional[str] = Field(
        default=None, description="Node ID to zoom into, or null for full view"
    )
    hud: SceneHud
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    code_diff: Optional[CodeDiffPayload] = None
    benchmarks: List[BenchmarkItem] = Field(default_factory=list)
    timeline_events: List[TimelineEventItem] = Field(default_factory=list)
    callout_keywords: List[str] = Field(
        default_factory=list,
        description="2-3 exact words in narration_text to highlight on screen",
    )


class ThumbnailSpec(BaseModel):
    headline_text: str = Field(
        description="Strictly 3 to 4 bold words, e.g. 'WHY REDIS CRASHED' or '125ms TO 12ms'"
    )
    badge_text: str = Field(description="e.g. 'POST-MORTEM' or 'SYSTEM DESIGN'")
    left_icon_slug: str
    right_icon_slug: str
    connector_style: Literal["vs_bolt", "broken_arrow", "upgrade_arrow"]


class VideoRenderPayload(BaseModel):
    topic_category: Literal[
        "INCIDENT_POSTMORTEM", "SYSTEM_DESIGN", "JOB_MARKET", "NEW_TECH_RELEASE"
    ]
    theme_id: Literal["ARCHITECT_PAPER", "WAR_ROOM_HUD"]
    youtube_title: str = Field(description="High-CTR title under 70 chars")
    youtube_description: str
    youtube_tags: List[str]
    pinned_comment: str = Field(
        description="Opinionated engineering trade-off question to spark comments"
    )
    source_url: str
    thumbnail: ThumbnailSpec
    scenes: List[SceneSpec]
    words: List[WordTimestamp] = Field(default_factory=list)
    total_duration_sec: float = 0.0


# ===========================================================================
# Gemini client helpers
# ===========================================================================
def _get_client():
    """Lazily construct a google-genai client (import + key validation)."""
    try:
        from google import genai  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "google-genai is not installed. `pip install google-genai`."
        ) from exc
    return genai.Client(api_key=config.require_gemini())


# ---------------------------------------------------------------------------
# Topic selection (shortlist -> single winner)
# ---------------------------------------------------------------------------
class _TopicChoice(BaseModel):
    chosen_index: int = Field(description="0-based index of the winning candidate")
    reason: str = Field(description="One sentence: why this one wins on retention")


_TOPIC_SELECT_PROMPT = """You are the editorial director of a high-retention \
software-engineering YouTube channel. From the candidate list, pick the SINGLE \
story with the highest viewer-retention potential AND strong visualizability \
(something we can turn into animated system graphs, code diffs, benchmark bars, \
or an incident timeline).

Prefer: production outages/post-mortems with hard numbers, system-design \
migrations with before/after architecture, framework/benchmark battles with \
measurable wins, and SWE job-market/layoff/comp shifts. Avoid vague opinion \
pieces with nothing concrete to animate.

Return the 0-based index of the winner."""


def select_topic(candidates: list) -> int:
    """Ask Gemini to pick the best candidate; return its index.

    `candidates` is a list of objects exposing `.title`, `.url`, `.source`,
    `.points`, `.comments` (i.e. ingest_scout.Candidate). Falls back to index 0
    (highest score) if the LLM call fails.
    """
    if not candidates:
        raise ValueError("No candidates to select from.")
    shortlist = candidates[: config.LLM_SHORTLIST]
    listing = "\n".join(
        f"[{i}] ({c.source}, {c.points}pts/{c.comments}c) {c.title} :: {c.url}"
        for i, c in enumerate(shortlist)
    )
    try:
        client = _get_client()
        resp = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=f"{_TOPIC_SELECT_PROMPT}\n\nCANDIDATES:\n{listing}",
            config={
                "response_mime_type": "application/json",
                "response_schema": _TopicChoice,
                "temperature": 0.3,
            },
        )
        choice = _TopicChoice.model_validate_json(resp.text)
        idx = max(0, min(choice.chosen_index, len(shortlist) - 1))
        print(f"[script] Gemini picked [{idx}]: {choice.reason}")
        return idx
    except Exception as exc:  # noqa: BLE001
        print(f"[script] Topic selection failed ({exc}); defaulting to top-scored.")
        return 0


# ---------------------------------------------------------------------------
# Full script / telemetry generation
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """You are the showrunner AND principal engineer for a premium \
software-engineering YouTube channel. You convert a technical source article \
into a tightly-paced, highly-visual 65-110 second video as a strict JSON \
VideoRenderPayload.

NON-NEGOTIABLE RETENTION RULES:
1. HOOK (Scene 1, 0:00-0:07): open with a HARD metric, failure event, or a \
surprising architectural contradiction. NEVER open with "In today's video", \
"Welcome back", or "Hey everyone".
2. PACING: produce 7 to 9 scenes. Each scene narration is 15-30 spoken words. \
Total spoken duration must land between 65 and 110 seconds.
3. PROGRESSIVE GRAPH EVOLUTION: when visual_type == "SystemGraph", scene N \
starts with 3-4 baseline nodes; scene N+1 ADDS the bottleneck / cache / queue / \
shard node so the architecture visibly evolves. Reuse node ids across scenes.
4. THEME SELECTION (strict): INCIDENT_POSTMORTEM and JOB_MARKET => "WAR_ROOM_HUD". \
SYSTEM_DESIGN and NEW_TECH_RELEASE => "ARCHITECT_PAPER".
5. VISUAL VARIETY + NO EMPTY SCENES (critical): pick the visual_type that fits \
each beat AND fully populate its data field. A scene whose data is empty renders \
blank and is unacceptable — especially Scene 1.
   - SystemGraph  -> MUST have >=3 nodes and >=2 edges.
   - CodeDiff     -> MUST have code_diff with before_code and after_code.
   - BenchmarkChart -> MUST have >=2 benchmarks.
   - IncidentTimeline -> MUST have >=3 timeline_events.
   - JobMarketCard -> MUST have >=3 benchmarks (e.g. roles cut, severance weeks, \
hiring delta, comp) and MAY add timeline_events for notable moments.
   Pick visual_type by topic: INCIDENT_POSTMORTEM favors IncidentTimeline + \
SystemGraph; SYSTEM_DESIGN favors SystemGraph + CodeDiff + BenchmarkChart; \
NEW_TECH_RELEASE favors BenchmarkChart + CodeDiff + SystemGraph; JOB_MARKET \
favors JobMarketCard + BenchmarkChart + IncidentTimeline. Do NOT use an empty \
JobMarketCard as the hook.
6. HUD (category-adaptive, strict): fill each scene's `hud` with metrics that \
FIT THE TOPIC. Never put RPS / p99 / latency / error-rate / "INCIDENT CLOCK" on \
a JOB_MARKET or NEW_TECH_RELEASE video.
   - INCIDENT_POSTMORTEM: context 'INCIDENT CLOCK' + 'T+HH:MM:SS'; stats RPS, \
p99, error rate; status HEALTHY->DEGRADED->CRITICAL->RECOVERING across scenes.
   - SYSTEM_DESIGN: context 'SCALE'/'THROUGHPUT'; stats QPS, p99, cache hit %, \
cost; status STABLE/SCALING/BOTTLENECK/SOLVED.
   - JOB_MARKET: context 'AS OF' + a date; stats like 'ROLES CUT', 'SEVERANCE', \
'HIRING' (+/-%), 'MEDIAN TC'; status HIRING/FROZEN/LAYOFFS/REBOUND.
   - NEW_TECH_RELEASE: context 'VERSION'/'RELEASE'; stats STARS, benchmark win \
(e.g. '3.2x'), ADOPTION, 'VS' a rival; status ALPHA/BETA/STABLE/SHIPPING.
   Numbers should evolve scene-to-scene to tell the story. Set each stat's \
emphasis (good/warning/critical) to drive color.
7. icon_slug and thumbnail icon slugs MUST be real simpleicons.org slugs \
(e.g. postgresql, redis, cloudflare, rust, go, nodedotjs, docker, kubernetes, \
nginx, amazonaws, kafka).
8. callout_keywords: 2-3 words that appear VERBATIM in that scene's \
narration_text.
9. youtube_title under 70 chars, high-CTR. youtube_description includes \
chapter timestamps. pinned_comment is an opinionated engineering trade-off \
QUESTION that sparks debate.

Leave start_sec/duration_sec/words at defaults — the audio engine fills exact \
timestamps later. Return ONLY the JSON payload."""


def generate_script(
    topic_title: str,
    source_url: str,
    article_markdown: str,
) -> VideoRenderPayload:
    """Generate a fully-typed VideoRenderPayload from a source article."""
    client = _get_client()
    user_content = (
        f"SOURCE URL: {source_url}\n"
        f"HEADLINE: {topic_title}\n\n"
        f"SOURCE ARTICLE (markdown, may be truncated):\n{article_markdown}"
    )
    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[_SYSTEM_PROMPT, user_content],
        config={
            "response_mime_type": "application/json",
            "response_schema": VideoRenderPayload,
            "temperature": 0.8,
        },
    )
    payload = VideoRenderPayload.model_validate_json(resp.text)

    # Enforce the theme-selection rule deterministically (belt and suspenders).
    if payload.topic_category in ("INCIDENT_POSTMORTEM", "JOB_MARKET"):
        payload.theme_id = "WAR_ROOM_HUD"
    else:
        payload.theme_id = "ARCHITECT_PAPER"

    # Guarantee the source url round-trips even if the model omitted it.
    payload.source_url = payload.source_url or source_url

    # Repair any empty scenes so Zone A is never blank, then seed timings.
    _repair_scenes(payload)
    _seed_provisional_timings(payload)
    return payload


# ---------------------------------------------------------------------------
# Scene repair (safety net so a scene never renders empty)
# ---------------------------------------------------------------------------
def _parse_number(value: str) -> tuple[float, str]:
    """Extract a numeric magnitude and trailing unit from a stat value string.

    '82k' -> (82000, ''), '$180k' -> (180000, '$'), '110ms' -> (110, 'ms'),
    '+38%' -> (38, '%'), '3.2x' -> (3.2, 'x'). Falls back to (1.0, value).
    """
    cleaned = value.replace(",", "")
    m = re.search(r"-?\d+\.?\d*", cleaned)
    if not m:
        return 1.0, value.strip()
    num = float(m.group(0))
    tail = cleaned[m.end():].strip()
    lead = cleaned[: m.start()].strip()
    # Only a *standalone* k/M suffix (e.g. '82k', '4.2M') is a multiplier — not
    # the 'k' inside 'wks' or the 'm' inside 'ms'.
    suffix = re.match(r"([kKmM])\b", tail)
    if suffix:
        num *= 1_000 if suffix.group(1).lower() == "k" else 1_000_000
        tail = tail[suffix.end():].strip()
    return num, (tail or lead)


def _stats_to_benchmarks(scene: "SceneSpec") -> None:
    items: List[BenchmarkItem] = []
    for s in scene.hud.stats:
        num, unit = _parse_number(s.value)
        items.append(
            BenchmarkItem(
                label=s.label, value=num, unit=unit, is_winner=(s.emphasis == "good")
            )
        )
    if items:
        scene.benchmarks = items


def _repair_scenes(payload: VideoRenderPayload) -> None:
    """Guarantee each scene's visual has data; convert empties to a bar chart
    built from the (category-appropriate) HUD stats."""
    for sc in payload.scenes:
        if not sc.hud.stats:
            sc.hud.stats = [HudStat(label="SIGNAL", value="—")]

        empty = (
            (sc.visual_type == "SystemGraph" and len(sc.nodes) < 2)
            or (sc.visual_type == "CodeDiff" and sc.code_diff is None)
            or (sc.visual_type == "BenchmarkChart" and not sc.benchmarks)
            or (sc.visual_type == "IncidentTimeline" and not sc.timeline_events)
            or (sc.visual_type == "JobMarketCard" and not sc.benchmarks)
        )
        if not empty:
            continue
        # Fall back: render the HUD stats as a bar chart so Zone A is populated.
        print(
            f"[script] Scene {sc.scene_id} ({sc.visual_type}) had no data; "
            "repairing to BenchmarkChart from HUD stats."
        )
        if sc.visual_type not in ("BenchmarkChart", "JobMarketCard"):
            sc.visual_type = "BenchmarkChart"
        if not sc.benchmarks:
            _stats_to_benchmarks(sc)


def _seed_provisional_timings(payload: VideoRenderPayload) -> None:
    """Rough timing estimate (~2.6 words/sec) before real TTS alignment."""
    cursor = 0.0
    for scene in payload.scenes:
        words = max(1, len(scene.narration_text.split()))
        dur = round(words / 2.6, 2)
        scene.start_sec = round(cursor, 2)
        scene.duration_sec = dur
        cursor += dur + config.SCENE_GAP_MS / 1000.0
    payload.total_duration_sec = round(cursor, 2)


def save_payload(payload: VideoRenderPayload, path=None) -> None:
    path = path or config.RENDER_PAYLOAD_PATH
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload.model_dump(), fh, indent=2, ensure_ascii=False)
    print(f"[script] Wrote render payload -> {path}")


if __name__ == "__main__":
    # Emit the JSON schema so the TS side can be cross-checked.
    print(json.dumps(VideoRenderPayload.model_json_schema(), indent=2)[:1500])
