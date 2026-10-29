"""SQLite state store for topic deduplication.

A single tiny table tracks every topic we have already turned into a video so
the daily scout never repeats itself. Deduplication is two-layered:

1. Exact match on the SHA-256 of a *normalized* URL (scheme/host/path only).
2. Fuzzy title match (difflib ratio > TITLE_SIMILARITY_THRESHOLD) to catch the
   same story surfacing under a different URL (HN vs. the original blog, etc.).
"""

from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Optional
from urllib.parse import urlparse

try:  # package import
    from . import config
except ImportError:  # script import
    import config  # type: ignore


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the seen_topics table if it does not already exist."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seen_topics (
                url_hash         TEXT PRIMARY KEY,
                title            TEXT,
                published_at     TIMESTAMP,
                youtube_video_id TEXT
            )
            """
        )
        conn.commit()


def normalize_url(url: str) -> str:
    """Lower-case host, strip query/fragment and trailing slash for hashing."""
    parsed = urlparse(url.strip())
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = (parsed.path or "").rstrip("/")
    scheme = parsed.scheme or "https"
    return f"{scheme}://{host}{path}"


def url_hash(url: str) -> str:
    return hashlib.sha256(normalize_url(url).encode("utf-8")).hexdigest()


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def is_topic_seen(url: str, title: str) -> bool:
    """True if this URL (exact) or a very similar title has been published."""
    init_db()
    with _connect() as conn:
        # 1. Exact normalized-URL hash match.
        row = conn.execute(
            "SELECT 1 FROM seen_topics WHERE url_hash = ?", (url_hash(url),)
        ).fetchone()
        if row:
            return True

        # 2. Fuzzy title match against every stored title.
        if title:
            for stored in conn.execute("SELECT title FROM seen_topics"):
                stored_title = stored["title"] or ""
                if (
                    stored_title
                    and _title_similarity(stored_title, title)
                    > config.TITLE_SIMILARITY_THRESHOLD
                ):
                    return True
    return False


def mark_topic_published(
    url: str,
    title: str,
    youtube_video_id: Optional[str] = None,
    published_at: Optional[str] = None,
) -> None:
    """Record a topic so it is never produced again."""
    init_db()
    ts = published_at or datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO seen_topics (url_hash, title, published_at, youtube_video_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(url_hash) DO UPDATE SET
                title = excluded.title,
                youtube_video_id = COALESCE(excluded.youtube_video_id, seen_topics.youtube_video_id)
            """,
            (url_hash(url), title, ts, youtube_video_id),
        )
        conn.commit()


if __name__ == "__main__":  # quick manual smoke test
    init_db()
    print("DB initialized at", config.DB_PATH)
    print("seen?", is_topic_seen("https://example.com/post", "Hello World"))
