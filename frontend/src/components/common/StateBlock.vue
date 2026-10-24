<template>
  <div :class="['state-block', state, { compact }]" :role="state === 'error' ? 'alert' : 'status'">
    <span v-if="state === 'loading'" class="spinner" aria-hidden="true"></span>
    <p class="state-text">{{ text }}</p>
    <p v-if="hint" class="state-hint">{{ hint }}</p>
    <button v-if="state === 'error' && retryable" type="button" class="retry-btn" @click="$emit('retry')">
      {{ t('state.retry') }}
    </button>
  </div>
</template>

<script setup>
// 统一的加载 / 空态 / 错误态展示。文案走 i18n（state.*），调用方可用 message 覆盖。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  state: { type: String, default: 'empty', validator: (v) => ['loading', 'empty', 'error'].includes(v) },
  message: { type: String, default: '' },
  hint: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  retryable: { type: Boolean, default: true }
})
defineEmits(['retry'])

const { t } = useI18n()
const text = computed(() => props.message || t(`state.${props.state}`))
</script>

<style scoped>
.state-block { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 12px; text-align: center; color: #9ca3af; font-size: 14px; }
.state-block.compact { padding: 14px 8px; font-size: 13px; }
.state-block.error { color: #ef9a9a; }
.state-text, .state-hint { margin: 0; }
.state-hint { font-size: 12px; opacity: 0.8; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255, 255, 255, 0.2); border-top-color: #4fc3f7; border-radius: 50%; animation: state-spin 0.8s linear infinite; }
.retry-btn { background: none; border: 1px solid #4fc3f7; color: #4fc3f7; border-radius: 4px; padding: 3px 14px; cursor: pointer; font-size: 13px; }
.retry-btn:hover { background: rgba(79, 195, 247, 0.15); }
@keyframes state-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
