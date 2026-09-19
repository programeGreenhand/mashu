/**
 * 极简 markdown 渲染：```fenced code```、`inline code`、**bold**。
 * 先整体 escape 再还原标签，保证无 XSS。
 */

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderMarkdown(text) {
    if (!text) return '';
    // 先抽出 fenced code blocks
    const codeBlocks = [];
    let s = String(text).replace(/```([\s\S]*?)```/g, (_, code) => {
        codeBlocks.push(code.replace(/^\n/, ''));
        return `\u0000CODEBLOCK_${codeBlocks.length - 1}\u0000`;
    });
    s = escapeHtml(s);
    // inline code
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 把占位符替换成 <pre><code>
    s = s.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, idx) =>
        `<pre><code>${escapeHtml(codeBlocks[Number(idx)])}</code></pre>`,
    );
    return s;
}
