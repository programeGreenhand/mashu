/**
 * API 客户端：统一通过 window.mashu.apiBase（由 preload 注入）访问 FastAPI 后端。
 * vite dev 模式下没有 preload，回退到本地默认地址。
 */
const apiBase =
    (typeof window !== 'undefined' && window.mashu && window.mashu.apiBase) ||
    'http://127.0.0.1:8765';

export const API_BASE = apiBase;

async function jsonOf(resp) {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

export async function checkHealth() {
    const r = await fetch(`${apiBase}/health`);
    return r.ok;
}

export async function listSessions() {
    return jsonOf(await fetch(`${apiBase}/api/sessions`));
}

export async function createSession() {
    return jsonOf(await fetch(`${apiBase}/api/sessions`, { method: 'POST' }));
}

export async function getSession(id) {
    const r = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('session 不存在');
    return r.json();
}

export async function deleteSession(id) {
    return jsonOf(
        await fetch(`${apiBase}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    );
}

/**
 * POST /api/sessions/{id}/chat，SSE 流式返回。
 * onEvent(obj) 会被依次调用：{message:{...}} / {done:true} / {error}
 */
export async function chatStream(sessionId, message, onEvent) {
    const resp = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${t}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // 最后一个可能不完整，留到下次
        for (const part of parts) {
            for (const line of part.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (!data) continue;
                try {
                    onEvent(JSON.parse(data));
                } catch (e) {
                    console.warn('SSE parse error', e, data);
                }
            }
        }
    }
}
