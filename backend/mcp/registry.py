from __future__ import annotations

from threading import Lock

from mcp.base_server import MCPServer


class MCPRegistry:
    _instance: "MCPRegistry | None" = None
    _lock: Lock = Lock()

    def __new__(cls) -> "MCPRegistry":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._servers = {}
        return cls._instance

    def register(self, server: MCPServer) -> None:
        self._servers[server.server_name] = server

    def get(self, server_name: str) -> MCPServer | None:
        return self._servers.get(server_name)

    def list_all_tools(self) -> dict[str, str]:
        tool_map: dict[str, str] = {}
        for server_name, server in self._servers.items():
            for tool in server.list_tools():
                tool_map[tool.name] = server_name
        return tool_map


mcp_registry = MCPRegistry()
