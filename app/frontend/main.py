"""FastAPI 应用入口。"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from frontend.api import chat as chat_routes
from frontend.api import sessions as session_routes

THIS_FILE = Path(__file__).resolve()
FRONTEND_DIR = THIS_FILE.parent.parent  # H:\MaShuCodingFrontEnd
STATIC_DIR = FRONTEND_DIR / "static"

app = FastAPI(
    title="MaShuCoding Frontend",
    description="本地 FastAPI 桌面应用，桥接后端 LangGraph coding agent",
    version="0.1.0",
)

# 开发期方便调试；桌面应用场景下同源访问实际上不需要 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


# API 路由
app.include_router(session_routes.router)
app.include_router(chat_routes.router)

# 静态资源
app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """桌面应用主页（单页聊天 UI）。"""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> RedirectResponse:
    return RedirectResponse(url="/static/favicon.svg")