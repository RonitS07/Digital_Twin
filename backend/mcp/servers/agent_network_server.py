from mcp.base_server import MCPServer, MCPTool
import logging

logger = logging.getLogger(__name__)

class AgentNetworkMCPServer(MCPServer):
    server_name = "agent_network"

    def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(
                name="discover_twin",
                description="Find another registered AI Twin",
                input_schema={
                    "target_identifier": "str (email or uid)"
                }
            ),
            MCPTool(
                name="send_message",
                description="Send A2A message to another twin",
                input_schema={
                    "sender_user_id": "str",
                    "receiver_user_id": "str",
                    "msg_type": "str",
                    "payload": "dict"
                }
            ),
            MCPTool(
                name="schedule_with_twin",
                description="Find common free time and propose "
                            "meeting with another twin",
                input_schema={
                    "requester_user_id": "str",
                    "target_user_id": "str",
                    "duration_minutes": "int (default 30)",
                    "lookahead_days": "int (default 7)"
                }
            ),
            MCPTool(
                name="get_inbox",
                description="Get pending A2A messages for user",
                input_schema={"user_id": "str"}
            ),
        ]

    async def call_tool(self, tool_name: str, 
                        args: dict) -> dict:
        from db.database import get_db
        from db.models import AgentRegistry, A2AMessageLog
        from services.agent_registry import lookup_agent
        from services.scheduling_negotiation import (
            find_common_slots
        )
        from services.agent_broker import store_and_deliver

        db = next(get_db())
        try:
            if tool_name == "discover_twin":
                target = args["target_identifier"]
                # Try by email first, then by user_id
                user = db.query(AgentRegistry).filter(
                    (AgentRegistry.display_name == target) |
                    (AgentRegistry.user_id == target)
                ).first()
                if not user:
                    return {"found": False, 
                            "error": "Twin not found"}
                return {
                    "found": True,
                    "user_id": user.user_id,
                    "display_name": user.display_name,
                    "status": user.status,
                    "capabilities": user.capabilities
                }

            elif tool_name == "send_message":
                from schemas.a2a_message import A2AMessage
                msg = A2AMessage(
                    sender_user_id=args["sender_user_id"],
                    receiver_user_id=args["receiver_user_id"],
                    msg_type=args["msg_type"],
                    payload=args.get("payload", {}),
                    requires_hitl=True
                )
                await store_and_deliver(msg, db)
                return {
                    "delivered": True, 
                    "msg_id": msg.msg_id
                }

            elif tool_name == "schedule_with_twin":
                slots = await find_common_slots(
                    db=db,
                    user_a_id=args["requester_user_id"],
                    user_b_id=args["target_user_id"],
                    duration_minutes=args.get(
                        "duration_minutes", 30),
                    lookahead_days=args.get(
                        "lookahead_days", 7)
                )
                return {
                    "slots_found": len(slots),
                    "slots": slots
                }

            elif tool_name == "get_inbox":
                msgs = db.query(A2AMessageLog).filter(
                    A2AMessageLog.receiver_user_id == 
                    args["user_id"],
                    A2AMessageLog.status == "pending"
                ).order_by(
                    A2AMessageLog.created_at.desc()
                ).limit(20).all()
                return {
                    "messages": [
                        {
                            "msg_id": m.msg_id,
                            "from": m.sender_user_id,
                            "type": m.msg_type,
                            "payload": m.payload,
                            "created_at": 
                                m.created_at.isoformat()
                        }
                        for m in msgs
                    ]
                }

            else:
                return {
                    "error": f"Unknown tool: {tool_name}"
                }
        except Exception as e:
            logger.error(
                f"[AgentNetworkMCP] {tool_name} error: {e}"
            )
            return {"error": str(e), "ok": False}
        finally:
            db.close()
