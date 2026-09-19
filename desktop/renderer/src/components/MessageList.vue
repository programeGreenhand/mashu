<script setup>
import { nextTick, ref, watch } from 'vue';
import { store, sendMessage } from '../store';
import MessageItem from './MessageItem.vue';

const el = ref(null);

const SUGGESTIONS = [
    '帮我看看当前项目有哪些文件',
    '搜索包含 FastAPI 的代码',
    '运行 pytest 看测试结果',
];

// 消息条数变化时滚到底部
watch(
    () => store.messages.length,
    async () => {
        await nextTick();
        if (el.value) el.value.scrollTop = el.value.scrollHeight;
    },
);
</script>

<template>
    <section ref="el" class="messages">
        <div v-if="store.messages.length === 0" class="empty-hint">
            <h2>你好，我是 MaShu Coding Agent</h2>
            <p>我可以读取、搜索并执行本地项目代码。试着问我：</p>
            <ul class="suggestions">
                <li v-for="s in SUGGESTIONS" :key="s">
                    <button class="suggest" @click="sendMessage(s)">{{ s }}</button>
                </li>
            </ul>
        </div>
        <MessageItem v-for="m in store.messages" :key="m.id" :msg="m" />
    </section>
</template>
