import logging
import uuid
import asyncio
from datetime import datetime, timezone

from mcp.base_server import MCPServer, MCPTool

logger = logging.getLogger(__name__)


class MemoryMCPServer(MCPServer):
    server_name = "memory"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="store",
                description="Store content in memory",
                input_schema={
                    "user_id": "str",
                    "content": "str",
                    "memory_type": "str",
                    "metadata": "dict (optional)",
                },
            ),
            MCPTool(
                name="retrieve",
                description="Retrieve memory by semantic query",
                input_schema={
                    "user_id": "str",
                    "query": "str",
                    "n": "int (default 3)",
                    "memory_type": "str (optional)",
                },
            ),
            MCPTool(
                name="get_stats",
                description="Get memory store statistics",
                input_schema={"user_id": "str"},
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from db.database import get_db
        from db.models import ArchiveMemory, StructuredMemory
        from memory.chroma import get_collection, retrieve_memory, store_memory

        db = next(get_db())
        user_id = args.get("user_id")

        try:
            if tool_name == "store":
                doc_id = str(uuid.uuid4())
                metadata = dict(args.get("metadata") or {})
                metadata["timestamp"] = datetime.now(timezone.utc).isoformat()
                await asyncio.to_thread(
                    store_memory,
                    user_id,
                    doc_id,
                    args["content"],
                    args.get("memory_type", "chat"),
                    metadata,
                )
                return {"stored": True, "doc_id": doc_id}

            if tool_name == "retrieve":
                raw = await asyncio.to_thread(
                    retrieve_memory,
                    user_id,
                    args["query"],
                    args.get("n", 3),
                    args.get("memory_type"),
                )
                results = [line for line in (raw or "").split("\n") if line.strip()]
                return {"results": results, "count": len(results)}

            if tool_name == "get_stats":
                col = get_collection(user_id)
                chroma_count = int(col.count())

                structured = (
                    db.query(StructuredMemory).filter(StructuredMemory.user_id == user_id).count()
                )
                archive = db.query(ArchiveMemory).filter(ArchiveMemory.user_id == user_id).count()
                return {"chroma": chroma_count, "structured": structured, "archive": archive}

            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"[MemoryMCP] {tool_name} error: {e}")
            return {"error": str(e)}
        finally:
            db.close()
