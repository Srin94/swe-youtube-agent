"""Telegram Human-in-the-Loop approval gate.

Sends the rendered thumbnail + title + summary + pinned comment to the operator
with [Approve & Upload] / [Cancel] inline buttons, then polls getUpdates for a
callback. If AUTO_APPROVE_MINUTES elapse without an explicit reject, it returns
approved=True so the daily automation is never blocked.

If Telegram is not configured, `request_approval` returns True immediately
(approval is a no-op), so local runs without a bot still publish.
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


def _call(method: str, **params):
    url = _API.format(token=config.TELEGRAM_BOT_TOKEN, method=method)
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, data=params)
        resp.raise_for_status()
        return resp.json()


def _send_photo(payload: VideoRenderPayload) -> None:
    caption = (
        f"\U0001F3AC *{_md(payload.youtube_title)}*\n\n"
        f"Theme: `{payload.theme_id}`  |  Category: `{payload.topic_category}`\n"
        f"Duration: `{payload.total_duration_sec:.0f}s`  |  Scenes: `{len(payload.scenes)}`\n\n"
        f"*Pinned comment:*\n{_md(payload.pinned_comment)}\n\n"
        f"Source: {payload.source_url}"
    )
    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ Approve & Upload", "callback_data": APPROVE},
            {"text": "❌ Cancel", "callback_data": REJECT},
        ]]
    }
    import json as _json

    url = _API.format(token=config.TELEGRAM_BOT_TOKEN, method="sendPhoto")
    with httpx.Client(timeout=60.0) as client, open(config.THUMBNAIL_PATH, "rb") as img:
        resp = client.post(
            url,
            data={
                "chat_id": config.TELEGRAM_CHAT_ID,
                "caption": caption[:1024],
                "parse_mode": "Markdown",
                "reply_markup": _json.dumps(keyboard),
            },
            files={"photo": ("thumbnail.png", img, "image/png")},
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
                    return ApprovalResult(False, "operator rejected")
        except Exception as exc:  # noqa: BLE001
            print(f"[telegram] poll error ({exc}); retrying.")
            time.sleep(3)
    return ApprovalResult(True, "auto-approved on timeout")


def request_approval(payload: VideoRenderPayload) -> bool:
    """Return True if the video should be published."""
    if not config.has_telegram():
        print("[telegram] Not configured; auto-approving (no HITL gate).")
        return True

    try:
        _send_photo(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"[telegram] Failed to send preview ({exc}); auto-approving.")
        return True

    minutes = config.AUTO_APPROVE_MINUTES
    print(f"[telegram] Preview sent. Waiting up to {minutes} min for a decision...")
    deadline = time.time() + minutes * 60
    result = _poll_for_decision(deadline)
    print(f"[telegram] Decision: approved={result.approved} ({result.reason})")

    # Notify the operator of the outcome.
    try:
        msg = (
            "✅ Publishing now." if result.approved else "\U0001F6D1 Upload cancelled."
        )
        _call("sendMessage", chat_id=config.TELEGRAM_CHAT_ID, text=msg)
    except Exception:  # noqa: BLE001
        pass
    return result.approved


if __name__ == "__main__":
    import json

    with open(config.RENDER_PAYLOAD_PATH, encoding="utf-8") as fh:
        p = VideoRenderPayload.model_validate(json.load(fh))
    print("approved:", request_approval(p))
