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
                description="Read recent emails from inbox, optionally filtered by search query",
                input_schema={
                    "user_id": "str",
                    "max_results": "int (default 5)",
                    "query": "str (optional search query, e.g. 'from:amazon', 'subject:invoice', or search term)",
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
                description="Save email to Gmail Drafts folder (does NOT send)",
                input_schema={
                    "user_id": "str",
                    "to": "str",
                    "subject": "str",
                    "body": "str",
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
            save_draft,
            read_recent_emails,
            read_sent_emails,
            send_email,
            search_emails,
        )

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            if tool_name == "read_emails":
                query = args.get("query")
                if query:
                    result = await asyncio.to_thread(
                        search_emails,
                        db,
                        user_id,
                        query,
                        args.get("max_results", 5),
                    )
                else:
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
                # BUG 4 FIX B: Use save_draft (saves to Drafts folder, does NOT send)
                result = await asyncio.to_thread(
                    save_draft,
                    db,
                    user_id,
                    args.get("to", ""),
                    args.get("subject", ""),
                    args.get("body", args.get("context", "")),
                )
                return result

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
