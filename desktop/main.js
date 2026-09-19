/**
 * MaShu Coding 桌面端 - Electron 主进程
 *
 * 架构：
 *   Electron (本进程) ──┐
 *                       ├─ spawn ──> python app/run.py (FastAPI sidecar)
 *   BrowserWindow ──────┘
 *      │ loadURL http://127.0.0.1:<port>/
 *      │ 同源 fetch /api/...
 *      ▼
 *   FastAPI + LangGraph agent
 */
'use strict';

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// ---- 配置 ----
const APP_DIR = path.resolve(__dirname, '..', 'app');           // 兄弟目录：FastAPI 入口
const RUN_PY = path.join(APP_DIR, 'run.py');
const HOST = '127.0.0.1';
const PORT = parseInt(process.env.MASHU_PORT || '8765', 10);   // 避开常用 8000
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 400;

// ---- 状态 ----
let pythonProc = null;
let mainWindow = null;

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

// ---- 窗口 ----
async function createWindow() {
    const ready = await waitForServer();
    if (!ready) {
        console.error(`[desktop] backend 未在 ${STARTUP_TIMEOUT_MS}ms 内就绪`);
        app.quit();
        return;
    }

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

    // 外链走系统浏览器，不在 Electron 里打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });

    const url = `http://${HOST}:${PORT}/`;
    console.log(`[desktop] loadURL ${url}`);
    await mainWindow.loadURL(url);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ---- 生命周期 ----
app.whenReady().then(async () => {
    startBackend();
    await createWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // macOS 习惯：dock 图标保留
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);
process.on('exit', stopBackend);
process.on('SIGINT', () => { stopBackend(); process.exit(0); });
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });