from mcp.registry import mcp_registry
from mcp.servers.calendar_server import CalendarMCPServer
from mcp.servers.file_server import FileMCPServer
from mcp.servers.gmail_server import GmailMCPServer
from mcp.servers.memory_server import MemoryMCPServer
from mcp.servers.slack_server import SlackMCPServer
from mcp.servers.telegram_server import TelegramMCPServer
from mcp.servers.visual_server import VisualMCPServer
from mcp.servers.whatsapp_server import WhatsAppMCPServer
from mcp.servers.agent_network_server import AgentNetworkMCPServer


def register_all_servers():
    mcp_registry.register(GmailMCPServer())
    mcp_registry.register(CalendarMCPServer())
    mcp_registry.register(SlackMCPServer())
    mcp_registry.register(TelegramMCPServer())
    mcp_registry.register(MemoryMCPServer())
    mcp_registry.register(FileMCPServer())
    mcp_registry.register(VisualMCPServer())
    mcp_registry.register(WhatsAppMCPServer())
    mcp_registry.register(AgentNetworkMCPServer())
