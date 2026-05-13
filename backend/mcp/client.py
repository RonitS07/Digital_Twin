import logging

from mcp.base_server import MCPTool
from mcp.registry import MCPRegistry

logger = logging.getLogger(__name__)


class MCPClient:
    def __init__(self, registry: MCPRegistry):
        self.registry = registry

    async def call(
        self,
        server_name: str,
        tool_name: str,
        args: dict,
        user_id: str,
    ) -> dict:
        logger.info(f"[MCP] {server_name}.{tool_name} called by {user_id}")

        server = self.registry.get(server_name)
        if server is None:
            return {
                "ok": False,
                "server": server_name,
                "tool": tool_name,
                "result": None,
                "error": f"MCP server '{server_name}' not found",
            }

        tool = server.get_tool(tool_name)
        if tool is None:
            return {
                "ok": False,
                "server": server_name,
                "tool": tool_name,
                "result": None,
                "error": f"Tool '{tool_name}' not found on server '{server_name}'",
            }

        try:
            result = await server.call_tool(tool_name, args)
            return {
                "ok": True,
                "server": server_name,
                "tool": tool_name,
                "result": result,
                "error": None,
            }
        except Exception as exc:
            return {
                "ok": False,
                "server": server_name,
                "tool": tool_name,
                "result": None,
                "error": str(exc),
            }

    async def discover(self, server_name: str) -> list[MCPTool]:
        server = self.registry.get(server_name)
        if server is None:
            return []
        return server.list_tools()
