<template>
  <div class="agent-chat-panel">
    <!-- 顶部工具栏 -->
    <div class="panel-toolbar">
      <div class="toolbar-left">
        <button
          v-for="tool in quickTools"
          :key="tool.id"
          class="tool-btn"
          :class="{ active: currentTool === tool.id }"
          @click="selectQuickTool(tool)"
          :title="tool.name"
        >
          <span class="tool-icon">{{ tool.icon }}</span>
          <span class="tool-label">{{ tool.name }}</span>
        </button>
      </div>
      <div class="toolbar-right">
        <button class="action-btn" @click="showSettings = !showSettings" title="设置">
          <span>⚙️</span>
        </button>
        <button class="action-btn" @click="clearHistory" title="清空对话">
          <span>🗑️</span>
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div v-if="agentStore.messages.length === 0" class="welcome-screen">
        <div class="welcome-animation">
          <div class="ai-orb">
            <div class="orb-ring"></div>
            <div class="orb-core">🤖</div>
          </div>
        </div>
        <h2>ObserV6 Agent</h2>
        <p class="welcome-subtitle">您的IPv6网络探测智能助手</p>

        <div class="capabilities-grid">
          <div
            v-for="cap in capabilities"
            :key="cap.title"
            class="capability-card"
            @click="sendCapabilityPrompt(cap.prompt)"
          >
            <span class="cap-icon">{{ cap.icon }}</span>
            <span class="cap-title">{{ cap.title }}</span>
            <span class="cap-desc">{{ cap.desc }}</span>
          </div>
        </div>

        <div class="suggested-prompts">
          <span class="prompt-label">试试这样问：</span>
          <div class="prompt-chips">
            <span
              v-for="prompt in suggestedPrompts"
              :key="prompt"
              class="prompt-chip"
              @click="sendMessage(prompt)"
            >
              {{ prompt }}
            </span>
          </div>
        </div>
      </div>

      <!-- 消息列表 -->
      <TransitionGroup name="message" tag="div" class="messages-list">
        <div
          v-for="(message, index) in agentStore.messages"
          :key="message.id"
          class="message-wrapper"
          :class="{ 'user': message.role === 'user', 'ai': message.role === 'assistant' }"
        >
          <div class="message-avatar">
            <span v-if="message.role === 'user'">👤</span>
            <span v-else-if="message.type === 'tool_result'">🔧</span>
            <span v-else-if="message.type === 'workflow'">⚙️</span>
            <span v-else-if="message.type === 'terminal'">💻</span>
            <span v-else>🤖</span>
          </div>

          <div class="message-bubble">
            <div v-if="message.type === 'welcome'" class="welcome-badge">
              <span>ObserV6 Agent</span>
            </div>

            <div class="message-content" v-html="formatMessage(message.content)"></div>

            <div v-if="message.toolCall" class="tool-call-indicator">
              <span class="tool-badge" :class="message.toolCall.tool">
                {{ getToolName(message.toolCall.tool) }}
              </span>
              <span class="tool-params">{{ formatParams(message.toolCall.params) }}</span>
            </div>

            <div v-if="message.suggestions?.length" class="suggestions-bar">
              <span
                v-for="suggestion in message.suggestions"
                :key="suggestion"
                class="suggestion-tag"
                @click="sendMessage(suggestion)"
              >
                {{ suggestion }}
              </span>
            </div>

            <div class="message-meta">
              <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
              <span v-if="message.usage" class="tokens">
                {{ message.usage.total_tokens || message.usage.prompt_tokens + message.usage.completion_tokens }} tokens
              </span>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <!-- 加载状态 -->
      <div v-if="agentStore.loading" class="loading-indicator">
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="loading-text">思考中...</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="input-toolbar">
        <button class="input-action" @click="attachFile" title="附加文件">
          <span>📎</span>
        </button>
        <button class="input-action" @click="toggleTerminal" title="终端模式">
          <span :class="{ active: showTerminal }">💻</span>
        </button>
        <button class="input-action" @click="toggleHistory" title="历史记录">
          <span>📜</span>
        </button>
      </div>

      <div class="input-wrapper">
        <textarea
          ref="inputTextarea"
          v-model="inputMessage"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact="inputMessage += '\n'"
          placeholder="输入您的需求，描述越详细，回答越准确..."
          rows="1"
          :disabled="agentStore.loading"
        ></textarea>
        <button
          class="send-button"
          @click="handleSend"
          :disabled="!inputMessage.trim() || agentStore.loading"
        >
          <span v-if="!agentStore.loading">发送</span>
          <span v-else class="loading-spinner"></span>
        </button>
      </div>

      <div class="input-hints">
        <span>Enter 发送</span>
        <span>Shift+Enter 换行</span>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <h3>设置</h3>
          <button @click="showSettings = false">✕</button>
        </div>
        <div class="settings-content">
          <div class="setting-item">
            <label>AI模型</label>
            <select v-model="settings.model">
              <option value="minimax">MiniMax</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div class="setting-item">
            <label>温度</label>
            <input type="range" min="0" max="100" v-model="settings.temperature" />
            <span>{{ settings.temperature / 100 }}</span>
          </div>
          <div class="setting-item">
            <label>最大回复长度</label>
            <input type="number" v-model="settings.maxTokens" min="256" max="4096" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, watch } from 'vue'
import { useAgentStore } from '@/stores/agent'

const agentStore = useAgentStore()

const inputMessage = ref('')
const messagesContainer = ref(null)
const inputTextarea = ref(null)
const showSettings = ref(false)
const showTerminal = ref(false)
const currentTool = ref(null)

const settings = reactive({
  model: 'minimax',
  temperature: 70,
  maxTokens: 2048
})

const quickTools = [
  { id: 'xmap', name: 'XMap', icon: '🔍' },
  { id: 'zgrab2', name: 'ZGrab2', icon: '🌐' },
  { id: 'terminal', name: '终端', icon: '💻' },
  { id: 'knowledge', name: '知识', icon: '📚' },
  { id: 'workflow', name: '工作流', icon: '⚙️' }
]

const capabilities = [
  { icon: '🔍', title: '地址扫描', desc: 'XMap活跃性检测', prompt: '帮我扫描 2001:db8::/32 网段的IPv6地址' },
  { icon: '🌐', title: '服务探测', desc: 'ZGrab2端口扫描', prompt: '探测 2001:db8::1 的HTTP服务端口' },
  { icon: '💻', title: '终端命令', desc: '执行系统命令', prompt: '在终端执行 ifconfig 命令' },
  { icon: '📚', title: '知识问答', desc: 'IPv6技术问题', prompt: '解释一下IPv6的NDP协议工作原理' },
  { icon: '⚙️', title: '工作流', desc: '设计探测流程', prompt: '帮我设计一个IPv6地址扫描工作流' }
]

const suggestedPrompts = [
  '扫描某大学IPv6地址分布',
  '如何优化IPv6网络性能',
  '解释SLAAC和DHCPv6的区别',
  '设计一个完整的探测工作流'
]

onMounted(async () => {
  agentStore.initMessages()
  await agentStore.getTools()
  await agentStore.getStatus()
  autoResizeTextarea()
})

const selectQuickTool = (tool) => {
  currentTool.value = tool.id
  const prompts = {
    xmap: '使用XMap扫描目标地址',
    zgrab2: '使用ZGrab2探测服务',
    terminal: '打开终端执行命令',
    knowledge: '查询IPv6知识',
    workflow: '生成探测工作流'
  }
  inputMessage.value = prompts[tool.id] || ''
  inputTextarea.value?.focus()
}

const sendCapabilityPrompt = (prompt) => {
  sendMessage(prompt)
}

const sendMessage = async (message) => {
  if (!message.trim() || agentStore.loading) return

  const msg = message.trim()
  inputMessage.value = ''
  currentTool.value = null

  try {
    await agentStore.sendMessage(msg)
    nextTick(() => {
      scrollToBottom()
    })
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}

const handleSend = () => {
  if (inputMessage.value.trim()) {
    sendMessage(inputMessage.value)
  }
}

const clearHistory = () => {
  if (confirm('确定要清空对话历史吗？')) {
    agentStore.clearHistory()
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const autoResizeTextarea = () => {
  if (inputTextarea.value) {
    inputTextarea.value.style.height = 'auto'
    inputTextarea.value.style.height = Math.min(inputTextarea.value.scrollHeight, 150) + 'px'
  }
}

watch(inputMessage, () => {
  nextTick(autoResizeTextarea)
})

const formatMessage = (content) => {
  if (!content) return ''

  let html = escapeHtml(content)

  // 代码块
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 class="msg-heading">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="msg-heading">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="msg-heading">$1</h2>')

  // 列表
  html = html.replace(/^(\*|-) (.+)$/gm, '<li>$2</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

  // 换行
  html = html.replace(/\n/g, '<br>')

  return html
}

const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const formatParams = (params) => {
  if (!params) return ''
  try {
    return JSON.stringify(params)
  } catch {
    return String(params)
  }
}

const getToolName = (toolId) => {
  const tool = quickTools.find(t => t.id === toolId)
  return tool ? tool.name : toolId
}

const attachFile = () => {
  // TODO: 实现文件附加功能
  console.log('Attach file clicked')
}

const toggleTerminal = () => {
  showTerminal.value = !showTerminal.value
}

const toggleHistory = () => {
  // TODO: 实现历史记录面板
  console.log('Toggle history clicked')
}
</script>

<style scoped lang="scss">
.agent-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
}

// 工具栏
.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .toolbar-left {
    display: flex;
    gap: 8px;
  }

  .toolbar-right {
    display: flex;
    gap: 8px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    color: #a0a0b0;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 13px;

    &:hover {
      background: rgba(102, 126, 234, 0.2);
      border-color: rgba(102, 126, 234, 0.5);
      color: #ffffff;
      transform: translateY(-2px);
    }

    &.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-color: transparent;
      color: #ffffff;
    }

    .tool-icon {
      font-size: 16px;
    }
  }

  .action-btn {
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #a0a0b0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      transform: rotate(45deg);
    }

    span {
      font-size: 16px;
    }
  }
}

// 欢迎屏幕
.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;

  .welcome-animation {
    margin-bottom: 24px;
  }

  .ai-orb {
    position: relative;
    width: 100px;
    height: 100px;

    .orb-ring {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(102, 126, 234, 0.5);
      border-radius: 50%;
      animation: pulse-ring 2s ease-out infinite;
    }

    .orb-core {
      position: absolute;
      inset: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      animation: float 3s ease-in-out infinite;
    }
  }

  h2 {
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 8px;
  }

  .welcome-subtitle {
    color: #6b7280;
    font-size: 14px;
    margin-bottom: 32px;
  }

  .capabilities-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    max-width: 700px;
    margin-bottom: 32px;

    .capability-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;

      &:hover {
        background: rgba(102, 126, 234, 0.15);
        border-color: rgba(102, 126, 234, 0.4);
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
      }

      .cap-icon {
        font-size: 28px;
      }

      .cap-title {
        font-size: 13px;
        font-weight: 600;
        color: #e0e0e0;
      }

      .cap-desc {
        font-size: 11px;
        color: #6b7280;
      }
    }
  }

  .suggested-prompts {
    .prompt-label {
      font-size: 12px;
      color: #6b7280;
      display: block;
      margin-bottom: 12px;
    }

    .prompt-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      max-width: 600px;
    }

    .prompt-chip {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      font-size: 13px;
      color: #a0a0b0;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover {
        background: rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.5);
        color: #ffffff;
      }
    }
  }
}

// 消息容器
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 3px;
  }
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-wrapper {
  display: flex;
  gap: 12px;
  max-width: 85%;

  &.user {
    flex-direction: row-reverse;
    margin-left: auto;
  }

  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(102, 126, 234, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .message-bubble {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 14px 18px;
    position: relative;

    .welcome-badge {
      position: absolute;
      top: -10px;
      left: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    .message-content {
      color: #e0e0e0;
      line-height: 1.7;
      font-size: 14px;

      :deep(.code-block) {
        background: #0d0d1a;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 12px 16px;
        margin: 8px 0;
        overflow-x: auto;
        font-size: 13px;
        font-family: 'Fira Code', 'Consolas', monospace;
        color: #a5d6ff;
      }

      :deep(.inline-code) {
        background: rgba(102, 126, 234, 0.15);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 13px;
        color: #667eea;
      }

      :deep(.msg-heading) {
        color: #667eea;
        margin: 12px 0 8px;
      }

      :deep(strong) {
        color: #ffffff;
        font-weight: 600;
      }

      :deep(ul) {
        margin: 8px 0;
        padding-left: 20px;
        list-style: disc;
      }

      :deep(a) {
        color: #667eea;
        text-decoration: none;
        border-bottom: 1px solid rgba(102, 126, 234, 0.5);
      }
    }

    .tool-call-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);

      .tool-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;

        &.xmap { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        &.zgrab2 { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
        &.terminal { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }
        &.knowledge { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); }
        &.workflow { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
      }

      .tool-params {
        font-size: 11px;
        color: #6b7280;
        font-family: monospace;
      }
    }

    .suggestions-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;

      .suggestion-tag {
        padding: 4px 12px;
        background: rgba(102, 126, 234, 0.1);
        border: 1px solid rgba(102, 126, 234, 0.2);
        border-radius: 12px;
        font-size: 12px;
        color: #667eea;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background: rgba(102, 126, 234, 0.2);
          border-color: rgba(102, 126, 234, 0.4);
        }
      }
    }

    .message-meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 11px;
      color: #4b5563;

      .timestamp {
        opacity: 0.7;
      }

      .tokens {
        opacity: 0.5;
      }
    }
  }

  &.user .message-bubble {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;

    .message-content {
      color: #ffffff;
    }
  }
}

// 加载指示器
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: #6b7280;

  .loading-dots {
    display: flex;
    gap: 4px;

    span {
      width: 8px;
      height: 8px;
      background: #667eea;
      border-radius: 50%;
      animation: bounce 1.4s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }

  .loading-text {
    font-size: 13px;
  }
}

// 输入区域
.input-area {
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  .input-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;

    .input-action {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover {
        background: rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.4);
        color: #667eea;

        span.active {
          color: #10b981;
        }
      }
    }
  }

  .input-wrapper {
    display: flex;
    gap: 12px;
    align-items: flex-end;

    textarea {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 14px;
      font-family: inherit;
      color: #e0e0e0;
      resize: none;
      max-height: 150px;
      transition: all 0.2s;

      &:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.5);
        background: rgba(255, 255, 255, 0.08);
      }

      &::placeholder {
        color: #4b5563;
      }

      &:disabled {
        opacity: 0.5;
      }
    }

    .send-button {
      min-width: 80px;
      height: 44px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 12px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .loading-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    }
  }

  .input-hints {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    font-size: 11px;
    color: #4b5563;
  }
}

// 设置面板
.settings-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-panel {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 360px;
  overflow: hidden;

  .settings-header {
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

    button {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 18px;

      &:hover {
        color: #ffffff;
      }
    }
  }

  .settings-content {
    padding: 20px;

    .setting-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;

      label {
        width: 100px;
        font-size: 13px;
        color: #a0a0b0;
      }

      select,
      input[type="number"] {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px 12px;
        color: #e0e0e0;
        font-size: 13px;

        &:focus {
          outline: none;
          border-color: rgba(102, 126, 234, 0.5);
        }
      }

      input[type="range"] {
        flex: 1;
        accent-color: #667eea;
      }

      span {
        width: 40px;
        font-size: 13px;
        color: #667eea;
      }
    }
  }
}

// 动画
@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.message-enter-active {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
