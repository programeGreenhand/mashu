<script setup>
import { computed, onMounted } from 'vue';
import SessionSidebar from './components/SessionSidebar.vue';
import MessageList from './components/MessageList.vue';
import ChatComposer from './components/ChatComposer.vue';
import { store, shortId, removeSession, init } from './store';

const title = computed(() =>
    store.sessionId ? '会话 ' + shortId(store.sessionId) : '未选择会话',
);

onMounted(init);
</script>

<template>
    <div class="layout">
        <SessionSidebar />
        <main class="main">
            <header class="topbar">
                <div class="current-title">{{ title }}</div>
                <div class="topbar-actions">
                    <button
                        v-if="store.sessionId"
                        title="删除当前会话"
                        @click="removeSession(store.sessionId)"
                    >
                        清空
                    </button>
                </div>
            </header>
            <MessageList />
            <ChatComposer />
        </main>
    </div>
</template>
