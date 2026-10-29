# Autonomous SWE YouTube Agent

A fully autonomous, **$0/month** pipeline that discovers trending software-
engineering stories, writes a tightly-paced script, synthesizes a voiceover,
renders a 1080p60 programmatic video with [Remotion](https://remotion.dev),
and publishes it to YouTube — gated by a Telegram human-in-the-loop approval.

Four content pillars: **production outages / post-mortems**, **system design &
architecture migrations**, **SWE job market / layoffs / comp**, and **new
frameworks / compilers / benchmark battles**.

## Monorepo layout

```
agent-backend/     Python pipeline (ingest -> script -> audio -> thumbnail -> publish)
  src/             Pipeline modules
  main.py          End-to-end orchestrator
  auth_youtube.py  One-time OAuth refresh-token helper
video-engine/      Remotion video engine (React 19 + TypeScript)
  src/components/   3-zone bento HUD + 5 scene renderers
  public/assets/    narration.wav + render_payload.json copied in per run
.github/workflows/ Daily cron + manual-topic CI workflow
```

## Quick start (local)

### 1. Backend

```bash
cd agent-backend
python -m venv .venv
. .venv/Scripts/activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
playwright install chromium
cp ../.env.example ../.env       # then fill in your keys
```

The only strictly-required secret for a dry run is `GEMINI_API_KEY`
(free from [Google AI Studio](https://aistudio.google.com)). Telegram and
YouTube credentials are optional — without them the pipeline auto-approves and
skips the upload.

### 2. Video engine

```bash
cd video-engine
npm install
npm start          # opens Remotion Studio on the bundled mock payload
```

Because `public/assets/render_payload.json` ships with a 6-scene mock covering
all five visual types, the Remotion studio works with **zero API keys**.

### 3. End-to-end dry run

```bash
cd agent-backend
python main.py --topic "Cloudflare outage post-mortem" --dry-run
```

This scrapes a real source, generates `output/render_payload.json`, synthesizes
`output/narration.wav` with word timestamps, renders `output/thumbnail.png`,
compiles `output/final_video.mp4`, and stops before the YouTube upload.

Useful flags: `--topic "..."` (targeted mode), `--dry-run` (skip upload),
`--skip-video` (backend-only iteration).

## How it runs for $0

| Stage | Free tool |
| :-- | :-- |
| Scheduler | GitHub Actions (2,000 min/mo) or local CLI |
| State / dedup | SQLite committed back to the repo |
| Ingestion | HN Algolia, engineering RSS, GitHub Trending, Reddit JSON |
| Article extraction | Jina Reader + BeautifulSoup fallback |
| Script + telemetry | Gemini 2.5 Flash (structured JSON output) |
| Voice | Kokoro-82M (edge-tts fallback) |
| Word timing | faster-whisper (base.en, int8) |
| Video | Remotion v4 |
| Thumbnail | Playwright headless Chromium |
| Approval + publish | Telegram Bot API + YouTube Data API v3 |

## Data contract

`agent-backend/src/script_generator.py` (Pydantic) and
`video-engine/src/types/schema.ts` (TypeScript) are a one-to-one mirror of the
`VideoRenderPayload` JSON contract. Change one, change the other.

## YouTube auth (one time)

```bash
cd agent-backend
python auth_youtube.py --secrets client_secret.json
```

Copy the printed `YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN` into `.env`.

## Notes on model availability

The heavy ML deps (`kokoro-onnx`, `faster-whisper`) degrade gracefully: if the
Kokoro model files are not cached the audio engine falls back to `edge-tts`, and
if `faster-whisper` is unavailable it falls back to proportional word timing.
The pipeline therefore still produces a renderable video with a minimal install.
