import os
import asyncio
import tempfile

import requests

from mcp.base_server import MCPServer, MCPTool


class FileMCPServer(MCPServer):
    server_name = "file"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="read_file",
                description="Read text content from an uploaded file",
                input_schema={"file_path": "str"},
            ),
            MCPTool(
                name="describe_image",
                description="Describe image metadata from path or URL",
                input_schema={"image_path_or_url": "str"},
            ),
        ]

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from tools.file_tool import read_file, read_image_description

        if tool_name == "read_file":
            file_path = args["file_path"]
            if "../" in file_path:
                return {"error": "Invalid path"}

            backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            uploads_root = os.path.realpath(os.path.join(backend_root, "uploads"))

            resolved = file_path
            if not os.path.isabs(resolved):
                resolved = os.path.realpath(os.path.join(uploads_root, resolved))
            else:
                resolved = os.path.realpath(resolved)

            if not resolved.startswith(uploads_root):
                return {"error": "Access denied. Path must stay inside uploads/"}

            content = await asyncio.to_thread(read_file, resolved)
            ext = os.path.splitext(resolved)[1].lstrip(".").lower()
            return {"content": content, "chars": len(content or ""), "type": ext}

        if tool_name == "describe_image":
            image_input = args["image_path_or_url"]
            if image_input.startswith("http://") or image_input.startswith("https://"):
                with tempfile.NamedTemporaryFile(suffix=".img", delete=True) as tmp:
                    response = requests.get(image_input, timeout=20)
                    response.raise_for_status()
                    tmp.write(response.content)
                    tmp.flush()
                    description = await asyncio.to_thread(
                        read_image_description,
                        tmp.name,
                    )
            else:
                description = await asyncio.to_thread(
                    read_image_description,
                    image_input,
                )
            return {"description": description}

        return {"error": f"Unknown tool: {tool_name}"}
