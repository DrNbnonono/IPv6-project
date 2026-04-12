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
      ref="chatPanel"
    >
      <!-- 面板头部 -->
      <div class="panel-header" @mousedown.stop="startPanelDrag">
        <div class="header-left">
          <span class="ai-icon">🤖</span>
          <h3>IPv6知识问答助手</h3>
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
          <h4>欢迎使用IPv6知识问答助手</h4>
          <p>我可以回答IPv6相关的领域知识，尝试以下问题：</p>
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
              🔍 分析中国的IPv6部署情况
            </li>
          </ul>
        </div>

        <div 
          v-for="message in aiStore.detectionMessages" 
          :key="message.id"
          class="message"
          :class="{ 
            'user-message': message.role === 'user', 
            'ai-message': message.role === 'assistant',
            'error-message': message.error 
          }"
        >
          <div class="message-avatar">
            <span v-if="message.role === 'user'">👤</span>
            <span v-else>🤖</span>
          </div>
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(message.content)"></div>
            <div v-if="message.data && message.data.type && message.data.type !== 'text'" class="message-data">
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
          <span v-if="!aiStore.detectionLoading">发送</span>
          <span v-else>发送中...</span>
        </button>
      </div>

      <!-- 调整大小手柄 -->
      <div class="resize-handle resize-e" @mousedown="startResize($event, 'e')"></div>
      <div class="resize-handle resize-s" @mousedown="startResize($event, 's')"></div>
      <div class="resize-handle resize-w" @mousedown="startResize($event, 'w')"></div>
      <div class="resize-handle resize-n" @mousedown="startResize($event, 'n')"></div>
      <div class="resize-handle resize-se" @mousedown="startResize($event, 'se')"></div>
      <div class="resize-handle resize-sw" @mousedown="startResize($event, 'sw')"></div>
      <div class="resize-handle resize-ne" @mousedown="startResize($event, 'ne')"></div>
      <div class="resize-handle resize-nw" @mousedown="startResize($event, 'nw')"></div>
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
const chatPanel = ref(null)

// 拖拽相关状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const btnPosition = ref({ x: window.innerWidth - 120, y: window.innerHeight - 120 })
const panelPosition = ref({ x: window.innerWidth - 420, y: 100 })
const panelSize = ref({ width: 600, height: 720 })

// 计算样式
const triggerBtnStyle = computed(() => ({
  left: `${btnPosition.value.x}px`,
  top: `${btnPosition.value.y}px`
}))

const panelStyle = computed(() => ({
  left: `${panelPosition.value.x}px`,
  top: `${panelPosition.value.y}px`,
  width: `${panelSize.value.width}px`,
  height: `${panelSize.value.height}px`
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
        x: Math.max(0, Math.min(window.innerWidth - panelSize.value.width, e.clientX - dragStartX.value)),
        y: Math.max(0, Math.min(window.innerHeight - panelSize.value.height, e.clientY - dragStartY.value))
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

// 开始调整大小
const startResize = (e, direction) => {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true

  const startWidth = panelSize.value.width
  const startHeight = panelSize.value.height
  const startX = e.clientX
  const startY = e.clientY
  const startPosX = panelPosition.value.x
  const startPosY = panelPosition.value.y

  const onMouseMove = (e) => {
    if (!isDragging.value) return

    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    if (direction.includes('e')) {
      panelSize.value.width = Math.max(400, Math.min(window.innerWidth - startPosX - 20, startWidth + deltaX))
    }
    if (direction.includes('s')) {
      panelSize.value.height = Math.max(400, Math.min(window.innerHeight - startPosY - 20, startHeight + deltaY))
    }
    if (direction.includes('w')) {
      const newWidth = Math.max(400, startWidth - deltaX)
      const widthDiff = startWidth - newWidth
      panelSize.value.width = newWidth
      panelPosition.value.x = Math.max(0, startPosX + widthDiff)
    }
    if (direction.includes('n')) {
      const newHeight = Math.max(400, startHeight - deltaY)
      const heightDiff = startHeight - newHeight
      panelSize.value.height = newHeight
      panelPosition.value.y = Math.max(0, startPosY + heightDiff)
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

// Markdown渲染（支持表格、引用、列表等）
const formatMessage = (content) => {
  if (!content) return ''

  const codeBlocks = []
  const placeholderText = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length
    codeBlocks.push({ lang: lang || 'text', code })
    return `@@CODE_BLOCK_${index}@@`
  })

  const applyInline = (text) => {
    let safe = escapeHtml(text)
    // 支持链接 [text](url)
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>')
    safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    return safe
  }

  let html = ''
  let listType = null
  let listBuffer = []
  let tableBuffer = []
  let quoteBuffer = []

  const flushList = () => {
    if (!listType || !listBuffer.length) return
    html += `<${listType}>${listBuffer.map(item => `<li>${item}</li>`).join('')}</${listType}>`
    listType = null
    listBuffer = []
  }

  const flushQuote = () => {
    if (!quoteBuffer.length) return
    html += `<blockquote>${quoteBuffer.join('<br>')}</blockquote>`
    quoteBuffer = []
  }

  const flushTable = () => {
    if (!tableBuffer.length) return
    const rows = tableBuffer
      .map(row => row.split('|').map(cell => cell.trim()).filter(cell => cell !== ''))
      .filter(cells => cells.length)

    if (!rows.length) {
      tableBuffer = []
      return
    }

    const isDivider = (cells) => cells.every(cell => /^:?[-]{3,}:?$/.test(cell))
    let header = []
    let body = []

    if (rows.length > 1 && isDivider(rows[1])) {
      header = [rows[0]]
      body = rows.slice(2)
    } else {
      body = rows
    }

    const renderRow = (cells, tag) => `<tr>${cells.map(cell => `<${tag} style="border: 1px solid #94a3b8; padding: 8px 12px;">${applyInline(cell)}</${tag}>`).join('')}</tr>`

    html += '<table class="markdown-table" style="width: 100%; border-collapse: collapse; border: 2px solid #94a3b8; margin: 12px 0;">'
    if (header.length) {
      html += `<thead style="background: #e2e8f0;">${renderRow(header[0], 'th')}</thead>`
    }
    if (body.length) {
      html += `<tbody>${body.map(row => renderRow(row, 'td')).join('')}</tbody>`
    }
    html += '</table>'

    tableBuffer = []
  }

  placeholderText.split('\n').forEach(rawLine => {
    const line = rawLine.trim()

    if (!line) {
      flushList()
      flushQuote()
      flushTable()
      html += '<div class="message-gap"></div>'
      return
    }

    // 水平分隔线（---、***、___）
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList()
      flushQuote()
      flushTable()
      html += '<hr class="md-hr">'
      return
    }

    // 标题（支持 # / ## / ###）
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      flushList()
      flushQuote()
      flushTable()
      html += `<h${level + 1}>${applyInline(text)}</h${level + 1}>`
      return
    }

    if (/^\|.*\|$/.test(line)) {
      flushList()
      flushQuote()
      tableBuffer.push(line)
      return
    }
    flushTable()

    if (/^>\s?/.test(line)) {
      flushList()
      quoteBuffer.push(applyInline(line.replace(/^>\s?/, '')))
      return
    }
    flushQuote()

    if (/^(\*|-)\s+/.test(line)) {
      flushQuote()
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listBuffer.push(applyInline(line.replace(/^(\*|-)\s+/, '')))
      return
    }

    if (/^\d+\.\s+/.test(line)) {
      flushQuote()
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      listBuffer.push(applyInline(line.replace(/^\d+\.\s+/, '')))
      return
    }

    flushList()
    html += `<p>${applyInline(line)}</p>`
  })

  flushList()
  flushQuote()
  flushTable()

  let finalHtml = html
  codeBlocks.forEach((block, index) => {
    const replacement = `<pre class="code-block"><code class="language-${block.lang}">${escapeHtml(block.code.trim())}</code></pre>`
    finalHtml = finalHtml.replace(`@@CODE_BLOCK_${index}@@`, replacement)
  })

  return finalHtml
}

// HTML转义
const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
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
  width: 120px;
  height: 44px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  color: #ffffff;
  cursor: move;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 12px 30px rgba(102, 126, 234, 0.35);
  transition: transform 0.2s ease;
  font-weight: 500;
  letter-spacing: 0.01em;

  &:hover {
    transform: translateY(-2px);
  }

  .ai-icon {
    font-size: 18px;
  }

  .ai-label {
    font-size: 13px;
  }
}

.ai-chat-panel {
  position: fixed;
  background: #ffffff;
  border-radius: 18px;
  box-shadow: 0 30px 70px rgba(102, 126, 234, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(102, 126, 234, 0.24);
  min-width: 400px;
  min-height: 400px;
}

.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 10;

  &.resize-e {
    right: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  &.resize-s {
    left: 0;
    right: 0;
    bottom: 0;
    height: 8px;
    cursor: ns-resize;
  }

  &.resize-w {
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  &.resize-n {
    left: 0;
    right: 0;
    top: 0;
    height: 8px;
    cursor: ns-resize;
  }

  &.resize-se {
    right: 0;
    bottom: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
  }

  &.resize-sw {
    left: 0;
    bottom: 0;
    width: 16px;
    height: 16px;
    cursor: nesw-resize;
  }

  &.resize-ne {
    right: 0;
    top: 0;
    width: 16px;
    height: 16px;
    cursor: nesw-resize;
  }

  &.resize-nw {
    left: 0;
    top: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
  }
}

.panel-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
  padding: 12px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  user-select: none;
  box-shadow: 0 10px 24px rgba(102, 126, 234, 0.35);

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;

    .ai-icon {
      font-size: 24px;
    }

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
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
  padding: 18px 22px;
  background: #f7f9fc;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #e7eaf6;
  }

  &::-webkit-scrollbar-thumb {
    background: #8895e6;
    border-radius: 3px;

    &:hover {
      background: #6f7cd1;
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
      color: #000000;

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
      color: #ffffff;
      border-radius: 16px 16px 6px 16px;
    }
  }

  &.ai-message {
    .message-content {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px 16px 16px 6px;
    }
  }

  &.error-message {
    .message-content {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
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
      line-height: 1.7;
      word-wrap: break-word;
      color: #0f172a;
      font-size: 15px;
      padding: 0 8px; // 增加左右内边距

      h2, h3, h4 {
        margin: 8px 0 4px;
        font-weight: 600;
      }

      h2 { font-size: 16px; }
      h3 { font-size: 14px; }
      h4 { font-size: 13px; }

      ul,
      ol {
        margin: 10px 0 10px -8px; // 左侧负margin抵消padding
        padding-left: 32px; // 增加padding确保标号有空间
      }

      li {
        margin: 4px 0;
        line-height: 1.6;
        padding-left: 4px;
      }

      .code-block {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 12px;
        border-radius: 6px;
        margin: 8px 0;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.4;

        code {
          font-family: 'Consolas', 'Monaco', monospace;
        }
      }

      .inline-code {
        background: rgba(15, 23, 42, 0.08);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
      }

      strong {
        font-weight: 600;
      }

      em {
        font-style: italic;
      }

      a {
        color: #667eea;
        text-decoration: none;
        border-bottom: 1px solid #667eea;
        transition: all 0.2s;

        &:hover {
          color: #764ba2;
          border-bottom-color: #764ba2;
        }
      }

      blockquote {
        margin: 10px 0;
        border-left: 3px solid #94a3b8;
        padding-left: 12px;
        color: #475569;
        background: rgba(148, 163, 184, 0.1);
      }

      table,
      table.markdown-table {
        font-size: 13px;
      }

      th,
      td {
        text-align: left;
      }

      thead {
        font-weight: 600;
      }

      tbody tr:nth-child(even) {
        background: #f1f5f9;
      }

      hr.md-hr {
        border: none;
        border-top: 1px solid #e2e8f0;
        margin: 12px 0;
      }
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

.message-gap {
  height: 8px;
}

.input-container {
  padding: 18px 22px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
  position: relative;

  textarea {
    flex: 1;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 120px 12px 14px; // 右侧预留空间给固定位置的发送按钮
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
    min-width: 96px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    border: none;
    border-radius: 999px;
    font-weight: 500;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
    position: absolute;
    right: 22px;
    bottom: 22px;

    &:hover:not(:disabled) {
      opacity: 0.95;
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(102, 126, 234, 0.35);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

/* 用户消息文字在深色气泡中保持高对比度 */
.message.user-message .message-content .message-text {
  color: #ffffff;

  a {
    color: #ffffff;
    border-bottom-color: rgba(255, 255, 255, 0.5);

    &:hover {
      border-bottom-color: #ffffff;
    }
  }

  table,
  table.markdown-table {
    th, td {
      color: #ffffff;
    }

    tbody tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.08);
    }
  }
}
</style>
