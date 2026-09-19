# MaShuCoding · 前端桌面应用 (`H:\mashu\app`)

基于 **FastAPI** 的本地桌面应用（浏览器打开），把后端 LangGraph coding agent 暴露成一个可交互的聊天界面。

> 后端代码位于同级的 `H:\mashu\agent`，本项目**不修改后端**，只通过 `sys.path` 注入导入其 `app.agent.graph.graph`，并显式加载 `agent/.env`。

## 目录结构

```
H:\mashu\app\
├── frontend\
│   ├── __init__.py
│   ├── main.py             # FastAPI 入口
│   ├── api\
│   │   ├── chat.py         # /api/sessions/{id}/chat  (SSE)
│   │   └── sessions.py     # /api/sessions ...
│   └── services\
│       └── agent_service.py  # 包装后端 graph，会话管理，路径探测，.env 加载
├── static\
│   ├── index.html          # 单页聊天界面
│   ├── style.css
│   ├── app.js
│   └── favicon.svg
├── requirements.txt
├── run.py                  # 启动脚本（自动打开浏览器）
└── README.md
```

## 安装

```bash
cd H:\mashu\app
pip install -r requirements.txt
```

后端依赖（`langchain-core / langgraph / langchain-openai / python-dotenv`）也写在了 `requirements.txt` 里，因为前端会直接 import 后端的 graph。

后端的 `.env` 必须在 `H:\mashu\agent\.env`，包含 `DEEPSEEK_API_KEY`。

## 启动

```bash
cd H:\mashu\app
python run.py
# 默认监听 http://127.0.0.1:8000/ ，启动后会自动打开浏览器
```

或者：

```bash
cd H:\mashu\app
uvicorn frontend.main:app --host 127.0.0.1 --port 8000 --reload
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/api/sessions` | 新建会话 |
| GET | `/api/sessions` | 列出会话 |
| GET | `/api/sessions/{id}` | 会话详情（含消息历史） |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| POST | `/api/sessions/{id}/chat` | 发送一条消息，SSE 流式返回 |

### SSE 事件格式

每条 SSE 事件形如：

```
data: {"node":"agent","message":{"role":"assistant","content":"…","tool_calls":[…]}}

data: {"node":"tools","message":{"role":"tool","tool_call_id":"…","content":"…"}}

data: {"done":true,"session_id":"…"}
```

## 工作流程

1. 浏览器打开 `http://127.0.0.1:8000/` → 加载 `static/index.html`
2. 前端调 `/api/sessions` 拉取会话列表，没有则自动新建一个
3. 用户输入消息 → 前端 `POST /api/sessions/{id}/chat`
4. FastAPI 调用 `agent_service.chat_stream()` → 内部 `graph.stream({messages})`
5. 把后端 LangGraph 的 `agent` / `tools` 节点事件实时转发为 SSE
6. 前端按事件渲染：用户气泡、AI 思考中、工具调用卡（折叠）、工具返回结果

## 关于后端调用目录

`run_command` 工具会以**启动 FastAPI 的工作目录**为 cwd 执行 shell 命令。如果想让 agent 操作 `H:\mashu\agent` 后端项目：

```bash
cd H:\mashu\agent && python H:\mashu\app\run.py
```

或自行调整 `agent/app/tools/terminal.py`（在**后端**目录）。