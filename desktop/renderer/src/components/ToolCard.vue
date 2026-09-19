<script setup>
import { computed } from 'vue';

const props = defineProps({ msg: { type: Object, required: true } });

const pending = computed(() => props.msg.result === null);

const bodyText = computed(() => {
    const head = `参数:\n${JSON.stringify(props.msg.args, null, 2)}`;
    return pending.value ? head : `${head}\n\n返回:\n${props.msg.result || '(空)'}`;
});
</script>

<template>
    <div class="msg tool-wrapper">
        <details class="tool-card" :open="msg.open">
            <summary>
                <template v-if="pending">🔧 调用工具 <b>{{ msg.name }}</b></template>
                <template v-else>📥 工具 <b>{{ msg.name }}</b> 返回</template>
            </summary>
            <div class="tool-body">{{ bodyText }}</div>
        </details>
    </div>
</template>
