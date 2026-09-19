/**
 * MaShu Coding 桌面端 - Electron 主进程
 *
 * 架构：
 *
 *   Electron (本进程)
 *     │
 *     ├─ 注册 mashu:// 协议  ──>  映射到 desktop/ui/（Vue 3 + Vite 构建产物）
 *     │                          dev 模式可用 MASHU_DEV_URL 指向 vite dev server
 *     ├─ spawn ──> python run.py (FastAPI sidecar, 127.0.0.1:8765)
 *     │              ├─ dev:    python run.py at <repo>/app/
 *     │              └─ 打包后: python run.py at <resources>/app/
 *     │
 *     └─ BrowserWindow loadURL mashu://app/index.html
 *              │  preload 注入 window.mashu.apiBase
 *              ▼
 *          fetch(`${apiBase}/api/...`)  ──>  FastAPI  ──>  LangGraph agent
 */
'use strict';

const { app, BrowserWindow, shell, protocol, net, dialog } = require('electron');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ---- 路径（dev / 打包后不同） ----
const IS_PACKAGED = app.isPackaged;
const PROJECT_ROOT = IS_PACKAGED
    ? process.resourcesPath                              // resources/
    : path.resolve(__dirname, '..');                     // h:\mashu
const APP_DIR = path.join(PROJECT_ROOT, 'app');
const AGENT_DIR = path.join(PROJECT_ROOT, 'agent');
const RUN_PY = path.join(APP_DIR, 'run.py');
const UI_DIR = path.join(__dirname, 'ui');

// ---- 后端配置 ----
const HOST = '127.0.0.1';
const PORT = parseInt(process.env.MASHU_PORT || '8765', 10);
const API_BASE = `http://${HOST}:${PORT}`;
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 400;

// ---- 状态 ----
let pythonProc = null;
let mainWindow = null;

// ---- 必须：在 app ready 之前声明自定义协议特权 ----
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'mashu',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
]);

// ---- 工具：寻找系统 python ----
function pickPython() {
    if (process.env.MASHU_PYTHON) return process.env.MASHU_PYTHON;
    return process.platform === 'win32' ? 'python' : 'python3';
}

// ---- 检查 Python + .env + 依赖 ----
function checkEnvironment() {
    const python = pickPython();
    const r = spawnSync(python, ['--version'], { encoding: 'utf-8' });
    if (r.status !== 0) {
        return {
            ok: false,
            message: `找不到 Python 解释器 (${python})。\n\n` +
                `请先安装 Python 3.10+ 并加入 PATH：\n` +
                `https://www.python.org/downloads/\n\n` +
                `或设置环境变量 MASHU_PYTHON 指向 python.exe 的完整路径。`,
        };
    }

    const envFile = path.join(AGENT_DIR, '.env');
    if (!fs.existsSync(envFile)) {
        return {
            ok: false,
            message: `缺少配置文件：${envFile}\n\n` +
                `请在该路径创建 .env，并填入：\n\n` +
                `  DEEPSEEK_API_KEY=sk-你的key\n` +
                `  TAVILY_API_KEY=tvly-你的key（可选）\n\n` +
                `获取 key：\n` +
                `  DeepSeek: https://platform.deepseek.com/api_keys\n` +
                `  Tavily:   https://app.tavily.com`,
        };
    }

    return { ok: true };
}

// ---- 工具：探测 FastAPI 就绪 ----
function probeHealth() {
    return new Promise((resolve) => {
        const req = http.get(
            { host: HOST, port: PORT, path: '/health', timeout: POLL_INTERVAL_MS },
            (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function waitForServer() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await probeHealth()) return true;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    return false;
}

// ---- 启动 Python FastAPI sidecar ----
function startBackend() {
    const python = pickPython();
    const args = ['run.py', '--host', HOST, '--port', String(PORT), '--no-browser'];

    console.log(`[desktop] spawn: ${python} ${args.join(' ')} (cwd=${APP_DIR})`);
    pythonProc = spawn(python, args, {
        cwd: APP_DIR,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    pythonProc.stdout.on('data', (b) => process.stdout.write(`[backend] ${b}`));
    pythonProc.stderr.on('data', (b) => process.stderr.write(`[backend!] ${b}`));
    pythonProc.on('exit', (code, sig) => {
        console.log(`[desktop] backend exited code=${code} sig=${sig}`);
        pythonProc = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `alert('后端进程已退出 (code=${code})，桌面端将关闭');`,
            ).catch(() => {});
            app.quit();
        }
    });
}

function stopBackend() {
    if (!pythonProc) return;
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pythonProc.pid), '/t', '/f']).on('error', () => {});
        } else {
            pythonProc.kill('SIGTERM');
        }
    } catch (e) {
        console.error('[desktop] kill backend failed:', e);
    }
    pythonProc = null;
}

// ---- 注册 mashu:// -> desktop/ui/ ----
function registerMashuProtocol() {
    protocol.handle('mashu', async (request) => {
        try {
            const url = new URL(request.url);
            let rel = decodeURIComponent(url.pathname || '/');
            if (rel === '/' || rel === '') rel = '/index.html';
            const target = path.normalize(path.join(UI_DIR, rel));
            if (!target.startsWith(UI_DIR)) {
                return new Response('forbidden', { status: 403 });
            }
            return net.fetch(pathToFileURL(target).toString());
        } catch (e) {
            console.error('[desktop] mashu:// handler error:', e);
            return new Response(`error: ${e.message}`, { status: 500 });
        }
    });
}

// ---- 窗口 ----
async function createWindow() {
    const ready = await waitForServer();
    if (!ready) {
        console.error(`[desktop] backend 未在 ${STARTUP_TIMEOUT_MS}ms 内就绪`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: '后端未启动',
                message: 'FastAPI 后端在 30 秒内未就绪。',
                detail: '请检查 Python 依赖是否安装：\n\n' +
                    `  cd "${APP_DIR}"\n` +
                    '  pip install -r requirements.txt',
            });
        }
        app.quit();
        return;
    }

    process.env.MASHU_API_BASE = API_BASE;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'MaShu Coding',
        backgroundColor: '#0f1115',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });

    // 生产：mashu:// 自定义协议加载 desktop/ui/ 下的 Vue 构建产物；
    // 开发：设 MASHU_DEV_URL=http://localhost:5173 可直连 vite dev server（HMR）
    const url = process.env.MASHU_DEV_URL || 'mashu://app/index.html';
    console.log(`[desktop] loadURL ${url}   (api=${API_BASE})`);
    await mainWindow.loadURL(url);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ---- 生命周期 ----
app.whenReady().then(async () => {
    // 1) 环境检查
    const env = checkEnvironment();
    if (!env.ok) {
        dialog.showErrorBox('MaShu Coding 启动失败', env.message);
        app.quit();
        return;
    }

    // 2) 注册协议 + 启后端 + 建窗口
    registerMashuProtocol();
    startBackend();
    await createWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);
process.on('exit', stopBackend);
process.on('SIGINT', () => { stopBackend(); process.exit(0); });
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });