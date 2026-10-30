"""YouTube Data API v3 publishing: upload, thumbnail, pinned comment.

Rebuilds OAuth credentials from the three stored env values (client id/secret +
refresh token), uploads the MP4 resumably, sets the custom thumbnail, and seeds
the community with the debate-sparking pinned comment. Upload is retried with
exponential backoff so a transient failure never wastes the 10k daily quota.
"""

from __future__ import annotations

from typing import Optional

from tenacity import retry, stop_after_attempt, wait_exponential

try:
    from . import config, db
    from .script_generator import VideoRenderPayload
except ImportError:  # pragma: no cover
    import config  # type: ignore
    import db  # type: ignore
    from script_generator import VideoRenderPayload  # type: ignore


def _build_service():
    from google.oauth2.credentials import Credentials  # type: ignore
    from googleapiclient.discovery import build  # type: ignore

    creds = Credentials(
        token=None,
        refresh_token=config.YOUTUBE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=config.YOUTUBE_CLIENT_ID,
        client_secret=config.YOUTUBE_CLIENT_SECRET,
        scopes=config.YOUTUBE_UPLOAD_SCOPES,
    )
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=30))
def _upload_video(youtube, payload: VideoRenderPayload) -> str:
    from googleapiclient.http import MediaFileUpload  # type: ignore

    body = {
        "snippet": {
            "title": payload.youtube_title[:100],
            "description": payload.youtube_description,
            "tags": payload.youtube_tags[:30],
            "categoryId": config.YOUTUBE_CATEGORY_ID,
        },
        "status": {
            "privacyStatus": "public",
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(
        str(config.FINAL_VIDEO_PATH),
        chunksize=1024 * 1024,
        resumable=True,
        mimetype="video/mp4",
    )
    request = youtube.videos().insert(
        part="snippet,status", body=body, media_body=media
    )
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"[youtube] Upload progress: {int(status.progress() * 100)}%")
    video_id = response["id"]
    print(f"[youtube] Uploaded video id={video_id}")
    return video_id


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20))
def _set_thumbnail(youtube, video_id: str) -> None:
    from googleapiclient.http import MediaFileUpload  # type: ignore

    youtube.thumbnails().set(
        videoId=video_id,
        media_body=MediaFileUpload(str(config.THUMBNAIL_PATH), mimetype="image/png"),
    ).execute()
    print("[youtube] Custom thumbnail set.")


def _alert_thumbnail_rejected(video_id: str, exc: Exception) -> None:
    """Tell the operator (via Telegram) that YouTube refused the custom thumbnail.

    The video is already public with an auto-generated frame, so this is a
    heads-up to upload output/thumbnail.png manually. The most common cause is a
    channel that isn't verified for custom thumbnails. Best-effort: never raises.
    """
    try:
        try:
            from . import telegram_gate
        except ImportError:  # pragma: no cover
            import telegram_gate  # type: ignore
        telegram_gate.notify(
            "⚠️ Custom thumbnail REJECTED by YouTube.\n"
            "The video published with an auto-generated frame instead.\n"
            "Most likely the channel isn't verified for custom thumbnails "
            "(verify at youtube.com/verify), then upload output/thumbnail.png "
            "manually in YouTube Studio.\n"
            f"Video: https://youtu.be/{video_id}\n"
            f"Reason: {exc}"
        )
    except Exception as notify_exc:  # noqa: BLE001
        print(f"[youtube] thumbnail-rejected alert failed ({notify_exc}).")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20))
def _post_comment(youtube, video_id: str, text: str) -> None:
    youtube.commentThreads().insert(
        part="snippet",
        body={
            "snippet": {
                "videoId": video_id,
                "topLevelComment": {"snippet": {"textOriginal": text}},
            }
        },
    ).execute()
    print("[youtube] Pinned/debate comment posted.")


def publish(payload: VideoRenderPayload) -> Optional[str]:
    """Upload the finished video and seed the community. Returns the video id."""
    if config.DRY_RUN_SKIP_UPLOAD:
        print("[youtube] DRY_RUN_SKIP_UPLOAD=true; skipping upload.")
        return None
    if not config.has_youtube_credentials():
        print("[youtube] No YouTube credentials; skipping upload.")
        return None
    if not config.FINAL_VIDEO_PATH.exists():
        print("[youtube] final_video.mp4 missing; cannot upload.")
        return None

    youtube = _build_service()
    video_id = _upload_video(youtube, payload)

    try:
        _set_thumbnail(youtube, video_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[youtube] Thumbnail set failed (non-fatal): {exc}")
        _alert_thumbnail_rejected(video_id, exc)

    try:
        _post_comment(youtube, video_id, payload.pinned_comment)
    except Exception as exc:  # noqa: BLE001
        print(f"[youtube] Comment post failed (non-fatal): {exc}")

    # Record so the scout never repeats this topic.
    db.mark_topic_published(payload.source_url, payload.youtube_title, video_id)
    print(f"[youtube] https://youtu.be/{video_id}")
    return video_id


if __name__ == "__main__":
    import json

    with open(config.RENDER_PAYLOAD_PATH, encoding="utf-8") as fh:
        p = VideoRenderPayload.model_validate(json.load(fh))
    publish(p)
