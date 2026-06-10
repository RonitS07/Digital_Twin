import base64
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from sqlalchemy.orm import Session

from tools.google_oauth import get_google_credentials, GMAIL_SCOPES
from tools.google_http import build_google_api_service

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose"
]

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime


_GMAIL_CACHE = threading.local()

def get_gmail_service(db: Session, user_id: str):
    # Caching the service object per thread avoids the slow build() process on every poll
    # and prevents httplib2 concurrency issues (which cause memory corruption).
    if not hasattr(_GMAIL_CACHE, 'services'):
        _GMAIL_CACHE.services = {}

    if user_id in _GMAIL_CACHE.services:
        service, creds = _GMAIL_CACHE.services[user_id]
        if creds.valid:
            return service
        else:
            _GMAIL_CACHE.services.pop(user_id)
            
    creds = get_google_credentials(db=db, user_id=user_id, scopes=GMAIL_SCOPES)
    service = build_google_api_service("gmail", "v1", creds)
    _GMAIL_CACHE.services[user_id] = (service, creds)
    return service


def _clear_gmail_cache(user_id: str) -> None:
    if hasattr(_GMAIL_CACHE, "services"):
        _GMAIL_CACHE.services.pop(user_id, None)


def read_recent_emails(db: Session, user_id: str, max_results: int = 5) -> list:
    try:
        service = get_gmail_service(db=db, user_id=user_id)
        result = service.users().messages().list(
            userId="me",
            maxResults=max_results,
            labelIds=["INBOX"],
        ).execute()
    except (TimeoutError, OSError) as e:
        _clear_gmail_cache(user_id)
        logger.warning("Gmail list timed out for user %s: %s", user_id, e)
        return []

    messages = result.get("messages", [])
    emails = []

    for msg in messages:
        try:
            meta = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="metadata",
                metadataHeaders=["Subject", "From", "Date"],
            ).execute()
        except (TimeoutError, OSError) as e:
            logger.warning("Gmail message fetch timed out (%s): %s", msg.get("id"), e)
            continue

        headers = meta.get("payload", {}).get("headers", [])
        subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
        sender = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
        date = next((h["value"] for h in headers if h["name"] == "Date"), "")

        emails.append({
            "id": msg["id"],
            "subject": subject,
            "from": sender,
            "date": date,
            "snippet": meta.get("snippet", ""),
        })

    return emails

def read_sent_emails(db: Session, user_id: str, max_results: int = 50) -> list:
    from db.models import ProcessedEmail
    service = get_gmail_service(db=db, user_id=user_id)
    result = service.users().messages().list(
        userId="me",
        maxResults=max_results,
        labelIds=["SENT"]
    ).execute()

    messages = result.get("messages", [])
    emails = []
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=180)

    for msg in messages:
        # Check if already processed
        existing = db.query(ProcessedEmail).filter(ProcessedEmail.id == msg["id"], ProcessedEmail.source == "sent_backfill").first()
        if existing:
            continue

        try:
            full = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="full"
            ).execute()
        except Exception:
            continue

        headers = full["payload"].get("headers", [])
        subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "No Subject")
        to_addr  = next((h["value"] for h in headers if h["name"].lower() == "to"), "Unknown")
        date_str = next((h["value"] for h in headers if h["name"].lower() == "date"), "")
        snippet = full.get("snippet", "")

        # Extract body
        body = ""
        def process_parts(parts):
            b = ""
            for part in parts:
                mimeType = part.get('mimeType')
                if mimeType == 'text/plain':
                    data = part.get('body', {}).get('data')
                    if data: b += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif 'parts' in part:
                    b += process_parts(part['parts'])
            return b

        payload = full['payload']
        if 'parts' in payload:
            body = process_parts(payload['parts'])
        else:
            data = payload.get('body', {}).get('data')
            body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore') if data else full.get("snippet", "")

        if date_str:
            try:
                dt = parsedate_to_datetime(date_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < cutoff_date:
                    continue
            except Exception:
                pass

        emails.append({
            "id":      msg["id"],
            "subject": subject,
            "to":      to_addr,
            "date":    date_str,
            "snippet": snippet,
            "body":    body
        })

    return emails

def search_emails(db: Session, user_id: str, query: str, max_results: int = 10) -> list:
    """Search for emails matching a specific query (q parameter)."""
    service = get_gmail_service(db=db, user_id=user_id)
    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results
    ).execute()

    messages = result.get("messages", [])
    emails = []

    for msg in messages:
        try:
            full = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="full"
            ).execute()

            headers = full["payload"].get("headers", [])
            subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
            sender  = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
            date    = next((h["value"] for h in headers if h["name"] == "Date"), "")
            snippet = full.get("snippet", "")

            emails.append({
                "id":      msg["id"],
                "subject": subject,
                "from":    sender,
                "date":    date,
                "snippet": snippet
            })
        except Exception:
            continue

    return emails

def draft_email(db: Session, user_id: str, to: str, subject: str, body: str) -> dict:
    service = get_gmail_service(db=db, user_id=user_id)
    message = MIMEText(body)
    message["to"]      = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = service.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw}}
    ).execute()
    return {"draft_id": draft["id"], "to": to, "subject": subject}


def save_draft(db: Session, user_id: str, to: str, subject: str, body: str) -> dict:
    """
    BUG 4 FIX: Save email to Gmail Drafts folder — does NOT send.
    Uses Gmail Drafts API (drafts().create) not messages().send().
    """
    service = get_gmail_service(db=db, user_id=user_id)
    message = MIMEText(body, 'html')
    message["to"]      = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = service.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw}}
    ).execute()
    return {
        "ok": True,
        "draft_id": draft["id"],
        "to": to,
        "subject": subject,
        "message": f"Draft saved to Gmail Drafts folder. Draft ID: {draft['id']}"
    }

def send_email(db: Session, user_id: str, to: str, subject: str, body: str) -> dict:
    """Send email via Gmail. Strips markdown formatting so recipient gets clean plain text."""
    service = get_gmail_service(db=db, user_id=user_id)

    # Strip common markdown so the email body is clean plain text
    import re
    plain_body = body
    plain_body = re.sub(r'\*\*(.+?)\*\*', r'\1', plain_body)      # **bold**
    plain_body = re.sub(r'\*(.+?)\*', r'\1', plain_body)           # *italic*
    plain_body = re.sub(r'#{1,6}\s*', '', plain_body)              # # headers
    plain_body = re.sub(r'^[-*+]\s+', '', plain_body, flags=re.MULTILINE)  # bullet points
    plain_body = re.sub(r'`(.+?)`', r'\1', plain_body)             # `code`
    plain_body = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', plain_body)   # [link](url)
    plain_body = re.sub(r'---+', '', plain_body)                    # horizontal rules
    plain_body = plain_body.strip()

    message = MIMEText(plain_body, 'plain')
    message["to"]      = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
    return {"message_id": sent["id"], "status": "sent", "to": to, "subject": subject}

def reply_to_email(db: Session, user_id: str, message_id: str, body: str) -> dict:
    service = get_gmail_service(db=db, user_id=user_id)
    
    # 1. Fetch original message details
    original = service.users().messages().get(userId="me", id=message_id, format="metadata").execute()
    headers = original.get("payload", {}).get("headers", [])
    
    msg_id  = next((h["value"] for h in headers if h["name"].lower() == "message-id"), None)
    subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "No Subject")
    to_addr = next((h["value"] for h in headers if h["name"].lower() == "from"), None)
    thread_id = original.get("threadId")

    if not to_addr:
        return {"error": "Could not determine recipient from original message"}

    # 2. Build the reply message
    reply = MIMEText(body)
    reply["to"] = to_addr
    # Add Re: if not present
    if not subject.lower().startswith("re:"):
        reply["subject"] = "Re: " + subject
    else:
        reply["subject"] = subject
        
    if msg_id:
        reply["In-Reply-To"] = msg_id
        reply["References"]  = msg_id
    
    raw = base64.urlsafe_b64encode(reply.as_bytes()).decode()
    
    # 3. Send as part of the same thread
    sent = service.users().messages().send(
        userId="me",
        body={
            "raw": raw,
            "threadId": thread_id
        }
    ).execute()
    
    return {"message_id": sent["id"], "thread_id": sent["threadId"], "status": "replied"}

def get_email_details(db: Session, user_id: str, message_id: str) -> dict:
    service = get_gmail_service(db=db, user_id=user_id)
    full = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full"
    ).execute()

    headers = full["payload"].get("headers", [])
    subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
    sender  = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
    
    # Helper to extract body and attachments
    attachments = []
    def process_parts(parts):
        body = ""
        for part in parts:
            mimeType = part.get('mimeType')
            filename = part.get('filename')
            part_id  = part.get('body', {}).get('attachmentId')
            
            if filename and part_id:
                attachments.append({
                    "id": part_id,
                    "filename": filename,
                    "mimeType": mimeType,
                    "size": part.get('body', {}).get('size')
                })
            
            if mimeType == 'text/plain':
                data = part['body'].get('data')
                if data: body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            elif 'parts' in part:
                body += process_parts(part['parts'])
        return body

    payload = full['payload']
    if 'parts' in payload:
        body = process_parts(payload['parts'])
    else:
        data = payload.get('body', {}).get('data')
        body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore') if data else full.get("snippet", "")
    
    return {
        "id": message_id,
        "subject": subject,
        "from": sender,
        "body": body,
        "attachments": attachments
    }

def download_attachment(db: Session, user_id: str, message_id: str, attachment_id: str) -> bytes:
    service = get_gmail_service(db=db, user_id=user_id)
    attachment = service.users().messages().attachments().get(
        userId="me",
        messageId=message_id,
        id=attachment_id
    ).execute()
    
    data = attachment.get("data")
    if not data:
        return b""
    return base64.urlsafe_b64decode(data)

def watch_gmail(db: Session, user_id: str, topic_name: str) -> dict:
    """Tells Google to send push notifications to the specified Pub/Sub topic."""
    service = get_gmail_service(db=db, user_id=user_id)
    request = {
        'labelIds': ['INBOX'],
        'topicName': topic_name
    }
    return service.users().watch(userId='me', body=request).execute()

def stop_gmail_watch(db: Session, user_id: str):
    service = get_gmail_service(db=db, user_id=user_id)
    return service.users().stop(userId='me').execute()

def send_styled_invite(db: Session, user_id: str, to: str, subject: str, html_content: str) -> dict:
    service = get_gmail_service(db=db, user_id=user_id)
    message = MIMEMultipart("alternative")
    message["to"] = to
    message["subject"] = subject
    
    # Add plain text fallback if needed, but for now just HTML
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)
    
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
    return {"message_id": sent["id"], "status": "sent_styled"}
