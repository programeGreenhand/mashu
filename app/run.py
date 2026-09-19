"""
启动入口：用 uvicorn 跑 frontend.main:app

用法：
    python run.py
    # 或者自定义端口
    python run.py --port 9000
"""
from __future__ import annotations

import argparse
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="MaShu Coding 前端")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="开发期热重载")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/"

    if not args.no_browser:
        # uvicorn 启动后稍微延迟再打开浏览器
        import threading
        import time

        def _open():
            time.sleep(1.2)
            try:
                webbrowser.open(url)
            except Exception:
                pass

        threading.Thread(target=_open, daemon=True).start()

    uvicorn.run(
        "frontend.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()