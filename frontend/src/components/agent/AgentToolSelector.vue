<template>
  <div class="agent-tool-selector">
    <div class="selector-header">
      <h3>工具选择</h3>
      <button @click="$emit('close')" class="close-btn">✖️</button>
    </div>

    <div class="tools-grid">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="tool-card"
        :class="{ active: selectedTool?.id === tool.id }"
        @click="selectTool(tool)"
      >
        <span class="tool-icon">{{ getToolIcon(tool.id) }}</span>
        <span class="tool-name">{{ tool.name }}</span>
        <span class="tool-category">{{ getCategoryLabel(tool.category) }}</span>
      </div>
    </div>

    <div v-if="selectedTool" class="tool-config">
      <h4>配置 {{ selectedTool.name }}</h4>

      <div class="param-form">
        <div v-for="(config, paramName) in selectedTool.parameters" :key="paramName" class="param-item">
          <label>{{ paramName }}</label>
          <input
            v-if="config.type === 'string'"
            v-model="paramValues[paramName]"
            :placeholder="config.description"
            type="text"
          />
          <input
            v-else-if="config.type === 'number'"
            v-model.number="paramValues[paramName]"
            :placeholder="config.description"
            type="number"
          />
          <select v-else-if="config.type === 'enum'" v-model="paramValues[paramName]">
            <option value="">选择...</option>
            <option v-for="opt in config.values" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <span class="param-hint">{{ config.description }}</span>
        </div>
      </div>

      <div class="config-actions">
        <button @click="clearConfig" class="btn-secondary">清空</button>
        <button @click="executeTool" class="btn-primary" :disabled="!canExecute">
          执行
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useAgentStore } from '@/stores/agent'

const props = defineProps({
  tools: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'execute'])

const agentStore = useAgentStore()

const selectedTool = ref(null)
const paramValues = reactive({})

const canExecute = computed(() => {
  if (!selectedTool.value) return false

  for (const [paramName, config] of Object.entries(selectedTool.value.parameters)) {
    if (config.required && !paramValues[paramName]) {
      return false
    }
  }
  return true
})

const selectTool = (tool) => {
  selectedTool.value = tool
  // 初始化默认值
  for (const [paramName, config] of Object.entries(tool.parameters)) {
    if (config.default !== undefined) {
      paramValues[paramName] = config.default
    } else {
      paramValues[paramName] = ''
    }
  }
}

const clearConfig = () => {
  for (const key in paramValues) {
    paramValues[key] = ''
  }
}

const executeTool = () => {
  if (!canExecute.value) return

  const params = {}
  for (const [key, value] of Object.entries(paramValues)) {
    if (value !== '' && value !== null && value !== undefined) {
      params[key] = value
    }
  }

  emit('execute', {
    toolName: selectedTool.value.id,
    params
  })
}

const getToolIcon = (toolId) => {
  const icons = {
    xmap: '🔍',
    zgrab2: '🌐',
    knowledge: '📚',
    workflow: '⚙️'
  }
  return icons[toolId] || '🔧'
}

const getCategoryLabel = (category) => {
  const labels = {
    scanner: '扫描器',
    assistant: '助手',
    analysis: '分析'
  }
  return labels[category] || category
}
</script>

<style scoped lang="scss">
.agent-tool-selector {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;

  h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
  }
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px;

  .tool-card {
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    &:hover {
      border-color: #667eea;
    }

    &.active {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .tool-icon {
      font-size: 28px;
    }

    .tool-name {
      font-weight: 500;
      color: #333;
      font-size: 14px;
    }

    .tool-category {
      font-size: 11px;
      color: #666;
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 4px;
    }
  }
}

.tool-config {
  padding: 16px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;

  h4 {
    margin: 0 0 16px;
    font-size: 14px;
    color: #333;
  }

  .param-form {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .param-item {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-size: 13px;
        font-weight: 500;
        color: #333;
      }

      input,
      select {
        padding: 8px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 13px;

        &:focus {
          outline: none;
          border-color: #667eea;
        }
      }

      .param-hint {
        font-size: 11px;
        color: #666;
      }
    }
  }

  .config-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;

    button {
      flex: 1;
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;

      &.btn-secondary {
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        color: #333;

        &:hover {
          background: #e5e7eb;
        }
      }

      &.btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;

        &:hover:not(:disabled) {
          opacity: 0.9;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }
}
</style>
