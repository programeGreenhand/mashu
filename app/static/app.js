/* MaShu Coding Agent 前端逻辑 */
(() => {
    'use strict';

    // ---------- state ----------
    const state = {
        sessionId: null,
        sessions: [],
        busy: false,
        // 用于把 tool_call_id 关联到对应的 tool 消息
        pendingToolMessages: new Map(),
    };

    // ---------- DOM ----------
    const $ = (sel) => document.querySelector(sel);
    const els = {
        sessionList: $('#session-list'),
        newBtn: $('#new-session-btn'),
        messages: $('#messages'),
        emptyHint: $('#empty-hint'),
        input: $('#input'),
        sendBtn: $('#send-btn'),
        currentTitle: $('#current-title'),
        clearBtn: $('#clear-btn'),
        statusDot: $('#status-dot'),
        statusText: $('#status-text'),
    };

    // ---------- API ----------
    const api = {
        async listSessions() {
            const r = await fetch('/api/sessions');
            return r.json();
        },
        async createSession() {
            const r = await fetch('/api/sessions', {method: 'POST'});
            return r.json();
        },
        async getSession(id) {
            const r = await fetch(`/api/sessions/${id}`);
            if (!r.ok) throw new Error('session 不存在');
            return r.json();
        },
        async deleteSession(id) {
            const r = await fetch(`/api/sessions/${id}`, {method: 'DELETE'});
            return r.json();
        },
    };

    // ---------- helpers ----------
    function setStatus(state_, text) {
        els.statusDot.className = 'status-dot' + (state_ ? ' ' + state_ : '');
        els.statusText.textContent = text;
    }

    function shortId(id) {
        return id ? id.slice(0, 8) : '';
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 极简 markdown：处理 ```code blocks```、`inline code`、**bold**
     */
    function renderMarkdown(text) {
        if (!text) return '';
        // 先抽出 fenced code blocks
        const codeBlocks = [];
        let s = text.replace(/```([\s\S]*?)```/g, (_, code) => {
            codeBlocks.push(code.replace(/^\n/, ''));
            return `\u0000CODEBLOCK_${codeBlocks.length - 1}\u0000`;
        });
        s = escapeHtml(s);
        // inline code
        s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        // bold
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // 把占位符替换成 <pre><code>
        s = s.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, idx) => {
            return `<pre><code>${escapeHtml(codeBlocks[Number(idx)])}</code></pre>`;
        });
        return s;
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            els.messages.scrollTop = els.messages.scrollHeight;
        });
    }

    function autoResize() {
        els.input.style.height = 'auto';
        els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
    }

    // ---------- session 渲染 ----------
    async function refreshSessions() {
        try {
            state.sessions = await api.listSessions();
            renderSessionList();
        } catch (e) {
            console.error(e);
        }
    }

    function renderSessionList() {
        els.sessionList.innerHTML = '';
        for (const s of state.sessions) {
            const li = document.createElement('li');
            li.dataset.id = s.session_id;
            if (s.session_id === state.sessionId) li.classList.add('active');
            li.innerHTML = `
                <span class="session-id" title="${s.session_id}">${escapeHtml(shortId(s.session_id))} · ${s.message_count} 条</span>
                <button class="session-del" title="删除">✕</button>
            `;
            li.querySelector('.session-id').addEventListener('click', () => loadSession(s.session_id));
            li.querySelector('.session-del').addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm('删除该会话？')) return;
                await api.deleteSession(s.session_id);
                if (state.sessionId === s.session_id) {
                    state.sessionId = null;
                    resetMessages();
                }
                refreshSessions();
            });
            els.sessionList.appendChild(li);
        }
    }

    function resetMessages() {
        els.messages.innerHTML = '';
        els.messages.appendChild(els.emptyHint);
        els.currentTitle.textContent = '未选择会话';
        state.pendingToolMessages.clear();
    }

    async function loadSession(id) {
        if (state.busy) return;
        try {
            const data = await api.getSession(id);
            state.sessionId = id;
            els.currentTitle.textContent = '会话 ' + shortId(id);
            els.messages.innerHTML = '';
            state.pendingToolMessages.clear();
            for (const m of data.messages) {
                appendMessage(m);
            }
            if (data.messages.length === 0) {
                els.messages.appendChild(els.emptyHint);
            }
            scrollToBottom();
            renderSessionList();
        } catch (e) {
            alert(e.message);
        }
    }

    // ---------- 消息渲染 ----------
    function appendMessage(msg) {
        if (els.emptyHint.parentElement === els.messages) {
            els.messages.removeChild(els.emptyHint);
        }

        if (msg.role === 'user') {
            els.messages.appendChild(renderUserMessage(msg.content));
        } else if (msg.role === 'assistant') {
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                // agent 决定调用工具 → 显示 tool 卡 + 思考中
                for (const tc of msg.tool_calls) {
                    els.messages.appendChild(renderToolCallCard(tc));
                    state.pendingToolMessages.set(tc.id, {args: tc.args, name: tc.name});
                }
                // assistant 文字部分（如有）
                if (msg.content && msg.content.trim()) {
                    els.messages.appendChild(renderAssistantMessage(msg.content));
                } else {
                    els.messages.appendChild(renderThinking());
                }
            } else {
                els.messages.appendChild(renderAssistantMessage(msg.content));
            }
        } else if (msg.role === 'tool') {
            // 把对应的 tool call 卡替换成结果卡
            const pending = state.pendingToolMessages.get(msg.tool_call_id);
            const card = renderToolResultCard({
                name: pending?.name || 'tool',
                args: pending?.args || {},
                content: msg.content,
            });
            // 找到对应的 tool-call card 替换
            const oldCard = els.messages.querySelector(
                `[data-tool-id="${cssEscape(msg.tool_call_id)}"]`
            );
            if (oldCard) {
                oldCard.replaceWith(card);
            } else {
                els.messages.appendChild(card);
            }
            state.pendingToolMessages.delete(msg.tool_call_id);
            // 把 assistant 占位的"思考中"移除
            const thinking = els.messages.querySelector('.thinking-msg');
            if (thinking) thinking.remove();
        } else if (msg.role === 'system') {
            // 忽略 system prompt
        } else {
            // 兜底
            const div = document.createElement('div');
            div.className = 'msg';
            div.innerHTML = `<div class="body"><div class="bubble">${renderMarkdown(msg.content)}</div></div>`;
            els.messages.appendChild(div);
        }
        scrollToBottom();
    }

    function renderUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'msg user';
        div.innerHTML = `
            <div class="avatar">U</div>
            <div class="body">
                <div class="meta">你</div>
                <div class="bubble">${renderMarkdown(text)}</div>
            </div>
        `;
        return div;
    }

    function renderAssistantMessage(text) {
        const div = document.createElement('div');
        div.className = 'msg assistant';
        div.innerHTML = `
            <div class="avatar">A</div>
            <div class="body">
                <div class="meta">Agent</div>
                <div class="bubble">${renderMarkdown(text)}</div>
            </div>
        `;
        return div;
    }

    function renderThinking() {
        const div = document.createElement('div');
        div.className = 'msg assistant thinking-msg';
        div.innerHTML = `
            <div class="avatar">A</div>
            <div class="body">
                <div class="meta">Agent · 等待工具结果…</div>
                <div class="bubble"><span class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div>
            </div>
        `;
        return div;
    }

    function renderToolCallCard(tc) {
        const details = document.createElement('details');
        details.className = 'tool-card';
        details.setAttribute('data-tool-id', tc.id || '');
        details.open = true;
        const argsStr = JSON.stringify(tc.args, null, 2);
        details.innerHTML = `
            <summary>🔧 调用工具 <b>${escapeHtml(tc.name)}</b></summary>
            <div class="tool-body">参数:\n${escapeHtml(argsStr)}</div>
        `;
        const wrapper = document.createElement('div');
        wrapper.className = 'msg tool';
        wrapper.style.maxWidth = '880px';
        wrapper.style.margin = '0 auto';
        wrapper.appendChild(details);
        return wrapper;
    }

    function renderToolResultCard({name, args, content}) {
        const details = document.createElement('details');
        details.className = 'tool-card';
        details.open = false;
        const argsStr = JSON.stringify(args, null, 2);
        details.innerHTML = `
            <summary>📥 工具 <b>${escapeHtml(name)}</b> 返回</summary>
            <div class="tool-body">参数:\n${escapeHtml(argsStr)}\n\n返回:\n${escapeHtml(content || '(空)')}</div>
        `;
        const wrapper = document.createElement('div');
        wrapper.className = 'msg tool';
        wrapper.style.maxWidth = '880px';
        wrapper.style.margin = '0 auto';
        wrapper.appendChild(details);
        return wrapper;
    }

    // CSS.escape polyfill for older browsers
    function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
    }

    // ---------- 发送消息（SSE 流式） ----------
    async function sendMessage(text) {
        if (state.busy) return;
        if (!state.sessionId) {
            const s = await api.createSession();
            state.sessionId = s.session_id;
            await refreshSessions();
            await loadSession(state.sessionId);
        }

        text = text.trim();
        if (!text) return;

        state.busy = true;
        els.sendBtn.disabled = true;
        setStatus('busy', '正在处理…');

        appendMessage({role: 'user', content: text});

        try {
            const resp = await fetch(`/api/sessions/${state.sessionId}/chat`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: text}),
            });
            if (!resp.ok) {
                const t = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${t}`);
            }
            await consumeSSE(resp, (obj) => {
                if (obj.error) {
                    appendMessage({role: 'assistant', content: '⚠️ ' + obj.error});
                } else if (obj.message) {
                    appendMessage(obj.message);
                } else if (obj.done) {
                    refreshSessions();
                }
            });
            setStatus('ok', '已就绪');
        } catch (e) {
            console.error(e);
            appendMessage({role: 'assistant', content: '⚠️ ' + e.message});
            setStatus('err', '出错');
        } finally {
            state.busy = false;
            els.sendBtn.disabled = false;
            els.input.focus();
            refreshSessions();
        }
    }

    async function consumeSSE(resp, onEvent) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
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

    // ---------- 事件绑定 ----------
    function bind() {
        els.newBtn.addEventListener('click', async () => {
            const s = await api.createSession();
            state.sessionId = s.session_id;
            await refreshSessions();
            await loadSession(state.sessionId);
            els.input.focus();
        });

        els.sendBtn.addEventListener('click', () => {
            sendMessage(els.input.value);
            els.input.value = '';
            autoResize();
        });

        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(els.input.value);
                els.input.value = '';
                autoResize();
            }
        });
        els.input.addEventListener('input', autoResize);

        els.clearBtn.addEventListener('click', () => {
            if (!state.sessionId) return;
            if (!confirm('删除当前会话？')) return;
            api.deleteSession(state.sessionId).then(() => {
                state.sessionId = null;
                resetMessages();
                refreshSessions();
            });
        });

        document.querySelectorAll('.suggest').forEach(btn => {
            btn.addEventListener('click', () => {
                sendMessage(btn.textContent.trim());
            });
        });
    }

    // ---------- 启动 ----------
    async function init() {
        bind();
        autoResize();
        try {
            const r = await fetch('/health');
            if (r.ok) setStatus('ok', '已连接');
        } catch (e) {
            setStatus('err', '后端不可达');
        }
        await refreshSessions();
        if (state.sessions.length === 0) {
            const s = await api.createSession();
            state.sessionId = s.session_id;
            await refreshSessions();
            await loadSession(state.sessionId);
        }
    }

    init();
})();