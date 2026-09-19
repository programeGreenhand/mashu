<script setup>
import { nextTick, ref } from 'vue';
import { store, sendMessage } from '../store';

const input = ref('');
const ta = ref(null);

async function submit() {
    const text = input.value;
    if (!text.trim() || store.busy) return;
    input.value = '';
    await nextTick();
    autoResize();
    sendMessage(text);
}

function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
    }
}

function autoResize() {
    if (!ta.value) return;
    ta.value.style.height = 'auto';
    ta.value.style.height = Math.min(ta.value.scrollHeight, 200) + 'px';
}
</script>

<template>
    <footer class="composer">
        <div class="composer-inner">
            <textarea
                ref="ta"
                v-model="input"
                rows="1"
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                @keydown="onKeydown"
                @input="autoResize"
            ></textarea>
            <button class="primary-btn" :disabled="store.busy" @click="submit">发送</button>
        </div>
        <div class="hint">后端 LangGraph · 模型 deepseek-chat</div>
    </footer>
</template>
