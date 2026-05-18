import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import (
    TaskLog,
    User,
    AgentRegistry,
    A2AMessageLog,
    FileAsset,
    ArchiveMemory,
    IntegrationToken,
    ProcessedEmail,
    StructuredMemory,
)
from db.twin_chat_models import DirectChatSession, DirectChatMessage
from memory.chroma import get_collection
from security.auth import get_current_admin, HARDLOCKED_ADMIN_EMAILS

logger = logging.getLogger(__name__)
router = APIRouter()

IST = timezone(timedelta(hours=5, minutes=30))


def _mask_chat_id(chat_id: Optional[str]) -> Optional[str]:
    if not chat_id:
        return None
    value = str(chat_id)
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"


def _safe_chroma_count_for_user(user_id: str) -> int:
    try:
        return int(get_collection(user_id).count())
    except Exception:
        return 0


def _clear_user_chroma(user_id: str) -> None:
    col = get_collection(user_id)
    try:
        col.delete(where={"user_id": user_id})
        return
    except Exception:
        pass

    docs = col.get()
    ids = docs.get("ids", []) if docs else []
    if ids:
        col.delete(ids=ids)


def _log_admin_action(
    db: Session,
    actor_user_id: str,
    action_type: str,
    target_user_id: str,
    details: str,
) -> None:
    log = TaskLog(
        user_id=actor_user_id,
        kind="execution",
        input=f"Admin action: {action_type}",
        intent=action_type,
        output=details,
        approved=True,
        metadata_json=json.dumps(
            {"admin_action": True, "target_user_id": target_user_id, "action_type": action_type}
        ),
    )
    db.add(log)


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    now_utc = datetime.now(timezone.utc)
    now_naive_utc = datetime.utcnow()
    day_start_ist = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    day_start_utc = day_start_ist.astimezone(timezone.utc).replace(tzinfo=None)

    total_users = db.query(User).count()
    active_users_24h = db.query(User).filter(User.created_at >= now_naive_utc - timedelta(hours=24)).count()
    total_ai_tasks = db.query(TaskLog).count()
    tasks_today = db.query(TaskLog).filter(TaskLog.created_at >= day_start_utc).count()
    emails_processed_total = db.query(ProcessedEmail).count()
    active_agents = db.query(AgentRegistry).count()

    total_memory_docs = 0
    for user in db.query(User.id).all():
        total_memory_docs += _safe_chroma_count_for_user(user.id)

    return {
        "total_users": total_users,
        "active_users_24h": active_users_24h,
        "total_ai_tasks": total_ai_tasks,
        "tasks_today": tasks_today,
        "total_memory_docs": total_memory_docs,
        "emails_processed_total": emails_processed_total,
        "active_agents": active_agents,
        "as_of": now_utc.isoformat(),
        "requested_by": current_admin.id,
    }


@router.get("/users")
def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    query = db.query(User)
    if search:
        query = query.filter(User.email.ilike(f"%{search}%"))

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    user_ids = [u.id for u in users]
    provider_map = {uid: {"gmail": False, "calendar": False} for uid in user_ids}
    if user_ids:
        rows = db.query(IntegrationToken.user_id, IntegrationToken.provider).filter(
            IntegrationToken.user_id.in_(user_ids)
        )
        for uid, provider in rows.all():
            if provider == "google":
                provider_map[uid]["gmail"] = True
                provider_map[uid]["calendar"] = True

    data = []
    for user in users:
        data.append(
            {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "is_admin": bool(user.is_admin),
                "is_active": bool(user.is_active),
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_seen": user.created_at.isoformat() if user.created_at else None,
                "sent_backfill_done": bool(user.sent_backfill_done),
                "gmail_connected": provider_map[user.id]["gmail"],
                "calendar_connected": provider_map[user.id]["calendar"],
                "telegram_connected": bool(user.telegram_chat_id),
                "telegram_chat_id_masked": _mask_chat_id(user.telegram_chat_id),
            }
        )

    return {
        "items": data,
        "page": page,
        "limit": limit,
        "total": total,
        "requested_by": current_admin.id,
    }


@router.post("/users/{user_id}/elevate")
def elevate_user_to_admin(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = True
    user.admin_granted_at = datetime.now(timezone.utc)
    user.admin_granted_by = current_admin.id
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_elevated",
        target_user_id=user_id,
        details=f"Elevated user {user_id} to admin",
    )
    db.commit()
    return {"status": "success", "message": f"{user.email} is now admin"}


@router.post("/users/{user_id}/revoke")
def revoke_admin(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot revoke your own admin access")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ❗ Hardlock: cannot revoke hardlocked superadmin email
    if user.email in HARDLOCKED_ADMIN_EMAILS:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot revoke admin access for this account — it is a hardlocked superadmin."
        )

    user.is_admin = False
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_revoked",
        target_user_id=user_id,
        details=f"Revoked admin access for user {user_id}",
    )
    db.commit()
    return {"status": "success", "message": f"Admin revoked for {user.email}"}


@router.delete("/users/{user_id}")
def soft_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ❗ Hardlock: cannot delete hardlocked superadmin
    if user.email in HARDLOCKED_ADMIN_EMAILS:
        raise HTTPException(
            status_code=403,
            detail="Cannot delete this account — it is a hardlocked superadmin."
        )

    user.is_active = False
    db.query(IntegrationToken).filter(IntegrationToken.user_id == user_id).delete()
    _clear_user_chroma(user_id)
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_user_soft_deleted",
        target_user_id=user_id,
        details=f"Soft deleted user {user_id}, revoked OAuth tokens, cleared Chroma memory",
    )
    db.commit()
    return {"status": "success", "message": f"User {user.email} soft deleted"}

@router.post("/users/{user_id}/restore")
def restore_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_user_restored",
        target_user_id=user_id,
        details=f"Restored user {user_id}",
    )
    db.commit()
    return {"status": "success", "message": f"User {user.email} restored"}


@router.delete("/users/{user_id}/permanent")
def permanent_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ❗ Hardlock: cannot permanently delete hardlocked superadmin
    if user.email in HARDLOCKED_ADMIN_EMAILS:
        raise HTTPException(
            status_code=403,
            detail="Cannot permanently delete this account — it is a hardlocked superadmin."
        )

    email = user.email

    # 1. Clear Vector Memory
    _clear_user_chroma(user_id)

    # 2. Delete from related tables (Manual cascade)
    db.query(AgentRegistry).filter(AgentRegistry.user_id == user_id).delete()
    db.query(IntegrationToken).filter(IntegrationToken.user_id == user_id).delete()
    db.query(StructuredMemory).filter(StructuredMemory.user_id == user_id).delete()
    db.query(ArchiveMemory).filter(ArchiveMemory.user_id == user_id).delete()
    db.query(ProcessedEmail).filter(ProcessedEmail.user_id == user_id).delete()
    db.query(FileAsset).filter(FileAsset.user_id == user_id).delete()
    
    # Delete A2A Messages (Sender or Receiver)
    db.query(A2AMessageLog).filter(
        or_(A2AMessageLog.sender_user_id == user_id, A2AMessageLog.receiver_user_id == user_id)
    ).delete()

    # Delete Twin Chat Data
    # Messages in sessions where user was a participant
    sessions = db.query(DirectChatSession).filter(
        or_(DirectChatSession.initiator_id == user_id, DirectChatSession.partner_id == user_id)
    ).all()
    session_ids = [s.id for s in sessions]
    if session_ids:
        db.query(DirectChatMessage).filter(DirectChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(DirectChatSession).filter(DirectChatSession.id.in_(session_ids)).delete(synchronize_session=False)

    # Delete Logs
    db.query(TaskLog).filter(TaskLog.user_id == user_id).delete()

    # 3. Finally, delete the User
    db.delete(user)
    
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_user_permanently_deleted",
        target_user_id=user_id,
        details=f"PERMANENTLY DELETED user {email} and all associated data.",
    )
    
    db.commit()
    return {"status": "success", "message": f"User {email} has been permanently removed from the system."}


@router.get("/logs")
def list_platform_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    query = db.query(TaskLog)
    if user_id:
        query = query.filter(TaskLog.user_id == user_id)
    if action_type:
        query = query.filter(TaskLog.intent == action_type)
    if date_from:
        query = query.filter(TaskLog.created_at >= date_from.replace(tzinfo=None))
    if date_to:
        query = query.filter(TaskLog.created_at <= date_to.replace(tzinfo=None))

    total = query.count()
    rows = (
        query.order_by(TaskLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "user_id": r.user_id,
                "kind": r.kind,
                "input": r.input,
                "intent": r.intent,
                "output": r.output,
                "approved": r.approved,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "metadata_json": r.metadata_json,
            }
            for r in rows
        ],
        "page": page,
        "limit": limit,
        "total": total,
        "requested_by": current_admin.id,
    }


@router.get("/memory/stats")
def get_memory_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    structured_counts = dict(
        db.query(StructuredMemory.user_id, func.count(StructuredMemory.id))
        .group_by(StructuredMemory.user_id)
        .all()
    )
    archive_counts = dict(
        db.query(ArchiveMemory.user_id, func.count(ArchiveMemory.id))
        .group_by(ArchiveMemory.user_id)
        .all()
    )

    data = []
    for user in db.query(User).all():
        chroma_count = _safe_chroma_count_for_user(user.id)
        data.append(
            {
                "user_id": user.id,
                "email": user.email,
                "chromadb_docs": chroma_count,
                "structured_memory": int(structured_counts.get(user.id, 0)),
                "archive_memory": int(archive_counts.get(user.id, 0)),
            }
        )
    data.sort(key=lambda item: item["chromadb_docs"], reverse=True)
    return {"items": data, "requested_by": current_admin.id}


@router.post("/memory/{user_id}/reset")
def reset_user_memory(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _clear_user_chroma(user_id)
    db.query(StructuredMemory).filter(StructuredMemory.user_id == user_id).delete()
    db.query(ArchiveMemory).filter(ArchiveMemory.user_id == user_id).delete()
    _log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        action_type="admin_memory_reset",
        target_user_id=user_id,
        details=f"Reset memory for user {user_id}",
    )
    db.commit()
    return {"status": "success", "message": f"Memory reset for {user.email}"}


@router.get("/agents")
def list_agent_registry(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    agents = db.query(AgentRegistry).order_by(AgentRegistry.last_seen.desc()).all()
    return {
        "items": [
            {
                "user_id": a.user_id,
                "display_name": a.display_name,
                "handle": a.handle,
                "status": a.status,
                "capabilities": json.loads(a.capabilities or "[]"),
                "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                "agent_endpoint": a.agent_endpoint,
            }
            for a in agents
        ],
        "requested_by": current_admin.id,
    }


@router.get("/system/health")
def get_system_health(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    health = {
        "backend": "ok",
        "database": {"status": "ok", "users_count": 0},
        "chromadb": {"status": "ok"},
        "groq": {"status": "unknown", "last_response_time_ms": None},
        "telegram": {"status": "unknown", "enabled_users": 0},
        "checked_by": current_admin.id,
    }

    try:
        health["database"]["users_count"] = db.query(User).count()
    except Exception as exc:
        health["database"] = {"status": "error", "error": str(exc)}

    try:
        get_collection("healthcheck_admin").count()
    except Exception as exc:
        health["chromadb"] = {"status": "error", "error": str(exc)}

    try:
        latest = db.query(TaskLog).filter(TaskLog.metadata_json.isnot(None)).order_by(TaskLog.created_at.desc()).limit(50).all()
        last_response_time = None
        for row in latest:
            try:
                meta = json.loads(row.metadata_json or "{}")
                if "response_time_ms" in meta:
                    last_response_time = meta["response_time_ms"]
                    break
            except Exception:
                continue
        if last_response_time is not None:
            health["groq"] = {"status": "ok", "last_response_time_ms": last_response_time}
    except Exception as exc:
        health["groq"] = {"status": "error", "error": str(exc)}

    try:
        enabled = (
            db.query(User)
            .filter(User.telegram_enabled.is_(True), User.telegram_chat_id.isnot(None))
            .count()
        )
        health["telegram"] = {"status": "ok" if enabled >= 0 else "error", "enabled_users": enabled}
    except Exception as exc:
        health["telegram"] = {"status": "error", "error": str(exc)}

    return health

@router.get("/mcp/status")
async def get_mcp_status(
    current_admin: User = Depends(get_current_admin),
):
    from mcp.registry import mcp_registry
    servers = []
    for name, server in mcp_registry._servers.items():
        try:
            tools = server.list_tools()
            extra_data = {}
            if name == "whatsapp":
                try:
                    # Async call to get QR status if it's the WhatsApp server
                    status_res = await server.call_tool("get_status", {})
                    extra_data = status_res
                except Exception:
                    pass

            servers.append({
                "name": name,
                "tool_count": len(tools),
                "status": "ok",
                "tools": [t.name for t in tools],
                "extra": extra_data
            })
        except Exception as e:
            servers.append({
                "name": name,
                "tool_count": 0,
                "status": "error",
                "error": str(e),
                "tools": [],
                "extra": {}
            })
    return {
        "servers": servers,
        "total_tools": sum(
            s["tool_count"] for s in servers
        ),
        "total_servers": len(servers)
    }
