import json
import os
from datetime import datetime, timezone
from typing import Optional, Sequence, Tuple
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session
from google.auth.exceptions import RefreshError

from db.models import IntegrationToken
from security.token_crypto import encrypt_str, decrypt_str


GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://127.0.0.1:8000/oauth/google/callback")


GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
]

CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]


def _load_client_config() -> dict:
    with open(GOOGLE_CREDENTIALS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def build_flow(scopes: Sequence[str], state: str) -> Flow:
    cfg = _load_client_config()
    flow = Flow.from_client_config(cfg, scopes=list(scopes), state=state)
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    return flow


def get_google_credentials(db: Session, user_id: str, scopes: Sequence[str]) -> Credentials:
    print(f"DEBUG: get_google_credentials called for user_id='{user_id}' with provider='google'")
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
    )
    if not row:
        print(f"DEBUG: No google IntegrationToken found for user_id='{user_id}'")
        raise RuntimeError("Google integration not connected")

    access_token = decrypt_str(row.access_token_enc)
    refresh_token = decrypt_str(row.refresh_token_enc) if row.refresh_token_enc else None

    # Load client_id / client_secret from credentials.json so refresh works
    cfg = _load_client_config()
    oauth = cfg.get("web") or cfg.get("installed") or {}

    # Pass client_id and client_secret in the constructor — newer google-auth
    # versions made these read-only properties, so they can't be set after init.
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=oauth.get("client_id"),
        client_secret=oauth.get("client_secret"),
        scopes=list(scopes),
    )

    # Refresh if needed and possible
    if not creds.valid and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError as e:
            raise RuntimeError("Google authorization expired. Please reconnect Google.") from e
        except Exception as e:
            raise RuntimeError("Google authorization refresh failed. Please try reconnecting.") from e

        row.access_token_enc = encrypt_str(creds.token)
        row.token_type = getattr(creds, "token_type", row.token_type)
        if getattr(creds, "expiry", None):
            row.expiry = creds.expiry
        row.scope = " ".join(creds.scopes or [])
        db.add(row)
        db.commit()

    if not creds.valid:
        raise RuntimeError("Google authorization is invalid. Please reconnect Google.")

    return creds


def upsert_google_tokens(
    db: Session,
    user_id: str,
    access_token: str,
    refresh_token: Optional[str],
    expiry: Optional[datetime],
    scope: Optional[str],
    token_type: Optional[str],
) -> None:
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
    )
    if not row:
        row = IntegrationToken(user_id=user_id, provider="google", access_token_enc="", refresh_token_enc=None)

    row.access_token_enc = encrypt_str(access_token)
    row.refresh_token_enc = encrypt_str(refresh_token) if refresh_token else row.refresh_token_enc
    row.expiry = expiry
    row.scope = scope
    row.token_type = token_type
    db.add(row)
    db.commit()


def is_connected(db: Session, user_id: str) -> bool:
    return (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
        is not None
    )