import time
import uuid

from datetime import datetime, timezone
from googleapiclient.discovery import build

from sqlalchemy.orm import Session

from tools.google_oauth import get_google_credentials, CALENDAR_SCOPES

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
]

def get_calendar_service(db: Session, user_id: str):
    creds = get_google_credentials(db=db, user_id=user_id, scopes=CALENDAR_SCOPES)
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

def get_upcoming_events(db: Session, user_id: str, max_results: int = 10) -> list:
    service = get_calendar_service(db=db, user_id=user_id)
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
                 location: str = "", db: Session = None, user_id: str = None) -> dict:
    if db is None or user_id is None:
        raise ValueError("db and user_id are required")
    service = get_calendar_service(db=db, user_id=user_id)

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
    fetched = None
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

    if fetched is None:
        fetched = created

    return {
        "event_id":      fetched["id"],
        "title":         fetched.get("summary"),
        "start":         fetched["start"].get("dateTime"),
        "end":           fetched["end"].get("dateTime"),
        "attendees":     [a["email"] for a in fetched.get("attendees", [])],
        "meet_link":     meet_link if meet_link else "Meet link pending — check Google Calendar",
        "calendar_link": fetched.get("htmlLink")
    }