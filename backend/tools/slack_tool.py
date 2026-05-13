import os
import logging
import requests
from datetime import datetime
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from core.config import settings

from db.models import IntegrationToken
from security.token_crypto import encrypt_str, decrypt_str

logger = logging.getLogger(__name__)

SLACK_CLIENT_ID = settings.SLACK_CLIENT_ID
SLACK_CLIENT_SECRET = settings.SLACK_CLIENT_SECRET
SLACK_REDIRECT_URI = settings.SLACK_OAUTH_REDIRECT_URI or "http://127.0.0.1:8000/oauth/slack/callback"

def get_slack_token(db: Session, user_id: str) -> str:
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "slack")
        .first()
    )
    if not row:
        raise RuntimeError("Slack integration not connected")
    
    return decrypt_str(row.access_token_enc)

def upsert_slack_tokens(
    db: Session,
    user_id: str,
    access_token: str,
    scope: Optional[str] = None,
    bot_user_id: Optional[str] = None
) -> None:
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "slack")
        .first()
    )
    if not row:
        row = IntegrationToken(user_id=user_id, provider="slack", access_token_enc="")
    
    row.access_token_enc = encrypt_str(access_token)
    row.scope = scope
    # Using token_type field to store bot_user_id if needed, or just skip it
    row.token_type = bot_user_id 
    db.add(row)
    db.commit()

def is_slack_connected(db: Session, user_id: str) -> bool:
    return (
        db.query(IntegrationToken)
        .filter(IntegrationToken.user_id == user_id, IntegrationToken.provider == "slack")
        .first()
        is not None
    )

def list_slack_channels(db: Session, user_id: str) -> List[Dict]:
    token = get_slack_token(db, user_id)
    url = "https://slack.com/api/conversations.list"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"types": "public_channel,private_channel", "limit": 100}
    
    response = requests.get(url, headers=headers, params=params)
    data = response.json()
    
    if not data.get("ok"):
        logger.error(f"Slack API Error (list_channels): {data.get('error')}")
        return []
    
    return [
        {"id": c["id"], "name": c["name"], "is_private": c.get("is_private", False)}
        for c in data.get("channels", [])
    ]

def send_slack_message(db: Session, user_id: str, channel_id: str, text: str) -> Dict:
    token = get_slack_token(db, user_id)
    url = "https://slack.com/api/chat.postMessage"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"channel": channel_id, "text": text}
    
    response = requests.post(url, headers=headers, json=payload)
    data = response.json()
    
    if not data.get("ok"):
        logger.error(f"Slack API Error (send_message): {data.get('error')}")
        raise RuntimeError(f"Slack post failed: {data.get('error')}")
    
    return {"ok": True, "ts": data.get("ts"), "channel": data.get("channel")}

def read_slack_messages(db: Session, user_id: str, channel_id: str, limit: int = 10) -> list:
    token = get_slack_token(db, user_id)
    url = "https://slack.com/api/conversations.history"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"channel": channel_id, "limit": limit}
    
    response = requests.get(url, headers=headers, params=params)
    data = response.json()
    
    if not data.get("ok"):
        logger.error(f"Slack API Error (read_messages): {data.get('error')}")
        return []
    
    return [
        {"user": m.get("user"), "text": m.get("text"), "ts": m.get("ts")}
        for m in data.get("messages", [])
    ]

def get_user_id_by_slack_bot_id(db: Session, bot_user_id: str) -> Optional[str]:
    """Finds our internal user_id associated with a Slack bot_user_id."""
    row = (
        db.query(IntegrationToken)
        .filter(IntegrationToken.token_type == bot_user_id, IntegrationToken.provider == "slack")
        .first()
    )
    return row.user_id if row else None
