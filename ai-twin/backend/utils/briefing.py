import logging
from datetime import datetime
from sqlalchemy.orm import Session
from tools.gmail_tool import read_recent_emails
from tools.calendar_tool import get_upcoming_events
from graph.llm_utils import _llm

logger = logging.getLogger(__name__)

def generate_daily_briefing(db: Session, user_id: str, user_name: str):
    """
    Generates a daily briefing for the user based on their inbox and calendar for LAST 24 HOURS.
    """
    email_text = "No new activity in the last 24 hours."
    event_text = "No scheduled events for today."
    
    try:
        # 1. Fetch data
        try:
            emails = read_recent_emails(db=db, user_id=user_id, max_results=20)
            if emails:
                email_text = ""
                for m in emails:
                    email_text += f"- From: {m['from']} | Subject: {m['subject']} | Snippet: {m['snippet']}\n"
        except Exception as e:
            logger.warning(f"Gmail fetch failed for briefing: {e}")
            email_text = "⚠️ Unable to sync latest emails. Please verify Gmail connection."

        try:
            events = get_upcoming_events(db=db, user_id=user_id, max_results=20)
            if events:
                event_text = ""
                for e in events:
                    event_text += f"- Event: {e['title']} | Time: {e['start']}\n"
        except Exception as e:
            logger.warning(f"Calendar fetch failed for briefing: {e}")
            event_text = "⚠️ Unable to sync calendar events. Please verify Google Calendar connection."
        
        now = datetime.now()
        
        # 3. Use LLM to summarize
        prompt = f"""
You are the Digital Twin of {user_name}. 
Prepare a comprehensive LAST 24 HOURS REPORT and DAILY BRIEFING for {user_name}.

CONTEXT:
Inbox Activity (Last 24h):
{email_text}

Today's Schedule:
{event_text}

Current Time: {now.strftime('%Y-%m-%d %H:%M')}

INSTRUCTIONS:
1. Start with "LAST 24 HOURS REPORT - {now.strftime('%B %d, %Y')}"
2. Summarize the events and priorities using SHORT BULLET POINTS.
3. Show ONLY what is absolutely necessary for the user to understand.
4. Do NOT write long paragraphs. Keep it extremely concise and scan-friendly.
5. Highlight any missed opportunities or urgent items. Ensure you mention if any service is disconnected if the text contains warnings.
6. Use a direct, executive tone.
"""
        briefing = _llm(
            system=f"You are the Digital Twin of {user_name}, a high-level executive summarized.",
            user=prompt
        )
        
        return briefing
    except Exception as e:
        logger.error(f"Critical error in briefing generation: {e}")
        return f"Good morning {user_name}. I had trouble accessing your primary data intelligence. Please ensure your Google integrations are active in Settings."
