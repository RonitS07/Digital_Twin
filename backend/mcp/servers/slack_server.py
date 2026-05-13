import asyncio
import logging

from mcp.base_server import MCPServer, MCPTool

logger = logging.getLogger(__name__)


class SlackMCPServer(MCPServer):
    server_name = "slack"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="send_message",
                description="Send message to a Slack channel",
                input_schema={
                    "user_id": "str",
                    "channel_id": "str",
                    "channel_name": "str (optional)",
                    "text": "str",
                },
            ),
            MCPTool(
                name="read_messages",
                description="Read messages from a Slack channel",
                input_schema={
                    "user_id": "str",
                    "channel_id": "str",
                    "limit": "int (default 10)",
                },
            ),
            MCPTool(
                name="list_channels",
                description="List available Slack channels",
                input_schema={"user_id": "str"},
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from db.database import get_db
        from tools.slack_tool import list_slack_channels, read_slack_messages, send_slack_message

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            if tool_name == "send_message":
                result = await asyncio.to_thread(
                    send_slack_message,
                    db,
                    user_id,
                    args["channel_id"],
                    args["text"],
                )
                return {
                    "ok": bool(result.get("ok")),
                    "ts": result.get("ts"),
                    "channel": result.get("channel"),
                    "channel_name": args.get("channel_name"),
                }

            if tool_name == "read_messages":
                messages = await asyncio.to_thread(
                    read_slack_messages,
                    db,
                    user_id,
                    args["channel_id"],
                    args.get("limit", 10),
                )
                return {"messages": messages}

            if tool_name == "list_channels":
                channels = await asyncio.to_thread(list_slack_channels, db, user_id)
                return {"channels": [{"id": c.get("id"), "name": c.get("name")} for c in channels]}

            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"[SlackMCP] {tool_name} error: {e}")
            return {"error": str(e)}
        finally:
            db.close()
