import os
from mcp.base_server import MCPServer, MCPTool

class WhatsAppMCPServer(MCPServer):
    server_name = "whatsapp"
    BRIDGE_URL = os.getenv(
        "WHATSAPP_BRIDGE_URL", "http://localhost:3001"
    )

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="send_message",
                description="Send WhatsApp message to a number",
                input_schema={
                    "to": "str (phone number with country code)",
                    "message": "str"
                }
            ),
            MCPTool(
                name="get_messages",
                description="Get recent messages from a chat",
                input_schema={
                    "chat_id": "str",
                    "limit": "int (default 10)"
                }
            ),
            MCPTool(
                name="get_status",
                description="Check if WhatsApp is connected",
                input_schema={}
            ),
        ]

    async def call_tool(self, tool_name: str, 
                        args: dict) -> dict:
        import httpx
        async with httpx.AsyncClient(timeout=10) as http:
            try:
                if tool_name == "send_message":
                    r = await http.post(
                        f"{self.BRIDGE_URL}/send",
                        json={
                            "to": args["to"],
                            "message": args["message"]
                        }
                    )
                    return r.json()

                elif tool_name == "get_messages":
                    r = await http.get(
                        f"{self.BRIDGE_URL}/messages/"
                        f"{args['chat_id']}"
                    )
                    return r.json()

                elif tool_name == "get_status":
                    r = await http.get(
                        f"{self.BRIDGE_URL}/status"
                    )
                    return r.json()

                else:
                    return {
                        "error": f"Unknown tool: {tool_name}"
                    }
            except httpx.ConnectError:
                return {
                    "error": "WhatsApp bridge not running. "
                             "Start with: node "
                             "mcp/servers/whatsapp_bridge/"
                             "index.js",
                    "ok": False
                }
