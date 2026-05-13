from abc import ABC, abstractmethod
from typing import Any


class MCPTool:
    def __init__(self, name: str, description: str, input_schema: dict):
        self.name = name
        self.description = description
        self.input_schema = input_schema


class MCPServer(ABC):
    server_name: str = "base"

    @abstractmethod
    def list_tools(self) -> list[MCPTool]:
        """Return all tools this server exposes."""
        pass

    @abstractmethod
    async def call_tool(self, tool_name: str, args: dict) -> dict:
        """Execute a tool and return structured result."""
        pass

    def get_tool(self, name: str) -> MCPTool | None:
        return next((t for t in self.list_tools() if t.name == name), None)
