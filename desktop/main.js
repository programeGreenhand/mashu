/**
 * MaShu Coding 桌面端 - Electron 主进程
 *
 * 架构：
 *
 *   Electron (本进程)
 *     │
 *     ├─ 注册自定义协议 mashu://  ──>  映射到 desktop/ui/ 目录
 *     │                                 （自包含的 UI 资源）
 *     │
 *     ├─ spawn ──> python ../app/run.py (FastAPI sidecar, 127.0.0.1:8765)
 *     │
 *     └─ BrowserWindow loadURL mashu://app/index.html
 *              │   预加载注入 window.mashu.apiBase = http://127.0.0.1:8765
 *              ▼
 *          fetch(${apiBase}/api/...)  ──>  FastAPI  ──>  LangGraph agent
 */
'use strict';

const { app, BrowserWindow, shell, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// ---- 路径 ----
const DESKTOP_DIR = __dirname;
const UI_DIR = path.join(DESKTOP_DIR, 'ui');
const APP_DIR = path.resolve(DESKTOP_DIR, '..', 'app');
const RUN_PY = path.join(APP_DIR, 'run.py');

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
            standard: true,        // 像 https:// 一样工作（URL 解析、相对路径）
            secure: true,           // 视为安全上下文，可使用 crypto 等
            supportFetchAPI: true,
            corsEnabled: true,      // 允许页面 fetch 跨源到 FastAPI
            stream: true,
        },
    },
]);

// ---- 工具：寻找系统 python ----
function pickPython() {
    if (process.env.MASHU_PYTHON) return process.env.MASHU_PYTHON;
    return process.platform === 'win32' ? 'python' : 'python3';
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

// ---- 注册自定义协议 mashu:// -> desktop/ui/ ----
function registerMashuProtocol() {
    protocol.handle('mashu', async (request) => {
        try {
            const url = new URL(request.url);
            // mashu://app/<path>  ->  desktop/ui/<path>
            let rel = decodeURIComponent(url.pathname || '/');
            if (rel === '/' || rel === '') rel = '/index.html';
            const target = path.normalize(path.join(UI_DIR, rel));
            // 防越界
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
        app.quit();
        return;
    }

    // 让 preload 拿到后端地址
    process.env.MASHU_API_BASE = API_BASE;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'MaShu Coding',
        backgroundColor: '#0f1115',
        webPreferences: {
            preload: path.join(DESKTOP_DIR, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // 外链走系统浏览器
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });

    const url = 'mashu://app/index.html';
    console.log(`[desktop] loadURL ${url}   (api=${API_BASE})`);
    await mainWindow.loadURL(url);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ---- 生命周期 ----
app.whenReady().then(async () => {
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