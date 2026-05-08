import logging
from datetime import datetime
from sqlalchemy.orm import Session
from tools.gmail_tool import read_recent_emails
from tools.calendar_tool import get_upcoming_events
from tools.google_oauth import is_scope_sufficient, CALENDAR_SCOPES
from graph.llm_utils import _llm

logger = logging.getLogger(__name__)

def generate_daily_briefing(db: Session, user_id: str, user_name: str):
    """
    Generates a daily briefing for the user based on their inbox and calendar.
    Gracefully skips services the user hasn't connected or authorized.
    """
    email_text = "No new inbox activity."
    event_text = "No calendar events available."
    
    try:
        # 1. Fetch Gmail (only if connected)
        try:
            emails = read_recent_emails(db=db, user_id=user_id, max_results=10)
            if emails:
                lines = []
                for m in emails[:8]:  # Cap at 8 to stay under token limits
                    snippet = (m.get('snippet') or '')[:100]
                    lines.append(f"- From: {m['from']} | Subject: {m['subject']} | {snippet}")
                email_text = "\n".join(lines)
        except Exception as e:
            logger.warning(f"Gmail fetch failed for briefing: {e}")
            email_text = "⚠️ Gmail not connected or access revoked."

        # 2. Fetch Calendar — only if user has granted calendar scopes
        if is_scope_sufficient(db=db, user_id=user_id, scopes=CALENDAR_SCOPES):
            try:
                events = get_upcoming_events(db=db, user_id=user_id, max_results=10)
                if events:
                    lines = []
                    for e in events[:8]:
                        lines.append(f"- {e['title']} | {e['start']}")
                    event_text = "\n".join(lines)
                else:
                    event_text = "No upcoming events."
            except Exception as e:
                logger.warning(f"Calendar fetch failed for briefing: {e}")
                event_text = "⚠️ Calendar sync failed."
        else:
            event_text = "Calendar not connected (missing scope). Reconnect Google in Settings."
        
        now = datetime.now()
        
        # 3. Use LLM to summarize
        prompt = (
            f"GENERATE ULTRA-CONCISE MOBILE BRIEFING\n"
            f"Date: {now.strftime('%A, %b %d')}\n\n"
            f"INBOX ACTIVITY:\n{email_text}\n\n"
            f"CALENDAR EVENTS:\n{event_text}\n\n"
            f"OBJECTIVE:\n"
            f"Create a scan-friendly, 'elite' briefing. "
            f"Use ONLY bold headers (no #), emojis, and bullet points. "
            f"Structure: *📅 Agenda* (max 3 items), *📩 Inbox* (max 3 items). "
            f"Keep it under 150 words. Focus on immediate priorities."
        )
        briefing = _llm(
            system=f"You are the Digital Twin of {user_name}. Provide a sharp, executive summary. No yapping. No intro/outro.",
            user=prompt,
            force_fast=True
        )
        
        return briefing
    except Exception as e:
        logger.error(f"Critical error in briefing generation: {e}")
        return f"Good morning {user_name}. I had trouble generating your briefing. Please ensure your integrations are active in Settings."
