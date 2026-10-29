"""Central configuration: env variables, RSS feed URLs, and pipeline constants.

Everything that tunes the pipeline lives here so the individual modules stay
declarative. Environment variables are loaded once via python-dotenv.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# agent-backend/src/config.py -> agent-backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

DATA_DIR = BACKEND_DIR / "data"
OUTPUT_DIR = BACKEND_DIR / "output"
TEMPLATES_DIR = BACKEND_DIR / "templates"

VIDEO_ENGINE_DIR = REPO_ROOT / "video-engine"
VIDEO_ASSETS_DIR = VIDEO_ENGINE_DIR / "public" / "assets"

DB_PATH = DATA_DIR / "seen_topics.db"
RENDER_PAYLOAD_PATH = OUTPUT_DIR / "render_payload.json"
NARRATION_PATH = OUTPUT_DIR / "narration.wav"
THUMBNAIL_PATH = OUTPUT_DIR / "thumbnail.png"
FINAL_VIDEO_PATH = OUTPUT_DIR / "final_video.mp4"
THUMBNAIL_TEMPLATE_PATH = TEMPLATES_DIR / "thumbnail_template.html"

# Ensure the writable directories exist on import so downstream modules never
# have to worry about it.
for _d in (DATA_DIR, OUTPUT_DIR, VIDEO_ASSETS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# Load .env from the repo root (if present). Does nothing in CI where the
# variables are injected directly into the environment.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")  # allow a backend-local override too

# ---------------------------------------------------------------------------
# Secrets / credentials
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

# How long the pipeline waits for a Telegram decision before giving up.
# (Historically named AUTO_APPROVE_MINUTES; it is now just the wait window.)
APPROVAL_WINDOW_MINUTES = int(
    os.getenv("APPROVAL_WINDOW_MINUTES", os.getenv("AUTO_APPROVE_MINUTES", "30")) or "30"
)
# Back-compat alias so existing code/.env referencing the old name keeps working.
AUTO_APPROVE_MINUTES = APPROVAL_WINDOW_MINUTES

# Fail-closed by default: if no explicit "Approve" arrives within the window,
# DO NOT publish. Set APPROVE_ON_TIMEOUT=true only if you want the old behaviour
# where silence auto-publishes after the timeout.
APPROVE_ON_TIMEOUT = os.getenv("APPROVE_ON_TIMEOUT", "false").lower() in (
    "1",
    "true",
    "yes",
)

YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID", "").strip()
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET", "").strip()
YOUTUBE_REFRESH_TOKEN = os.getenv("YOUTUBE_REFRESH_TOKEN", "").strip()

DRY_RUN_SKIP_UPLOAD = os.getenv("DRY_RUN_SKIP_UPLOAD", "false").lower() in (
    "1",
    "true",
    "yes",
)

# ---------------------------------------------------------------------------
# LLM configuration
# ---------------------------------------------------------------------------
# NOTE: gemini-2.5-flash (named in the spec) is retired for new API keys; the
# live API directs new users to gemini-3.8-flash. Override via GEMINI_MODEL.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

# ---------------------------------------------------------------------------
# Ingestion configuration
# ---------------------------------------------------------------------------
HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_MIN_POINTS = 80
HN_LOOKBACK_SECONDS = 172_800  # 48h

GITHUB_TRENDING_URL = "https://github.com/trending?since=daily"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}"

REDDIT_ENDPOINTS = [
    "https://www.reddit.com/r/experienceddevs/top.json?t=day&limit=10",
    "https://www.reddit.com/r/programming/top.json?t=day&limit=10",
]

# A browser-like UA so Reddit/GitHub do not 429 the unauthenticated requests.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 swe-youtube-agent/1.0"
)

# 15 top engineering blog RSS feeds covering outages, system design and SWE news.
ENGINEERING_RSS_FEEDS = [
    "https://blog.cloudflare.com/rss/",
    "https://netflixtechblog.com/feed",
    "https://discord.com/blog/rss.xml",
    "https://www.uber.com/blog/engineering/rss/",
    "https://aws.amazon.com/blogs/architecture/feed/",
    "https://stripe.com/blog/feed.rss",
    "https://github.blog/engineering.atom",
    "https://feed.infoq.com/",
    "https://newsletter.pragmaticengineer.com/feed",
    "https://engineering.fb.com/feed/",
    "https://blog.google/technology/developers/rss/",
    "https://slack.engineering/feed/",
    "https://dropbox.tech/feed",
    "https://engineeringblog.yelp.com/feed.xml",
    "https://www.allthingsdistributed.com/atom.xml",
]

# ---------------------------------------------------------------------------
# Scoring / selection
# ---------------------------------------------------------------------------
MAX_CANDIDATES = 15          # keep after scoring
LLM_SHORTLIST = 5            # how many to hand to Gemini for final pick
COMMENT_WEIGHT = 1.8
SCORE_TIME_OFFSET_HOURS = 2
SCORE_TIME_EXPONENT = 1.3
TITLE_SIMILARITY_THRESHOLD = 0.80

# ---------------------------------------------------------------------------
# Article extraction
# ---------------------------------------------------------------------------
JINA_READER_PREFIX = "https://r.jina.ai/"
JINA_TIMEOUT_SECONDS = 20
MIN_ARTICLE_CHARS = 300
MAX_ARTICLE_CHARS = 18_000

# ---------------------------------------------------------------------------
# Audio / TTS
# ---------------------------------------------------------------------------
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "am_michael")
KOKORO_SPEED = float(os.getenv("KOKORO_SPEED", "1.0"))  # calmer than 1.04
# Warmer, more conversational default (Azure HD "multilingual" voice). If the
# edge endpoint doesn't accept it, the synth falls through this chain in order.
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "en-US-AndrewMultilingualNeural")
EDGE_TTS_FALLBACK_VOICES = ["en-US-GuyNeural", "en-US-ChristopherNeural"]
EDGE_TTS_RATE = os.getenv("EDGE_TTS_RATE", "-3%")  # slightly slower, less rushed
SCENE_GAP_MS = 340  # a touch more breath between scenes
AUDIO_SAMPLE_RATE = 24_000  # Kokoro native; resampled to 16k for whisper
WHISPER_MODEL = "base.en"
WHISPER_COMPUTE_TYPE = "int8"

# ---------------------------------------------------------------------------
# Background music
# ---------------------------------------------------------------------------
# A soothing bed is mixed UNDER the narration of every video. By default it is
# synthesized procedurally with a fresh key + chord progression each run, so no
# two videos share the same track and nothing has to be downloaded or licensed.
# Drop royalty-free files into MUSIC_DIR to use those instead (one per render,
# never repeating the previous pick).
BACKGROUND_MUSIC_ENABLED = os.getenv("BACKGROUND_MUSIC_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
)
MUSIC_DIR = BACKEND_DIR / "assets" / "music"
# Absolute level of the music bed (dBFS). Narration sits near -16..-20 dBFS, so
# -30 keeps the music clearly in the background. Lower = quieter music.
MUSIC_LEVEL_DBFS = float(os.getenv("MUSIC_LEVEL_DBFS", "-30"))
MUSIC_FADE_MS = int(os.getenv("MUSIC_FADE_MS", "2500"))  # fade in/out length

# ---------------------------------------------------------------------------
# Thumbnail
# ---------------------------------------------------------------------------
THUMBNAIL_WIDTH = 1280
THUMBNAIL_HEIGHT = 720
SIMPLEICONS_CDN = "https://cdn.simpleicons.org/{slug}"

# ---------------------------------------------------------------------------
# Video
# ---------------------------------------------------------------------------
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080
VIDEO_FPS = 60
REMOTION_COMPOSITION_ID = "SWEMasterVideo"

# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------
YOUTUBE_CATEGORY_ID = "28"  # Science & Technology
YOUTUBE_UPLOAD_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]


def require_gemini() -> str:
    """Return the Gemini key or raise a helpful error."""
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to .env or the environment "
            "(see .env.example)."
        )
    return GEMINI_API_KEY


def has_telegram() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


def has_youtube_credentials() -> bool:
    return bool(
        YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN
    )
