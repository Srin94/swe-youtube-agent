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
    from . import llm_providers
except ImportError:  # pragma: no cover
    import config  # type: ignore
    import llm_providers  # type: ignore


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


class SceneWorld(BaseModel):
    """Drives the ScenarioWorld visual: the animated CSS faux-3D 'living world'.

    The crowd of glowing units IS the scenario's mass actor; `online_fraction`
    lights or darkens them and the pill counts toward it, and `status` recolors
    the whole stage (normal=calm, warning/critical=the failure). This is how the
    one running story is shown as a moving scene instead of an abstract diagram.
    """

    unit_icon: Literal[
        "person", "car", "ticket", "server", "box", "request", "database", "file"
    ] = Field(
        default="person",
        description="What the COUNTABLE THING in this narration line literally is, "
        "drawn as many small icons. Map the noun to the closest icon: people/users/"
        "fans/customers/drivers->person; vehicles/rides/cabs->car; tickets/tokens/"
        "passes/seats->ticket; servers/nodes/workers/pods/instances->server; "
        "packages/orders/items/containers/deploys->box; requests/calls/packets/"
        "events/queries->request; databases/stores/shards->database; files/rows/"
        "records/logs/documents->file. Pick the one the viewer would recognise.",
    )
    formation: Literal["rush", "queue", "jam", "field", "scatter"] = Field(
        default="field",
        description="How the units MOVE this beat — the verb of the line. "
        "rush = many units stream toward one gate and pile up (thundering herd, "
        "flash sale, surge); queue = units line up and drain in orderly batches "
        "(message queue, rate limiter, waiting room); jam = units are already "
        "crushed at a choke point (an overload/outage beat); field = units fill a "
        "grid/lot and a fraction light up (N things at rest: rows, cars, servers, "
        "'online_fraction' is the lit share); scatter = units fan out from a hub "
        "(broadcast, fan-out, replication). Choose the one that matches the verb.",
    )
    gate_label: Optional[str] = Field(
        default=None,
        description="rush/queue/jam only: the <=10 char label on the gate the units "
        "push through, e.g. 'ENTRANCE', 'CHECKOUT', 'API', 'PRIMARY'. null otherwise.",
    )
    headline_line1: str = Field(
        description="Top headline line, punchy. <= 22 chars. e.g. '42,000 shoppers,'"
    )
    headline_line2: str = Field(
        description="Second headline line (gets the accent color). <= 22 chars. "
        "e.g. 'one cache key'"
    )
    section_label: str = Field(
        description="Mono kicker label for this beat: 'the setup', 'the problem', "
        "'the fix', 'the payoff'. <= 18 chars."
    )
    metric_prefix: str = Field(
        default="online",
        description="Label before the live count in the pill — what GOT THROUGH / is "
        "active: 'inside', 'served', 'parked', 'delivered', 'online'. <= 12 chars.",
    )
    population: int = Field(
        description="The crowd size the pill counts against, e.g. 42000, 500, 10000."
    )
    online_fraction: float = Field(
        description="0.0-1.0 share that got THROUGH / is active / is lit. 1.0 = all "
        "fine (calm); low = most stuck or dark (the failure beat). For a jam use a "
        "low value so the crush dominates; for a healthy field use a high value."
    )
    status: Literal["normal", "warning", "critical"] = Field(
        default="normal",
        description="normal = calm (accent color), warning/critical = the failure "
        "(amber/red). Drives the whole stage's color.",
    )


class SceneSpec(BaseModel):
    scene_id: int
    chapter_title: str = Field(description="Short 2-4 word HUD chapter title")
    narration_text: str = Field(description="Spoken script for this scene (15 to 30 words)")
    start_sec: float = 0.0
    duration_sec: float = 7.0
    visual_type: Literal[
        "Intro",
        "StatHero",
        "ScenarioWorld",
        "SystemGraph",
        "Tree",
        "Pipeline",
        "Layers",
        "Mesh",
        "Grid",
        "Sequence",
        "Flow",
        "CodeDiff",
        "BenchmarkChart",
        "IncidentTimeline",
        "JobMarketCard",
        "Outro",
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
    agenda_items: List[str] = Field(
        default_factory=list,
        description="Intro scene: 3-4 short 'what we'll cover' lines (3-5 words "
        "each). Outro scene: 2-3 one-line recap takeaways. Empty for all other "
        "visual types.",
    )
    hero_stat_value: Optional[str] = Field(
        default=None,
        description="StatHero scene ONLY: the single oversized number WITH unit, "
        "e.g. '20%', '125ms', '$180k', '3.2x'. Null for other visual types.",
    )
    hero_stat_label: Optional[str] = Field(
        default=None,
        description="StatHero scene ONLY: short label under the number, e.g. "
        "'OF THE INTERNET WENT DOWN', 'LATENCY CUT'.",
    )
    hero_stat_sub: Optional[str] = Field(
        default=None,
        description="StatHero scene ONLY: optional one-line context under the label.",
    )
    story_beat: Optional[str] = Field(
        default=None,
        description="One concrete sentence describing what happens IN THE SCENARIO "
        "during this scene (uses the scenario's named actors), grounding the visual "
        "in the running story rather than abstract architecture. <= 120 chars. "
        "e.g. '450 drivers quietly switch their app off, so the map looks empty.' "
        "Fill for every non-bookend scene.",
    )
    world: Optional[SceneWorld] = Field(
        default=None,
        description="ScenarioWorld scene ONLY: the data driving the animated "
        "living-world visual (headline, live metric, crowd status). Null otherwise.",
    )


class ScenarioActor(BaseModel):
    """One concrete, named participant in the real-world scenario.

    Actors recur across scenes so the viewer follows the SAME characters the
    whole video (e.g. '450 drivers', 'the pricing engine', 'the airport queue')
    instead of meeting a new abstract box every beat.
    """

    name: str = Field(
        description="Concrete name/handle, e.g. '450 drivers', 'Pricing engine', "
        "'Checkout cart'. <= 24 chars."
    )
    role: str = Field(
        description="What they do in the story, in plain words. <= 40 chars."
    )
    icon_slug: str = Field(
        default="",
        description="Optional simple-icons slug for this actor, or '' for none.",
    )


class ConceptMapping(BaseModel):
    """Ties one piece of technical jargon to its plain real-world meaning.

    This is the explicit anti-jargon contract: every key term the narration uses
    must be grounded here in everyday language tied to the scenario.
    """

    term: str = Field(
        description="The technical term, e.g. 'surge pricing', 'virtual queue', "
        "'anomaly detection', 'write-ahead log'."
    )
    plain_meaning: str = Field(
        description="What it means INSIDE THIS SCENARIO, in everyday words a "
        "non-engineer gets instantly. <= 70 chars."
    )


class Scenario(BaseModel):
    """The single concrete real-world story the whole video is built around.

    The anti-jargon lever: instead of narrating abstract architecture, every
    scene advances ONE tangible situation with named `actors`, and each technical
    concept is grounded via `concept_mappings`. Stage-2 rendering will animate
    this story as a persistent world, so keep it concrete and quantitative.
    """

    setting: str = Field(
        description="The concrete situation in one line, e.g. '500 Uber drivers "
        "waiting at SFO airport during a Friday-night surge'. <= 120 chars."
    )
    analogy: str = Field(
        description="An everyday 'it's like...' comparison a non-engineer gets "
        "instantly, e.g. 'It's like everyone in a stadium standing up to see "
        "better — so nobody sees better.' <= 140 chars."
    )
    actors: List[ScenarioActor] = Field(
        default_factory=list,
        description="2-4 named concrete participants that recur across scenes.",
    )
    concept_mappings: List[ConceptMapping] = Field(
        default_factory=list,
        description="2-4 jargon -> plain-meaning pairs grounding the key terms in "
        "the scenario. Every technical term the narration leans on appears here.",
    )
    plain_takeaway: str = Field(
        description="The one-sentence 'so what' a smart friend would remember, in "
        "human terms (no jargon). <= 160 chars."
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
    scenario: Optional[Scenario] = Field(
        default=None,
        description="The single concrete real-world scenario the WHOLE video is "
        "built around. Every scene must advance this one story (see Scenario).",
    )
    thumbnail: ThumbnailSpec
    scenes: List[SceneSpec]
    words: List[WordTimestamp] = Field(default_factory=list)
    total_duration_sec: float = 0.0


# ===========================================================================
# LLM generation (multi-provider with automatic fallback; see llm_providers)
# ===========================================================================
# All structured generation routes through `llm_providers.generate_structured`,
# which tries Gemini (native structured output) first and transparently falls
# back across the free OpenAI-compatible providers on overload / quota errors.


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
        choice = llm_providers.generate_structured(
            _TOPIC_SELECT_PROMPT,
            f"CANDIDATES:\n{listing}",
            _TopicChoice,
            temperature=0.3,
            label="topic-select",
        )
        idx = max(0, min(choice.chosen_index, len(shortlist) - 1))
        print(f"[script] LLM picked [{idx}]: {choice.reason}")
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
0. SCENARIO-FIRST (the most important rule — this is what separates us from \
every other faceless tech channel): before anything else, invent ONE concrete, \
specific, real-world scenario and build the ENTIRE video around it. Fill the \
top-level `scenario` object:
   - setting: a tangible situation with REAL numbers and a REAL place/moment \
(e.g. '500 drivers idling at SFO airport on a Friday night', not 'a distributed \
system under load').
   - analogy: one everyday 'it's like...' comparison a non-engineer gets \
instantly (stadium crowds, a restaurant queue, a highway on-ramp, a bank teller \
line). The analogy must actually MAP to the mechanism, not just be decoration.
   - actors: 2-4 NAMED concrete participants (e.g. '450 drivers', 'the pricing \
engine', 'the airport queue'). These SAME actors recur across scenes — the \
viewer follows characters, not abstract boxes.
   - concept_mappings: for EVERY technical term you will say, give its plain \
meaning inside the scenario. If a term has no mapping, do not use it.
   - plain_takeaway: the one human-language sentence a viewer repeats to a \
friend afterwards.
   Then every scene's narration_text must ADVANCE THIS ONE STORY using the named \
actors, and every scene MUST set `story_beat` to one concrete sentence of what \
happens in the scenario at that moment. Teach the engineering THROUGH the story. \
BANNED unless immediately grounded in the scenario in the same sentence: \
'leverages', 'robust', 'scalable', 'under the hood', 'at scale', naked metrics \
with no actor. Prefer 'the queue' over 'the buffer', 'waiting room' over \
'staging', 'bouncer' over 'rate limiter' — then name the real term once, mapped. The \
scenario drives the NARRATION and at most 2 ScenarioWorld beats — it does NOT \
mean most scenes use the ScenarioWorld visual; visual variety (rule 5) is \
equally non-negotiable.
1. STRUCTURE (mandatory bookends): the FIRST scene MUST be visual_type "Intro" \
and the LAST scene MUST be visual_type "Outro".
   - Intro (0:00-0:08): a punchy cold open. narration_text states the ONE \
provocative promise of the video (a hard number or contradiction), then "here's \
what we'll break down". Fill agenda_items with 3-4 short 'what we'll cover' lines \
(3-5 words each, e.g. 'The root cause', 'How the fix works', 'The real numbers'). \
NEVER "Welcome back" / "Hey everyone" / "In today's video".
   - Outro: narration_text thanks the viewer and asks them to SUBSCRIBE and \
comment. Fill agenda_items with 2-3 one-line recap takeaways.
2. PACING: produce 8 to 11 scenes TOTAL (including Intro + Outro). Each scene \
narration is 15-30 spoken words. Total spoken duration 80-135 seconds.
3. PROGRESSIVE GRAPH EVOLUTION: when visual_type == "SystemGraph", scene N \
starts with 3-4 baseline nodes; scene N+1 ADDS the bottleneck / cache / queue / \
shard node so the architecture visibly evolves. Reuse node ids across scenes. \
Keep node label <= 16 chars and sublabel <= 22 chars so nothing overflows.
4. THEME SELECTION (strict): INCIDENT_POSTMORTEM and JOB_MARKET => "WAR_ROOM_HUD". \
SYSTEM_DESIGN and NEW_TECH_RELEASE => "ARCHITECT_PAPER".
5. VISUAL VARIETY — TOP PRIORITY (as important as the scenario): the body \
(every scene between Intro and Outro) MUST look different beat to beat. HARD \
RULES, all mandatory: (a) use AT LEAST 5 DIFFERENT visual_type values across the \
video; (b) use any one visual_type AT MOST TWICE; (c) use ScenarioWorld AT MOST \
TWICE — it is a human accent, never the backbone; (d) never place two scenes of \
the same visual_type back-to-back. Lead with the specialized visuals \
(SystemGraph, CodeDiff, BenchmarkChart, IncidentTimeline, JobMarketCard, \
StatHero); use StatHero for the single most dramatic number (right after the \
Intro is ideal). Fully populate each scene's data field; an empty data field \
renders blank and is unacceptable.
   - Intro       -> MUST have 3-4 agenda_items.
   - StatHero    -> MUST set hero_stat_value (number+unit) and hero_stat_label.
   - ScenarioWorld -> MUST set `world`: unit_icon (what the countable thing in \
the line literally IS — person/car/ticket/server/box/request/database/file), \
formation (how they MOVE this beat — rush/queue/jam/field/scatter), gate_label \
(rush/queue/jam only), headline_line1/2, section_label, metric_prefix, \
population, online_fraction, status. Use ScenarioWorld for AT MOST 2 beats in \
the whole video — it is a human "what it feels like" accent, NOT the backbone. \
When you do use it, pick unit_icon + formation to MATCH THE WORDS of that line \
and vary the formation between the two beats so they don't look alike. \
e.g. '100,000 fans rush one gate' -> unit_icon person, formation rush, gate_label \
ENTRANCE, population 100000, online_fraction 0.1 (the jam); 'a million rows, no \
index' -> unit_icon file, formation field, online_fraction 0.08; 'orders pile up \
behind one worker' -> unit_icon box, formation queue, gate_label WORKER; 'one \
event fans out to every subscriber' -> unit_icon request, formation scatter. \
Show the arc through status/online_fraction: calm setup (normal, ~1.0), the \
failure/turn (critical, low), the payoff (normal, recovered). ALWAYS pick \
unit_icon + formation to MATCH THE WORDS of that exact line, so the viewer sees \
precisely what is being said — not an abstract chart.
   - SystemGraph -> a general service architecture (client->gateway->services\
->stores). MUST have >=3 nodes and >=2 edges; `tier` = column (1=edge..5=store).
   - Tree -> a HIERARCHY (DOM tree, B-tree, file system, dependency/call tree, \
decision tree). MUST have >=3 nodes + parent->child edges; set each node's \
`tier` to its DEPTH (root=1, children=2, grandchildren=3...).
   - Pipeline -> a SEQUENTIAL PROCESS (parser/compiler stages, a request \
lifecycle, CI/CD, an ETL/data pipeline). MUST have >=3 nodes; set `tier` to the \
STAGE ORDER (1,2,3...); stages render left-to-right.
   - Layers -> STACKED TIERS (cache levels, the memory hierarchy, the network/\
OSI stack, CDN edge->origin, storage tiers). MUST have >=2 nodes; set `tier` to \
the layer depth (1=top/closest to the user, higher=deeper).
   - Mesh -> an INTERCONNECTED NETWORK (distributed system, replication, a \
service mesh, peer-to-peer/gossip, a consensus cluster). MUST have >=3 nodes and \
several `edges` linking many of them.
   - Grid -> a GRID / MATRIX of cells (hash-table buckets, shards/partitions, \
memory cells/pages, a comparison matrix). `nodes` fill slots left-to-right, \
top-to-bottom. MUST have >=4 nodes; no edges required.
   - Sequence -> MESSAGES OVER TIME between participants (a TCP/TLS handshake, \
an OAuth flow, an API request lifecycle, a 2-phase commit, DNS resolution). \
`nodes` are the participants (columns); `edges` are the ordered messages — list \
them in TIME ORDER and set each edge's `label` to the message (<=20 chars, e.g. \
'SYN', '200 OK', 'grant token'). MUST have >=2 nodes and >=2 edges.
   - Flow -> a STATE MACHINE / FLOWCHART with branches and loops (control flow, \
a retry/backoff loop, a session/auth lifecycle, consensus roles, a decision \
tree with cycles). `nodes` are states/steps — set `tier` to the step rank \
(1,2,3...); multiple nodes MAY share a tier to branch. `edges` are transitions; \
set each edge's `label` to the condition (<=16 chars, e.g. 'on success', \
'retry', 'timeout'), and an edge pointing back to an earlier tier reads as a \
loop. MUST have >=3 nodes and >=2 edges.
   For SystemGraph/Tree/Pipeline/Layers/Mesh/Grid/Sequence/Flow, fill `nodes` \
(id, label <=16 chars, sublabel <=22 chars, icon_slug, tier, status) and `edges` \
(source, target, packet_color, plus `label` for Sequence and Flow) exactly as \
for SystemGraph — only the ARRANGEMENT differs.
   ILLUSTRATION = MATCH THE MECHANISM (key for variety): pick the illustration \
whose SHAPE matches the topic — a hierarchy -> Tree; a sequence of stages -> \
Pipeline; layered tiers/caches -> Layers; a many-to-many network -> Mesh; \
messages exchanged over time (a handshake, protocol, or API flow) -> Sequence; \
a grid of cells/buckets/shards or a comparison matrix -> Grid; a process with \
branches or loops (control flow, retries, a state machine) -> Flow; a general \
architecture -> SystemGraph; a population/crowd feeling -> ScenarioWorld. \
Do NOT draw every topic as the same shape.
   - CodeDiff    -> MUST have code_diff; keep EACH line <= 46 characters and \
<= 6 lines per side so code never overflows the panel.
   - BenchmarkChart -> MUST have >=2 benchmarks.
   - IncidentTimeline -> MUST have >=3 timeline_events.
   - JobMarketCard -> MUST have >=3 benchmarks and MAY add timeline_events.
   - Outro       -> MUST have 2-3 agenda_items (recap).
   - EVERY non-bookend scene -> MUST set `story_beat` (one concrete scenario \
sentence) so the visual is always anchored to the running story.
   - FILL OR DROP: a detail scene you cannot FULLY populate must NOT be emitted \
— use a ScenarioWorld beat in its place. Never output an empty SystemGraph (no \
nodes), an empty CodeDiff (no code_diff), or an empty chart; empty detail scenes \
all collapse into identical bar charts and wreck the pacing.
   - NEVER place two scenes of the same visual_type back-to-back, and never use \
any single visual_type more than twice. When in doubt between a detail scene and \
a ScenarioWorld beat, choose the detail scene — visual variety wins.
   HYBRID STRUCTURE (preferred): the specialized visuals (SystemGraph, CodeDiff, \
BenchmarkChart, IncidentTimeline, JobMarketCard, StatHero) carry the video; \
ScenarioWorld adds at most 2 human beats. Pick types by topic: \
INCIDENT_POSTMORTEM favors ScenarioWorld + StatHero + IncidentTimeline; \
SYSTEM_DESIGN favors SystemGraph + Tree + Pipeline + Layers + Mesh + Sequence + \
Flow + Grid + CodeDiff (pick the shapes that fit the mechanism); \
NEW_TECH_RELEASE favors StatHero + BenchmarkChart + Pipeline + Sequence + CodeDiff; JOB_MARKET favors ScenarioWorld + StatHero \
+ JobMarketCard. Use AT MOST 2 ScenarioWorld beats per \
video; make the other 4-6 body scenes DIFFERENT specialized visuals.
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
    user_content = (
        f"SOURCE URL: {source_url}\n"
        f"HEADLINE: {topic_title}\n\n"
        f"SOURCE ARTICLE (markdown, may be truncated):\n{article_markdown}"
    )
    payload = llm_providers.generate_structured(
        _SYSTEM_PROMPT,
        user_content,
        VideoRenderPayload,
        temperature=0.8,
        label="script",
    )

    # Enforce the theme-selection rule deterministically (belt and suspenders).
    if payload.topic_category in ("INCIDENT_POSTMORTEM", "JOB_MARKET"):
        payload.theme_id = "WAR_ROOM_HUD"
    else:
        payload.theme_id = "ARCHITECT_PAPER"

    # Guarantee the source url round-trips even if the model omitted it.
    payload.source_url = payload.source_url or source_url

    # Guarantee a scenario exists so the whole pipeline (and Stage-2 rendering)
    # always has a concrete story to anchor to, even if the model skipped it.
    _ensure_scenario(payload)

    # Guarantee the Intro/Outro bookends, repair any empty scenes so Zone A is
    # never blank, then seed timings.
    _ensure_intro_outro(payload)
    _repair_scenes(payload)
    _enforce_variety(payload)
    _renumber_scenes(payload)
    _seed_provisional_timings(payload)
    return payload


# ---------------------------------------------------------------------------
# Scenario safety net (so the story anchor is never missing)
# ---------------------------------------------------------------------------
def _ensure_scenario(payload: VideoRenderPayload) -> None:
    """Guarantee a usable `scenario` even if the model omitted or half-filled it.

    A thin synthesized scenario (built from the title) is better than None: it
    keeps downstream consumers — and Stage-2 rendering — able to assume the
    field is always present. A real model-authored scenario is left untouched
    apart from backfilling the one-line takeaway.
    """
    title = payload.youtube_title.rstrip(".").strip()
    sc = payload.scenario
    if sc and sc.setting.strip():
        if not sc.plain_takeaway.strip():
            sc.plain_takeaway = f"{title}." if title else "Here's how it really works."
        return
    payload.scenario = Scenario(
        setting=title or "A real production system under pressure",
        analogy="",
        actors=[],
        concept_mappings=[],
        plain_takeaway=f"{title}." if title else "Here's how it really works.",
    )


# ---------------------------------------------------------------------------
# Intro / Outro bookends (deterministic safety net)
# ---------------------------------------------------------------------------
def _default_hud() -> SceneHud:
    return SceneHud(
        context_label="",
        context_value="",
        status_text="",
        status_level="info",
        stats=[HudStat(label="SIGNAL", value="—")],
        insight="",
    )


def _make_intro(payload: VideoRenderPayload) -> SceneSpec:
    """Build an agenda intro from the body scenes' chapter titles."""
    agenda = [
        s.chapter_title
        for s in payload.scenes
        if s.chapter_title and s.visual_type not in ("Intro", "Outro")
    ][:4]
    if not agenda:
        agenda = ["The root cause", "How it works", "The real numbers"]
    return SceneSpec(
        scene_id=0,
        chapter_title="Overview",
        narration_text=(
            f"{payload.youtube_title.rstrip('.')}. Here's what we'll break down."
        ),
        visual_type="Intro",
        hud=_default_hud(),
        agenda_items=agenda,
    )


def _make_outro(payload: VideoRenderPayload) -> SceneSpec:
    recap = [
        s.chapter_title
        for s in payload.scenes
        if s.chapter_title and s.visual_type not in ("Intro", "Outro")
    ]
    recap = recap[-3:] if recap else ["The takeaway"]
    return SceneSpec(
        scene_id=999,
        chapter_title="Wrap Up",
        narration_text=(
            f"That's the breakdown. If it helped, subscribe to {config.CHANNEL_NAME} "
            "for more deep dives, and drop your take in the comments."
        ),
        visual_type="Outro",
        hud=_default_hud(),
        agenda_items=recap,
    )


def _ensure_intro_outro(payload: VideoRenderPayload) -> None:
    """Force the first scene to be an Intro and the last to be an Outro."""
    scenes = payload.scenes
    if not scenes:
        return
    if scenes[0].visual_type != "Intro":
        scenes.insert(0, _make_intro(payload))
    elif not scenes[0].agenda_items:
        scenes[0].agenda_items = _make_intro(payload).agenda_items
    if scenes[-1].visual_type != "Outro":
        scenes.append(_make_outro(payload))
    elif not scenes[-1].agenda_items:
        scenes[-1].agenda_items = _make_outro(payload).agenda_items


def _renumber_scenes(payload: VideoRenderPayload) -> None:
    for i, sc in enumerate(payload.scenes, start=1):
        sc.scene_id = i


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


# Keyword -> glyph. Checked by score (most hits win); default "person".
_UNIT_KEYWORDS = [
    ("car", ("car", "cab", "taxi", "vehicle", " ride", "truck", "fleet", "driver")),
    ("ticket", ("ticket", "token", "pass", "seat", "booking", "reservation")),
    ("server", ("server", "node", "worker", "pod", "instance", "machine",
                "host", "replica", "broker")),
    ("database", ("database", " db ", "datastore", "shard", "warehouse")),
    ("file", ("file", "row", "record", " log", "document", "photo", "image",
              "blob", "object")),
    ("box", ("package", "order", "parcel", " item", "product", "deploy",
             "build", "container", "shipment", "cart")),
    ("request", ("request", "query", "packet", "event", "message", " api",
                 "rpc", "ping", "webhook", " call", "transaction")),
    ("person", ("user", "fan", "customer", "shopper", "visitor", "people",
                "rider", "viewer", "client", "subscriber", "player",
                "passenger", "person", "crowd")),
]

# Keyword -> motion. Checked by score; default "field" ("jam" if the beat is
# critical and nothing else matched).
_FORMATION_KEYWORDS = [
    ("scatter", ("fan out", "fan-out", "broadcast", "replicat", "publish",
                 "propagat", "distribute", "spread", "notify", "gossip",
                 "multicast")),
    ("jam", ("jam", "stuck", "choke", "bottleneck", "gridlock", "overload",
             "crush", "saturate", "congest", "deadlock", "pile up", "pile-up")),
    ("queue", ("queue", "wait", "line up", "backlog", "buffer", "batch",
               "rate limit", "throttle", "drain", "pipeline", "behind one")),
    ("rush", ("rush", "surge", "spike", "flood", "stampede", "thundering",
              "herd", "flash sale", "peak", "burst", "swarm", "hammer", "slam",
              "pour", "all at once", "simultaneous")),
    ("field", ("grid", " lot", "cluster", "pool", "table", "stored", "at rest",
               "park", "idle", "capacity", "million", "records", " sit")),
]

_GATE_LABELS = [
    ("CHECKOUT", ("checkout", "cart", "purchase", "buy")),
    ("API", (" api", "endpoint", "gateway")),
    ("PRIMARY", ("database", "primary", " db ", "datastore")),
    ("WORKER", ("worker", "consumer", "processor")),
    ("ENTRANCE", ("entrance", "gate", "door", "turnstile", "stadium")),
]


def _score_keywords(text: str, groups) -> Optional[str]:
    best, best_score = None, 0
    for name, kws in groups:
        score = sum(text.count(k) for k in kws)
        if score > best_score:
            best, best_score = name, score
    return best


def _world_text(sc: "SceneSpec", payload: VideoRenderPayload) -> str:
    parts = [
        sc.narration_text or "",
        sc.chapter_title or "",
        " ".join(sc.callout_keywords or []),
        sc.story_beat or "",
    ]
    if payload.scenario:
        parts.append(payload.scenario.setting or "")
        parts.append(payload.scenario.analogy or "")
    return (" " + " ".join(parts) + " ").lower()


def _infer_unit_formation(text: str, critical: bool):
    unit = _score_keywords(text, _UNIT_KEYWORDS) or "person"
    formation = _score_keywords(text, _FORMATION_KEYWORDS) or (
        "jam" if critical else "field"
    )
    return unit, formation


def _default_gate_label(text: str) -> str:
    return _score_keywords(text, _GATE_LABELS) or "GATE"


def _ensure_world(sc: "SceneSpec", payload: VideoRenderPayload) -> None:
    """Guarantee a ScenarioWorld scene has a usable `world` block.

    Synthesizes sensible defaults from the scenario setting, the HUD status, and
    the scene's chapter/keywords so the animated world always has something real
    to drive even if the model left `world` null or half-filled. The unit glyph
    and the motion formation are inferred from the words of the line, so an
    auto-created beat still draws the right thing doing the right verb.
    """
    status = {"critical": "critical", "warning": "warning"}.get(
        sc.hud.status_level, "normal"
    )
    text = _world_text(sc, payload)
    inferred_unit, inferred_formation = _infer_unit_formation(text, status == "critical")

    setting = (payload.scenario.setting if payload.scenario else "") or ""
    m = re.search(r"[\d,]{2,}", setting)
    pop = None
    if m:
        try:
            pop = int(m.group(0).replace(",", ""))
        except ValueError:
            pop = None
    pop = pop or 500
    frac = 0.08 if status == "critical" else 0.45 if status == "warning" else 1.0

    if sc.world is None:
        kws = sc.callout_keywords[:2]
        gate = (
            _default_gate_label(text)
            if inferred_formation in ("rush", "queue", "jam")
            else None
        )
        sc.world = SceneWorld(
            unit_icon=inferred_unit,
            formation=inferred_formation,
            gate_label=gate,
            headline_line1=(sc.chapter_title or "The system")[:22],
            headline_line2=(" ".join(kws) if kws else "under pressure")[:22],
            section_label="the problem" if status != "normal" else "the setup",
            metric_prefix="online",
            population=pop,
            online_fraction=frac,
            status=status,
        )
        return
    w = sc.world
    # Gently correct lazy defaults: only override when the model left the field
    # at its default AND the words clearly point elsewhere.
    if w.unit_icon == "person" and inferred_unit != "person":
        w.unit_icon = inferred_unit
    if w.formation == "field" and inferred_formation != "field":
        w.formation = inferred_formation
    if w.formation in ("rush", "queue", "jam") and not (w.gate_label or "").strip():
        w.gate_label = _default_gate_label(text)
    if not w.population or w.population < 1:
        w.population = pop
    w.online_fraction = min(1.0, max(0.0, w.online_fraction))
    if not w.headline_line1.strip():
        w.headline_line1 = (sc.chapter_title or "The system")[:22]
    if not w.section_label.strip():
        w.section_label = "the problem" if status != "normal" else "the setup"


# Types we can always synthesize data for (from the HUD stats or the scenario),
# so they are safe deterministic fallbacks when a scene is empty or over-used.
_FILLABLE_FALLBACKS = ("BenchmarkChart", "StatHero", "ScenarioWorld")
_SCENARIOWORLD_CAP = 2  # at most this many ScenarioWorld scenes per video
_PER_TYPE_CAP = 2  # at most this many of any one visual_type per video
_BOOKENDS = ("Intro", "Outro")


def _type_cap(vtype: str) -> int:
    return _SCENARIOWORLD_CAP if vtype == "ScenarioWorld" else _PER_TYPE_CAP


def _fill_as(sc: "SceneSpec", vtype: str, payload: VideoRenderPayload) -> None:
    """Convert a scene to `vtype` and synthesize its required data in place."""
    sc.visual_type = vtype  # type: ignore[assignment]
    if vtype == "ScenarioWorld":
        _ensure_world(sc, payload)
    elif vtype == "BenchmarkChart":
        if not sc.benchmarks:
            _stats_to_benchmarks(sc)
    elif vtype == "StatHero":
        if not sc.hero_stat_value:
            first = sc.hud.stats[0] if sc.hud.stats else HudStat(label="SIGNAL", value="—")
            sc.hero_stat_value = first.value
            sc.hero_stat_label = sc.hero_stat_label or sc.chapter_title or first.label


def _is_empty(sc: "SceneSpec") -> bool:
    """A specialized detail scene whose data field is missing (renders blank)."""
    return (
        (
            sc.visual_type
            in ("SystemGraph", "Tree", "Pipeline", "Mesh", "Layers", "Grid", "Sequence", "Flow")
            and len(sc.nodes) < 2
        )
        or (sc.visual_type in ("Sequence", "Flow") and len(sc.edges) < 1)
        or (sc.visual_type == "CodeDiff" and sc.code_diff is None)
        or (sc.visual_type == "BenchmarkChart" and not sc.benchmarks)
        or (sc.visual_type == "IncidentTimeline" and not sc.timeline_events)
        or (sc.visual_type == "JobMarketCard" and not sc.benchmarks)
    )


def _choose_fallback(counts: dict, prev_type, exclude=()) -> str:
    """Least-used fillable type that respects the caps and isn't `prev_type`.

    Relaxes the caps (but still avoids `prev_type`) if every fillable type is
    already capped, so this always returns something sensible.
    """

    def ok(t: str) -> bool:
        return t != prev_type and t not in exclude and counts.get(t, 0) < _type_cap(t)

    options = [t for t in _FILLABLE_FALLBACKS if ok(t)]
    if not options:
        options = [t for t in _FILLABLE_FALLBACKS if t != prev_type and t not in exclude]
    if not options:
        options = [t for t in _FILLABLE_FALLBACKS if t != prev_type] or list(_FILLABLE_FALLBACKS)
    return min(options, key=lambda t: counts.get(t, 0))


def _repair_scenes(payload: VideoRenderPayload) -> None:
    """Guarantee each scene's visual has data.

    An empty detail scene (the model declared e.g. a SystemGraph but gave no
    nodes) is reassigned to the LEAST-USED fillable visual that respects the
    per-type caps and never duplicates the previous scene's type — so empties
    are spread across several looks instead of all collapsing into ScenarioWorld.
    """
    counts: dict[str, int] = {}
    for sc in payload.scenes:
        counts[sc.visual_type] = counts.get(sc.visual_type, 0) + 1

    for i, sc in enumerate(payload.scenes):
        if not sc.hud.stats:
            sc.hud.stats = [HudStat(label="SIGNAL", value="—")]

        # StatHero needs its one big number; borrow from HUD if the model missed.
        if sc.visual_type == "StatHero" and not sc.hero_stat_value:
            first = sc.hud.stats[0]
            sc.hero_stat_value = first.value
            sc.hero_stat_label = sc.hero_stat_label or first.label
        if sc.visual_type in ("Intro", "Outro", "StatHero"):
            continue
        # ScenarioWorld needs its `world` block, not the node/chart data.
        if sc.visual_type == "ScenarioWorld":
            _ensure_world(sc, payload)
            continue
        if not _is_empty(sc):
            continue

        prev_type = payload.scenes[i - 1].visual_type if i > 0 else None
        counts[sc.visual_type] = counts.get(sc.visual_type, 1) - 1
        fallback = _choose_fallback(counts, prev_type)
        print(
            f"[script] Scene {sc.scene_id} ({sc.visual_type}) had no data; "
            f"repairing to {fallback}."
        )
        _fill_as(sc, fallback, payload)
        counts[fallback] = counts.get(fallback, 0) + 1


def _enforce_variety(payload: VideoRenderPayload) -> None:
    """Deterministic guarantee that the body is visually varied.

    Keeps the first `cap` scenes of each visual_type (ScenarioWorld capped hard
    at 2) and reassigns every surplus scene — and any remaining same-type
    back-to-back pair — to the least-used fillable visual. Richly authored,
    unique detail scenes are left untouched; this only trims over-use and
    repeats, the two things that made every video look the same.
    """
    body = [i for i, sc in enumerate(payload.scenes) if sc.visual_type not in _BOOKENDS]

    # 1) Keep the first `cap` of each type; diversify the surplus.
    kept: dict[str, int] = {}
    for i in body:
        sc = payload.scenes[i]
        t = sc.visual_type
        if kept.get(t, 0) < _type_cap(t):
            kept[t] = kept.get(t, 0) + 1
            continue
        prev_type = payload.scenes[i - 1].visual_type if i > 0 else None
        new_t = _choose_fallback(kept, prev_type, exclude=(t,))
        print(f"[script] Scene {sc.scene_id}: '{t}' over cap; diversifying to {new_t}.")
        _fill_as(sc, new_t, payload)
        kept[new_t] = kept.get(new_t, 0) + 1

    # 2) Break any remaining same-type back-to-back pairs.
    for pos in range(1, len(payload.scenes)):
        sc = payload.scenes[pos]
        prev = payload.scenes[pos - 1]
        if sc.visual_type in _BOOKENDS or sc.visual_type != prev.visual_type:
            continue
        nxt = payload.scenes[pos + 1].visual_type if pos + 1 < len(payload.scenes) else None
        new_t = _choose_fallback(kept, prev.visual_type, exclude=(sc.visual_type, nxt or ""))
        if new_t == sc.visual_type:
            continue
        print(
            f"[script] Scene {sc.scene_id}: back-to-back '{sc.visual_type}'; "
            f"varying to {new_t}."
        )
        kept[sc.visual_type] = kept.get(sc.visual_type, 1) - 1
        _fill_as(sc, new_t, payload)
        kept[new_t] = kept.get(new_t, 0) + 1


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
