# MaShu Coding · Desktop (Electron)

把现有 `app/` (FastAPI + LangGraph) 套进一个原生窗口，成为真正的桌面应用。

```
桌面端
   │
   ├─ Electron main (本进程)
   │      └─ spawn ──> python ../app/run.py  (FastAPI sidecar, 127.0.0.1:8765)
   │
   └─ BrowserWindow  ── loadURL http://127.0.0.1:8765/
                          │
                          ▼  (同源 fetch / SSE)
                        FastAPI 路由  ──>  LangGraph agent
```

前端静态文件（`../app/static/`）**没有任何改动**——Electron 直接加载 FastAPI 提供的同一份页面。

## 快速启动

```bash
# 1) 安装 Electron（首次）
cd H:\mashu\desktop
npm install

# 2) 启动桌面端（会自动拉起 Python 后端并打开窗口）
npm start
```

> 后端依赖（FastAPI / LangGraph / DeepSeek 等）请确保 `H:\mashu\app\requirements.txt` 已安装。

## 环境变量（可选）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MASHU_PORT` | `8765` | 后端 FastAPI 监听端口 |
| `MASHU_PYTHON` | `python` (Win) / `python3` | Python 解释器路径 |

例：使用 9000 端口启动：

```bash
MASHU_PORT=9000 npm start
```

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `main.js` | 主进程：spawn Python sidecar、轮询 `/health` 就绪后建窗口 |
| `preload.js` | contextBridge，仅暴露 `window.mashu.platform/versions` |
| `package.json` | Electron 依赖与 npm 脚本 |

## 打包成 .exe（可选）

打包工具未安装。如需产出独立安装包：

```bash
npm install --save-dev electron-builder
npx electron-builder --win --x64
```

构建产物会落在 `desktop/dist/`（需要在 `.gitignore` 中已忽略 `dist/` 与 `node_modules/`）。

## 故障排查

- **窗口空白 + 提示 "后端进程已退出"**：检查 `python` 是否在 PATH 中、DeepSeek API key 是否有效（`H:\mashu\agent\.env`）。
- **端口被占用**：设置 `MASHU_PORT=<其它端口>` 后再启动。
- **SSE 没流式输出**：确认 `app/frontend/main.py` 的 CORS / 同源配置无误；Electron 加载的页面与 FastAPI 同源，不会触发 CORS。