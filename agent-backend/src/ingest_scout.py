"""SWE signal ingestion.

Five zero-auth collectors feed a single candidate pool:
  * Hacker News (Algolia search API)
  * 15 engineering-blog RSS feeds (feedparser)
  * GitHub Trending (httpx + BeautifulSoup)
  * r/experienceddevs + r/programming (Reddit public JSON)
  * a dynamic query fallback (HN query + Google News RSS) for --topic mode

Every candidate is normalized to a `Candidate` and ranked by a composite
virality / freshness score. Already-published topics are filtered out via
`db.is_topic_seen`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List, Optional

import feedparser
import httpx
from bs4 import BeautifulSoup

try:
    from . import config, db
except ImportError:  # pragma: no cover - script execution
    import config  # type: ignore
    import db  # type: ignore


@dataclass
class Candidate:
    title: str
    url: str
    source: str
    points: int = 0
    comments: int = 0
    created_at: float = field(default_factory=lambda: time.time())  # epoch secs
    extra: dict = field(default_factory=dict)

    @property
    def hours_since(self) -> float:
        return max(0.0, (time.time() - self.created_at) / 3600.0)

    def score(self) -> float:
        """Composite score: virality decayed by age.

            (points + comments * 1.8) / (hours_since + 2) ** 1.3
        """
        numerator = self.points + self.comments * config.COMMENT_WEIGHT
        denom = (self.hours_since + config.SCORE_TIME_OFFSET_HOURS) ** (
            config.SCORE_TIME_EXPONENT
        )
        return numerator / denom if denom else 0.0


def _client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": config.USER_AGENT},
        timeout=20.0,
        follow_redirects=True,
    )


def _parse_feed_time(entry) -> float:
    """Best-effort publish epoch from a feedparser entry."""
    for key in ("published_parsed", "updated_parsed"):
        t = entry.get(key)
        if t:
            return time.mktime(t)
    return time.time()


# ---------------------------------------------------------------------------
# 1. Hacker News
# ---------------------------------------------------------------------------
def fetch_hacker_news() -> List[Candidate]:
    cutoff = int(time.time()) - config.HN_LOOKBACK_SECONDS
    params = {
        "tags": "story",
        "numericFilters": f"points>{config.HN_MIN_POINTS},created_at_i>{cutoff}",
        "hitsPerPage": "50",
    }
    out: List[Candidate] = []
    try:
        with _client() as client:
            resp = client.get(config.HN_SEARCH_URL, params=params)
            resp.raise_for_status()
            for hit in resp.json().get("hits", []):
                url = hit.get("url") or (
                    f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                )
                out.append(
                    Candidate(
                        title=hit.get("title") or "",
                        url=url,
                        source="hackernews",
                        points=int(hit.get("points") or 0),
                        comments=int(hit.get("num_comments") or 0),
                        created_at=float(hit.get("created_at_i") or time.time()),
                        extra={"objectID": hit.get("objectID")},
                    )
                )
    except Exception as exc:  # noqa: BLE001 - never let one source kill the run
        print(f"[ingest] HN fetch failed: {exc}")
    return out


# ---------------------------------------------------------------------------
# 2. Engineering RSS feeds
# ---------------------------------------------------------------------------
def fetch_engineering_rss() -> List[Candidate]:
    out: List[Candidate] = []
    for feed_url in config.ENGINEERING_RSS_FEEDS:
        try:
            parsed = feedparser.parse(feed_url, agent=config.USER_AGENT)
            for entry in parsed.entries[:8]:
                link = entry.get("link")
                title = entry.get("title")
                if not link or not title:
                    continue
                out.append(
                    Candidate(
                        title=title,
                        url=link,
                        source=f"rss:{parsed.feed.get('title', feed_url)[:40]}",
                        # RSS has no score; seed a modest baseline so strong,
                        # very fresh posts can still surface.
                        points=40,
                        comments=0,
                        created_at=_parse_feed_time(entry),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[ingest] RSS feed failed ({feed_url}): {exc}")
    return out


# ---------------------------------------------------------------------------
# 3. GitHub Trending (scrape)
# ---------------------------------------------------------------------------
def fetch_github_trending() -> List[Candidate]:
    out: List[Candidate] = []
    try:
        with _client() as client:
            resp = client.get(config.GITHUB_TRENDING_URL)
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for article in soup.select("article.Box-row")[:20]:
            anchor = article.select_one("h2 a")
            if not anchor:
                continue
            repo = anchor.get("href", "").strip("/")
            if not repo:
                continue
            desc_el = article.select_one("p")
            desc = desc_el.get_text(strip=True) if desc_el else ""
            lang_el = article.select_one('[itemprop="programmingLanguage"]')
            language = lang_el.get_text(strip=True) if lang_el else ""
            stars_today = 0
            star_el = article.select_one("span.d-inline-block.float-sm-right")
            if star_el:
                digits = "".join(c for c in star_el.get_text() if c.isdigit())
                stars_today = int(digits) if digits else 0
            out.append(
                Candidate(
                    title=f"{repo} — {desc}" if desc else repo,
                    url=f"https://github.com/{repo}",
                    source="github-trending",
                    # Treat stars-gained-today as the virality signal.
                    points=stars_today,
                    comments=0,
                    created_at=time.time(),  # trending is "today"; treat as fresh
                    extra={"language": language, "stars_today": stars_today},
                )
            )
    except Exception as exc:  # noqa: BLE001
        print(f"[ingest] GitHub trending failed: {exc}")
    return out


# ---------------------------------------------------------------------------
# 4. Reddit (r/experienceddevs + r/programming)
# ---------------------------------------------------------------------------
def fetch_swe_reddit() -> List[Candidate]:
    out: List[Candidate] = []
    for endpoint in config.REDDIT_ENDPOINTS:
        try:
            with _client() as client:
                resp = client.get(endpoint)
                resp.raise_for_status()
            for child in resp.json().get("data", {}).get("children", []):
                data = child.get("data", {})
                title = data.get("title")
                if not title:
                    continue
                # Prefer the external link; fall back to the reddit thread.
                url = data.get("url_overridden_by_dest") or (
                    "https://www.reddit.com" + data.get("permalink", "")
                )
                out.append(
                    Candidate(
                        title=title,
                        url=url,
                        source=f"reddit:{data.get('subreddit', '')}",
                        points=int(data.get("score") or 0),
                        comments=int(data.get("num_comments") or 0),
                        created_at=float(data.get("created_utc") or time.time()),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[ingest] Reddit fetch failed ({endpoint}): {exc}")
    return out


# ---------------------------------------------------------------------------
# 5. Dynamic custom-topic fallback
# ---------------------------------------------------------------------------
def fetch_custom_topic(query: str) -> List[Candidate]:
    """For --topic mode: HN query + Google News RSS, top ~3 technical hits."""
    out: List[Candidate] = []

    # HN Algolia full-text query.
    try:
        with _client() as client:
            resp = client.get(
                config.HN_SEARCH_URL,
                params={"query": query, "tags": "story", "hitsPerPage": "10"},
            )
            resp.raise_for_status()
            for hit in resp.json().get("hits", [])[:5]:
                url = hit.get("url") or (
                    f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                )
                out.append(
                    Candidate(
                        title=hit.get("title") or query,
                        url=url,
                        source="hackernews:query",
                        points=int(hit.get("points") or 0),
                        comments=int(hit.get("num_comments") or 0),
                        created_at=float(hit.get("created_at_i") or time.time()),
                    )
                )
    except Exception as exc:  # noqa: BLE001
        print(f"[ingest] HN query failed: {exc}")

    # Google News RSS for the query, scoped to software engineering.
    try:
        from urllib.parse import quote_plus

        gnews_url = config.GOOGLE_NEWS_RSS.format(
            query=quote_plus(f"{query} software engineering")
        )
        parsed = feedparser.parse(gnews_url, agent=config.USER_AGENT)
        for entry in parsed.entries[:5]:
            link = entry.get("link")
            title = entry.get("title")
            if link and title:
                out.append(
                    Candidate(
                        title=title,
                        url=link,
                        source="google-news",
                        points=50,
                        comments=0,
                        created_at=_parse_feed_time(entry),
                    )
                )
    except Exception as exc:  # noqa: BLE001
        print(f"[ingest] Google News failed: {exc}")

    return out


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
def _dedupe_and_filter(cands: List[Candidate]) -> List[Candidate]:
    """Drop in-batch URL duplicates and already-published topics."""
    seen_hashes: set[str] = set()
    result: List[Candidate] = []
    for c in cands:
        if not c.url or not c.title:
            continue
        h = db.url_hash(c.url)
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        if db.is_topic_seen(c.url, c.title):
            continue
        result.append(c)
    return result


def discover_candidates(custom_topic: Optional[str] = None) -> List[Candidate]:
    """Return up to MAX_CANDIDATES fresh, unseen, score-ranked candidates."""
    db.init_db()
    if custom_topic:
        pool = fetch_custom_topic(custom_topic)
    else:
        pool = []
        pool += fetch_hacker_news()
        pool += fetch_engineering_rss()
        pool += fetch_github_trending()
        pool += fetch_swe_reddit()

    pool = _dedupe_and_filter(pool)
    pool.sort(key=lambda c: c.score(), reverse=True)
    top = pool[: config.MAX_CANDIDATES]
    for rank, c in enumerate(top, 1):
        print(
            f"[ingest] #{rank:>2} score={c.score():7.2f} "
            f"[{c.source}] {c.title[:70]}"
        )
    return top


if __name__ == "__main__":
    import sys

    topic = sys.argv[1] if len(sys.argv) > 1 else None
    discover_candidates(topic)
