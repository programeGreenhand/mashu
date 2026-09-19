"""会话相关 REST 接口。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from frontend.services.agent_service import agent_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", summary="新建一个会话")
def create_session() -> dict:
    s = agent_service.create_session()
    return {"session_id": s.session_id, "created_at": s.created_at}


@router.get("", summary="列出所有会话")
def list_sessions() -> list[dict]:
    return agent_service.list_sessions()


@router.get("/{session_id}", summary="获取会话详情（含消息历史）")
def get_session(session_id: str) -> dict:
    s = agent_service.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session 不存在")
    return {
        "session_id": s.session_id,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
        "messages": agent_service.get_history(session_id),
    }


@router.delete("/{session_id}", summary="删除会话")
def delete_session(session_id: str) -> dict:
    ok = agent_service.delete_session(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="session 不存在")
    return {"ok": True}