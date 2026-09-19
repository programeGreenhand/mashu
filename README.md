# MaShu · Coding Agent 项目

本地 Coding Agent：后端 LangGraph + DeepSeek，前端 FastAPI + 单页聊天 UI。

## 目录结构

```
H:\mashu\
├── agent\                  # 后端：LangGraph coding agent
│   ├── app\
│   │   ├── agent\          # graph / state / prompt
│   │   ├── tools\          # read_file / search_files / run_command
│   │   └── llm.py          # ChatOpenAI -> DeepSeek
│   ├── test_agent.py
│   ├── test_llm.py
│   ├── .env                # DEEPSEEK_API_KEY（不上传）
│   └── README.md
│
├── app\                    # 前端：FastAPI 桌面应用
│   ├── frontend\
│   │   ├── main.py
│   │   ├── api\
│   │   └── services\       # agent_service：包装后端 graph
│   ├── static\             # index.html / style.css / app.js / favicon.svg
│   ├── requirements.txt
│   ├── run.py              # 启动入口（自动打开浏览器）
│   └── README.md
│
└── README.md               # ← 本文件
```

## 子模块

| 子目录 | 说明 | 启动方式 |
| --- | --- | --- |
| [`agent/`](agent/) | 后端 LangGraph coding agent，可独立运行测试 | `python agent/test_agent.py` |
| [`app/`](app/) | 前端 FastAPI 桌面应用 | `python app/run.py` |

前端通过 `sys.path` 注入 + `load_dotenv` 加载后端的 `.env`，**不修改后端任何代码**。

## 快速启动

```bash
# 1. 装依赖
cd H:\mashu\app
pip install -r requirements.txt

# 2. 启动前端（会自动打开浏览器到 http://127.0.0.1:8000/）
python run.py
```

`.env` 在 `H:\mashu\agent\.env`，前端启动时会自动加载。

## 工作原理

```
浏览器 (127.0.0.1:8000)
    │ fetch /api/sessions/{id}/chat  (SSE)
    ▼
FastAPI (H:\mashu\app\frontend\)
    │ graph.stream({"messages": [...]})
    ▼
LangGraph (H:\mashu\agent\app\agent\graph.py)
    │ ChatOpenAI → DeepSeek API
    │ read_file / search_files / run_command
    ▼
流式事件 → SSE → 前端渲染
```

## 路径约定

- **后端代码**：`H:\mashu\agent\app\...`，对外暴露 `app.agent.graph.graph`（LangGraph `CompiledStateGraph`）
- **前端代码**：`H:\mashu\app\frontend\...`，通过 `agent_service.py` 把后端目录加入 `sys.path` 并 import
- **配置**：`H:\mashu\agent\.env`，含 `DEEPSEEK_API_KEY`

## 整合变更记录

- `2026-09-19` 项目整合到 `H:\mashu\`
  - 原 `H:\MaShuCoding` → `H:\mashu\agent`
  - 原 `H:\MaShuCodingFrontEnd` → `H:\mashu\app`
  - 前端 `agent_service.py` 增加显式 `load_dotenv(dotenv_path=...)` 避免 CWD 不在 backend 下时找不到 `.env`