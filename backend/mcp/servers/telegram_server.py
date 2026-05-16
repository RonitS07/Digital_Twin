import asyncio
import logging

from mcp.base_server import MCPServer, MCPTool

logger = logging.getLogger(__name__)


class TelegramMCPServer(MCPServer):
    server_name = "telegram"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="send_message",
                description="Send a Telegram message to the user's linked chat",
                input_schema={"user_id": "str", "text": "str"},
            ),
            MCPTool(
                name="send_image",
                description="Send an image to the user's linked Telegram chat",
                input_schema={
                    "user_id": "str",
                    "image_url": "str",
                    "caption": "str (optional)",
                },
            ),
            MCPTool(
                name="get_updates",
                description="Get latest Telegram updates for this user only",
                input_schema={"user_id": "str"},
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from db.database import get_db
        from db.models import User
        from tools.telegram_tool import get_telegram_updates, send_telegram_message, send_telegram_photo

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            user = db.query(User).filter(User.id == user_id).first()
            chat_id = user.telegram_chat_id if user else None
            if not chat_id:
                return {"error": "Telegram chat is not linked for this user"}

            if tool_name == "send_message":
                text = (args.get("text") or "").strip()
                if not text:
                    return {"ok": False, "skipped": True, "reason": "empty_message"}
                ok = await asyncio.to_thread(send_telegram_message, chat_id, text)
                return {"ok": bool(ok), "message_id": "unknown" if ok else None}

            if tool_name == "send_image":
                ok = await asyncio.to_thread(
                    send_telegram_photo,
                    chat_id,
                    args["image_url"],
                    args.get("caption"),
                )
                return {"ok": bool(ok)}

            if tool_name == "get_updates":
                updates = await get_telegram_updates()
                filtered = []
                for upd in updates:
                    msg = upd.get("message") or upd.get("edited_message") or {}
                    if str(msg.get("chat", {}).get("id")) != str(chat_id):
                        continue
                    filtered.append(
                        {
                            "update_id": upd.get("update_id"),
                            "message_id": msg.get("message_id"),
                            "text": msg.get("text") or msg.get("caption") or "",
                            "date": msg.get("date"),
                        }
                    )
                return {"updates": filtered[-10:]}

            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            err = str(e)
            if "chat not found" in err.lower():
                return {
                    "error": "Telegram chat not found. Send /start to the bot first.",
                    "ok": False
                }
            if "bot was blocked" in err.lower():
                return {
                    "error": "Telegram bot was blocked by the user.",
                    "ok": False
                }
            logger.error(f"[TelegramMCP] {tool_name}: {e}")
            return {
                "error": f"Telegram error: {err[:100]}",
                "ok": False
            }
        finally:
            db.close()
