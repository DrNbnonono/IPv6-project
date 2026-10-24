<template>
    <div class="chat-body">
      <div class="chat-controls">
        <div class="status">
          <span class="status-dot" :class="{ online: !aiStore.toolsLoading }"></span>
          <span class="status-text">{{ aiStore.toolsLoading ? '思考中' : '在线' }}</span>
        </div>
        <div class="control-buttons">
          <button @click="clearHistory" class="control-btn" title="清空对话">
            <span>🗑️</span>
          </button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="messages-container" ref="messagesContainer">
        <div v-if="aiStore.toolsMessages.length === 0" class="welcome-section">
          <div class="welcome-icon">🚀</div>
          <h4>欢迎使用AI探测助手</h4>
          <p>我可以帮您完成以下任务：</p>
          
          <div class="feature-grid">
            <div class="feature-card" @click="sendSuggestion('如何使用XMap扫描一个IPv6网段？')">
              <span class="feature-icon">📡</span>
              <h5>XMap扫描</h5>
              <p>生成扫描命令和配置</p>
            </div>
            <div class="feature-card" @click="sendSuggestion('帮我创建一个完整的探测工作流')">
              <span class="feature-icon">🔗</span>
              <h5>工作流设计</h5>
              <p>自动化探测流程</p>
            </div>
            <div class="feature-card" @click="sendSuggestion('分析Zgrab2扫描结果')">
              <span class="feature-icon">📊</span>
              <h5>结果分析</h5>
              <p>智能解析扫描数据</p>
            </div>
            <div class="feature-card" @click="sendSuggestion('推荐最佳的探测策略')">
              <span class="feature-icon">💡</span>
              <h5>策略建议</h5>
              <p>优化探测方案</p>
            </div>
          </div>

          <div class="quick-actions">
            <h5>快速操作</h5>
            <div class="action-buttons">
              <button @click="sendSuggestion('列出所有可用的探测工具')" class="action-btn">
                🛠️ 可用工具
              </button>
              <button @click="sendSuggestion('查看最近的扫描任务')" class="action-btn">
                📋 最近任务
              </button>
              <button @click="sendSuggestion('生成IPv6地址列表')" class="action-btn">
                🌐 生成地址
              </button>
            </div>
          </div>
        </div>

        <div 
          v-for="message in aiStore.toolsMessages" 
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
            
            <!-- 显示AI建议的操作 -->
            <div v-if="message.actions && message.actions.length" class="message-actions">
              <h5>建议操作：</h5>
              <div 
                v-for="(action, index) in message.actions" 
                :key="index"
                class="action-item"
              >
                <div class="action-header">
                  <span class="action-icon">{{ getActionIcon(action.type) }}</span>
                  <span class="action-type">{{ action.tool || action.type }}</span>
                </div>
                <div class="action-command" v-if="action.command">
                  <code>{{ action.command }}</code>
                  <button @click="copyToClipboard(action.command)" class="copy-btn" title="复制命令">
                    📋
                  </button>
                </div>
                <button 
                  v-if="action.type === 'command'" 
                  @click="executeAction(action)" 
                  class="execute-btn"
                >
                  执行此操作
                </button>
              </div>
            </div>

            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>
        </div>

        <div v-if="aiStore.toolsLoading" class="message ai-message">
          <div class="message-avatar">
            <span>🤖</span>
          </div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p class="loading-text">正在分析您的请求...</p>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-section">
        <div class="input-toolbar">
          <button @click="attachFile" class="toolbar-btn" title="附加文件">
            📎
          </button>
          <button @click="showTemplates" class="toolbar-btn" title="使用模板">
            📋
          </button>
          <button @click="showHistory" class="toolbar-btn" title="历史记录">
            🕐
          </button>
        </div>
        <div class="input-container">
          <textarea
            v-model="inputMessage"
            @keydown.enter.prevent="handleSend"
            placeholder="描述您的探测需求，AI将为您提供专业建议..."
            rows="3"
            :disabled="aiStore.toolsLoading"
          ></textarea>
          <button 
            @click="handleSend" 
            class="send-btn"
            :disabled="!inputMessage.trim() || aiStore.toolsLoading"
          >
            <span v-if="!aiStore.toolsLoading">
              <span class="send-icon">➤</span>
              发送
            </span>
            <span v-else>
              <span class="loading-spinner">⏳</span>
              处理中
            </span>
          </button>
        </div>
      </div>
    </div>
 
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useRouter } from 'vue-router'

const aiStore = useAIStore()
const router = useRouter()

// 组件状态
const inputMessage = ref('')
const messagesContainer = ref(null)

// 发送消息
const handleSend = async () => {
  if (!inputMessage.value.trim() || aiStore.toolsLoading) return

  const message = inputMessage.value.trim()
  inputMessage.value = ''

  // 获取当前工具上下文
  const context = {
    currentRoute: router.currentRoute.value.name,
    currentTool: router.currentRoute.value.path.split('/')[2] || 'tools',
    timestamp: new Date().toISOString()
  }

  try {
    await aiStore.sendToolsMessage(message, context)
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
    aiStore.clearToolsHistory()
  }
}

// 滚动到底部
const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 格式化消息内容 - 完整Markdown支持
const formatMessage = (content) => {
  if (!content) return ''

  const codeBlocks = []
  const placeholderText = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length
    codeBlocks.push({ lang: lang || 'text', code })
    return `@@CODE_BLOCK_${index}@@`
  })

  const applyInline = (text) => {
    const div = document.createElement('div')
    div.textContent = text
    let safe = div.innerHTML
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

    const renderRow = (cells, tag) => `<tr>${cells.map(cell => `<${tag}>${applyInline(cell)}</${tag}>`).join('')}</tr>`

    html += '<table class="markdown-table">'
    if (header.length) {
      html += `<thead>${renderRow(header[0], 'th')}</thead>`
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

    // 水平分隔线
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList()
      flushQuote()
      flushTable()
      html += '<hr class="md-hr">'
      return
    }

    // 标题
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

    // 表格
    if (/^\|.*\|$/.test(line)) {
      flushList()
      flushQuote()
      tableBuffer.push(line)
      return
    }
    flushTable()

    // 引用
    if (/^>\s?/.test(line)) {
      flushList()
      quoteBuffer.push(applyInline(line.replace(/^>\s?/, '')))
      return
    }
    flushQuote()

    // 无序列表
    if (/^(\*|-)\s+/.test(line)) {
      flushQuote()
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listBuffer.push(applyInline(line.replace(/^(\*|-)\s+/, '')))
      return
    }

    // 有序列表
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
    const div = document.createElement('div')
    div.textContent = block.code.trim()
    const escapedCode = div.innerHTML
    const replacement = `<pre class="code-block"><code class="language-${block.lang}">${escapedCode}</code></pre>`
    finalHtml = finalHtml.replace(`@@CODE_BLOCK_${index}@@`, replacement)
  })

  return finalHtml
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 获取操作图标
const getActionIcon = (type) => {
  const icons = {
    command: '⚡',
    workflow: '🔗',
    scan: '📡',
    analyze: '📊',
    default: '💡'
  }
  return icons[type] || icons.default
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    alert('命令已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
  }
}

// 执行操作
const executeAction = (action) => {
  console.log('执行操作:', action)
  // TODO: 实现具体的操作执行逻辑
  alert(`即将执行: ${action.command}\n\n此功能需要后端支持`)
}

// 附加文件
const attachFile = () => {
  alert('文件附加功能开发中...')
}

// 显示模板
const showTemplates = () => {
  alert('模板功能开发中...')
}

// 显示历史
const showHistory = () => {
  alert('历史记录功能开发中...')
}

// 监听消息变化
watch(() => aiStore.toolsMessages.length, () => {
  nextTick(() => {
    scrollToBottom()
  })
})

onMounted(() => {
  scrollToBottom()
})
</script>

<style scoped lang="scss">
// AI 探测助手：浅色聊天卡片，使用 styles/tokens.css 里的设计变量

.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  min-height: 560px;
  background: var(--ov-surface);
  border: 1px solid var(--ov-border);
  border-radius: 16px;
  box-shadow: var(--ov-shadow-lg);
  box-sizing: border-box;
  overflow: hidden;
}

.chat-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--ov-surface-2);
  border-bottom: 1px solid var(--ov-border);
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ov-ink-dim);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ov-warning);
  transition: background 0.3s ease, box-shadow 0.3s ease;

  &.online {
    background: var(--ov-success);
    box-shadow: 0 0 0 4px rgb(16 185 129 / 0.18);
  }
}

.control-buttons {
  display: flex;
  gap: 8px;
}

.control-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ov-surface);
  border: 1px solid var(--ov-border);
  border-radius: var(--ov-radius-sm);
  cursor: pointer;
  font-size: 15px;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:hover {
    border-color: var(--ov-accent);
    background: var(--ov-accent-soft);
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: calc(100vh - 430px);
  min-height: 320px;
  scroll-behavior: smooth;
}

// 欢迎页
.welcome-section {
  text-align: center;
  padding: 12px 0 4px;

  .welcome-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 14px;
    display: grid;
    place-items: center;
    font-size: 30px;
    border-radius: 18px;
    background: var(--ov-accent-gradient);
    box-shadow: 0 10px 24px rgb(var(--ov-accent-rgb) / 0.35);
  }

  h4 {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 700;
    color: var(--ov-ink);
  }

  > p {
    margin: 0 0 20px;
    font-size: 14px;
    color: var(--ov-ink-dim);
  }
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  text-align: left;
}

.feature-card {
  display: grid;
  grid-template-columns: 40px 1fr;
  grid-template-areas: 'icon title' 'icon desc';
  column-gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: var(--ov-surface);
  border: 1px solid var(--ov-border);
  border-radius: var(--ov-radius);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

  &:hover {
    border-color: var(--ov-accent);
    box-shadow: 0 6px 18px rgb(var(--ov-accent-rgb) / 0.16);
    transform: translateY(-1px);
  }

  .feature-icon {
    grid-area: icon;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    font-size: 20px;
    border-radius: 10px;
    background: var(--ov-accent-soft);
  }

  h5 {
    grid-area: title;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ov-ink);
  }

  p {
    grid-area: desc;
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--ov-ink-dim);
  }
}

.quick-actions {
  margin-top: 22px;

  h5 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--ov-ink-faint);
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .action-btn {
    padding: 7px 14px;
    font-size: 13px;
    color: var(--ov-ink);
    background: var(--ov-surface-2);
    border: 1px solid var(--ov-border);
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      color: var(--ov-accent-2);
      border-color: var(--ov-accent);
      background: var(--ov-accent-soft);
    }
  }
}

// 消息
.message {
  display: flex;
  gap: 12px;
  max-width: 100%;

  .message-avatar {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    font-size: 17px;
    border-radius: 50%;
    background: var(--ov-surface-2);
    border: 1px solid var(--ov-border);
  }

  .message-content {
    min-width: 0;
    max-width: min(760px, calc(100% - 48px));
    padding: 12px 16px;
    border-radius: 4px var(--ov-radius) var(--ov-radius) var(--ov-radius);
    background: var(--ov-surface-2);
    border: 1px solid var(--ov-border);
    color: var(--ov-ink);
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .message-time {
    margin-top: 6px;
    font-size: 11px;
    color: var(--ov-ink-faint);
  }

  &.user-message {
    flex-direction: row-reverse;

    .message-avatar {
      background: var(--ov-accent-gradient);
      border-color: transparent;
    }

    .message-content {
      border-radius: var(--ov-radius) 4px var(--ov-radius) var(--ov-radius);
      background: var(--ov-accent-gradient);
      border-color: transparent;
      color: #fff;
    }

    .message-time {
      color: rgb(255 255 255 / 0.7);
      text-align: right;
    }
  }
}

// 助手回复里的 Markdown（v-html 生成的节点不带 scoped 标记，所以用 :deep）
.message-text {
  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 14px 0 6px;
    font-weight: 600;
    line-height: 1.4;
  }
  :deep(h1) { font-size: 18px; }
  :deep(h2) { font-size: 16px; }
  :deep(h3) { font-size: 15px; }
  :deep(h4) { font-size: 14px; }
  :deep(p) { margin: 8px 0; }
  :deep(> :first-child) { margin-top: 0; }
  :deep(ul), :deep(ol) { margin: 8px 0; padding-left: 22px; }
  :deep(li) { margin: 3px 0; }
  :deep(hr), :deep(hr.md-hr) { border: none; border-top: 1px solid var(--ov-border); margin: 12px 0; }
  :deep(a) {
    color: var(--ov-accent-2);
    text-decoration: none;
    border-bottom: 1px solid rgb(37 99 235 / 0.35);
    &:hover { border-bottom-color: var(--ov-accent-2); }
  }
  :deep(blockquote) {
    margin: 10px 0;
    padding: 6px 12px;
    color: var(--ov-ink-dim);
    background: var(--ov-surface);
    border-left: 3px solid var(--ov-accent);
    border-radius: 0 var(--ov-radius-sm) var(--ov-radius-sm) 0;
  }
  :deep(.inline-code) {
    padding: 1px 6px;
    font-family: var(--ov-mono);
    font-size: 12.5px;
    color: var(--ov-accent-2);
    background: var(--ov-accent-soft);
    border-radius: 5px;
  }
  :deep(.code-block) {
    margin: 10px 0;
    padding: 14px 16px;
    overflow-x: auto;
    font-family: var(--ov-mono);
    font-size: 12.5px;
    line-height: 1.6;
    color: #d6e4f0;
    background: var(--ov-bg-panel);
    border: 1px solid var(--ov-line);
    border-radius: var(--ov-radius-sm);
    code { font-family: inherit; }
  }
  :deep(.markdown-table) {
    display: block;
    width: 100%;
    margin: 10px 0;
    overflow-x: auto;
    border-collapse: collapse;
    font-size: 13px;
    th, td {
      padding: 7px 12px;
      text-align: left;
      border: 1px solid var(--ov-border);
    }
    thead { background: var(--ov-surface); font-weight: 600; }
    tbody tr:nth-child(even) { background: rgb(15 23 42 / 0.03); }
  }
  :deep(.message-gap) { height: 6px; }
}

.user-message .message-text {
  :deep(a) { color: #fff; border-bottom-color: rgb(255 255 255 / 0.5); }
  :deep(.inline-code) { color: #fff; background: rgb(255 255 255 / 0.2); }
}

// 助手建议的操作
.message-actions {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--ov-border);

  h5 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ov-ink-dim);
  }

  .action-item {
    margin-bottom: 8px;
    padding: 10px 12px;
    background: var(--ov-surface);
    border: 1px solid var(--ov-border);
    border-radius: var(--ov-radius-sm);
  }

  .action-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ov-ink);
  }

  .action-command {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--ov-bg-panel);
    border-radius: 6px;

    code {
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      white-space: nowrap;
      font-family: var(--ov-mono);
      font-size: 12px;
      color: #d6e4f0;
    }
  }

  .copy-btn {
    flex: none;
    padding: 2px 6px;
    background: transparent;
    border: 1px solid var(--ov-line);
    border-radius: 6px;
    cursor: pointer;
    opacity: 0.8;
    &:hover { opacity: 1; background: rgb(255 255 255 / 0.08); }
  }

  .execute-btn {
    margin-top: 8px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--ov-accent-gradient);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    &:hover { box-shadow: 0 6px 16px rgb(var(--ov-accent-rgb) / 0.35); transform: translateY(-1px); }
  }
}

// 思考中
.typing-indicator {
  display: flex;
  gap: 5px;
  padding: 6px 0 2px;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ov-accent);
    animation: bounce 1.2s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}

.loading-text {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ov-ink-faint);
}

@keyframes bounce {
  0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-4px); }
}

// 输入区
.input-section {
  padding: 12px 20px 16px;
  background: var(--ov-surface);
  border-top: 1px solid var(--ov-border);

  .input-toolbar {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .toolbar-btn {
    width: 30px;
    height: 30px;
    font-size: 14px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s ease;
    &:hover { background: var(--ov-surface-2); border-color: var(--ov-border); }
  }

  .input-container {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    background: var(--ov-surface-2);
    border: 1px solid var(--ov-border);
    border-radius: var(--ov-radius);
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;

    &:focus-within {
      background: var(--ov-surface);
      border-color: var(--ov-accent);
      box-shadow: 0 0 0 3px rgb(var(--ov-accent-rgb) / 0.16);
    }

    textarea {
      flex: 1;
      min-height: 44px;
      max-height: 160px;
      padding: 6px 0;
      font: inherit;
      font-size: 14px;
      line-height: 1.6;
      color: var(--ov-ink);
      background: transparent;
      border: none;
      outline: none;
      resize: none;

      &::placeholder { color: var(--ov-ink-faint); }
    }
  }

  .send-btn {
    flex: none;
    height: 40px;
    padding: 0 18px;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: var(--ov-accent-gradient);
    border: none;
    border-radius: var(--ov-radius-sm);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease, opacity 0.2s ease;

    &:hover:not(:disabled) { box-shadow: 0 8px 18px rgb(var(--ov-accent-rgb) / 0.38); transform: translateY(-1px); }
    &:disabled { opacity: 0.45; cursor: not-allowed; }

    .send-icon { margin-right: 4px; font-size: 12px; }
    .loading-spinner { margin-right: 4px; }
  }
}

@media (max-width: 720px) {
  .chat-body { border-radius: 0; border-left: none; border-right: none; }
  .feature-grid { grid-template-columns: 1fr; }
  .messages-container { padding: 16px; max-height: none; }
  .message .message-content { max-width: calc(100% - 46px); }
}
</style>
