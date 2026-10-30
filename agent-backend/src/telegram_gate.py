"""Telegram Human-in-the-Loop approval gate.

Sends the rendered video + title + summary + pinned comment to the operator with
[Approve & Upload] / [Cancel] inline buttons, then polls getUpdates for a
callback.

FAIL-CLOSED: if no explicit "Approve" arrives within APPROVAL_WINDOW_MINUTES, the
video is NOT published. Set APPROVE_ON_TIMEOUT=true to restore the old behaviour
where silence auto-publishes after the timeout.

If Telegram is not configured, `request_approval` returns True immediately
(approval is a no-op), so local hands-on runs without a bot still publish.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

try:
    from . import config
    from .script_generator import VideoRenderPayload
except ImportError:  # pragma: no cover
    import config  # type: ignore
    from script_generator import VideoRenderPayload  # type: ignore

_API = "https://api.telegram.org/bot{token}/{method}"

APPROVE = "swe_approve"
REJECT = "swe_reject"


@dataclass
class ApprovalResult:
    approved: bool
    reason: str
    # True only when the operator explicitly rejected — the topic should then be
    # burned (marked seen). A mere timeout leaves this False so the topic can
    # resurface on a later run instead of being lost.
    reject_permanently: bool = False


def _call(method: str, **params):
    url = _API.format(token=config.TELEGRAM_BOT_TOKEN, method=method)
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, data=params)
        resp.raise_for_status()
        return resp.json()


def notify(text: str) -> None:
    """Best-effort one-way message to the operator (plain text, no buttons).

    No-op when Telegram isn't configured. Used to surface post-approval events —
    e.g. a custom thumbnail YouTube rejected — that would otherwise only hit the
    runner logs. Plain text (no parse_mode) so a raw error string with Markdown
    metacharacters can never 400 the send.
    """
    if not config.has_telegram():
        return
    try:
        _call("sendMessage", chat_id=config.TELEGRAM_CHAT_ID, text=text)
    except Exception as exc:  # noqa: BLE001
        print(f"[telegram] notify failed ({exc}).")


# Telegram Bot API caps uploads at 50 MB; stay just under it.
_TG_MAX_UPLOAD = 49 * 1024 * 1024


def _send_preview(payload: VideoRenderPayload) -> None:
    """Send the preview for approval.

    Prefers sending the actual rendered MP4 (so you can WATCH it on your phone
    before approving) with the Approve/Cancel buttons attached. Falls back to the
    thumbnail photo if the video is missing or larger than Telegram's 50 MB cap.
    """
    import json as _json

    # Surface whether the custom thumbnail actually rendered, so a missing one is
    # visible at approval time instead of silently becoming a YouTube auto-frame.
    thumb_ok = config.THUMBNAIL_PATH.exists() and config.THUMBNAIL_PATH.stat().st_size > 0
    thumb_line = (
        "\U0001F5BC️ Thumbnail: generated"
        if thumb_ok
        else "⚠️ Thumbnail: NOT generated — YouTube would use an auto-frame"
    )

    caption = (
        f"\U0001F3AC *{_md(payload.youtube_title)}*\n\n"
        f"Theme: `{payload.theme_id}`  |  Category: `{payload.topic_category}`\n"
        f"Duration: `{payload.total_duration_sec:.0f}s`  |  Scenes: `{len(payload.scenes)}`\n"
        f"{thumb_line}\n\n"
        f"*Pinned comment:*\n{_md(payload.pinned_comment)}\n\n"
        f"Source: {payload.source_url}"
    )
    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ Approve & Upload", "callback_data": APPROVE},
            {"text": "❌ Cancel", "callback_data": REJECT},
        ]]
    }
    data = {
        "chat_id": config.TELEGRAM_CHAT_ID,
        "caption": caption[:1024],
        "parse_mode": "Markdown",
        "reply_markup": _json.dumps(keyboard),
    }

    video_ok = (
        config.FINAL_VIDEO_PATH.exists()
        and config.FINAL_VIDEO_PATH.stat().st_size <= _TG_MAX_UPLOAD
    )

    with httpx.Client(timeout=180.0) as client:
        if video_ok:
            # Send the playable clip with the thumbnail as its cover.
            url = _API.format(token=config.TELEGRAM_BOT_TOKEN, method="sendVideo")
            files = {"video": ("final_video.mp4", open(config.FINAL_VIDEO_PATH, "rb"), "video/mp4")}
            if config.THUMBNAIL_PATH.exists():
                files["thumbnail"] = ("thumbnail.png", open(config.THUMBNAIL_PATH, "rb"), "image/png")
            data["supports_streaming"] = "true"
            try:
                resp = client.post(url, data=data, files=files)
                resp.raise_for_status()
                return
            except Exception as exc:  # noqa: BLE001 - fall back to a photo
                print(f"[telegram] sendVideo failed ({exc}); falling back to thumbnail.")
            finally:
                for f in files.values():
                    f[1].close()
        elif config.FINAL_VIDEO_PATH.exists():
            size_mb = config.FINAL_VIDEO_PATH.stat().st_size / 1_048_576
            print(f"[telegram] video is {size_mb:.0f}MB (>50MB); sending thumbnail only.")

        # Fallback: thumbnail photo with the same caption + buttons.
        url = _API.format(token=config.TELEGRAM_BOT_TOKEN, method="sendPhoto")
        with open(config.THUMBNAIL_PATH, "rb") as img:
            resp = client.post(
                url, data=data, files={"photo": ("thumbnail.png", img, "image/png")}
            )
            resp.raise_for_status()


def _md(text: str) -> str:
    """Escape the handful of Markdown-v1 metacharacters we care about."""
    for ch in ("_", "*", "`", "["):
        text = text.replace(ch, "\\" + ch)
    return text


def _poll_for_decision(deadline: float) -> ApprovalResult:
    """Long-poll getUpdates until a callback arrives or the deadline passes."""
    offset = None
    while time.time() < deadline:
        try:
            params = {"timeout": 25}
            if offset is not None:
                params["offset"] = offset
            data = _call("getUpdates", **params)
            for update in data.get("result", []):
                offset = update["update_id"] + 1
                cb = update.get("callback_query")
                if not cb:
                    continue
                decision = cb.get("data")
                # Acknowledge so the button stops spinning.
                try:
                    _call("answerCallbackQuery", callback_query_id=cb["id"])
                except Exception:  # noqa: BLE001
                    pass
                if decision == APPROVE:
                    return ApprovalResult(True, "operator approved")
                if decision == REJECT:
                    return ApprovalResult(
                        False, "operator rejected", reject_permanently=True
                    )
        except Exception as exc:  # noqa: BLE001
            print(f"[telegram] poll error ({exc}); retrying.")
            time.sleep(3)
    # No explicit decision arrived within the window.
    if config.APPROVE_ON_TIMEOUT:
        return ApprovalResult(True, "auto-approved on timeout (APPROVE_ON_TIMEOUT)")
    return ApprovalResult(False, "no response within window; not publishing (fail-closed)")


def request_approval(payload: VideoRenderPayload) -> ApprovalResult:
    """Return the approval decision for this video.

    `.approved` says whether to publish; `.reject_permanently` says whether the
    topic should be burned (marked seen) vs. allowed to resurface later.
    """
    if not config.has_telegram():
        print("[telegram] Not configured; auto-approving (no HITL gate).")
        return ApprovalResult(True, "telegram not configured; auto-approved")

    try:
        _send_preview(payload)
    except Exception as exc:  # noqa: BLE001
        # Could not even show the operator the preview. Fail closed unless the
        # operator has explicitly opted into timeout auto-publish.
        approved = config.APPROVE_ON_TIMEOUT
        print(
            f"[telegram] Failed to send preview ({exc}); "
            f"{'auto-approving (APPROVE_ON_TIMEOUT)' if approved else 'NOT publishing (fail-closed)'}."
        )
        return ApprovalResult(approved, f"preview send failed: {exc}")

    minutes = config.APPROVAL_WINDOW_MINUTES
    print(f"[telegram] Preview sent. Waiting up to {minutes} min for a decision...")
    deadline = time.time() + minutes * 60
    result = _poll_for_decision(deadline)
    print(f"[telegram] Decision: approved={result.approved} ({result.reason})")

    # Notify the operator of the outcome.
    try:
        if result.approved:
            msg = "✅ Publishing now."
        elif result.reject_permanently:
            msg = "\U0001F6D1 Upload cancelled."
        else:
            msg = (
                f"⌛ No response in {minutes} min — video NOT published "
                "(fail-closed). Re-run to try again."
            )
        _call("sendMessage", chat_id=config.TELEGRAM_CHAT_ID, text=msg)
    except Exception:  # noqa: BLE001
        pass
    return result


if __name__ == "__main__":
    import json

    with open(config.RENDER_PAYLOAD_PATH, encoding="utf-8") as fh:
        p = VideoRenderPayload.model_validate(json.load(fh))
    print("decision:", request_approval(p))
