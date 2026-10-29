"""One-time local helper to mint a YouTube Data API v3 refresh token.

Usage:
    1. Create an OAuth 2.0 "Desktop app" client in Google Cloud Console and
       download `client_secret.json` into this directory (or pass --secrets).
    2. Run:  python auth_youtube.py
    3. Approve in the browser. The script prints YOUTUBE_CLIENT_ID,
       YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN — copy them into .env.

The refresh token is long-lived; you only need to run this once.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Get a YouTube refresh token.")
    parser.add_argument(
        "--secrets",
        default="client_secret.json",
        help="Path to the OAuth desktop client_secret.json",
    )
    args = parser.parse_args()

    secrets_path = Path(args.secrets)
    if not secrets_path.exists():
        raise SystemExit(
            f"client secrets file not found: {secrets_path}\n"
            "Download it from Google Cloud Console (OAuth desktop client)."
        )

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "google-auth-oauthlib not installed. `pip install google-auth-oauthlib`."
        ) from exc

    flow = InstalledAppFlow.from_client_secrets_file(str(secrets_path), SCOPES)
    # Force a refresh token to be issued.
    creds = flow.run_local_server(
        port=0, access_type="offline", prompt="consent"
    )

    with open(secrets_path, encoding="utf-8") as fh:
        raw = json.load(fh)
    installed = raw.get("installed") or raw.get("web") or {}

    print("\n=== Copy these into your .env ===")
    print(f"YOUTUBE_CLIENT_ID={installed.get('client_id', '')}")
    print(f"YOUTUBE_CLIENT_SECRET={installed.get('client_secret', '')}")
    print(f"YOUTUBE_REFRESH_TOKEN={creds.refresh_token}")
    print("=================================\n")


if __name__ == "__main__":
    main()
