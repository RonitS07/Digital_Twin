import asyncio
import urllib.parse

from mcp.base_server import MCPServer, MCPTool
from mcp.servers.telegram_server import TelegramMCPServer


class VisualMCPServer(MCPServer):
    server_name = "visual"

    def __init__(self):
        self._telegram_server = TelegramMCPServer()

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="generate_image",
                description="Generate an image URL from a prompt",
                input_schema={"prompt": "str", "user_id": "str"},
            ),
            MCPTool(
                name="send_to_telegram",
                description="Send generated image to Telegram",
                input_schema={
                    "user_id": "str",
                    "image_url": "str",
                    "caption": "str (optional)",
                },
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        if tool_name == "generate_image":
            try:
                prompt = args["prompt"]
                encoded_prompt = urllib.parse.quote(prompt)
                url = (
                    "https://image.pollinations.ai/prompt/"
                    f"{encoded_prompt}?width=1024&height=768&model=flux&nologo=true"
                )
                return {"url": url, "prompt": prompt}
            except Exception:
                return {"error": "Image generation is temporarily unavailable."}

        if tool_name == "send_to_telegram":
            result = await self._telegram_server.call_tool(
                "send_image",
                {
                    "user_id": args["user_id"],
                    "image_url": args["image_url"],
                    "caption": args.get("caption", ""),
                },
            )
            return {"sent": bool(result.get("ok"))}

        return {"error": f"Unknown tool: {tool_name}"}
