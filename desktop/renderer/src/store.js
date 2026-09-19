/**
 * 全局状态与业务逻辑（会话管理、SSE 消息流）。
 * 用 Vue reactive 单例即可，无需引入 pinia。
 */
import { reactive } from 'vue';
import * as api from './api';

let uid = 0;

export const store = reactive({
    sessions: [],
    sessionId: null,
    messages: [], // 视图模型：{type: 'user'|'assistant'|'tool'|'thinking', ...}
    busy: false,
    status: 'init', // 'init' | 'ok' | 'busy' | 'err'
    statusText: '未连接',
});

export function shortId(id) {
    return id ? id.slice(0, 8) : '';
}

function setStatus(state_, text) {
    store.status = state_;
    store.statusText = text;
}

// ---------- 会话管理 ----------

export async function refreshSessions() {
    try {
        store.sessions = await api.listSessions();
    } catch (e) {
        console.error(e);
    }
}

export async function loadSession(id) {
    if (store.busy) return;
    try {
        const data = await api.getSession(id);
        store.sessionId = id;
        store.messages = [];
        for (const m of data.messages) appendMessage(m);
    } catch (e) {
        alert(e.message);
    }
}

export async function newSession() {
    const s = await api.createSession();
    await refreshSessions();
    await loadSession(s.session_id);
}

export async function removeSession(id) {
    if (!confirm('删除该会话？')) return;
    await api.deleteSession(id);
    if (store.sessionId === id) {
        store.sessionId = null;
        store.messages = [];
    }
    await refreshSessions();
}

// ---------- 消息流 ----------

function appendMessage(msg) {
    if (msg.role === 'user') {
        store.messages.push({ id: ++uid, type: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            // agent 决定调用工具 → 显示 tool 卡 + （无文字时）思考占位
            for (const tc of msg.tool_calls) {
                store.messages.push({
                    id: ++uid,
                    type: 'tool',
                    toolCallId: tc.id,
                    name: tc.name,
                    args: tc.args,
                    result: null,
                    open: true,
                });
            }
            if (msg.content && msg.content.trim()) {
                store.messages.push({ id: ++uid, type: 'assistant', content: msg.content });
            } else {
                store.messages.push({ id: ++uid, type: 'thinking' });
            }
        } else {
            store.messages.push({ id: ++uid, type: 'assistant', content: msg.content });
        }
    } else if (msg.role === 'tool') {
        // 找到对应的 tool-call 卡，填充结果并折叠
        const item = store.messages.find(
            (m) => m.type === 'tool' && m.toolCallId === msg.tool_call_id,
        );
        if (item) {
            item.result = msg.content;
            item.open = false;
        } else {
            store.messages.push({
                id: ++uid,
                type: 'tool',
                toolCallId: msg.tool_call_id,
                name: 'tool',
                args: {},
                result: msg.content,
                open: false,
            });
        }
        // 移除"思考中"占位
        const i = store.messages.findIndex((m) => m.type === 'thinking');
        if (i !== -1) store.messages.splice(i, 1);
    }
    // system：忽略
}

export async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || store.busy) return;

    if (!store.sessionId) {
        const s = await api.createSession();
        await refreshSessions();
        await loadSession(s.session_id);
    }

    store.busy = true;
    setStatus('busy', '正在处理…');
    appendMessage({ role: 'user', content: text });

    try {
        await api.chatStream(store.sessionId, text, (obj) => {
            if (obj.error) {
                appendMessage({ role: 'assistant', content: '⚠️ ' + obj.error });
            } else if (obj.message) {
                appendMessage(obj.message);
            } else if (obj.done) {
                refreshSessions();
            }
        });
        setStatus('ok', '已就绪');
    } catch (e) {
        console.error(e);
        appendMessage({ role: 'assistant', content: '⚠️ ' + e.message });
        setStatus('err', '出错');
    } finally {
        store.busy = false;
        refreshSessions();
    }
}

// ---------- 启动 ----------

export async function init() {
    try {
        if (await api.checkHealth()) setStatus('ok', '已连接');
    } catch {
        setStatus('err', '后端不可达');
    }
    await refreshSessions();
    if (store.sessions.length === 0) {
        await newSession();
    }
}
