"""
封装后端 LangGraph agent。

- 把后端目录加入 sys.path，导入后端的 graph，不修改后端代码。
- 每个 session 维护一份消息历史，调用 graph 时把历史整体传入。
- 通过 graph.stream 把 agent / tools 的中间事件转成字典，方便上层序列化给前端。
"""
from __future__ import annotations

import sys
import threading
import uuid
from pathlib import Path
from typing import Any, Iterator

# ---- 把后端目录加入 sys.path，不修改后端 ----
THIS_FILE = Path(__file__).resolve()
# 当前文件：H:\mashu\app/frontend/services/agent_service.py
# FRONTEND_DIR = H:\mashu/app
FRONTEND_DIR = THIS_FILE.parent.parent.parent
# BACKEND_DIR = H:\mashu/agent
BACKEND_DIR = FRONTEND_DIR.parent / "agent"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# 显式加载后端的 .env，否则当 CWD 不在 backend/ 下时，后端 llm.py 的 load_dotenv 找不到文件
from dotenv import load_dotenv  # noqa: E402

load_dotenv(dotenv_path=str(BACKEND_DIR / ".env"), override=False)

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage  # noqa: E402

from app.agent.graph import graph as backend_graph  # noqa: E402


class Session:
    """一个会话 = 一份消息历史。"""

    __slots__ = ("session_id", "messages", "created_at", "updated_at")

    def __init__(self, session_id: str | None = None) -> None:
        self.session_id = session_id or str(uuid.uuid4())
        self.messages: list[Any] = []
        self.created_at = ""
        self.updated_at = ""


class AgentService:
    """线程安全的会话管理 + 对后端 graph 的封装。"""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        from datetime import datetime

        self._now = lambda: datetime.now().isoformat(timespec="seconds")

    # ---------- session 管理 ----------
    def create_session(self) -> Session:
        s = Session()
        s.created_at = s.updated_at = self._now()
        with self._lock:
            self._sessions[s.session_id] = s
        return s

    def list_sessions(self) -> list[dict]:
        with self._lock:
            return [
                {
                    "session_id": s.session_id,
                    "message_count": len(s.messages),
                    "created_at": s.created_at,
                    "updated_at": s.updated_at,
                }
                for s in self._sessions.values()
            ]

    def get_session(self, session_id: str) -> Session | None:
        with self._lock:
            return self._sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def get_history(self, session_id: str) -> list[dict]:
        s = self.get_session(session_id)
        if not s:
            return []
        return [message_to_dict(m) for m in s.messages]

    # ---------- 流式调用 ----------
    def chat_stream(
        self,
        session_id: str,
        user_input: str,
    ) -> Iterator[dict]:
        """处理一轮对话：把用户输入追加到历史，调用后端 graph，逐节点产出事件。"""
        s = self.get_session(session_id)
        if not s:
            raise KeyError(f"session 不存在: {session_id}")

        user_msg = HumanMessage(content=user_input)
        s.messages.append(user_msg)

        # 整个历史作为输入喂给后端 graph
        events = backend_graph.stream({"messages": s.messages}, stream_mode="updates")

        seen_message_ids: set[int] = set()
        for event in events:
            # event 是 {"node_name": {"messages": [...]}} 或 "__interrupt__"
            for node_name, node_state in event.items():
                msgs = node_state.get("messages", []) if isinstance(node_state, dict) else []
                for m in msgs:
                    if id(m) in seen_message_ids:
                        continue
                    seen_message_ids.add(id(m))
                    s.messages.append(m)
                    yield {
                        "node": node_name,
                        "message": message_to_dict(m),
                    }

        s.updated_at = self._now()


# ---------- 序列化辅助 ----------
def message_to_dict(m: Any) -> dict:
    """把 LangChain 消息对象转成可 JSON 序列化的字典。"""
    role = _role_of(m)
    base: dict[str, Any] = {
        "role": role,
        "type": type(m).__name__,
        "content": getattr(m, "content", "") or "",
    }

    tool_calls = getattr(m, "tool_calls", None)
    if tool_calls:
        base["tool_calls"] = [
            {
                "name": tc.get("name"),
                "args": tc.get("args", {}),
                "id": tc.get("id"),
            }
            for tc in tool_calls
        ]

    tool_call_id = getattr(m, "tool_call_id", None)
    if tool_call_id:
        base["tool_call_id"] = tool_call_id

    name = getattr(m, "name", None)
    if name:
        base["name"] = name

    return base


def _role_of(m: Any) -> str:
    if isinstance(m, HumanMessage):
        return "user"
    if isinstance(m, AIMessage):
        return "assistant"
    if isinstance(m, ToolMessage):
        return "tool"
    if isinstance(m, SystemMessage):
        return "system"
    # 兜底：按类名判断
    cls = type(m).__name__
    return {
        "HumanMessage": "user",
        "AIMessage": "assistant",
        "ToolMessage": "tool",
        "SystemMessage": "system",
    }.get(cls, "unknown")


# 单例
agent_service = AgentService()