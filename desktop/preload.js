/**
 * Preload：在沙箱渲染进程暴露受控的极少量 API。
 * 当前不暴露任何业务方法，所有数据交互仍走同源 fetch / SSE。
 */
'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mashu', Object.freeze({
    platform: process.platform,
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },
}));