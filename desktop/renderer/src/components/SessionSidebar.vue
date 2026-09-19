<script setup>
import { store, newSession, loadSession, removeSession, shortId } from '../store';

async function onNew() {
    if (store.busy) return;
    await newSession();
}

async function onSelect(id) {
    await loadSession(id);
}

function onRemove(id) {
    removeSession(id);
}
</script>

<template>
    <aside class="sidebar">
        <div class="brand">
            <span class="logo">MaShu</span>
            <span class="logo-sub">Coding Agent</span>
        </div>

        <button class="primary-btn" @click="onNew">+ 新会话</button>

        <div class="sidebar-section-title">历史会话</div>
        <ul class="session-list">
            <li
                v-for="s in store.sessions"
                :key="s.session_id"
                :class="{ active: s.session_id === store.sessionId }"
                @click="onSelect(s.session_id)"
            >
                <span class="session-id" :title="s.session_id">
                    {{ shortId(s.session_id) }} · {{ s.message_count }} 条
                </span>
                <button class="session-del" title="删除" @click.stop="onRemove(s.session_id)">
                    ✕
                </button>
            </li>
        </ul>

        <div class="sidebar-footer">
            <div class="status-dot" :class="store.status"></div>
            <span>{{ store.statusText }}</span>
        </div>
    </aside>
</template>
