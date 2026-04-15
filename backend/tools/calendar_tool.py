import os
import time
import uuid

from datetime import datetime, timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
]

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token_calendar.json"

def get_calendar_service():
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
    return build("calendar", "v3", credentials=creds)

def normalize_datetime(dt_str: str) -> str:
    """
    Accepts multiple formats and converts to RFC3339 IST:
    - "2026-04-14T14:05:00+05:30"  → unchanged
    - "2026-04-14 14:05"           → "2026-04-14T14:05:00+05:30"
    - "2026-04-14 9:10"            → "2026-04-14T09:10:00+05:30"
    - "2026-04-14T14:05"           → "2026-04-14T14:05:00+05:30"
    """
    dt_str = dt_str.strip()

    # Already fully formatted
    if "+" in dt_str and "T" in dt_str and len(dt_str) > 19:
        return dt_str

    # Try all reasonable formats
    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %I:%M %p",   # 12-hour with AM/PM
        "%Y-%m-%dT%I:%M %p",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(dt_str, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30"
        except ValueError:
            continue

    raise ValueError(f"Cannot parse datetime: '{dt_str}'. Use format: 'YYYY-MM-DD HH:MM'")

def get_upcoming_events(max_results: int = 10) -> list:
    service = get_calendar_service()
    now = datetime.now(timezone.utc).isoformat()
    events_result = service.events().list(
        calendarId="primary",
        timeMin=now,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime"
    ).execute()

    events = events_result.get("items", [])
    result = []
    for event in events:
        start = event["start"].get("dateTime", event["start"].get("date"))
        attendees = [a["email"] for a in event.get("attendees", [])]
        result.append({
            "id":          event["id"],
            "title":       event.get("summary", "No Title"),
            "start":       start,
            "location":    event.get("location", ""),
            "description": event.get("description", ""),
            "attendees":   attendees
        })
    return result

def create_event(title: str, start_datetime: str, end_datetime: str,
                 attendees: list = [], description: str = "",
                 location: str = "") -> dict:
    service = get_calendar_service()

    # Normalize datetime strings — accepts flexible formats
    start_fmt = normalize_datetime(start_datetime)
    end_fmt   = normalize_datetime(end_datetime)

    # Build attendees list — always include as guests
    attendee_list = [{"email": email.strip()} for email in attendees if email.strip()]

    event = {
        "summary":     title,
        "location":    location,
        "description": description,
        "start": {"dateTime": start_fmt, "timeZone": "Asia/Kolkata"},
        "end":   {"dateTime": end_fmt,   "timeZone": "Asia/Kolkata"},
        "attendees": attendee_list,
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"}
            }
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 60},
                {"method": "popup", "minutes": 15}
            ]
        }
    }

    created = service.events().insert(
        calendarId="primary",
        body=event,
        sendUpdates="all",
        conferenceDataVersion=1     # Required for Meet link generation
    ).execute()

    event_id = created["id"]

    # Retry fetching until Meet link appears (max 5 attempts)
    meet_link = ""
    for attempt in range(5):
        time.sleep(1)
        fetched = service.events().get(
            calendarId="primary",
            eventId=event_id
        ).execute()

        conference = fetched.get("conferenceData", {})
        for ep in conference.get("entryPoints", []):
            if ep.get("entryPointType") == "video":
                meet_link = ep.get("uri", "")
                break

        if meet_link:
            break

    return {
        "event_id":      fetched["id"],
        "title":         fetched.get("summary"),
        "start":         fetched["start"].get("dateTime"),
        "end":           fetched["end"].get("dateTime"),
        "attendees":     [a["email"] for a in fetched.get("attendees", [])],
        "meet_link":     meet_link if meet_link else "Meet link pending — check Google Calendar",
        "calendar_link": fetched.get("htmlLink")
    }