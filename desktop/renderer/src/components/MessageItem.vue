<script setup>
import { computed } from 'vue';
import ToolCard from './ToolCard.vue';
import { renderMarkdown } from '../markdown';

const props = defineProps({ msg: { type: Object, required: true } });

const html = computed(() => renderMarkdown(props.msg.content));
</script>

<template>
    <!-- 工具调用 / 结果卡（可折叠） -->
    <ToolCard v-if="msg.type === 'tool'" :msg="msg" />

    <!-- 等待工具结果的思考占位 -->
    <div v-else-if="msg.type === 'thinking'" class="msg assistant">
        <div class="avatar">A</div>
        <div class="body">
            <div class="meta">Agent · 等待工具结果…</div>
            <div class="bubble">
                <span class="thinking">
                    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                </span>
            </div>
        </div>
    </div>

    <!-- 用户 / assistant 气泡 -->
    <div v-else class="msg" :class="msg.type">
        <div class="avatar">{{ msg.type === 'user' ? 'U' : 'A' }}</div>
        <div class="body">
            <div class="meta">{{ msg.type === 'user' ? '你' : 'Agent' }}</div>
            <!-- markdown 已在 renderMarkdown 内整体 escape，无 XSS -->
            <div class="bubble" v-html="html"></div>
        </div>
    </div>
</template>
