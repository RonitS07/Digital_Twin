import asyncio
import logging

from mcp.base_server import MCPServer, MCPTool

logger = logging.getLogger(__name__)


class GmailMCPServer(MCPServer):
    server_name = "gmail"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="read_emails",
                description="Read recent emails from inbox",
                input_schema={
                    "user_id": "str",
                    "max_results": "int (default 5)",
                },
            ),
            MCPTool(
                name="read_sent_emails",
                description="Read sent emails for style learning",
                input_schema={
                    "user_id": "str",
                    "max_results": "int (default 10)",
                },
            ),
            MCPTool(
                name="draft_email",
                description="Draft an email using writing style",
                input_schema={
                    "user_id": "str",
                    "to": "str",
                    "subject": "str",
                    "context": "str",
                },
            ),
            MCPTool(
                name="send_email",
                description="Send an email via Gmail API",
                input_schema={
                    "user_id": "str",
                    "to": "str",
                    "subject": "str",
                    "body": "str",
                },
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from db.database import get_db
        from tools.gmail_tool import (
            draft_email,
            read_recent_emails,
            read_sent_emails,
            send_email,
        )

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            if tool_name == "read_emails":
                result = await asyncio.to_thread(
                    read_recent_emails,
                    db,
                    user_id,
                    args.get("max_results", 5),
                )
                return {"emails": result}

            if tool_name == "read_sent_emails":
                result = await asyncio.to_thread(
                    read_sent_emails,
                    db,
                    user_id,
                    args.get("max_results", 10),
                )
                return {"sent_emails": result}

            if tool_name == "draft_email":
                result = await asyncio.to_thread(
                    draft_email,
                    db,
                    user_id,
                    args["to"],
                    args["subject"],
                    args.get("context", ""),
                )
                return {"drafted": True, "result": result}

            if tool_name == "send_email":
                result = await asyncio.to_thread(
                    send_email,
                    db,
                    user_id,
                    args["to"],
                    args["subject"],
                    args["body"],
                )
                return {"sent": True, "result": result}

            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"[GmailMCP] {tool_name} error: {e}")
            return {"error": str(e)}
        finally:
            db.close()
