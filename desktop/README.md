# MaShu Coding · Desktop (Electron + Vue 3)

原生窗口打包：渲染层为 Vue 3 + Vite 工程（`desktop/renderer/`），构建产物输出到 `desktop/ui/`，点桌面快捷方式即启动聊天窗口。

```
h:\mashu\desktop\
├── package.json
├── main.js          # spawn Python sidecar + 注册 mashu:// 协议 + 环境检查
├── preload.js       # contextBridge：注入 window.mashu.apiBase
├── renderer/        # Vue 3 + Vite 工程（源码）
│   ├── src/
│   │   ├── App.vue
│   │   ├── api.js       # API 客户端 + SSE 解析
│   │   ├── store.js     # reactive 全局状态（会话/消息流）
│   │   └── components/  # 侧栏 / 消息流 / 工具卡 / 输入区
│   └── vite.config.js   # base:'./' + 输出到 ../ui/
├── scripts/
│   └── build-icon.js # SVG → 多分辨率 PNG，给 electron-builder 用
├── ui/              # vite build 产物（提交到仓库，供打包直接使用）
└── README.md
```

## 开发模式

方式一（最简，UI 用构建产物）：

```bash
cd H:\mashu\desktop
npm install
npm --prefix renderer install   # 首次
npm run build:ui                # 首次 / renderer 源码有改动时
npm start                       # 自动 spawn Python 后端，弹出原生窗口
```

方式二（UI 热更新 HMR）：

```bash
cd H:\mashu\desktop\renderer
npm run dev                     # vite dev server @ http://localhost:5173
# 另开一个终端
cd H:\mashu\desktop
$env:MASHU_DEV_URL="http://localhost:5173"; npm start
```

环境变量：`MASHU_PORT=9000` 切换端口；`MASHU_PYTHON=C:\path\to\python.exe` 选解释器。

## 打包成可分发的桌面应用

```bash
cd H:\mashu\desktop
npm run dist        # 自动执行：icon → vite build → electron-builder
```

产物：`desktop/dist/MaShu Coding-Setup-0.1.0.exe`（NSIS 安装器）。

安装后效果：
- 桌面快捷方式 **MaShu Coding**
- 开始菜单项 **MaShu Coding**
- 双击启动 → 检测 Python → 拉起后端 → 弹窗

> `app/` 与 `agent/` 源码会作为 `extraResources` 一起打进安装包，**包含 `agent/.env`（API key 已内置，开箱即用）**。
> 注意：`.env` 只进安装包、不进 git 仓库（`.gitignore` 已忽略）。

## 前置条件（端用户机器）

| 依赖 | 说明 |
| --- | --- |
| **Python 3.10+** | 加入 PATH；安装后端依赖：`pip install -r app/requirements.txt` |

API key 已随安装包内置，无需手动配置 `.env`。

启动失败时，桌面端会弹出对话框告知确切原因。

## 架构

```
Electron main.js  ──┬─ spawn ──> python app/run.py  (FastAPI sidecar, 127.0.0.1:8765)
                    │
                    ├─ 注册 mashu:// 协议  ──>  desktop/ui/（Vue 构建产物）
                    │
                    └─ BrowserWindow loadURL mashu://app/index.html
                             │  preload 注入 window.mashu.apiBase
                             ▼
                         Vue app fetch(`${apiBase}/api/...`)  ──>  FastAPI  ──>  LangGraph
```

为什么用自定义协议：`file://` 在 Chromium 里 origin 视为 `null`，跨源 `fetch` 受限；`mashu://` 携带 `corsEnabled: true` 特权，可正常调 FastAPI。

## electron-builder 配置要点

`package.json` 的 `build` 段：

- `appId: com.programegreenhand.mashu` / `productName: MaShu Coding`
- Windows：`win.target = nsis`，生成 `.exe` 安装器
- NSIS：`oneClick: false` + `createDesktopShortcut: true` + `createStartMenuShortcut: true`
- `extraResources`：把 `../app` 和 `../agent`（含 `.env`）拷到 `resources/`，运行期由 `process.resourcesPath` 访问
- 图标：`build/icon.png`（512×512），由 `npm run icon` 从 `ui/favicon.svg` 渲染

## 故障排查

- **图标空白**：先跑 `npm run icon`；或把 `build/icon.png` 换成 256×256+ 的 PNG。
- **安装后启动报"找不到 Python"**：装 Python 3.10+ 并加 PATH，或 `setx MASHU_PYTHON "D:\Python311\python.exe"`。
- **后端依赖缺失**：在 `%LOCALAPPDATA%\Programs\MaShu Coding\resources\app` 下执行 `pip install -r requirements.txt`（首次安装后必须做一次）。
- **改了 renderer 源码没生效**：重新 `npm run build:ui`（或用方式二 HMR 调试）。
