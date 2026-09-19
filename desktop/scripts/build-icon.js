/**
 * 把 ui/favicon.svg 渲染成多分辨率 PNG，供 electron-builder 用作应用图标。
 *
 *   node scripts/build-icon.js
 *
 * 产物：
 *   build/icon.png       512x512 主图标（electron-builder 自动派生 ICO）
 *   build/icon-256.png   256x256
 *   build/icon-128.png   128x128
 *   build/icon-64.png    64x64
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SVG_PATH = path.join(__dirname, '..', 'ui', 'favicon.svg');
const OUT_DIR = path.join(__dirname, '..', 'build');
const MAIN_PNG = path.join(OUT_DIR, 'icon.png');

const SIZES = [512, 256, 128, 64];

function renderSvg(svg, size) {
    // fit: 0..1 自适应填充；background：透明
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: size },
        background: 'rgba(0,0,0,0)',
        font: { loadSystemFonts: true },
    });
    const rendered = resvg.render();
    return rendered.asPng();
}

function main() {
    if (!fs.existsSync(SVG_PATH)) {
        console.error(`[icon] 找不到源 SVG: ${SVG_PATH}`);
        process.exit(1);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const svg = fs.readFileSync(SVG_PATH);

    for (const size of SIZES) {
        const png = renderSvg(svg, size);
        const out = path.join(OUT_DIR, `icon-${size}.png`);
        fs.writeFileSync(out, png);
        console.log(`[icon] wrote ${out} (${png.length} bytes)`);
    }

    // 主图标 = 512x512
    fs.copyFileSync(path.join(OUT_DIR, 'icon-512.png'), MAIN_PNG);
    console.log(`[icon] wrote ${MAIN_PNG}`);
}

main();