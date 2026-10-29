# Project Requirement Specification: Autonomous Software Engineering YouTube Agent (`$0 Free-Tier Stack`)

## 1. Executive Summary & Objective
Build a fully autonomous, end-to-end AI video generation and publishing system focused exclusively on the **Software Engineering (SWE) ecosystem**:
1. **Production Outages & Incident Post-Mortems** (e.g., Cloudflare, AWS, CrowdStrike, Discord, GitHub downtime breakdowns)
2. **System Design & Architecture Migrations** (e.g., scaling databases, monolith-to-microservice trade-offs, caching bottlenecks)
3. **SWE Job Market, Layoffs & Compensation Shifts** (e.g., hiring trends, AI impact on junior/senior roles, interview changes)
4. **New Frameworks, Compilers & Benchmark Battles** (e.g., Rust vs. Go, Bun vs. Node, new open-source GitHub spikes)

The entire pipeline must run on **100% free-tier tooling ($0.00/month)**, executing via GitHub Actions or local CLI, compiling 1080p 60fps programmatic videos using **Remotion**, and publishing to YouTube via the **YouTube Data API v3** with a **Telegram Human-in-the-Loop (HITL)** approval gate and dynamic topic override.

---

## 2. Target Architecture & Free-Tier Tech Stack ($0/Month)

| Layer | Technology / Library | Free-Tier Quota / Advantage |
| :--- | :--- | :--- |
| **1. Compute & Cron Scheduler** | **GitHub Actions** (`ubuntu-latest`) | 2,000 free CI/CD minutes/month (or 100% free local CLI execution) |
| **2. State & Deduplication** | **SQLite** (`agent-backend/data/seen_topics.db`) | Zero-cost serverless relational DB committed back to repo |
| **3. SWE Signal Ingestion** | **HN Algolia API** + **GitHub Trending** + **`feedparser`** + **Reddit JSON** | 100% free unauthenticated endpoints covering all major SWE news |
| **4. Deep Article Extraction** | **Jina Reader** (`https://r.jina.ai/<URL>`) + **BeautifulSoup4** | Free clean Markdown extraction preserving code blocks & tables |
| **5. LLM Reasoning & Script** | **Google Gemini 2.5 Flash** (`google-genai` SDK) | Free tier via Google AI Studio (1,500 req/day, native structured JSON output) |
| **6. Voice Synthesis (TTS)** | **Kokoro-82M** (`kokoro-onnx` CPU) with **`edge-tts`** fallback | 100% free, Apache 2.0 local neural voice generation |
| **7. Word-Level Timestamp Sync** | **`faster-whisper`** (`base.en`, `int8` CPU quantization) | Extracts exact millisecond word timestamps to trigger visual animations |
| **8. Video Rendering Engine** | **Remotion v4** (React 19 + TypeScript + Tailwind CSS) | Deterministic 1080p MP4 rendering directly from React state |
| **9. Diagrams, Code & Telemetry** | **`@xyflow/react`** + **`elkjs`** + **`shiki`** + **`d3-scale`** + **`simple-icons`** | Auto-layout graphs, VS Code syntax highlighting, and 3,000+ tech vector logos |
| **10. Thumbnail Generator** | **Playwright** (Headless Chromium HTML/Tailwind-to-PNG) | Crisp `1280x720` high-CTR thumbnails with zero AI text distortion |
| **11. Approval & Publishing** | **Telegram Bot API** + **YouTube Data API v3** | Interactive mobile approval + automated upload, custom thumbnail & pinned comment |

---

## 3. Complete Monorepo Directory Structure

The coding agent must initialize the repository with this exact file tree:

```text
swe-youtube-agent/
├── .github/
│   └── workflows/
│       └── daily_swe_video.yml          # Automated cron + manual topic input workflow
├── agent-backend/
│   ├── data/
│   │   └── seen_topics.db               # SQLite database tracking published URLs & topics
│   ├── output/                          # Generated per-run artifacts (gitignored)
│   │   ├── render_payload.json          # Master JSON contract passed to Remotion
│   │   ├── narration.wav                # Full stitched voiceover audio
│   │   ├── thumbnail.png                # 1280x720 PNG rendered by Playwright
│   │   └── final_video.mp4              # Final 1080p MP4 compiled by Remotion
│   ├── templates/
│   │   └── thumbnail_template.html      # Tailwind HTML template for high-CTR thumbnails
│   ├── src/
│   │   ├── __init__.py
│   │   ├── config.py                    # Env variables, RSS URLs, and constants
│   │   ├── db.py                        # SQLite initialization & deduplication queries
│   │   ├── ingest_scout.py              # HN, GitHub, Tech RSS, and Reddit scrapers + dynamic query mode
│   │   ├── article_scraper.py           # Jina Reader markdown fetcher & content cleaner
│   │   ├── script_generator.py          # Gemini 2.5 Flash Pydantic AST script & visual generator
│   │   ├── audio_engine.py              # Kokoro-82M / edge-tts synthesis + faster-whisper alignment
│   │   ├── thumbnail_generator.py       # Playwright headless screenshot renderer
│   │   ├── telegram_gate.py             # Telegram HITL preview & approval polling
│   │   └── youtube_publisher.py         # YouTube Data API v3 upload, thumbnail, and pinned comment
│   ├── auth_youtube.py                  # One-time local CLI helper to get YouTube Refresh Token
│   ├── main.py                          # Master end-to-end orchestrator entrypoint
│   └── requirements.txt                 # Pinned Python dependencies
├── video-engine/
│   ├── public/
│   │   └── assets/                      # Audio file & static fonts copied before render
│   ├── src/
│   │   ├── index.ts                     # Remotion registerRoot entry
│   │   ├── Root.tsx                     # Remotion Composition declaration (1920x1080, 60fps)
│   │   ├── MasterComposition.tsx        # 3-Zone Asymmetric Bento HUD Layout Controller
│   │   ├── types/
│   │   │   └── schema.ts                # TypeScript interfaces matching Python Pydantic schema
│   │   ├── styles/
│   │   │   └── themes.ts                # ARCHITECT_PAPER and WAR_ROOM_HUD design tokens
│   │   ├── utils/
│   │   │   └── elkLayout.ts             # Deterministic ELK.js layered graph layout calculator
│   │   └── components/
│   │       ├── ZoneAStage.tsx           # Left 74% Main Visual Router
│   │       ├── ZoneBTelemetryHUD.tsx    # Right 26% Live Metrics, Gauges & Trade-off Sidebar
│   │       ├── ZoneCAudioTicker.tsx     # Bottom 64px Chapter Progress & Keyword Ticker
│   │       └── scenes/
│   │           ├── SystemGraphScene.tsx # Progressive node graph + square packet pulses
│   │           ├── CodeDiffScene.tsx    # Shiki syntax-highlighted code comparison
│   │           ├── BenchmarkChart.tsx   # Animated horizontal p99 latency / RPS bar chart
│   │           ├── IncidentTimeline.tsx # Post-mortem chronological stepper
│   │           └── JobMarketCard.tsx    # SWE hiring, layoff & compensation breakdown view
│   ├── package.json
│   ├── tsconfig.json
│   └── remotion.config.ts
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. End-to-End Pipeline Execution Flow

1. **Trigger & Mode Selection (`main.py`):**
   - Accepts an optional `--topic` CLI flag (or GitHub Actions `custom_topic` input).
   - If `--topic` is empty, runs in **Autonomous Daily SWE Scout Mode**.
   - If `--topic` is provided (e.g., `"Cloudflare BGP outage"` or `"SWE job market 2026"`), runs in **Targeted Topic Mode**.
2. **Ingestion & Scoring (`ingest_scout.py`):**
   - Queries Hacker News Algolia API, 15 top engineering blog RSS feeds, GitHub Trending, and `r/experienceddevs` / `r/programming`.
   - Filters out any URL hash or fuzzy title match already recorded in `seen_topics.db`.
   - Ranks the top 15 candidates by a composite formula:
     $$\text{Score} = \frac{\text{Points} + (\text{Comments} \times 1.8)}{(\text{Hours Since Published} + 2)^{1.3}}$$
   - Sends the top 5 candidates to Gemini 2.5 Flash to pick the single highest-retention topic with strong visualizability.
3. **Deep Context Scraping (`article_scraper.py`):**
   - Fetches clean Markdown from the winning URL via `https://r.jina.ai/<URL>`.
   - Extracts concrete metrics (latency numbers, error rates, dollar costs, code snippets, or architecture components).
4. **Structured Script & Telemetry AST Generation (`script_generator.py`):**
   - Calls Gemini 2.5 Flash with `response_schema=VideoRenderPayload` to generate:
     - Selectable visual theme (`ARCHITECT_PAPER` for system design/deep dives or `WAR_ROOM_HUD` for outages/news).
     - High-CTR YouTube Title, Description with timestamps, Tags, Thumbnail Blueprint, and a debate-sparking Pinned Comment.
     - 6 to 10 sequential `scenes`, each containing spoken narration, visual scene type, progressive graph mutations, and live right-hand HUD telemetry metrics.
5. **Voiceover Synthesis & Word-Level Alignment (`audio_engine.py`):**
   - Synthesizes each scene's narration into `.wav` audio using **Kokoro-82M** (or **`edge-tts`** fallback with `en-US-ChristopherNeural` at `+8%` rate) and inserts a `300ms` pause between scenes.
   - Runs **`faster-whisper`** (`base.en`, `int8`, `word_timestamps=True`) on the combined audio to populate exact start/end millisecond timestamps for every word and scene inside `render_payload.json`.
6. **Thumbnail Rendering (`thumbnail_generator.py`):**
   - Injects the Thumbnail Blueprint (3–4 punchy words, primary tech SVG icons, severity badge, and theme colors) into `thumbnail_template.html` and captures a `1280x720` PNG using **Playwright**.
7. **Programmatic Video Compilation (`video-engine/`):**
   - Copies `narration.wav` and `render_payload.json` into `video-engine/public/assets/`.
   - Invokes `npx remotion render src/index.ts SWEMasterVideo ../agent-backend/output/final_video.mp4 --codec=h264`.
8. **Telegram Human-in-the-Loop Gate (`telegram_gate.py`):**
   - Sends the generated `thumbnail.png`, video title, 3-bullet summary, and pinned comment to the user's Telegram chat with `[Approve & Publish]` and `[Reject]` inline buttons.
   - Polls for up to 45 minutes (if `AUTO_APPROVE_TIMEOUT=true`, auto-publishes after timeout).
9. **YouTube Upload & Community Seeding (`youtube_publisher.py`):**
   - Uploads `final_video.mp4` via `videos.insert`, sets `thumbnail.png` via `thumbnails.set`, posts the architectural debate question via `commentThreads.insert`, and logs the video ID in `seen_topics.db`.

---

## 5. Strict Data Contract: Python Pydantic $\leftrightarrow$ Remotion TypeScript Schema

Both `agent-backend/src/script_generator.py` and `video-engine/src/types/schema.ts` MUST adhere strictly to this JSON contract (`render_payload.json`).

### Python Pydantic Schema (`agent-backend/src/script_generator.py`)
```python
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

class WordTimestamp(BaseModel):
    word: str
    start_sec: float
    end_sec: float

class TelemetrySnapshot(BaseModel):
    incident_clock: str = Field(description="Format T+00:00:00 or metric label")
    rps: int = Field(description="Simulated or real requests/sec or primary volume metric")
    p99_latency_ms: int = Field(description="Simulated or real tail latency in ms")
    error_rate_pct: float = Field(description="0.0 to 100.0")
    system_status: Literal["HEALTHY", "DEGRADED", "CRITICAL", "RECOVERING"]
    tradeoff_badge: str = Field(description="Short trade-off note, e.g. 'Low Latency vs Stale Reads'")

class GraphNode(BaseModel):
    id: str
    label: str
    sublabel: str = Field(description="e.g., 'p99: 12ms' or 'Shard 01'")
    icon_slug: str = Field(description="Simple-icons slug e.g. 'postgresql', 'redis', 'cloudflare', 'rust', 'docker'")
    tier: int = Field(description="1=Edge/Client, 2=Gateway/Auth, 3=Compute/Service, 4=Cache/Queue, 5=Storage")
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
    visual_type: Literal["SystemGraph", "CodeDiff", "BenchmarkChart", "IncidentTimeline", "JobMarketCard"]
    camera_focus_node_id: Optional[str] = Field(default=None, description="Node ID to zoom into, or null for full view")
    telemetry: TelemetrySnapshot
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    code_diff: Optional[CodeDiffPayload] = None
    benchmarks: List[BenchmarkItem] = Field(default_factory=list)
    timeline_events: List[TimelineEventItem] = Field(default_factory=list)
    callout_keywords: List[str] = Field(default_factory=list, description="2-3 exact words in narration_text to highlight on screen")

class ThumbnailSpec(BaseModel):
    headline_text: str = Field(description="Strictly 3 to 4 bold words, e.g. 'WHY REDIS CRASHED' or '125ms TO 12ms'")
    badge_text: str = Field(description="e.g. 'POST-MORTEM' or 'SYSTEM DESIGN'")
    left_icon_slug: str
    right_icon_slug: str
    connector_style: Literal["vs_bolt", "broken_arrow", "upgrade_arrow"]

class VideoRenderPayload(BaseModel):
    topic_category: Literal["INCIDENT_POSTMORTEM", "SYSTEM_DESIGN", "JOB_MARKET", "NEW_TECH_RELEASE"]
    theme_id: Literal["ARCHITECT_PAPER", "WAR_ROOM_HUD"]
    youtube_title: str = Field(description="High-CTR title under 70 chars")
    youtube_description: str
    youtube_tags: List[str]
    pinned_comment: str = Field(description="Opinionated engineering trade-off question to spark comments")
    source_url: str
    thumbnail: ThumbnailSpec
    scenes: List[SceneSpec]
    words: List[WordTimestamp] = Field(default_factory=list)
    total_duration_sec: float = 0.0
```

---

## 6. Detailed Python Backend Module Specifications (`agent-backend/`)

### 6.1 `src/config.py` & `src/db.py`
- Load environment variables using `python-dotenv`.
- `db.py` creates `seen_topics` table (`url_hash TEXT PRIMARY KEY, title TEXT, published_at TIMESTAMP, youtube_video_id TEXT`).
- Provide helper functions `is_topic_seen(url: str, title: str) -> bool` (using SHA-256 of normalized URL plus `difflib.SequenceMatcher` > 0.80 title similarity check) and `mark_topic_published(...)`.

### 6.2 `src/ingest_scout.py`
Implement four zero-auth collector functions plus a dynamic search fallback:
1. **`fetch_hacker_news()`**: `GET https://hn.algolia.com/api/v1/search?tags=story&numericFilters=points>80,created_at_i>{now - 172800}`.
2. **`fetch_engineering_rss()`**: Parse via `feedparser`:
   - Cloudflare Blog (`https://blog.cloudflare.com/rss/`)
   - Netflix TechBlog (`https://netflixtechblog.com/feed`)
   - Discord Engineering (`https://discord.com/blog/rss.xml`)
   - Uber Engineering, AWS Architecture Blog, Stripe Blog, GitHub Blog, InfoQ, Pragmatic Engineer.
3. **`fetch_github_trending()`**: Scrape `https://github.com/trending?since=daily` via `httpx` + `BeautifulSoup4` to extract repository name, description, language, and stars gained today.
4. **`fetch_swe_reddit()`**: Fetch `https://www.reddit.com/r/experienceddevs/top.json?t=day&limit=10` and `r/programming/top.json?t=day&limit=10` with a custom `User-Agent` header to capture SWE job market discussions and breaking developer news.
5. **`fetch_custom_topic(query: str)`**: If the user passes `--topic "..."`, query HN Algolia (`query={query}`) and Google News RSS (`https://news.google.com/rss/search?q={query}+software+engineering`) to gather the top 3 matching technical articles.

### 6.3 `src/article_scraper.py`
- Given a candidate URL, fetch `https://r.jina.ai/{url}` with `headers={"X-Return-Format": "markdown"}` and timeout of `20s`.
- If Jina fails or returns fewer than 300 characters, fall back to direct `httpx.get(url)` + `BeautifulSoup4` paragraph and `<pre><code>` extraction.
- Truncate cleaned markdown to `18,000` characters so it fits well within Gemini free-tier token limits while preserving all technical numbers and code blocks.

### 6.4 `src/script_generator.py`
- Use the official `google-genai` SDK (`client.models.generate_content` with `model="gemini-2.5-flash"` and `config={"response_mime_type": "application/json", "response_schema": VideoRenderPayload}`).
- **System Prompt Rules for Retention:**
  - **0:00–0:07 Hook (Scene 1):** Must open with a hard metric, failure event, or surprising architectural contradiction (never start with *"In today's video"* or *"Welcome back"*).
  - **Progressive Graph Evolution:** When `visual_type == "SystemGraph"`, Scene $N$ should start with 3–4 baseline nodes, and Scene $N+1$ should add the bottleneck, cache, or queue node so the architecture evolves visually on screen.
  - **Theme Selection Rule:** Automatically select `"WAR_ROOM_HUD"` for `INCIDENT_POSTMORTEM` and `JOB_MARKET`, and `"ARCHITECT_PAPER"` for `SYSTEM_DESIGN` and `NEW_TECH_RELEASE`.
  - **Pacing:** Target 7 to 9 scenes total (total video duration 65 to 110 seconds—ideal for high completion rates on both YouTube long-form and Shorts feeds).

### 6.5 `src/audio_engine.py`
- Iterate over `payload.scenes`:
  - Primary TTS: Use `kokoro_onnx` (`am_adam` or `am_michael` voice at `speed=1.04`) to synthesize each `scene.narration_text` into `scene_{i}.wav`.
  - Automatic Fallback: If `kokoro` model files are not cached, automatically run `edge-tts` (`voice="en-US-ChristopherNeural"`, `rate="+8%"`) and convert to `16kHz` mono WAV via `pydub` / `ffmpeg`.
  - Append a `300ms` silent pad between scenes, record each scene's exact `start_sec` and `duration_sec`, and export `agent-backend/output/narration.wav`.
- Run `faster_whisper.WhisperModel("base.en", device="cpu", compute_type="int8")`:
  - Transcribe `narration.wav` with `word_timestamps=True`.
  - Populate `payload.words` with every word's `start_sec` and `end_sec`, and write the final `agent-backend/output/render_payload.json`.

### 6.6 `src/thumbnail_generator.py`
- Load `agent-backend/templates/thumbnail_template.html`.
- Render a `1280x720` viewport in headless Chromium using `playwright.sync_api`:
  - Match the active theme (`ARCHITECT_PAPER` uses warm cream `#F4F1EA` with `6px` brutalist black shadow borders and `#FF4F00` orange highlights; `WAR_ROOM_HUD` uses `#0B0C10` carbon grid with `#F43F5E` crimson alerts and terminal window chrome).
  - Fetch the two SVG logos from `https://cdn.simpleicons.org/{slug}` and place them flanking the central connector arrow/bolt.
  - Render the 3–4 word `headline_text` at `92px` `Space Grotesk` / `JetBrains Mono` ExtraBold.
  - Save output to `agent-backend/output/thumbnail.png`.

### 6.7 `src/telegram_gate.py` & `src/youtube_publisher.py`
- **`telegram_gate.py`**: If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, send `thumbnail.png` via `sendPhoto` with caption containing Title, Theme, Duration, and Pinned Comment, plus inline keyboard `[Approve & Upload]` / `[Cancel]`. Poll `getUpdates` for user callback; if `AUTO_APPROVE_MINUTES` elapses without rejection, proceed automatically.
- **`youtube_publisher.py`**:
  - Rebuild `google.oauth2.credentials.Credentials` from `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN`.
  - Upload `final_video.mp4` via `youtube.videos().insert(part="snippet,status", body=..., media_body=MediaFileUpload(..., chunksize=1024*1024, resumable=True))` with `categoryId="28"` (Science & Technology).
  - Set custom thumbnail via `youtube.thumbnails().set(videoId=video_id, media_body="output/thumbnail.png")`.
  - Insert the top-level debate comment via `youtube.commentThreads().insert(part="snippet", body=...)`.
  - Implement exponential backoff (`tenacity` or manual retry, max 3 retries) so a failed upload never drains the 10,000 daily YouTube API quota units.

---

## 7. Detailed Remotion Video Engine Specifications (`video-engine/`)

### 7.1 Composition Setup (`src/Root.tsx` & `src/MasterComposition.tsx`)
- Resolution: `1920x1080`, `fps: 60`.
- `durationInFrames`: Dynamically calculated from `Math.ceil(payload.total_duration_sec * 60)`.
- Include `<Audio src={staticFile("assets/narration.wav")} />`.

### 7.2 Signature Visual Layout: The 3-Zone Asymmetric Bento HUD
Do **NOT** copy generic dark-blue glowing flowchart channels. Every frame of `MasterComposition.tsx` must render a persistent, crisp **3-Zone Asymmetric Bento Grid** with `16px` outer padding and `2px` structural borders:

1. **Zone A — Primary Visual Stage (Top-Left, `74%` width $\times$ `90%` height):**
   - Renders the active scene component based on `scene.visual_type` (`SystemGraphScene`, `CodeDiffScene`, `BenchmarkChart`, `IncidentTimeline`, or `JobMarketCard`).
   - Includes a subtle top-left corner breadcrumb (`SCENE 0{scene_id} // {visual_type}`).
2. **Zone B — Live Telemetry & Trade-off HUD (Top-Right, `26%` width $\times$ `90%` height):**
   - **Panel 1 (Incident / System Clock):** Monospace digital readout (`scene.telemetry.incident_clock`) + pulsing status badge (`HEALTHY`, `DEGRADED`, `CRITICAL`, `RECOVERING`).
   - **Panel 2 (Live Interpolated Gauges):** Smoothly interpolates `rps`, `p99_latency_ms`, and `error_rate_pct` from the previous scene's values to the current scene's values using Remotion's `interpolate(frame, [sceneStart, sceneStart + 30], [prevVal, nextVal])`. Renders an animated SVG sparkline that spikes when `system_status === "CRITICAL"`.
   - **Panel 3 (Architectural Trade-off Box):** Displays `scene.telemetry.tradeoff_badge` inside a high-contrast callout card.
3. **Zone C — Chapter & Synchronized Word Ticker (Bottom Full-Width, `100%` width $\times$ `10%` height):**
   - Left side shows the chapter stepper (`01 HOOK` $\rightarrow$ `02 BOTTLENECK` $\rightarrow$ `03 ARCHITECTURE` $\rightarrow$ `04 VERDICT`).
   - Right side renders live karaoke-style word captions powered by `payload.words`, highlighting any word matching `scene.callout_keywords` in the active theme's accent color.

### 7.3 Bespoke Dual Theme Engine (`src/styles/themes.ts`)
Implement a strict token map supporting both brand aesthetics:

| Token | `ARCHITECT_PAPER` (System Design / Deep Dives) | `WAR_ROOM_HUD` (Outages / Incidents / Job News) |
| :--- | :--- | :--- |
| **`canvasBg`** | `#F4F1EA` (Warm Archival Drafting Paper) | `#0B0C10` (Matte Carbon SRE Console) |
| **`gridPattern`** | `24px` technical millimeter rule lines (`#E2DDD2`) | `24px` dot-matrix crosshair grid (`#1F2430`) |
| **`cardBg`** | `#FFFFFF` with `4px 4px 0px #18181B` brutalist shadow | `#12151E` with top terminal header bar `[node://id]` |
| **`borderStyle`** | `2px solid #18181B` (Stark drafting ink) | `1px solid #2A303C` |
| **`textPrimary`** | `#18181B` (Deep Ink Black) | `#F3F4F6` (Crisp Phosphor White) |
| **`accentPrimary`** | `#FF4F00` (International Engineering Orange) | `#00F5D4` (Telemetry Mint) & `#FFB000` (Amber) |
| **`accentCritical`** | `#D90429` (Crimson Stamp) | `#FF2A54` (High-Contrast Signal Red) |
| **`fontHeading`** | `'Space Grotesk', sans-serif` | `'JetBrains Mono', monospace` |
| **`fontMono`** | `'IBM Plex Mono', monospace` | `'JetBrains Mono', monospace` |

### 7.4 Scene Component Implementation Rules (`src/components/scenes/`)
1. **`SystemGraphScene.tsx`:**
   - Run `elkjs` (`algorithm: 'layered'`, `elk.direction: 'RIGHT'`, `elk.layered.spacing.nodeNodeBetweenLayers: 130`, `elk.spacing.nodeNode: 75`) deterministically inside a `useMemo` hook so nodes never overlap.
   - Animate new nodes entering with `spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 140 } })`.
   - Draw SVG cubic bezier edges between connected nodes; animate square data packets (`<rect width="8" height="8" />`) traveling along the path using `SVGPathElement.getPointAtLength()` driven by `(frame * 4) % pathLength`.
   - If `scene.camera_focus_node_id` is set, smoothly interpolate the parent SVG/div container `transform: scale(1.3) translate(tx, ty)` to center on that node while dimming non-adjacent nodes to `opacity: 0.35`.
2. **`CodeDiffScene.tsx`:**
   - Render `before_code` and `after_code` side-by-side (or vertically stacked) using `shiki` with `github-light` (`ARCHITECT_PAPER`) or `vesper` (`WAR_ROOM_HUD`) themes, animating a highlight sweep across changed lines.
3. **`BenchmarkChart.tsx`, `IncidentTimeline.tsx`, `JobMarketCard.tsx`:**
   - Animate horizontal comparison bars, chronological incident badges, or compensation/layoff metric cards using Remotion `spring()` staggered by `index * 8` frames.

---

## 8. Dependency Manifests

### 8.1 `agent-backend/requirements.txt`
```text
google-genai>=1.2.0
pydantic>=2.10.0
python-dotenv>=1.0.1
httpx>=0.28.0
feedparser>=6.0.11
beautifulsoup4>=4.12.3
kokoro-onnx>=0.4.0
soundfile>=0.13.0
edge-tts>=7.0.0
faster-whisper>=1.1.0
pydub>=0.25.1
playwright>=1.50.0
google-api-python-client>=2.160.0
google-auth-oauthlib>=1.2.1
tenacity>=9.0.0
```

### 8.2 `video-engine/package.json`
```json
{
  "name": "swe-video-engine",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "remotion studio src/index.ts",
    "render": "remotion render src/index.ts SWEMasterVideo ../agent-backend/output/final_video.mp4 --codec=h264"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.250",
    "@remotion/media-utils": "^4.0.250",
    "@remotion/shapes": "^4.0.250",
    "@xyflow/react": "^12.4.0",
    "d3-scale": "^4.0.2",
    "elkjs": "^0.9.3",
    "lucide-react": "^0.475.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remotion": "^4.0.250",
    "shiki": "^2.0.0",
    "simple-icons": "^14.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0"
  }
}
```

---

## 9. GitHub Actions CI/CD Workflow (`.github/workflows/daily_swe_video.yml`)

```yaml
name: Daily SWE YouTube Video Agent

on:
  schedule:
    - cron: '30 5 * * *' # Runs daily at 05:30 UTC (11:00 AM IST)
  workflow_dispatch:
    inputs:
      custom_topic:
        description: 'Optional custom SWE topic (leave blank for automatic daily trend discovery)'
        required: false
        default: ''

permissions:
  contents: write

jobs:
  generate-and-publish:
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Install System Audio & Browser Dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg espeak-ng libsndfile1

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: agent-backend/requirements.txt

      - name: Install Python Packages & Playwright Chromium
        run: |
          python -m pip install --upgrade pip
          pip install -r agent-backend/requirements.txt
          playwright install --with-deps chromium

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: video-engine/package.json

      - name: Install Remotion Video Engine Dependencies
        run: |
          cd video-engine
          npm install

      - name: Execute End-to-End Agent Pipeline
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          YOUTUBE_CLIENT_ID: ${{ secrets.YOUTUBE_CLIENT_ID }}
          YOUTUBE_CLIENT_SECRET: ${{ secrets.YOUTUBE_CLIENT_SECRET }}
          YOUTUBE_REFRESH_TOKEN: ${{ secrets.YOUTUBE_REFRESH_TOKEN }}
          AUTO_APPROVE_MINUTES: "30"
        run: |
          cd agent-backend
          if [ -n "${{ github.event.inputs.custom_topic }}" ]; then
            python main.py --topic "${{ github.event.inputs.custom_topic }}"
          else
            python main.py
          fi

      - name: Commit Updated SQLite Deduplication Database
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add agent-backend/data/seen_topics.db
          git diff --staged --quiet || git commit -m "chore: record published SWE topic in seen_topics.db [skip ci]"
          git push
```

---

## 10. Environment Variables & Acceptance Criteria for the Coding Agent

### `.env.example`
```env
# Google AI Studio Free API Key
GEMINI_API_KEY=your_gemini_api_key

# Telegram HITL Approval Bot (Optional locally, recommended for CI)
TELEGRAM_BOT_TOKEN=123456789:ABCDEF...
TELEGRAM_CHAT_ID=987654321
AUTO_APPROVE_MINUTES=30

# YouTube Data API v3 OAuth2 Credentials
YOUTUBE_CLIENT_ID=your_client_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REFRESH_TOKEN=your_oauth_refresh_token

# Local Testing Flags
DRY_RUN_SKIP_UPLOAD=false
```

### Coding Agent Step-by-Step Build & Verification Instructions
1. **Scaffold Monorepo:** Create all directories and files defined in Section 3.
2. **Implement Backend First:** Write `config.py`, `db.py`, `ingest_scout.py`, `article_scraper.py`, `script_generator.py`, `audio_engine.py`, `thumbnail_generator.py`, `telegram_gate.py`, `youtube_publisher.py`, `auth_youtube.py`, and `main.py`.
3. **Build Mock Test Payload:** Create a sample `video-engine/public/assets/render_payload.json` containing at least 4 scenes (covering `SystemGraph`, `CodeDiff`, `BenchmarkChart`, and `IncidentTimeline`) so the Remotion frontend can be tested independently of API keys.
4. **Implement Remotion 3-Zone Bento Engine:** Build `MasterComposition.tsx`, `themes.ts`, `elkLayout.ts`, and all 5 scene components in `video-engine/src/components/scenes/`.
5. **End-to-End Dry Run:** Verify that running `python main.py --topic "Cloudflare outage post-mortem" --dry-run` scrapes a real technical source, generates `render_payload.json`, synthesizes `narration.wav` with word timestamps, renders `thumbnail.png`, and compiles a valid `1920x1080` MP4 in `agent-backend/output/final_video.mp4`.