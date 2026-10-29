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


# Theme color maps mirror themes.ts / requirement section 6.6.
_THEMES: Dict[str, Dict[str, str]] = {
    "ARCHITECT_PAPER": {
        "canvas_bg": "#F4F1EA",
        "card_bg": "#FFFFFF",
        # Icon chips sit on a light surface so brand logos of any color stay
        # legible (e.g. near-black GitHub, which vanished on the dark card).
        "icon_chip_bg": "#FFFFFF",
        "grid": "#E2DDD2",
        "text_primary": "#18181B",
        "accent": "#FF4F00",
        "accent_critical": "#D90429",
        "border": "2px solid #18181B",
        "font_heading": "'Space Grotesk', 'Segoe UI', sans-serif",
        "badge_shadow": "4px 4px 0px #18181B",
        "card_shadow": "4px 4px 0px #18181B",
        "grid_pattern": (
            "linear-gradient(#E2DDD2 1px, transparent 1px),"
            "linear-gradient(90deg, #E2DDD2 1px, transparent 1px)"
        ),
    },
    "WAR_ROOM_HUD": {
        "canvas_bg": "#0B0C10",
        "card_bg": "#12151E",
        # Light chip on the carbon console keeps brand logos legible.
        "icon_chip_bg": "#F2F4F7",
        "grid": "#1F2430",
        "text_primary": "#F3F4F6",
        "accent": "#00F5D4",
        "accent_critical": "#FF2A54",
        "border": "1px solid #2A303C",
        "font_heading": "'JetBrains Mono', 'Consolas', monospace",
        "badge_shadow": "0 0 0 2px #2A303C",
        "card_shadow": "0 0 24px rgba(0,245,212,0.15)",
        "grid_pattern": (
            "radial-gradient(#1F2430 1.5px, transparent 1.5px)"
        ),
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
    # Fallback: first letter, dark on the light chip.
    letter = (slug[:1] or "?").upper()
    return (
        f'<span style="font-size:92px;font-weight:900;color:#18181B">{letter}</span>'
    )


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
        "__CARD_BG__": theme["card_bg"],
        "__ICON_CHIP_BG__": theme["icon_chip_bg"],
        "__GRID__": theme["grid"],
        "__TEXT_PRIMARY__": theme["text_primary"],
        "__ACCENT__": theme["accent"],
        "__ACCENT_CRITICAL__": theme["accent_critical"],
        "__BORDER__": theme["border"],
        "__FONT_HEADING__": theme["font_heading"],
        "__BADGE_SHADOW__": theme["badge_shadow"],
        "__CARD_SHADOW__": theme["card_shadow"],
        "__GRID_PATTERN__": theme["grid_pattern"],
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
