"""High-CTR 1280x720 thumbnail renderer (Playwright headless Chromium).

Injects the LLM-authored ThumbnailSpec into `templates/thumbnail_template.html`,
picks theme-matched colors, inlines the two simple-icons SVGs (fetched and
embedded as data so the render works even if the headless browser is offline),
and screenshots the page to `output/thumbnail.png`.
"""

from __future__ import annotations

from typing import Dict

import httpx

try:
    from . import config
    from .script_generator import ThumbnailSpec, VideoRenderPayload
except ImportError:  # pragma: no cover
    import config  # type: ignore
    from script_generator import ThumbnailSpec, VideoRenderPayload  # type: ignore


# Theme color maps mirror the (now dark) themes.ts. Both themes are dramatic
# dark stages so the thumbnail matches the video it fronts.
_THEMES: Dict[str, Dict[str, str]] = {
    # Dark "blueprint" — system design / deep dives / new releases.
    "ARCHITECT_PAPER": {
        "canvas_bg": "#0A0E16",
        "canvas_bg2": "#101A2E",
        "card_bg": "#121A28",
        "grid": "#1A2233",
        "text_primary": "#EAF0F8",
        "text_muted": "#8092AC",
        "accent": "#4EA8FF",
        "accent_2": "#7C5CFF",
        "accent_critical": "#FF5C7A",
        "accent_glow": "rgba(78,168,255,0.45)",
        "accent2_glow": "rgba(124,92,255,0.40)",
        "font_heading": "'Space Grotesk', 'Segoe UI', sans-serif",
        "font_mono": "'IBM Plex Mono', 'Consolas', monospace",
    },
    # Carbon SRE console — outages / incidents / job news.
    "WAR_ROOM_HUD": {
        "canvas_bg": "#0B0C10",
        "canvas_bg2": "#0E1620",
        "card_bg": "#12151E",
        "grid": "#1F2430",
        "text_primary": "#F3F4F6",
        "text_muted": "#8A93A6",
        "accent": "#00F5D4",
        "accent_2": "#FFB000",
        "accent_critical": "#FF2A54",
        "accent_glow": "rgba(0,245,212,0.40)",
        "accent2_glow": "rgba(255,176,0,0.35)",
        "font_heading": "'JetBrains Mono', 'Consolas', monospace",
        "font_mono": "'JetBrains Mono', 'Consolas', monospace",
    },
}

# Common LLM slug variants -> canonical simple-icons slugs. Brands fully removed
# from simple-icons for trademark reasons (microsoft, windows, azure, openai,
# vscode, ...) have no logo available and fall through to the letter badge.
_ICON_ALIASES: Dict[str, str] = {
    "node": "nodedotjs",
    "nodejs": "nodedotjs",
    "golang": "go",
    "postgres": "postgresql",
    "postgre": "postgresql",
    "k8s": "kubernetes",
    "https": "cloudflare",
    "vuejs": "vuedotjs",
    "nextjs": "nextdotjs",
    "githubactions": "github",
    "aws": "amazonwebservices",
    "amazon": "amazonwebservices",
}

_CONNECTOR_GLYPH = {
    "vs_bolt": "⚡",      # lightning bolt (VS)
    "broken_arrow": "↯",  # downwards zigzag arrow
    "upgrade_arrow": "→",  # rightwards arrow
}


def _fetch_icon_svg(slug: str) -> str:
    """Return inline <svg> markup for a simple-icons slug, or a text fallback.

    The chip background is always light, so the letter fallback uses a dark
    color (brand SVGs keep their own colors, which read fine on the light chip).
    """
    if not slug:
        return ""
    normalized = slug.lower().strip().replace(" ", "")
    normalized = _ICON_ALIASES.get(normalized, normalized)
    try:
        url = config.SIMPLEICONS_CDN.format(slug=normalized)
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers={"User-Agent": config.USER_AGENT})
            resp.raise_for_status()
            svg = resp.text
            if "<svg" in svg:
                return svg
    except Exception as exc:  # noqa: BLE001
        print(f"[thumbnail] icon unavailable for '{slug}' -> letter badge ({exc})")
    # Fallback: first letter in the tile.
    letter = (slug[:1] or "?").upper()
    return f'<span class="fallback">{letter}</span>'


def _headline_html(text: str, accent_last_word: bool = True) -> str:
    """Render the headline, accenting the final word for contrast."""
    words = text.strip().split()
    if not words:
        return ""
    if accent_last_word and len(words) > 1:
        head = " ".join(words[:-1])
        return f'{head} <span class="hl">{words[-1]}</span>'
    return text


def _fill_template(spec: ThumbnailSpec, theme_id: str) -> str:
    theme = _THEMES.get(theme_id, _THEMES["ARCHITECT_PAPER"])
    with open(config.THUMBNAIL_TEMPLATE_PATH, encoding="utf-8") as fh:
        html = fh.read()

    connector_glyph = _CONNECTOR_GLYPH.get(spec.connector_style, "→")
    connector_class = "critical" if spec.connector_style == "broken_arrow" else ""

    replacements = {
        "__CANVAS_BG__": theme["canvas_bg"],
        "__CANVAS_BG2__": theme["canvas_bg2"],
        "__CARD_BG__": theme["card_bg"],
        "__GRID__": theme["grid"],
        "__TEXT_PRIMARY__": theme["text_primary"],
        "__TEXT_MUTED__": theme["text_muted"],
        "__ACCENT__": theme["accent"],
        "__ACCENT_2__": theme["accent_2"],
        "__ACCENT_CRITICAL__": theme["accent_critical"],
        "__ACCENT_GLOW__": theme["accent_glow"],
        "__ACCENT2_GLOW__": theme["accent2_glow"],
        "__FONT_HEADING__": theme["font_heading"],
        "__FONT_MONO__": theme["font_mono"],
        "__CHANNEL_NAME__": config.CHANNEL_NAME.upper(),
        "__BADGE_TEXT__": spec.badge_text.upper(),
        "__LEFT_ICON__": _fetch_icon_svg(spec.left_icon_slug),
        "__RIGHT_ICON__": _fetch_icon_svg(spec.right_icon_slug),
        "__CONNECTOR_GLYPH__": connector_glyph,
        "__CONNECTOR_CLASS__": connector_class,
        "__HEADLINE_HTML__": _headline_html(spec.headline_text),
    }
    for token, value in replacements.items():
        html = html.replace(token, value)
    return html


def render_thumbnail(payload: VideoRenderPayload) -> str:
    """Render the thumbnail PNG; return its path. Requires Playwright chromium."""
    html = _fill_template(payload.thumbnail, payload.theme_id)

    # Write the filled HTML next to the output for debugging/repro.
    filled_path = config.OUTPUT_DIR / "thumbnail_filled.html"
    filled_path.write_text(html, encoding="utf-8")

    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "playwright not installed. `pip install playwright && playwright install chromium`."
        ) from exc

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(
            viewport={"width": config.THUMBNAIL_WIDTH, "height": config.THUMBNAIL_HEIGHT},
            device_scale_factor=1,
        )
        page.goto(filled_path.as_uri())
        page.wait_for_timeout(300)  # let fonts/layout settle
        page.screenshot(path=str(config.THUMBNAIL_PATH), clip={
            "x": 0, "y": 0,
            "width": config.THUMBNAIL_WIDTH, "height": config.THUMBNAIL_HEIGHT,
        })
        browser.close()

    print(f"[thumbnail] Rendered -> {config.THUMBNAIL_PATH}")
    return str(config.THUMBNAIL_PATH)


if __name__ == "__main__":
    import json

    with open(config.RENDER_PAYLOAD_PATH, encoding="utf-8") as fh:
        p = VideoRenderPayload.model_validate(json.load(fh))
    render_thumbnail(p)
