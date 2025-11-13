<template>
  <div class="ai-chat-wrapper">
    <!-- 浮动触发按钮 -->
    <button 
      v-if="!isVisible" 
      class="ai-trigger-btn"
      :style="triggerBtnStyle"
      @click="togglePanel"
      @mousedown="startDrag"
      title="AI数据分析助手"
    >
      <span class="ai-icon">🤖</span>
      <span class="ai-label">AI助手</span>
    </button>

    <!-- AI聊天面板 -->
    <div 
      v-show="isVisible" 
      class="ai-chat-panel"
      :style="panelStyle"
      @mousedown="startPanelDrag"
    >
      <!-- 面板头部 -->
      <div class="panel-header" @mousedown.stop="startPanelDrag">
        <div class="header-left">
          <span class="ai-icon">🤖</span>
          <h3>AI数据分析助手</h3>
          <span class="status-indicator" :class="{ online: !aiStore.detectionLoading }"></span>
        </div>
        <div class="header-actions">
          <button @click="clearHistory" class="icon-btn" title="清空对话">
            <span>🗑️</span>
          </button>
          <button @click="togglePanel" class="icon-btn" title="关闭">
            <span>✖️</span>
          </button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="messages-container" ref="messagesContainer">
        <div v-if="aiStore.detectionMessages.length === 0" class="welcome-message">
          <div class="welcome-icon">👋</div>
          <h4>欢迎使用AI数据分析助手</h4>
          <p>我可以帮您分析IPv6数据，回答以下问题：</p>
          <ul class="suggestions">
            <li @click="sendSuggestion('中国的IPv6地址占全球的比例是多少？')">
              📊 中国的IPv6地址占全球的比例是多少？
            </li>
            <li @click="sendSuggestion('哪些国家的IPv6部署最活跃？')">
              🌍 哪些国家的IPv6部署最活跃？
            </li>
            <li @click="sendSuggestion('显示前10个ASN的IPv6地址分布')">
              📈 显示前10个ASN的IPv6地址分布
            </li>
            <li @click="sendSuggestion('分析当前选中国家的详细数据')">
              🔍 分析当前选中国家的详细数据
            </li>
          </ul>
        </div>

        <div 
          v-for="message in aiStore.detectionMessages" 
          :key="message.id"
          class="message"
          :class="{ 'user-message': message.role === 'user', 'ai-message': message.role === 'assistant' }"
        >
          <div class="message-avatar">
            <span v-if="message.role === 'user'">👤</span>
            <span v-else>🤖</span>
          </div>
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(message.content)"></div>
            <div v-if="message.data" class="message-data">
              <!-- 这里可以渲染图表或统计数据 -->
              <pre>{{ JSON.stringify(message.data, null, 2) }}</pre>
            </div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>
        </div>

        <div v-if="aiStore.detectionLoading" class="message ai-message">
          <div class="message-avatar">
            <span>🤖</span>
          </div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-container">
        <textarea
          v-model="inputMessage"
          @keydown.enter.prevent="handleSend"
          placeholder="输入您的问题..."
          rows="2"
          :disabled="aiStore.detectionLoading"
        ></textarea>
        <button 
          @click="handleSend" 
          class="send-btn"
          :disabled="!inputMessage.trim() || aiStore.detectionLoading"
        >
          <span v-if="!aiStore.detectionLoading">发送 ➤</span>
          <span v-else>发送中...</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useDetectionStore } from '@/stores/detection'

const aiStore = useAIStore()
const detectionStore = useDetectionStore()

// 面板显示状态
const isVisible = ref(false)
const inputMessage = ref('')
const messagesContainer = ref(null)

// 拖拽相关状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const btnPosition = ref({ x: window.innerWidth - 120, y: window.innerHeight - 120 })
const panelPosition = ref({ x: window.innerWidth - 420, y: 100 })

// 计算样式
const triggerBtnStyle = computed(() => ({
  left: `${btnPosition.value.x}px`,
  top: `${btnPosition.value.y}px`
}))

const panelStyle = computed(() => ({
  left: `${panelPosition.value.x}px`,
  top: `${panelPosition.value.y}px`
}))

// 切换面板显示
const togglePanel = () => {
  isVisible.value = !isVisible.value
  if (isVisible.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}

// 开始拖拽按钮
const startDrag = (e) => {
  if (e.button !== 0) return // 只响应左键
  isDragging.value = true
  dragStartX.value = e.clientX - btnPosition.value.x
  dragStartY.value = e.clientY - btnPosition.value.y

  const onMouseMove = (e) => {
    if (isDragging.value) {
      btnPosition.value = {
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStartX.value)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragStartY.value))
      }
    }
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 开始拖拽面板
const startPanelDrag = (e) => {
  if (e.button !== 0) return
  isDragging.value = true
  dragStartX.value = e.clientX - panelPosition.value.x
  dragStartY.value = e.clientY - panelPosition.value.y

  const onMouseMove = (e) => {
    if (isDragging.value) {
      panelPosition.value = {
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragStartX.value)),
        y: Math.max(0, Math.min(window.innerHeight - 500, e.clientY - dragStartY.value))
      }
    }
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 发送消息
const handleSend = async () => {
  if (!inputMessage.value.trim() || aiStore.detectionLoading) return

  const message = inputMessage.value.trim()
  inputMessage.value = ''

  // 获取当前页面上下文
  const context = {
    selectedCountry: detectionStore.selectedCountry,
    selectedAsn: detectionStore.selectedAsn,
    countries: detectionStore.countries.length,
    asns: detectionStore.asns.length
  }

  try {
    await aiStore.sendDetectionMessage(message, context)
    nextTick(() => {
      scrollToBottom()
    })
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}

// 发送建议问题
const sendSuggestion = (suggestion) => {
  inputMessage.value = suggestion
  handleSend()
}

// 清空历史
const clearHistory = () => {
  if (confirm('确定要清空对话历史吗？')) {
    aiStore.clearDetectionHistory()
  }
}

// 滚动到底部
const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 格式化消息内容（支持Markdown）
const formatMessage = (content) => {
  if (!content) return ''
  // 简单的Markdown格式化
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 监听消息变化，自动滚动
watch(() => aiStore.detectionMessages.length, () => {
  nextTick(() => {
    scrollToBottom()
  })
})
</script>

<style scoped lang="scss">
.ai-chat-wrapper {
  position: fixed;
  z-index: 9999;
}

.ai-trigger-btn {
  position: fixed;
  width: 100px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 25px;
  color: white;
  cursor: move;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  font-weight: 500;
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  }

  .ai-icon {
    font-size: 20px;
  }

  .ai-label {
    font-size: 14px;
  }
}

.ai-chat-panel {
  position: fixed;
  width: 400px;
  height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  user-select: none;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;

    .ai-icon {
      font-size: 24px;
    }

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ccc;
      
      &.online {
        background: #4ade80;
        box-shadow: 0 0 8px #4ade80;
      }
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;

    .icon-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 6px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      span {
        font-size: 14px;
      }
    }
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f9fafb;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;

    &:hover {
      background: #555;
    }
  }
}

.welcome-message {
  text-align: center;
  padding: 20px;

  .welcome-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  h4 {
    margin: 0 0 8px;
    color: #333;
    font-size: 18px;
  }

  p {
    color: #666;
    margin-bottom: 16px;
  }

  .suggestions {
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;

    li {
      background: white;
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid #e5e7eb;

      &:hover {
        background: #f3f4f6;
        border-color: #667eea;
        transform: translateX(4px);
      }
    }
  }
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;

  &.user-message {
    flex-direction: row-reverse;

    .message-content {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px 12px 4px 12px;
    }
  }

  &.ai-message {
    .message-content {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px 12px 12px 4px;
    }
  }

  .message-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .message-content {
    max-width: 70%;
    padding: 12px;

    .message-text {
      line-height: 1.6;
      word-wrap: break-word;
    }

    .message-data {
      margin-top: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
      font-size: 12px;
      overflow-x: auto;

      pre {
        margin: 0;
        white-space: pre-wrap;
      }
    }

    .message-time {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 4px;
    }
  }
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #667eea;
    animation: typing 1.4s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-10px);
    opacity: 1;
  }
}

.input-container {
  padding: 16px;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 8px;

  textarea {
    flex: 1;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px;
    font-size: 14px;
    resize: none;
    font-family: inherit;

    &:focus {
      outline: none;
      border-color: #667eea;
    }

    &:disabled {
      background: #f9fafb;
      cursor: not-allowed;
    }
  }

  .send-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0 20px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
