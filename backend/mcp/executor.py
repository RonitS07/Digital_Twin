import asyncio
import logging
import os
import uuid

from mcp.client import MCPClient
from mcp.registry import mcp_registry

logger = logging.getLogger(__name__)
MCP_ENABLED = os.getenv("MCP_ENABLED", "true").lower() == "true"

# M10 FIX: Hard Human-In-The-Loop gate.
# These intents ALWAYS require explicit user approval before any tool is called.
# Adding an intent here is the ONLY safe way to enforce HITL — upstream nodes
# (classifier, planner) must never be the sole gate for destructive actions.
ALWAYS_REQUIRE_APPROVAL: set[str] = {
    "send_email",
    "email_send",
    "create_calendar_event",
    "calendar_create",
    "send_slack_message",
    "slack_send",
    "send_whatsapp_message",
    "whatsapp_send",
    "send_telegram_message",
    "telegram_send",
}


def _build_preview(intent: str, params: dict) -> str:
    """Build a human-readable preview of the pending action."""
    if intent in ("send_email", "email_send"):
        return f"Send email to {params.get('to', '?')} — Subject: {params.get('subject', '(none)')}"
    if intent in ("create_calendar_event", "calendar_create"):
        return f"Create event: {params.get('title', '?')} at {params.get('start_datetime', '?')}"
    if intent in ("send_slack_message", "slack_send"):
        return f"Post to Slack #{params.get('channel_name', params.get('channel_id', '?'))}: {str(params.get('text', ''))[:80]}"
    if intent in ("send_whatsapp_message", "whatsapp_send"):
        return f"WhatsApp to {params.get('to', '?')}: {str(params.get('message', ''))[:80]}"
    if intent in ("send_telegram_message", "telegram_send"):
        return f"Telegram to {params.get('chat_id', '?')}: {str(params.get('message', ''))[:80]}"
    return f"Action: {intent}"


def _create_approval_record(user_id: str, intent: str, params: dict) -> str:
    """
    Persist an approval record and return its ID.
    Uses SessionLocal to avoid circular imports with FastAPI's dependency injection.
    """
    approval_id = str(uuid.uuid4())
    try:
        from db.database import SessionLocal
        from db.models import TaskLog
        import json
        db = SessionLocal()
        try:
            record = TaskLog(
                id=approval_id,
                user_id=user_id,
                input=_build_preview(intent, params),
                intent=intent,
                output="",
                kind="approval",
                approved=False,
                metadata_json=json.dumps({"intent": intent, "params": params}),
            )
            db.add(record)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[MCPExecutor] Failed to persist approval record: {e}")
    return approval_id


class MCPExecutor:
    """
    Single entry point for all tool execution from LangGraph.
    Replaces scattered direct tool calls in nodes.py by routing
    every intent through the appropriate MCP server + tool.
    """

    def __init__(self):
        self.client = MCPClient(mcp_registry)

    async def execute(self, intent: str, args: dict,
                      user_id: str, _bypass_hitl: bool = False) -> dict:
        """
        Routes intent to correct MCP server + tool.

        M10 FIX: Intents in ALWAYS_REQUIRE_APPROVAL are intercepted here
        BEFORE any tool mapping lookup. _bypass_hitl=True is ONLY used by
        the explicit post-approval execution path (e.g. /approve endpoint)
        and must never be set by classifier/planner nodes.

        Returns standard envelope:
        {
            "ok": bool,
            "intent": str,
            "result": dict,
            "error": None | str,
            "requires_hitl": bool
        }
        """
        # ── M10 FIX: Hard HITL gate — cannot be bypassed by upstream nodes ──
        if intent in ALWAYS_REQUIRE_APPROVAL and not _bypass_hitl:
            approval_id = _create_approval_record(user_id, intent, args)
            preview = _build_preview(intent, args)
            logger.info(
                f"[MCPExecutor] HITL gate triggered for intent={intent} "
                f"user={user_id} approval_id={approval_id}"
            )
            return {
                "ok": False,
                "intent": intent,
                "result": {},
                "error": None,
                "requires_hitl": True,
                "status": "pending_approval",
                "approval_id": approval_id,
                "preview": preview,
                "message": (
                    f"This action requires your approval before it runs. "
                    f"Preview: {preview}"
                ),
            }
        # ── Route to MCP server ───────────────────────────────────────────────
        mapping = self._get_intent_mapping()
        if intent not in mapping:
            return {
                "ok": False,
                "intent": intent,
                "result": {},
                "error": f"No MCP mapping for intent: {intent}",
                "requires_hitl": False,
            }

        server_name, tool_name, requires_hitl = mapping[intent]
        logger.info(
            f"[MCPExecutor] {intent} → "
            f"{server_name}.{tool_name} (hitl={requires_hitl})"
        )

        result = await self.client.call(
            server_name, tool_name, args, user_id
        )

        # Surface human-readable errors before returning
        if not result.get("ok") and result.get("error"):
            logger.warning(
                f"[MCPExecutor] {intent} failed: {result['error']}"
            )
            return {
                "ok": False,
                "intent": intent,
                "result": {},
                "error": result["error"],   # human readable from MCP server
                "requires_hitl": False,
            }

        return {
            "ok": result.get("ok", True),
            "intent": intent,
            "result": result.get("result", result),
            "error": result.get("error"),
            "requires_hitl": requires_hitl,
        }

    def _get_intent_mapping(self) -> dict:
        """
        Maps every classifier intent to:
        (server_name, tool_name, requires_hitl)
        """
        return {
            # Email
            "email_read":   ("gmail", "read_emails",   False),
            "email_draft":  ("gmail", "draft_email",   False),  # BUG 4 FIX C: Draft saves to Gmail Drafts — no approval needed
            "email_send":   ("gmail", "send_email",    True),

            # Calendar
            "calendar":          ("calendar", "get_events",   False),
            "calendar_create":   ("calendar", "create_event", True),
            "calendar_freebusy": ("calendar", "get_free_busy", False),

            # Slack
            "slack_send":   ("slack", "send_message",  True),
            "slack_read":   ("slack", "read_messages", False),
            "slack_channels": ("slack", "list_channels", False),

            # Telegram
            "telegram_send": ("telegram", "send_message", False),
            "telegram_read": ("telegram", "get_updates",  False),

            # Visual
            "visual":       ("visual", "generate_image", False),

            # File
            "file_read":    ("file", "read_file",       False),

            # Memory (internal — not user-facing intents)
            "_memory_store":    ("memory", "store",    False),
            "_memory_retrieve": ("memory", "retrieve", False),

            # WhatsApp
            "whatsapp_send": ("whatsapp", "send_message", True),

            # Agent Network
            "schedule_with_twin": ("agent_network", "schedule_with_twin", True),
            "twin_message": ("agent_network", "send_message", True),
        }


# Global singleton
mcp_executor = MCPExecutor()

