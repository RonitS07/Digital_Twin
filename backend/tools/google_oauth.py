import os
import json
import logging
from datetime import datetime
from typing import Optional, Sequence
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session
from google.auth.exceptions import RefreshError, TransportError

from db.models import IntegrationToken
from security.token_crypto import encrypt_str, decrypt_str
from core.config import settings

logger = logging.getLogger(__name__)

GOOGLE_CREDENTIALS_FILE = settings.GOOGLE_CREDENTIALS_FILE or "credentials.json"
GOOGLE_REDIRECT_URI = settings.GOOGLE_OAUTH_REDIRECT_URI or "http://127.0.0.1:8000/oauth/google/callback"


GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
]

CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]

# Combined scope set used for a single OAuth grant (avoids multiple OAuth prompts)
COMBINED_SCOPES = list(set(GMAIL_SCOPES + CALENDAR_SCOPES))


def _load_client_config() -> dict:
    try:
        with open(GOOGLE_CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise RuntimeError(
            f"Google credentials file not found: {GOOGLE_CREDENTIALS_FILE}. "
            "Download it from Google Cloud Console and place it at the project root."
        )


def build_flow(scopes: Sequence[str], state: str) -> Flow:
    cfg = _load_client_config()
    flow = Flow.from_client_config(cfg, scopes=list(scopes), state=state)
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    return flow


def get_google_credentials(db: Session, user_id: str, scopes: Sequence[str]) -> Credentials:
    """
    Loads, validates, and auto-refreshes Google credentials for a user.
    
    Builds credentials using STORED scopes only, allowing graceful degradation:
    - Gmail-only users can use Gmail but not Calendar
    - Calendar-only users can use Calendar but not Gmail
    - If scopes mismatch the actual grant, Google returns RefreshError on API call
    
    Handles error classes:
    - Token expired → auto refresh via refresh_token
    - Token revoked → clear token and prompt re-connect
    - Network error → raise with clear message
    """
    logger.debug(f"Fetching Google credentials for user_id={user_id}")
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
    )
    if not row:
        logger.warning(f"No Google integration found for user_id={user_id}")
        raise RuntimeError(
            "Google account not connected. Please go to Settings → Integrations → Connect Google."
        )

    access_token = decrypt_str(row.access_token_enc)
    refresh_token = decrypt_str(row.refresh_token_enc) if row.refresh_token_enc else None

    cfg = _load_client_config()
    oauth = cfg.get("web") or cfg.get("installed") or {}

    # Log mismatch for diagnostics but DO NOT block — let the user use whatever they have
    stored_scopes = set((row.scope or "").split())
    requested_scopes = set(scopes)
    missing_scopes = requested_scopes - stored_scopes
    if missing_scopes and stored_scopes:
        logger.warning(
            f"Scope mismatch for user_id={user_id}. "
            f"Missing: {missing_scopes}. Stored: {stored_scopes}. "
            f"Building creds with stored scopes — will degrade gracefully."
        )

    # Use stored scopes if available, otherwise fall back to requested
    effective_scopes = list(stored_scopes) if stored_scopes else list(scopes)

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=oauth.get("client_id"),
        client_secret=oauth.get("client_secret"),
        scopes=effective_scopes,
    )

    if not creds.valid:
        if creds.refresh_token:
            try:
                logger.info(f"Refreshing Google token for user_id={user_id}")
                creds.refresh(Request())

                # Persist the refreshed tokens
                row.access_token_enc = encrypt_str(creds.token)
                if creds.refresh_token:
                    row.refresh_token_enc = encrypt_str(creds.refresh_token)
                row.expiry = creds.expiry
                row.scope = " ".join(creds.scopes or [])
                db.add(row)
                db.commit()
                logger.info(f"Successfully refreshed Google token for user_id={user_id}")

            except RefreshError as e:
                err_str = str(e).lower()
                # Token revoked or expired — clear it so user re-connects cleanly
                logger.error(f"Google refresh token revoked/expired for user_id={user_id}: {e}")
                if "revoked" in err_str or "invalid_grant" in err_str:
                    # Clear the bad token row so re-connect flow starts fresh
                    try:
                        row.access_token_enc = ""
                        row.refresh_token_enc = None
                        db.add(row)
                        db.commit()
                    except Exception:
                        pass
                raise RuntimeError(
                    "Google authorization has expired or been revoked. "
                    "Please reconnect Google in Settings → Integrations."
                ) from e

            except TransportError as e:
                logger.error(f"Network error refreshing Google token for user_id={user_id}: {e}")
                raise RuntimeError(
                    "Could not reach Google servers to refresh authorization. "
                    "Check your internet connection and try again."
                ) from e

            except Exception as e:
                logger.error(f"Unexpected error refreshing Google token for user_id={user_id}: {e}")
                raise RuntimeError(
                    "Google authorization refresh failed. Please try reconnecting."
                ) from e
        else:
            # No refresh token — user needs to re-authorize
            logger.error(f"No refresh token available for user_id={user_id}")
            raise RuntimeError(
                "Google authorization is incomplete (no refresh token). "
                "Please reconnect Google in Settings → Integrations."
            )

    if not creds.valid:
        logger.error(f"Google credentials still invalid after refresh attempt for user_id={user_id}")
        raise RuntimeError(
            "Google authorization is invalid. Please reconnect Google in Settings → Integrations."
        )

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
        row = IntegrationToken(
            user_id=user_id, provider="google",
            access_token_enc="", refresh_token_enc=None
        )

    row.access_token_enc = encrypt_str(access_token)
    # Only overwrite refresh_token if a new one was provided (Google only sends it on first auth)
    if refresh_token:
        row.refresh_token_enc = encrypt_str(refresh_token)
    row.expiry = expiry
    row.scope = scope
    row.token_type = token_type
    db.add(row)
    db.commit()
    logger.info(f"Upserted Google tokens for user_id={user_id}, scope={scope}")


def is_connected(db: Session, user_id: str) -> bool:
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
    )
    # Connected = row exists AND has a non-empty access token
    return row is not None and bool(row.access_token_enc)


def is_scope_sufficient(db: Session, user_id: str, scopes: Sequence[str]) -> bool:
    """Check if a user's stored token covers the requested scopes without raising."""
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "google")
        .first()
    )
    if not row:
        return False
    stored = set((row.scope or "").split())
    return set(scopes).issubset(stored)