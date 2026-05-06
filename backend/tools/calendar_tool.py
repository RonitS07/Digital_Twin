import time
import uuid
import threading
import logging
from datetime import datetime, timezone
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

from sqlalchemy.orm import Session

from tools.google_oauth import get_google_credentials, CALENDAR_SCOPES

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
]


_CAL_CACHE = threading.local()

from tools.google_oauth import get_google_credentials, CALENDAR_SCOPES, is_scope_sufficient

def get_calendar_service(db: Session, user_id: str):
    # Caching the service object per thread avoids the slow build() process on every poll
    if not hasattr(_CAL_CACHE, 'services'):
        _CAL_CACHE.services = {}

    if user_id in _CAL_CACHE.services:
        service, creds = _CAL_CACHE.services[user_id]
        if creds.valid:
            return service
        else:
            _CAL_CACHE.services.pop(user_id)
            
    # CRITICAL: Check if user has granted calendar scopes BEFORE building service
    if not is_scope_sufficient(db=db, user_id=user_id, scopes=CALENDAR_SCOPES):
        logger.warning(f"Insufficient scopes for Calendar API (user {user_id})")
        raise RuntimeError("Missing Calendar permissions. Please reconnect your Google account in Settings and ensure all boxes are checked.")

    creds = get_google_credentials(db=db, user_id=user_id, scopes=CALENDAR_SCOPES)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    _CAL_CACHE.services[user_id] = (service, creds)
    return service

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

def get_upcoming_events(db: Session, user_id: str, max_results: int = 20) -> list:
    service = get_calendar_service(db=db, user_id=user_id)
    now = datetime.now(timezone.utc).isoformat()
    
    # 1. Fetch all visible calendars from the user's list
    try:
        calendar_list = service.calendarList().list().execute().get('items', [])
    except Exception as e:
        print(f"Error fetching calendar list: {e}")
        calendar_list = [{"id": "primary", "selected": True}]

    all_raw_events = []
    
    # 2. Loop through each selected calendar and pull events
    for cal in calendar_list:
        if not cal.get('selected', True):
            continue
            
        try:
            events_result = service.events().list(
                calendarId=cal['id'],
                timeMin=now,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime"
            ).execute()
            events = events_result.get("items", [])
            for e in events:
                e['_calendar_name'] = cal.get('summaryOverride') or cal.get('summary')
            all_raw_events.extend(events)
        except Exception as e:
            print(f"Error fetching events for calendar {cal['id']}: {e}")

    # 3. Sort by start time and format for AI
    def get_start(e):
        return e["start"].get("dateTime") or e["start"].get("date")

    all_raw_events.sort(key=get_start)
    
    result = []
    # Deduplicate by event ID just in case (though unlikely across different calendars unless shared)
    seen_ids = set()

    for event in all_raw_events:
        eid = event.get("id")
        if eid in seen_ids:
            continue
        seen_ids.add(eid)

        # Skip all-day events (holidays, birthdays, observances).
        # Real meetings always have a dateTime; all-day events only have a date key.
        start_datetime = event["start"].get("dateTime")
        if not start_datetime:
            continue

        start = start_datetime
        end = event.get("end", {}).get("dateTime", event.get("end", {}).get("date"))
        attendees = [a["email"] for a in event.get("attendees", [])]
        organizer = event.get("organizer", {}).get("email")
        if organizer and organizer not in attendees:
            attendees.insert(0, organizer)
        
        meet_link = event.get("hangoutsLink", "")
        conference = event.get("conferenceData", {})
        for ep in conference.get("entryPoints", []):
            if ep.get("entryPointType") == "video":
                meet_link = ep.get("uri", "")
                break

        result.append({
            "id":          event["id"],
            "title":       event.get("summary", "No Title"),
            "start":       start,
            "end":         end,
            "location":    event.get("location", ""),
            "description": event.get("description", ""),
            "meet_link":   meet_link,
            "attendees":   attendees,
            "calendar":    event.get("_calendar_name", "Primary")
        })
        
        if len(result) >= max_results:
            break

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
        "meet_link":     meet_link if meet_link else None,
        "calendar_link": fetched.get("htmlLink")
    }