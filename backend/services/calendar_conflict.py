"""
BUG 3 FIX: Precise calendar conflict detection service.
Uses exact time window query — no all-day events, no false positives.
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def check_conflict_precise(
    db,
    user_id: str,
    start_dt: datetime,
    end_dt: datetime,
) -> str | None:
    """
    Returns the name of a conflicting event if one exists, else None.

    Key differences from the original check_conflict:
    - Only checks dateTime events (skips all-day events)
    - Uses the exact requested time window (no over-wide windows)
    - Skips cancelled events
    - On any error, allows booking (fail open) — never blocks user on a check failure
    """
    try:
        from tools.google_oauth import get_google_credentials
        from tools.calendar_tool import CALENDAR_SCOPES
        import googleapiclient.discovery

        creds = get_google_credentials(db, user_id, CALENDAR_SCOPES)
        if not creds:
            logger.warning(
                f"[ConflictCheck] No credentials for user {user_id} — allowing booking"
            )
            return None  # Can't check — allow booking

        service = googleapiclient.discovery.build(
            "calendar", "v3", credentials=creds
        )

        # Query only the exact requested window
        events_result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start_dt.isoformat(),
                timeMax=end_dt.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )

        events = events_result.get("items", [])
        for event in events:
            # Skip all-day events (they have 'date' not 'dateTime')
            if "dateTime" not in event.get("start", {}):
                continue
            # Skip cancelled events
            if event.get("status") == "cancelled":
                continue
            # Real conflict found
            return event.get("summary", "Existing meeting")

        return None  # No conflict

    except Exception as e:
        logger.warning(
            f"[ConflictCheck] Error for user {user_id}: {e} — allowing booking"
        )
        return None  # On error, allow booking (fail open)
