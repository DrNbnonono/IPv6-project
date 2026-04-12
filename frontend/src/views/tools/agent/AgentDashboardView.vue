<template>
  <div class="agent-dashboard-view">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <div class="logo" v-if="!sidebarCollapsed">
          <span class="logo-icon">🤖</span>
          <span class="logo-text">ObserV6 Agent</span>
        </div>
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '→' : '←' }}
        </button>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section">
          <span class="nav-label" v-if="!sidebarCollapsed">工具</span>
          <div
            v-for="tool in agentStore.availableTools"
            :key="tool.id"
            class="nav-item"
            :class="{ active: selectedTool?.id === tool.id }"
            @click="selectTool(tool)"
            :title="tool.name"
          >
            <span class="nav-icon">{{ getToolIcon(tool.id) }}</span>
            <span class="nav-text" v-if="!sidebarCollapsed">{{ tool.name }}</span>
          </div>
        </div>

        <div class="nav-section">
          <span class="nav-label" v-if="!sidebarCollapsed">终端</span>
          <div class="nav-item" @click="showTerminalPanel = true" :title="'终端管理'">
            <span class="nav-icon">💻</span>
            <span class="nav-text" v-if="!sidebarCollapsed">终端</span>
            <span class="badge" v-if="terminalCount > 0">{{ terminalCount }}</span>
          </div>
          <div class="nav-item" @click="showHistoryPanel = true" :title="'历史记录'">
            <span class="nav-icon">📜</span>
            <span class="nav-text" v-if="!sidebarCollapsed">历史</span>
          </div>
        </div>

        <div class="nav-section">
          <span class="nav-label" v-if="!sidebarCollapsed">记忆</span>
          <div class="nav-item" @click="showMemoryPanel = true" :title="'记忆管理'">
            <span class="nav-icon">🧠</span>
            <span class="nav-text" v-if="!sidebarCollapsed">记忆</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer" v-if="!sidebarCollapsed">
        <div class="status-indicator">
          <span class="status-dot" :class="{ online: agentStatus?.llm?.configured }"></span>
          <span class="status-text">{{ agentStatus?.llm?.provider || 'Unknown' }}</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <div class="page-info">
          <h1>Agent 助手</h1>
          <p class="subtitle">{{ currentViewTitle }}</p>
        </div>
        <div class="top-actions">
          <div class="stat-badge">
            <span class="stat-icon">💬</span>
            <span class="stat-value">{{ agentStore.messages.length }}</span>
            <span class="stat-label">对话</span>
          </div>
          <div class="stat-badge">
            <span class="stat-icon">🔧</span>
            <span class="stat-value">{{ agentStore.availableTools.length }}</span>
            <span class="stat-label">工具</span>
          </div>
          <div class="stat-badge">
            <span class="stat-icon">💻</span>
            <span class="stat-value">{{ terminalCount }}</span>
            <span class="stat-label">终端</span>
          </div>
        </div>
      </header>

      <!-- 内容区域 -->
      <div class="content-area">
        <!-- 聊天面板 -->
        <div class="chat-section">
          <AgentChatPanel />
        </div>

        <!-- 工具详情侧边栏 -->
        <aside class="detail-sidebar" v-if="selectedTool && showToolDetail">
          <div class="detail-header">
            <span class="detail-icon">{{ getToolIcon(selectedTool.id) }}</span>
            <div class="detail-info">
              <h3>{{ selectedTool.name }}</h3>
              <span class="detail-category">{{ selectedTool.category }}</span>
            </div>
            <button class="close-btn" @click="showToolDetail = false">✕</button>
          </div>

          <div class="detail-content">
            <p class="detail-description">{{ selectedTool.description }}</p>

            <div class="params-section">
              <h4>参数说明</h4>
              <div
                v-for="(config, name) in selectedTool.parameters"
                :key="name"
                class="param-item"
              >
                <div class="param-header">
                  <code class="param-name">{{ name }}</code>
                  <span v-if="config.required" class="param-required">必填</span>
                  <span class="param-type">{{ config.type }}</span>
                </div>
                <p class="param-desc">{{ config.description }}</p>
                <input
                  v-if="config.type === 'string'"
                  v-model="toolParams[name]"
                  class="param-input"
                  :placeholder="config.description"
                />
                <input
                  v-else-if="config.type === 'number'"
                  v-model.number="toolParams[name]"
                  type="number"
                  class="param-input"
                />
              </div>
            </div>

            <button
              class="execute-btn"
              @click="executeSelectedTool"
              :disabled="!canExecuteTool"
            >
              执行工具
            </button>
          </div>
        </aside>
      </div>
    </main>

    <!-- 终端面板 -->
    <div v-if="showTerminalPanel" class="overlay" @click.self="showTerminalPanel = false">
      <div class="terminal-panel">
        <div class="panel-header">
          <h3>终端管理</h3>
          <div class="header-actions">
            <button class="action-btn primary" @click="createNewTerminal">
              + 新建终端
            </button>
            <button class="action-btn" @click="showTerminalPanel = false">✕</button>
          </div>
        </div>

        <div class="terminal-list">
          <div
            v-for="term in terminals"
            :key="term.id"
            class="terminal-item"
            :class="{ active: activeTerminalId === term.id }"
            @click="selectTerminal(term.id)"
          >
            <span class="terminal-icon">💻</span>
            <div class="terminal-info">
              <span class="terminal-id">{{ term.id.substring(0, 8) }}...</span>
              <span class="terminal-status">
                {{ term.isActive ? '运行中' : '已关闭' }}
              </span>
            </div>
            <div class="terminal-actions">
              <button @click.stop="closeTerminalById(term.id)" title="关闭">✕</button>
            </div>
          </div>
          <div v-if="terminals.length === 0" class="empty-state">
            暂无终端会话
          </div>
        </div>

        <div v-if="activeTerminalId" class="terminal-output">
          <div class="output-header">
            <span>输出</span>
            <button @click="clearTerminalOutput">清空</button>
          </div>
          <div class="output-content" ref="terminalOutput">
            <pre>{{ terminalOutput }}</pre>
          </div>
          <div class="terminal-input">
            <input
              v-model="terminalCommand"
              @keydown.enter="executeTerminalCommand"
              placeholder="输入命令..."
            />
            <button @click="executeTerminalCommand">执行</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 记忆面板 -->
    <div v-if="showMemoryPanel" class="overlay" @click.self="showMemoryPanel = false">
      <div class="memory-panel">
        <div class="panel-header">
          <h3>记忆管理</h3>
          <button class="action-btn" @click="showMemoryPanel = false">✕</button>
        </div>

        <div class="memory-content">
          <div class="memory-stats">
            <div class="stat-card">
              <span class="stat-icon">⚙️</span>
              <span class="stat-value">{{ memorySummary.preferences || 0 }}</span>
              <span class="stat-label">偏好设置</span>
            </div>
            <div class="stat-card">
              <span class="stat-icon">🔧</span>
              <span class="stat-value">{{ memorySummary.toolHistory || 0 }}</span>
              <span class="stat-label">工具历史</span>
            </div>
            <div class="stat-card">
              <span class="stat-icon">📚</span>
              <span class="stat-value">{{ memorySummary.knowledge || 0 }}</span>
              <span class="stat-label">知识条目</span>
            </div>
          </div>

          <div class="memory-actions">
            <button class="action-btn danger" @click="clearAllMemory">
              清空所有记忆
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useAgentStore } from '@/stores/agent'
import AgentChatPanel from '@/components/agent/AgentChatPanel.vue'

const agentStore = useAgentStore()

const sidebarCollapsed = ref(false)
const selectedTool = ref(null)
const showToolDetail = ref(false)
const toolParams = reactive({})
const showTerminalPanel = ref(false)
const showHistoryPanel = ref(false)
const showMemoryPanel = ref(false)
const terminalCount = ref(0)
const terminals = ref([])
const activeTerminalId = ref(null)
const terminalCommand = ref('')
const terminalOutput = ref('')
const memorySummary = reactive({
  preferences: 0,
  toolHistory: 0,
  knowledge: 0
})

const currentViewTitle = computed(() => {
  if (selectedTool.value) return selectedTool.value.name
  return '智能助手'
})

onMounted(async () => {
  await agentStore.getStatus()
  await refreshTerminals()
  await refreshMemorySummary()
})

const getToolIcon = (toolId) => {
  const icons = {
    xmap: '🔍',
    zgrab2: '🌐',
    knowledge: '📚',
    workflow: '⚙️',
    terminal: '💻'
  }
  return icons[toolId] || '🔧'
}

const selectTool = (tool) => {
  selectedTool.value = tool
  showToolDetail.value = true

  // 重置参数
  for (const key in toolParams) {
    delete toolParams[key]
  }

  // 设置默认值
  for (const [name, config] of Object.entries(tool.parameters)) {
    if (config.default !== undefined) {
      toolParams[name] = config.default
    }
  }
}

const canExecuteTool = computed(() => {
  if (!selectedTool.value) return false

  for (const [name, config] of Object.entries(selectedTool.value.parameters)) {
    if (config.required && !toolParams[name]) {
      return false
    }
  }
  return true
})

const executeSelectedTool = async () => {
  if (!canExecuteTool.value) return

  await agentStore.executeTool(selectedTool.value.id, { ...toolParams })
  showToolDetail.value = false
}

const refreshTerminals = async () => {
  try {
    const response = await fetch('/api/agent/terminals', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    const data = await response.json()
    if (data.success) {
      terminals.value = data.terminals.terminals || []
      terminalCount.value = terminals.value.length
    }
  } catch (error) {
    console.error('获取终端列表失败:', error)
  }
}

const createNewTerminal = async () => {
  try {
    const response = await fetch('/api/agent/terminal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    })
    const data = await response.json()
    if (data.success) {
      await refreshTerminals()
      selectTerminal(data.terminal.id)
    }
  } catch (error) {
    console.error('创建终端失败:', error)
  }
}

const selectTerminal = (id) => {
  activeTerminalId.value = id
}

const closeTerminalById = async (id) => {
  try {
    await fetch(`/api/agent/terminal/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    await refreshTerminals()
    if (activeTerminalId.value === id) {
      activeTerminalId.value = null
    }
  } catch (error) {
    console.error('关闭终端失败:', error)
  }
}

const executeTerminalCommand = async () => {
  if (!terminalCommand.value.trim() || !activeTerminalId.value) return

  try {
    const response = await fetch('/api/agent/terminal/execute', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        terminalId: activeTerminalId.value,
        command: terminalCommand.value
      })
    })
    const data = await response.json()

    terminalOutput.value += `\n$ ${terminalCommand.value}\n`
    if (data.stdout) terminalOutput.value += data.stdout
    if (data.stderr) terminalOutput.value += data.stderr
    if (data.exitCode !== 0) terminalOutput.value += `\n[退出码: ${data.exitCode}]`

    terminalCommand.value = ''

    nextTick(() => {
      const output = document.querySelector('.output-content')
      if (output) output.scrollTop = output.scrollHeight
    })
  } catch (error) {
    console.error('执行命令失败:', error)
  }
}

const clearTerminalOutput = () => {
  terminalOutput.value = ''
}

const refreshMemorySummary = async () => {
  try {
    const response = await fetch('/api/agent/memory/summary', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    const data = await response.json()
    if (data.success) {
      Object.assign(memorySummary, data.data)
    }
  } catch (error) {
    console.error('获取记忆摘要失败:', error)
  }
}

const clearAllMemory = async () => {
  if (!confirm('确定要清空所有记忆吗？此操作不可恢复。')) return

  try {
    await fetch('/api/agent/memory', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    await refreshMemorySummary()
  } catch (error) {
    console.error('清空记忆失败:', error)
  }
}
</script>

<style scoped lang="scss">
.agent-dashboard-view {
  display: flex;
  height: 100vh;
  background: #0a0a0f;
  color: #e0e0e0;
}

// 侧边栏
.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #12121a 0%, #0f0f17 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;

  &.collapsed {
    width: 72px;

    .sidebar-header {
      padding: 16px;
      justify-content: center;
    }

    .nav-item {
      justify-content: center;
      padding: 12px;
    }
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;

      .logo-icon {
        font-size: 28px;
      }

      .logo-text {
        font-size: 16px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    }

    .collapse-btn {
      width: 28px;
      height: 28px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #6b7280;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;

      &:hover {
        background: rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.4);
        color: #667eea;
      }
    }
  }

  .sidebar-nav {
    flex: 1;
    padding: 16px 0;
    overflow-y: auto;

    .nav-section {
      margin-bottom: 24px;

      .nav-label {
        display: block;
        padding: 0 16px 8px;
        font-size: 11px;
        font-weight: 600;
        color: #4b5563;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      color: #a0a0b0;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;

      &:hover {
        background: rgba(102, 126, 234, 0.1);
        color: #e0e0e0;
      }

      &.active {
        background: rgba(102, 126, 234, 0.15);
        color: #667eea;

        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
        }
      }

      .nav-icon {
        font-size: 18px;
        width: 24px;
        text-align: center;
      }

      .nav-text {
        font-size: 14px;
      }

      .badge {
        margin-left: auto;
        padding: 2px 8px;
        background: rgba(102, 126, 234, 0.2);
        border-radius: 10px;
        font-size: 11px;
        color: #667eea;
      }
    }
  }

  .sidebar-footer {
    padding: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;

        &.online {
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
        }
      }

      .status-text {
        font-size: 13px;
        color: #6b7280;
      }
    }
  }
}

// 主内容区
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 28px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    .page-info {
      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        color: #ffffff;
      }

      .subtitle {
        margin: 4px 0 0;
        font-size: 13px;
        color: #6b7280;
      }
    }

    .top-actions {
      display: flex;
      gap: 12px;

      .stat-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;

        .stat-icon {
          font-size: 16px;
        }

        .stat-value {
          font-size: 16px;
          font-weight: 700;
          color: #667eea;
        }

        .stat-label {
          font-size: 12px;
          color: #6b7280;
        }
      }
    }
  }

  .content-area {
    flex: 1;
    display: flex;
    overflow: hidden;

    .chat-section {
      flex: 1;
      padding: 20px;
      overflow: hidden;
    }
  }
}

// 工具详情侧边栏
.detail-sidebar {
  width: 320px;
  background: #12121a;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;

  .detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    .detail-icon {
      font-size: 32px;
    }

    .detail-info {
      flex: 1;

      h3 {
        margin: 0;
        font-size: 16px;
        color: #e0e0e0;
      }

      .detail-category {
        font-size: 12px;
        color: #6b7280;
      }
    }

    .close-btn {
      width: 28px;
      height: 28px;
      background: rgba(255, 255, 255, 0.05);
      border: none;
      border-radius: 6px;
      color: #6b7280;
      cursor: pointer;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }
    }
  }

  .detail-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;

    .detail-description {
      font-size: 13px;
      color: #a0a0b0;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .params-section {
      h4 {
        font-size: 13px;
        color: #667eea;
        margin: 0 0 16px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .param-item {
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);

        &:last-of-type {
          border-bottom: none;
        }

        .param-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;

          .param-name {
            font-size: 13px;
            color: #667eea;
            background: rgba(102, 126, 234, 0.1);
            padding: 2px 8px;
            border-radius: 4px;
          }

          .param-required {
            font-size: 10px;
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
          }

          .param-type {
            font-size: 10px;
            color: #6b7280;
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 6px;
            border-radius: 4px;
          }
        }

        .param-desc {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px;
        }

        .param-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: #e0e0e0;

          &:focus {
            outline: none;
            border-color: rgba(102, 126, 234, 0.5);
          }
        }
      }
    }

    .execute-btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 10px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

// 覆盖层
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.terminal-panel,
.memory-panel {
  background: #12121a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    h3 {
      margin: 0;
      font-size: 16px;
      color: #e0e0e0;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #a0a0b0;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
      }

      &.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;

        &:hover {
          transform: translateY(-1px);
        }
      }

      &.danger {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;

        &:hover {
          background: rgba(239, 68, 68, 0.2);
        }
      }
    }
  }
}

.terminal-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;

  .terminal-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(102, 126, 234, 0.1);
      border-color: rgba(102, 126, 234, 0.3);
    }

    &.active {
      background: rgba(102, 126, 234, 0.15);
      border-color: rgba(102, 126, 234, 0.5);
    }

    .terminal-icon {
      font-size: 24px;
    }

    .terminal-info {
      flex: 1;
      display: flex;
      flex-direction: column;

      .terminal-id {
        font-size: 13px;
        font-family: monospace;
        color: #667eea;
      }

      .terminal-status {
        font-size: 11px;
        color: #6b7280;
      }
    }

    .terminal-actions button {
      width: 24px;
      height: 24px;
      background: rgba(239, 68, 68, 0.1);
      border: none;
      border-radius: 4px;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
      }
    }
  }

  .empty-state {
    text-align: center;
    padding: 32px;
    color: #6b7280;
    font-size: 13px;
  }
}

.terminal-output {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.02);
    font-size: 13px;
    color: #6b7280;

    button {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 12px;

      &:hover {
        color: #667eea;
      }
    }
  }

  .output-content {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
    background: #0a0a0f;
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    color: #a5d6ff;

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  }

  .terminal-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.06);

    input {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #e0e0e0;

      &:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.5);
      }
    }

    button {
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        transform: translateY(-1px);
      }
    }
  }
}

.memory-content {
  padding: 20px;

  .memory-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;

    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 16px;
      text-align: center;

      .stat-icon {
        font-size: 24px;
        display: block;
        margin-bottom: 8px;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #667eea;
        display: block;
      }

      .stat-label {
        font-size: 12px;
        color: #6b7280;
      }
    }
  }

  .memory-actions {
    .action-btn {
      width: 100%;
    }
  }
}
</style>
