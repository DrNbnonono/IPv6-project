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

.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 18px 45px rgba(102, 126, 234, 0.12);
  background: linear-gradient(160deg, rgba(102, 126, 234, 0.12), rgba(118, 75, 162, 0.08));
  border: 1px solid rgba(102, 126, 234, 0.16);
  margin: 0px 64px; /* 添加左右外边距 */
  box-sizing: border-box;
  overflow: hidden;
}

.chat-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px 0;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #6b76c9;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ccc;
  box-shadow: 0 0 0 rgba(74, 222, 128, 0.3);
  transition: all 0.3s ease;

  &.online {
    background: #4ade80;
    box-shadow: 0 0 12px rgba(74, 222, 128, 0.6);
  }
}

.control-buttons {
  display: flex;
  gap: 12px;
}

.control-btn {
  background: rgba(102, 126, 234, 0.1);
  border: none;
  border-radius: 12px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;

  &:hover {
    background: rgba(102, 126, 234, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.2);
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #f7f9fc;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #e7eaf6;
  }

  &::-webkit-scrollbar-thumb {
    background: #8895e6;
    border-radius: 4px;

    &:hover {
      background: #6f7cd1;
    }
  }
}

.welcome-section {
  text-align: center;
  padding: 20px;

  .welcome-icon {
    font-size: 64px;
    margin-bottom: 20px;
  }

  h4 {
    margin: 0 0 10px;
    color: #333;
    font-size: 24px;
  }

  p {
    color: #666;
    margin-bottom: 30px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 30px;

    .feature-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s;
      border: 2px solid rgba(102, 126, 234, 0.24);
      text-align: center;

      &:hover {
        border-color: #667eea;
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
      }

      .feature-icon {
        font-size: 32px;
        display: block;
        margin-bottom: 12px;
      }

      h5 {
        margin: 0 0 8px;
        color: #333;
        font-size: 16px;
      }

      p {
        margin: 0;
        color: #666;
        font-size: 13px;
      }
    }
  }

  .quick-actions {
    text-align: left;
    background: white;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid rgba(102, 126, 234, 0.24);

    h5 {
      margin: 0 0 15px;
      color: #333;
      font-size: 16px;
    }

    .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;

      .action-btn {
        background: #f3f4f6;
        border: 1px solid rgba(102, 126, 234, 0.24);
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;

        &:hover {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-color: #667eea;
        }
      }
    }
  }
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;

  &.user-message {
    flex-direction: row-reverse;

    .message-content {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 16px 16px 4px 16px;
    }
  }

  &.ai-message {
    .message-content {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px 16px 16px 4px;
    }
  }

  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    flex-shrink: 0;
  }

    .message-content {
      max-width: 75%;
      padding: 16px;

      .message-text {
        line-height: 1.7;
        word-wrap: break-word;
        color: #0f172a;
        font-size: 15px;
        padding: 0 8px; // 增加左右内边距，防止内容贴边

        h2, h3, h4 {
          margin: 8px 0 4px;
          font-weight: 600;
        }

        h2 { font-size: 16px; }
        h3 { font-size: 14px; }
        h4 { font-size: 13px; }

        p {
          margin: 8px 0;
        }

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

        hr.md-hr, hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 12px 0;
        }

        .inline-code {
          background: rgba(0, 0, 0, 0.08);
        padding: 2px 6px;
        border-radius: 4px;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
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
    }

    .message-actions {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(102, 126, 234, 0.24);

      h5 {
        margin: 0 0 12px;
        font-size: 14px;
        opacity: 0.8;
      }

      .action-item {
        background: rgba(102, 126, 234, 0.06);
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 10px;

        .action-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-weight: 500;

          .action-icon {
            font-size: 18px;
          }
        }

        .action-command {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(102, 126, 234, 0.08);
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 8px;

          code {
            flex: 1;
            font-family: 'Courier New', monospace;
            font-size: 13px;
          }

          .copy-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            opacity: 0.6;
            transition: opacity 0.2s;

            &:hover {
              opacity: 1;
            }
          }
        }

        .execute-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;

          &:hover {
            background: #5568d3;
            transform: translateY(-1px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.35);
          }
        }
      }
    }

    .message-time {
      font-size: 11px;
      opacity: 0.5;
      margin-top: 8px;
    }
  }
}

.typing-indicator {
  display: flex;
  gap: 6px;
  padding: 10px 0;

  span {
    width: 10px;
    height: 10px;
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

.loading-text {
  margin: 8px 0 0;
  font-size: 13px;
  opacity: 0.7;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-12px);
    opacity: 1;
  }
}

.input-section {
  background: white;
  border-top: 1px solid rgba(102, 126, 234, 0.24);
  padding: 16px;

  .input-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;

    .toolbar-btn {
      background: #f3f4f6;
      border: 1px solid rgba(102, 126, 234, 0.24);
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 16px;

      &:hover {
        background: #e7eaf6;
      }
    }
  }

  .input-container {
    display: flex;
    gap: 12px;

    textarea {
      flex: 1;
      border: 2px solid rgba(102, 126, 234, 0.24);
      border-radius: 12px;
      padding: 12px;
      font-size: 14px;
      resize: none;
      font-family: inherit;
      transition: border-color 0.2s;

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
      border-radius: 12px;
      padding: 0 24px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 100px;
      justify-content: center;

      .send-icon {
        font-size: 18px;
      }

      .loading-spinner {
        animation: spin 1s linear infinite;
      }

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(102, 126, 234, 0.35);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
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

.message-gap {
  height: 8px;
}
</style>
