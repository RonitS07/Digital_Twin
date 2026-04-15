import os
import base64
from email.mime.text import MIMEText
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose"
]

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token_gmail.json"

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)

def read_recent_emails(max_results: int = 5) -> list:
    service = get_gmail_service()
    result = service.users().messages().list(
        userId="me",
        maxResults=max_results,
        labelIds=["INBOX"]
    ).execute()

    messages = result.get("messages", [])
    emails = []

    for msg in messages:
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

    return emails

def draft_email(to: str, subject: str, body: str) -> dict:
    service = get_gmail_service()
    message = MIMEText(body)
    message["to"]      = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = service.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw}}
    ).execute()
    return {"draft_id": draft["id"], "to": to, "subject": subject}

def send_email(to: str, subject: str, body: str) -> dict:
    service = get_gmail_service()
    message = MIMEText(body)
    message["to"]      = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
    return {"message_id": sent["id"], "status": "sent"}
def reply_to_email(message_id: str, body: str) -> dict:
    service = get_gmail_service()
    
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

def get_email_details(message_id: str) -> dict:
    service = get_gmail_service()
    full = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full"
    ).execute()

    headers = full["payload"].get("headers", [])
    subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
    sender  = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
    snippet = full.get("snippet", "")
    
    return {
        "id": message_id,
        "subject": subject,
        "from": sender,
        "snippet": snippet
    }

def watch_gmail(topic_name: str) -> dict:
    """Tells Google to send push notifications to the specified Pub/Sub topic."""
    service = get_gmail_service()
    request = {
        'labelIds': ['INBOX'],
        'topicName': topic_name
    }
    return service.users().watch(userId='me', body=request).execute()

def stop_gmail_watch():
    service = get_gmail_service()
    return service.users().stop(userId='me').execute()
