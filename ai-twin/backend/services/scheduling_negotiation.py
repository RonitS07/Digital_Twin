"""
Scheduling Negotiation Engine
Finds common free time windows between two users' calendars,
scores slots by personal preferences, and drives the A2A negotiation flow.

Privacy guarantee:
- Never returns event titles or calendar details to the other Twin.
- Only returns boolean availability windows (free/busy).
- Preferences are pulled locally per user — never shared cross-twin.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models import StructuredMemory

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

SLOT_GRANULARITY_MINUTES = 30   # minimum schedulable block
DEFAULT_LOOKAHEAD_DAYS = 7
WORKING_HOUR_START = 9          # 9 AM
WORKING_HOUR_END = 18           # 6 PM


# ─────────────────────────────────────────────────────────────────────────────
# Free window computation
# ─────────────────────────────────────────────────────────────────────────────

def get_free_windows(
    db: Session,
    user_id: str,
    lookahead_days: int = DEFAULT_LOOKAHEAD_DAYS,
) -> list[dict]:
    """
    Compute free time windows for a user over the next `lookahead_days`.
    Uses their Google Calendar busy slots to subtract from working hours.

    Returns:
        List of dicts: [{start: datetime, end: datetime}]
        Only returns *anonymous* free slots — no event details.
    """
    from tools.calendar_tool import get_upcoming_events

    try:
        events = get_upcoming_events(db=db, user_id=user_id, max_results=50)
    except Exception as e:
        logger.warning(f"[Scheduling] Could not fetch calendar for {user_id}: {e}")
        events = []

    # Parse busy intervals from calendar events
    busy: list[tuple[datetime, datetime]] = []
    for ev in events:
        try:
            start_str = ev.get("start", "")
            end_str = ev.get("end", "")
            if not start_str or not end_str:
                continue
            start_dt = _parse_dt(start_str)
            end_dt = _parse_dt(end_str)
            if start_dt and end_dt:
                busy.append((start_dt, end_dt))
        except Exception:
            continue

    # Generate candidate free slots (SLOT_GRANULARITY_MINUTES blocks within working hours)
    now = datetime.now()
    # Round up to next slot boundary
    minutes_ahead = SLOT_GRANULARITY_MINUTES - (now.minute % SLOT_GRANULARITY_MINUTES)
    cursor = now + timedelta(minutes=minutes_ahead)
    cursor = cursor.replace(second=0, microsecond=0)

    end_horizon = now + timedelta(days=lookahead_days)
    free_slots = []

    while cursor < end_horizon:
        slot_end = cursor + timedelta(minutes=SLOT_GRANULARITY_MINUTES)

        # Only within working hours on weekdays
        if cursor.weekday() < 5 and WORKING_HOUR_START <= cursor.hour < WORKING_HOUR_END:
            # Check against all busy intervals
            is_free = all(
                slot_end <= b_start or cursor >= b_end
                for b_start, b_end in busy
            )
            if is_free:
                free_slots.append({"start": cursor, "end": slot_end})

        cursor += timedelta(minutes=SLOT_GRANULARITY_MINUTES)

    return free_slots


def _parse_dt(s: str) -> Optional[datetime]:
    """Parse ISO datetime string, strip timezone for naive comparison."""
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Intersection: find common free slots
# ─────────────────────────────────────────────────────────────────────────────

async def find_common_slots(
    db: Session,
    user_a_id: str,
    user_b_id: str,
    duration_minutes: int = 30,
    lookahead_days: int = DEFAULT_LOOKAHEAD_DAYS,
    start_date_suggested: Optional[str] = None,
) -> list[dict]:
    """
    Find time slots where both User A and User B are free.

    Privacy: Each user's free windows are computed locally.
    Only the *intersection* (anonymous time ranges) is shared — no event details.

    Returns top 5 common slots scored by User A's scheduling preferences.
    """
    slots_a = get_free_windows(db, user_a_id, lookahead_days)
    slots_b = get_free_windows(db, user_b_id, lookahead_days)

    if not slots_a or not slots_b:
        logger.info(f"[Scheduling] No free windows for {user_a_id} or {user_b_id}")
        return []

    # If start_date_suggested is provided, we can restrict the search window
    suggested_dt = None
    if start_date_suggested:
        suggested_dt = _parse_dt(start_date_suggested)

    common = []
    for slot_a in slots_a:
        for slot_b in slots_b:
            overlap_start = max(slot_a["start"], slot_b["start"])
            overlap_end = min(slot_a["end"], slot_b["end"])
            overlap_minutes = int((overlap_end - overlap_start).total_seconds() // 60)

            if overlap_minutes >= duration_minutes:
                # If suggesting a date, we only want slots within 24 hours of that date
                # or we just want to PRIORITIZE them.
                # For now, let's keep all but prioritize via scoring.
                common.append({
                    "start": overlap_start.isoformat(),
                    "end": (overlap_start + timedelta(minutes=duration_minutes)).isoformat(),
                    "duration_minutes": duration_minutes,
                    "_raw_start": overlap_start,  # used for scoring, stripped before return
                })

    # Score by User A's preferences + proximity to suggested date
    prefs = _get_schedule_preferences(db, user_a_id)
    
    def score_with_suggested(dt: datetime):
        base_score = _score_slot(dt, prefs)
        if suggested_dt:
            diff_hours = abs((dt - suggested_dt).total_seconds()) / 3600
            # Strong penalty for slots far from suggested date
            return base_score + (diff_hours * 2.0)
        return base_score

    scored = sorted(common, key=lambda s: score_with_suggested(s["_raw_start"]))

    # Clean up internal field and return top 5
    result = []
    for s in scored[:5]:
        result.append({
            "start": s["start"],
            "end": s["end"],
            "duration_minutes": s["duration_minutes"],
        })

    logger.info(f"[Scheduling] Found {len(result)} common slots for {user_a_id} ↔ {user_b_id}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Preference scoring
# ─────────────────────────────────────────────────────────────────────────────

def _get_schedule_preferences(db: Session, user_id: str) -> dict:
    """Load scheduling preference memories for a user."""
    prefs = {
        "prefers_morning": False,   # default: no strong time preference
        "prefers_afternoon": False,
        "avoid_mondays": False,
        "preferred_duration": 30,
    }
    try:
        memories = (
            db.query(StructuredMemory)
            .filter(
                StructuredMemory.user_id == user_id,
                StructuredMemory.category == "habit",
            )
            .all()
        )
        for m in memories:
            val = m.value.lower()
            if "morning" in val:
                prefs["prefers_morning"] = True
            if "afternoon" in val:
                prefs["prefers_afternoon"] = True
            if "monday" in val and "avoid" in val:
                prefs["avoid_mondays"] = True
    except Exception as e:
        logger.warning(f"[Scheduling] Preference load failed for {user_id}: {e}")
    return prefs


def _score_slot(dt: datetime, prefs: dict) -> float:
    """
    Score a slot datetime (lower score = better preference match).
    Used to rank candidate slots for User A.
    """
    score = 0.0

    # Penalise Mondays if preferred
    if prefs.get("avoid_mondays") and dt.weekday() == 0:
        score += 10.0

    # Morning preference (9–12)
    if prefs.get("prefers_morning"):
        if not (9 <= dt.hour < 12):
            score += 5.0
    elif prefs.get("prefers_afternoon"):
        if not (12 <= dt.hour < 17):
            score += 5.0
    else:
        # Default: prefer mid-morning (10–11 AM sweet spot)
        score += abs(dt.hour - 10) * 0.5

    # Prefer earlier in the week (Mon=0 ... Fri=4)
    score += dt.weekday() * 0.1

    return score


# ─────────────────────────────────────────────────────────────────────────────
# Booking helper (after both parties approve a scheduling_confirm)
# ─────────────────────────────────────────────────────────────────────────────

def book_confirmed_meeting(
    db: Session,
    user_a_id: str,
    user_b_id: str,
    slot: dict,          # {start: ISO str, end: ISO str}
    event_title: str,
    description: str = "",
) -> dict:
    """
    Create the calendar event for BOTH users once a scheduling_confirm is approved.
    Called only after HITL approval from both sides.
    Returns the created event details.
    """
    from tools.calendar_tool import create_event
    from db.models import User

    user_a = db.query(User).filter(User.id == user_a_id).first()
    user_b = db.query(User).filter(User.id == user_b_id).first()

    attendees_b = [user_b.email] if user_b and user_b.email else []
    attendees_a = [user_a.email] if user_a and user_a.email else []

    results = {}

    # Create for User A (with User B as attendee)
    try:
        res_a = create_event(
            db=db,
            user_id=user_a_id,
            title=event_title,
            start_datetime=slot["start"],
            end_datetime=slot["end"],
            description=description,
            attendees=attendees_b,
        )
        results["user_a_event"] = res_a
        logger.info(f"[Scheduling] Calendar event created for {user_a_id}")
    except Exception as e:
        logger.error(f"[Scheduling] Failed to create event for {user_a_id}: {e}")
        results["user_a_error"] = str(e)

    # Create for User B (with User A as attendee)
    try:
        res_b = create_event(
            db=db,
            user_id=user_b_id,
            title=event_title,
            start_datetime=slot["start"],
            end_datetime=slot["end"],
            description=description,
            attendees=attendees_a,
        )
        results["user_b_event"] = res_b
        logger.info(f"[Scheduling] Calendar event created for {user_b_id}")
    except Exception as e:
        logger.error(f"[Scheduling] Failed to create event for {user_b_id}: {e}")
        results["user_b_error"] = str(e)

    return results
