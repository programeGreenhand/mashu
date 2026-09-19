# MaShu Coding · Desktop (Electron)

原生窗口打包：UI 资源全在 `desktop/ui/`，点桌面快捷方式即启动聊天窗口。

```
h:\mashu\desktop\
├── package.json
├── main.js          # spawn Python sidecar + 注册 mashu:// 协议 + 环境检查
├── preload.js       # contextBridge：注入 window.mashu.apiBase
├── scripts/
│   └── build-icon.js # SVG → 多分辨率 PNG，给 electron-builder 用
├── ui/              # 自包含 UI（index.html / app.js / style.css / favicon.svg）
└── README.md
```

## 开发模式

```bash
cd H:\mashu\desktop
npm install
npm start         # 自动 spawn Python 后端，弹出原生窗口
```

环境变量：`MASHU_PORT=9000 npm start` 切换端口；`MASHU_PYTHON=C:\path\to\python.exe npm start` 选解释器。

## 打包成可分发的桌面应用

```bash
cd H:\mashu\desktop
npm run dist
```

产物：`desktop/dist/MaShu Coding-Setup-0.1.0.exe`（NSIS 安装器，约 90 MB）。

安装后效果：
- 桌面快捷方式 **MaShu Coding**
- 开始菜单项 **MaShu Coding**
- 双击启动 → 检测 Python 与 `.env` → 拉起后端 → 弹窗

> `app/` 与 `agent/` 源码会被作为 `extraResources` 一起打进安装包（`.env` 排除，避免泄露 key）。

## 前置条件（端用户机器）

| 依赖 | 说明 |
| --- | --- |
| **Python 3.10+** | 加入 PATH；安装后端依赖：`pip install -r app/requirements.txt` |
| **DeepSeek API Key** | 在 `<安装目录>/resources/agent/.env` 写入 `DEEPSEEK_API_KEY=sk-...` |
| **Tavily API Key**（可选） | 同上文件 `TAVILY_API_KEY=tvly-...` |

启动失败时，桌面端会弹出对话框告知确切原因。

## 架构

```
Electron main.js  ──┬─ spawn ──> python app/run.py  (FastAPI sidecar, 127.0.0.1:8765)
                    │
                    ├─ 注册 mashu:// 协议  ──>  desktop/ui/
                    │
                    └─ BrowserWindow loadURL mashu://app/index.html
                             │  preload 注入 window.mashu.apiBase
                             ▼
                         fetch(`${apiBase}/api/...`)  ──>  FastAPI  ──>  LangGraph
```

为什么用自定义协议：`file://` 在 Chromium 里 origin 视为 `null`，跨源 `fetch` 受限；`mashu://` 携带 `corsEnabled: true` 特权，可正常调 FastAPI。

## electron-builder 配置要点

`package.json` 的 `build` 段：

- `appId: com.programegreenhand.mashu` / `productName: MaShu Coding`
- Windows：`win.target = nsis`，生成 `.exe` 安装器
- NSIS：`oneClick: false` + `createDesktopShortcut: true` + `createStartMenuShortcut: true`
- `extraResources`：把 `../app` 和 `../agent` 拷到 `resources/`，运行期由 `process.resourcesPath` 访问
- 图标：`build/icon.png`（512×512），由 `npm run icon` 从 `ui/favicon.svg` 渲染

## 故障排查

- **图标空白**：先跑 `npm run icon`；或把 `build/icon.png` 换成 256×256+ 的 PNG。
- **安装后启动报"找不到 Python"**：装 Python 3.10+ 并加 PATH，或 `setx MASHU_PYTHON "D:\Python311\python.exe"`。
- **安装后启动报"缺少 .env"**：在该路径创建文件并填 key：`%LOCALAPPDATA%\Programs\MaShu Coding\resources\agent\.env`。
- **后端依赖缺失**：在该路径命令行执行 `pip install -r requirements.txt`（首次安装后必须做一次）。