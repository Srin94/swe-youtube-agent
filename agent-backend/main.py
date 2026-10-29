"""Master end-to-end orchestrator for the Autonomous SWE YouTube Agent.

Stages:
    1. Trigger & mode selection (--topic => targeted, else autonomous scout)
    2. Ingestion & scoring            (ingest_scout)
    3. Topic selection via Gemini     (script_generator.select_topic)
    4. Deep article scraping          (article_scraper)
    5. Structured script + AST        (script_generator.generate_script)
    6. Voiceover + word alignment     (audio_engine)
    7. Thumbnail render               (thumbnail_generator)
    8. Programmatic video compile     (Remotion CLI)
    9. Telegram HITL approval gate    (telegram_gate)
   10. YouTube upload + community     (youtube_publisher)

Flags:
    --topic "..."   run in targeted topic mode
    --dry-run       do everything but skip the YouTube upload
    --skip-video    skip the Remotion render (fast backend-only iteration)
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

# Allow both `python main.py` (from agent-backend/) and module execution.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

import config  # type: ignore  # noqa: E402
import db  # type: ignore  # noqa: E402
import ingest_scout  # type: ignore  # noqa: E402
import article_scraper  # type: ignore  # noqa: E402
import script_generator  # type: ignore  # noqa: E402
import audio_engine  # type: ignore  # noqa: E402
import thumbnail_generator  # type: ignore  # noqa: E402
import telegram_gate  # type: ignore  # noqa: E402
import youtube_publisher  # type: ignore  # noqa: E402


def _banner(stage: str) -> None:
    print("\n" + "=" * 68)
    print(f"  {stage}")
    print("=" * 68)


def select_winning_candidate(custom_topic):
    _banner("STAGE 1-3: Ingestion, scoring & topic selection")
    candidates = ingest_scout.discover_candidates(custom_topic)
    if not candidates:
        raise SystemExit("No fresh candidates found. Nothing to produce today.")
    idx = script_generator.select_topic(candidates)
    # Put the LLM's pick first, then the rest by score, so a thin scrape can
    # fall through to the next-best candidate.
    ordered = [candidates[idx]] + [c for i, c in enumerate(candidates) if i != idx]
    winner = ordered[0]
    print(f"\n[main] WINNER: {winner.title}\n        {winner.url}")
    return winner, ordered


def _scrape_with_fallback(ordered):
    """Scrape the winner; if too thin, fall through to the next candidates.

    Returns (candidate, ScrapedArticle). Resolves Google News URLs along the
    way. Guarantees we never script from 13 characters when a scrapeable
    source exists in the shortlist.
    """
    tried = 0
    for cand in ordered[:5]:
        cand.url = ingest_scout.resolve_google_news_url(cand.url)
        article = article_scraper.scrape_article(cand.url)
        tried += 1
        print(
            f"[main] Scrape try {tried}: method={article.method} "
            f"chars={len(article.markdown)} [{cand.source}]"
        )
        if article.ok:
            return cand, article
    # Nothing scraped well — return the best effort on the original winner.
    best = ordered[0]
    return best, article_scraper.scrape_article(best.url)


def build_payload(winner, ordered=None):
    _banner("STAGE 4-5: Deep scrape & structured script generation")
    ordered = ordered or [winner]
    winner, article = _scrape_with_fallback(ordered)
    print(f"[main] Source: {winner.url}")
    payload = script_generator.generate_script(
        topic_title=winner.title,
        source_url=winner.url,
        article_markdown=article.markdown if article.ok else winner.title,
    )
    print(
        f"[main] Script: category={payload.topic_category} theme={payload.theme_id} "
        f"scenes={len(payload.scenes)}"
    )
    script_generator.save_payload(payload)
    return payload


def build_audio(payload):
    _banner("STAGE 6: Voiceover synthesis & word-level alignment")
    audio_engine.build_audio(payload, save=True)
    return payload


def build_thumbnail(payload):
    _banner("STAGE 7: Thumbnail rendering")
    try:
        thumbnail_generator.render_thumbnail(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"[main] Thumbnail render failed (continuing): {exc}")


def render_video(payload) -> bool:
    _banner("STAGE 8: Programmatic video compilation (Remotion)")
    # Copy the audio + payload into the Remotion public assets dir.
    config.VIDEO_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    if config.NARRATION_PATH.exists():
        shutil.copy(config.NARRATION_PATH, config.VIDEO_ASSETS_DIR / "narration.wav")
    shutil.copy(config.RENDER_PAYLOAD_PATH, config.VIDEO_ASSETS_DIR / "render_payload.json")

    npx = shutil.which("npx") or "npx"
    cmd = [
        npx, "remotion", "render", "src/index.ts",
        config.REMOTION_COMPOSITION_ID,
        str(config.FINAL_VIDEO_PATH),
        "--codec=h264",
    ]
    print(f"[main] Running: {' '.join(cmd)} (cwd={config.VIDEO_ENGINE_DIR})")
    try:
        subprocess.run(
            cmd, cwd=str(config.VIDEO_ENGINE_DIR), check=True, shell=(os.name == "nt")
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"[main] Remotion render failed: {exc}")
        return False
    ok = config.FINAL_VIDEO_PATH.exists()
    print(f"[main] Video rendered: {ok} -> {config.FINAL_VIDEO_PATH}")
    return ok


def approve_and_publish(payload, dry_run: bool) -> None:
    _banner("STAGE 9: Telegram human-in-the-loop approval")
    decision = telegram_gate.request_approval(payload)
    if not decision.approved:
        print(f"[main] Not publishing ({decision.reason}).")
        if decision.reject_permanently:
            # Explicit reject: burn the topic so we don't resurface it tomorrow.
            db.mark_topic_published(payload.source_url, payload.youtube_title, None)
        else:
            # Timed out / preview failed: leave the topic unseen so a later run
            # can pick it up again instead of losing it.
            print("[main] Topic left unseen; it can resurface on a later run.")
        return

    _banner("STAGE 10: YouTube upload & community seeding")
    if dry_run:
        print("[main] --dry-run: skipping upload. Recording topic as seen.")
        db.mark_topic_published(payload.source_url, payload.youtube_title, None)
        return
    youtube_publisher.publish(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="Autonomous SWE YouTube Agent")
    parser.add_argument("--topic", default=None, help="Targeted topic query")
    parser.add_argument("--dry-run", action="store_true", help="Skip YouTube upload")
    parser.add_argument(
        "--skip-video", action="store_true", help="Skip the Remotion render"
    )
    args = parser.parse_args()

    mode = "TARGETED" if args.topic else "AUTONOMOUS SCOUT"
    print(f"[main] Mode: {mode}  dry_run={args.dry_run}")
    db.init_db()

    winner, ordered = select_winning_candidate(args.topic)
    payload = build_payload(winner, ordered)
    build_audio(payload)
    build_thumbnail(payload)

    if not args.skip_video:
        render_video(payload)
    else:
        print("[main] --skip-video: not rendering the MP4.")

    approve_and_publish(payload, dry_run=args.dry_run)
    _banner("DONE")


if __name__ == "__main__":
    main()
