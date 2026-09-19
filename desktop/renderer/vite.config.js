import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 构建产物输出到 desktop/ui/，由 Electron 主进程通过 mashu:// 协议加载。
export default defineConfig({
    plugins: [vue()],
    base: './', // 相对路径，适配 mashu://app/ 自定义协议
    build: {
        outDir: '../ui',
        emptyOutDir: true,
    },
});
