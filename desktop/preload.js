/**
 * Preload：在沙箱渲染进程暴露受控的极少量 API。
 * 关键：把 FastAPI 后端地址（端口会动态变化）注入到 window.mashu.apiBase，
 *        让 index.html / app.js 可以用绝对 URL 调用后端，规避 file:// 同源问题。
 */
'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mashu', Object.freeze({
    platform: process.platform,
    // 由 main.js 通过环境变量 MASHU_API_BASE 注入（默认与 spawn 时一致）
    apiBase: process.env.MASHU_API_BASE || 'http://127.0.0.1:8765',
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },
}));