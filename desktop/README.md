# MaShu Coding · Desktop (Electron)

真正的桌面应用：UI 资源全在 `desktop/ui/` 里，原生窗口直接加载，**不再依赖 FastAPI 提供页面**。

```
h:\mashu\desktop\
├── package.json
├── main.js          # Electron 主进程：spawn Python sidecar、注册 mashu:// 协议、建窗口
├── preload.js       # contextBridge：注入 window.mashu.apiBase
├── README.md
└── ui/              # ← 自包含的 UI
    ├── index.html
    ├── app.js       # 拷贝自 app/static/app.js，相对路径 + window.mashu.apiBase
    ├── style.css    # 拷贝自 app/static/style.css
    └── favicon.svg
```

## 架构

```
Electron main  ──┬─ spawn ──> python ../app/run.py (FastAPI sidecar, 127.0.0.1:8765)
                 │
                 └─ 注册 mashu:// 协议  ──>  映射到 desktop/ui/
                            │
BrowserWindow ── loadURL mashu://app/index.html
        │ preload 注入 window.mashu.apiBase = "http://127.0.0.1:8765"
        ▼
    fetch(`${apiBase}/api/...`)  ──>  FastAPI  ──>  LangGraph agent
```

为什么用自定义协议而不直接 `loadFile`？
- `file://` 没有真正的 origin，浏览器把它的 origin 当作 `null`，跨源 fetch 到 `http://` 会触发 opaque-origin 限制。
- `mashu://` 是带特权的伪协议（`standard + secure + corsEnabled`），可正常跨源 fetch，且文件路径仍指向 `desktop/ui/`，目录自包含。

## 快速启动

```bash
cd H:\mashu\desktop
npm install      # 首次：装 Electron
npm start        # 自动拉起 Python 后端 + 弹原生窗口
```

## 环境变量（可选）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MASHU_PORT` | `8765` | 后端 FastAPI 监听端口（preload 也会同步使用） |
| `MASHU_PYTHON` | `python` (Win) / `python3` | Python 解释器路径 |

例：换 9000 端口：

```bash
MASHU_PORT=9000 npm start
```

## 同步 UI 资源

`desktop/ui/app.js` 是从 `app/static/app.js` 拷贝而来（仅 `index.html`/`app.js` 两份需要保持同步；`style.css`/`favicon.svg` 不变）。两份文件唯一差异：

- `index.html` 用相对路径 `style.css` / `app.js` / `favicon.svg`
- `app.js` 用 `window.mashu.apiBase` 拼绝对 URL 调用 `/api/...`

如有需要，可以写个 `scripts/sync-ui.js` 一键同步，告诉我。

## 打包成 .exe（可选）

```bash
npm install --save-dev electron-builder
npx electron-builder --win --x64
```

产物在 `desktop/dist/`（已在根 `.gitignore` 中忽略）。

## 故障排查

- **窗口白屏**：DevTools 打开 `npm run dev` 看控制台；常见是 Python 没启动、DeepSeek key 缺失。
- **`mashu://` 加载失败**：确认 `desktop/ui/` 里 4 个文件都在；`Electron` ≥ 25 才能用 `protocol.handle`。
- **端口占用**：`MASHU_PORT=9000 npm start`。
- **SSE 没流式**：FastAPI CORS 已开 `*`，跨源到 `http://127.0.0.1:8765` 不会拦截。