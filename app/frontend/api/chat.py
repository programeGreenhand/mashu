"""对话接口：把 LangGraph 流式事件转成 SSE。"""
from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from frontend.services.agent_service import agent_service

router = APIRouter(prefix="/api/sessions", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="用户输入")


def _sse(data: dict | str) -> str:
    """格式化一条 SSE 事件。"""
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False, default=str)
    return f"data: {data}\n\n"


async def _stream(session_id: str, user_input: str) -> AsyncIterator[str]:
    try:
        for event in agent_service.chat_stream(session_id, user_input):
            yield _sse(event)
        yield _sse({"done": True, "session_id": session_id})
    except KeyError as e:
        yield _sse({"error": str(e), "code": 404})
    except Exception as e:  # noqa: BLE001
        yield _sse({"error": f"{type(e).__name__}: {e}", "code": 500})


@router.post(
    "/{session_id}/chat",
    summary="发送一条消息，SSE 流式返回 agent / tool 事件",
    response_class=StreamingResponse,
)
async def chat(session_id: str, body: ChatRequest) -> StreamingResponse:
    if not agent_service.get_session(session_id):
        raise HTTPException(status_code=404, detail="session 不存在")

    return StreamingResponse(
        _stream(session_id, body.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 关闭 nginx 缓冲
            "Connection": "keep-alive",
        },
    )