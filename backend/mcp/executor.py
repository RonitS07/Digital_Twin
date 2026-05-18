import asyncio
import logging
import os

from mcp.client import MCPClient
from mcp.registry import mcp_registry

logger = logging.getLogger(__name__)
MCP_ENABLED = os.getenv("MCP_ENABLED", "true").lower() == "true"


class MCPExecutor:
    """
    Single entry point for all tool execution from LangGraph.
    Replaces scattered direct tool calls in nodes.py by routing
    every intent through the appropriate MCP server + tool.
    """

    def __init__(self):
        self.client = MCPClient(mcp_registry)

    async def execute(self, intent: str, args: dict,
                      user_id: str) -> dict:
        """
        Routes intent to correct MCP server + tool.
        Returns standard envelope:
        {
            "ok": bool,
            "intent": str,
            "result": dict,
            "error": None | str,
            "requires_hitl": bool
        }
        """
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
