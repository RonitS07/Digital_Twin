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
                input_schema={"file_path": "str", "user_request": "str"},
            ),
            MCPTool(
                name="describe_image",
                description="Describe image metadata from path or URL",
                input_schema={"image_path_or_url": "str"},
            ),
        ]

    IMAGE_EXTENSIONS = {
        '.png', '.jpg', '.jpeg',
        '.webp', '.gif', '.bmp'
    }

    async def call_tool(self, tool_name: str, args: dict) -> dict:
        from tools.file_tool import read_file, read_image_description

        if tool_name == "read_file":
            file_path = args.get("file_path", "")
            user_request = args.get(
                "user_request",
                "Summarise this file"
            )
            chat_history = args.get("chat_history", "")
            if "../" in file_path:
                return {"error": "Invalid path"}

            backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            uploads_root = os.path.realpath(os.path.join(backend_root, "uploads"))

            # BUG 1 FIX A: Strip leading slash and normalize double uploads/ prefix
            clean_path = file_path.lstrip("/")
            if clean_path.startswith("uploads/uploads/"):
                clean_path = clean_path.replace("uploads/uploads/", "uploads/", 1)

            resolved = clean_path
            if not os.path.isabs(resolved):
                # If path already starts with uploads/, join from backend_root
                if resolved.startswith("uploads/"):
                    resolved = os.path.realpath(os.path.join(backend_root, resolved))
                else:
                    resolved = os.path.realpath(os.path.join(uploads_root, resolved))
            else:
                resolved = os.path.realpath(resolved)

            if not resolved.startswith(uploads_root):
                return {"error": "Access denied. Path must stay inside uploads/"}

            ext = os.path.splitext(resolved)[1].lower()

            # IMAGE — use vision model
            if ext in self.IMAGE_EXTENSIONS:
                from llm.client import analyze_image_file
                description = await analyze_image_file(
                    file_path=resolved,
                    user_request=user_request,
                )
                return {
                    "ok": True,
                    "content": description,
                    "type": ext[1:],
                    "is_image": True,
                    "analysis_model": "vision"
                }

            # TEXT/DOCUMENT — use text model
            content = await asyncio.to_thread(read_file, resolved)
            if not content:
                return {
                    "ok": False,
                    "error": "Could not extract content"
                }
            
            # Semantic analysis
            from llm.client import analyze_file_content
            analysis = analyze_file_content(
                file_content=content,
                file_type=ext.lstrip('.'),
                user_request=user_request,
                chat_history=chat_history,
                file_path=resolved,
            )
            return {
                "ok": True,
                "content": analysis,
                "raw_chars": len(content or ""),
                "type": ext.lstrip('.'),
                "is_image": False,
                "analysis_model": "smart"
            }

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
