import asyncio
import logging
from datetime import datetime, timedelta

from mcp.base_server import MCPServer, MCPTool

logger = logging.getLogger(__name__)


class CalendarMCPServer(MCPServer):
    server_name = "calendar"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="get_events",
                description="Get upcoming calendar events",
                input_schema={
                    "user_id": "str",
                    "max_results": "int (default 20)",
                },
            ),
            MCPTool(
                name="create_event",
                description="Create a calendar event with conflict check",
                input_schema={
                    "user_id": "str",
                    "summary": "str",
                    "start_datetime": "str",
                    "end_datetime": "str",
                    "attendees": "list[str] (optional)",
                    "description": "str (optional)",
                },
            ),
            MCPTool(
                name="get_free_busy",
                description="Get busy windows in a time range",
                input_schema={
                    "user_id": "str",
                    "time_min": "ISO datetime str",
                    "time_max": "ISO datetime str",
                },
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from db.database import get_db
        from tools.calendar_tool import (
            check_conflict,
            create_event,
            get_calendar_service,
            get_upcoming_events,
            normalize_datetime,
        )

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            if tool_name == "get_events":
                events = await asyncio.to_thread(
                    get_upcoming_events,
                    db,
                    user_id,
                    args.get("max_results", 20),
                )
                return {"events": events}

            if tool_name == "create_event":
                start = await asyncio.to_thread(normalize_datetime, args["start_datetime"])
                end = await asyncio.to_thread(normalize_datetime, args.get("end_datetime") or "")

                # BUG 3 FIX: Use precise conflict check (no all-day events, exact window)
                try:
                    from services.calendar_conflict import check_conflict_precise
                    from datetime import datetime as _dt, timezone as _tz

                    def _parse_iso(s):
                        try:
                            if s.endswith("Z"):
                                s = s[:-1] + "+00:00"
                            return _dt.fromisoformat(s)
                        except Exception:
                            return None

                    start_dt = _parse_iso(start)
                    end_dt = _parse_iso(end) if end else (start_dt.replace(hour=start_dt.hour + 1) if start_dt else None)

                    if start_dt and end_dt:
                        conflict_name = await asyncio.to_thread(
                            check_conflict_precise,
                            db, user_id, start_dt, end_dt
                        )
                    else:
                        conflict_name = None
                except Exception as ce:
                    logger.warning(f"[CalendarMCP] Precise conflict check failed: {ce}, falling back to legacy check")
                    conflict_name = await asyncio.to_thread(check_conflict, db, user_id, start, end)

                if conflict_name:
                    # BUG 3 FIX: Report conflict name only — do NOT auto-reschedule
                    return {
                        "conflict": True,
                        "conflict_with": conflict_name,
                        "error": (
                            f"You have '{conflict_name}' at that time. "
                            f"Please choose a different time."
                        ),
                    }

                created = await asyncio.to_thread(
                    create_event,
                    args.get("summary", "Meeting"),
                    start,
                    end,
                    args.get("attendees", []) or [],
                    args.get("description", "") or "",
                    args.get("location", "") or "",
                    db,
                    user_id,
                )
                return {
                    "conflict": False,
                    "event_id": created.get("event_id"),
                    "calendar_link": created.get("calendar_link"),
                    "meet_url": created.get("meet_link"),
                    "event": created,
                }

            if tool_name == "get_free_busy":
                service = await asyncio.to_thread(get_calendar_service, db, user_id)
                body = {
                    "timeMin": args["time_min"],
                    "timeMax": args["time_max"],
                    "items": [{"id": "primary"}],
                }
                freebusy = await asyncio.to_thread(service.freebusy().query(body=body).execute)
                busy = freebusy.get("calendars", {}).get("primary", {}).get("busy", [])
                return {"busy": busy}

            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            err = str(e)
            if "invalid_grant" in err or "401" in err:
                return {
                    "error": "Google Calendar authorization expired. Please reconnect in Workspace settings.",
                    "ok": False
                }
            if "conflict" in err.lower():
                return {
                    "error": err,
                    "conflict": True,
                    "ok": False
                }
            logger.error(f"[CalendarMCP] {tool_name}: {e}")
            return {
                "error": f"Calendar error: {err[:100]}",
                "ok": False
            }
        finally:
            db.close()
