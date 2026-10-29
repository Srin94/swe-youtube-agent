"""Deep article extraction.

Primary path: Jina Reader (https://r.jina.ai/<URL>) which returns clean
Markdown with code blocks and tables preserved. Fallback: direct fetch +
BeautifulSoup paragraph / <pre><code> extraction. Output is truncated to
MAX_ARTICLE_CHARS so it comfortably fits Gemini's free-tier token budget.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

try:
    from . import config
except ImportError:  # pragma: no cover
    import config  # type: ignore


@dataclass
class ScrapedArticle:
    url: str
    markdown: str
    method: str  # "jina" | "soup" | "empty"

    @property
    def ok(self) -> bool:
        return len(self.markdown) >= config.MIN_ARTICLE_CHARS


def _truncate(text: str) -> str:
    text = text.strip()
    if len(text) <= config.MAX_ARTICLE_CHARS:
        return text
    # Cut on a newline boundary near the limit to avoid splitting a code block
    # mid-token where possible.
    cut = text.rfind("\n", 0, config.MAX_ARTICLE_CHARS)
    if cut < config.MAX_ARTICLE_CHARS * 0.6:
        cut = config.MAX_ARTICLE_CHARS
    return text[:cut].strip() + "\n\n...[truncated]"


def _fetch_jina(url: str) -> str:
    jina_url = config.JINA_READER_PREFIX + url
    with httpx.Client(timeout=config.JINA_TIMEOUT_SECONDS, follow_redirects=True) as client:
        resp = client.get(
            jina_url,
            headers={
                "X-Return-Format": "markdown",
                "User-Agent": config.USER_AGENT,
            },
        )
        resp.raise_for_status()
        return resp.text or ""


def _fetch_soup(url: str) -> str:
    with httpx.Client(timeout=config.JINA_TIMEOUT_SECONDS, follow_redirects=True) as client:
        resp = client.get(url, headers={"User-Agent": config.USER_AGENT})
        resp.raise_for_status()
        html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # Drop obvious non-content chrome.
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    parts: list[str] = []
    title = soup.find("h1") or soup.find("title")
    if title:
        parts.append(f"# {title.get_text(strip=True)}")

    root = soup.find("article") or soup.find("main") or soup.body or soup
    for el in root.find_all(["h2", "h3", "p", "pre", "li"]):
        if el.name in ("h2", "h3"):
            parts.append(f"\n## {el.get_text(strip=True)}")
        elif el.name == "pre":
            code = el.get_text("\n", strip=False)
            if code.strip():
                parts.append(f"```\n{code.strip()}\n```")
        elif el.name == "li":
            text = el.get_text(" ", strip=True)
            if text:
                parts.append(f"- {text}")
        else:
            text = el.get_text(" ", strip=True)
            if len(text) > 30:  # skip tiny nav-like fragments
                parts.append(text)
    return "\n\n".join(parts)


def scrape_article(url: str) -> ScrapedArticle:
    """Return cleaned markdown for a URL, trying Jina then BeautifulSoup."""
    # Try Jina Reader first.
    try:
        md = _fetch_jina(url)
        if len(md.strip()) >= config.MIN_ARTICLE_CHARS:
            return ScrapedArticle(url=url, markdown=_truncate(md), method="jina")
        print(f"[scraper] Jina returned {len(md)} chars (<min); falling back.")
    except Exception as exc:  # noqa: BLE001
        print(f"[scraper] Jina failed: {exc}; falling back to BeautifulSoup.")

    # Fallback: direct fetch + soup.
    try:
        md = _fetch_soup(url)
        if md.strip():
            return ScrapedArticle(url=url, markdown=_truncate(md), method="soup")
    except Exception as exc:  # noqa: BLE001
        print(f"[scraper] BeautifulSoup fallback failed: {exc}")

    return ScrapedArticle(url=url, markdown="", method="empty")


if __name__ == "__main__":
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "https://blog.cloudflare.com/"
    art = scrape_article(target)
    print(f"method={art.method} ok={art.ok} chars={len(art.markdown)}")
    print(art.markdown[:800])
