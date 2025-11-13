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

// 格式化消息内容
const formatMessage = (content) => {
  if (!content) return ''
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
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
  color: #666;
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
    background: #f1f1f1;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;

    &:hover {
      background: #555;
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
      border: 2px solid #e5e7eb;
      text-align: center;

      &:hover {
        border-color: #667eea;
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2);
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
    border: 1px solid #e5e7eb;

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
        border: 1px solid #e5e7eb;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;

        &:hover {
          background: #667eea;
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
      line-height: 1.6;
      word-wrap: break-word;

      code {
        background: rgba(0, 0, 0, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
      }

      pre {
        background: rgba(0, 0, 0, 0.05);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 10px 0;

        code {
          background: none;
          padding: 0;
        }
      }
    }

    .message-actions {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.1);

      h5 {
        margin: 0 0 12px;
        font-size: 14px;
        opacity: 0.8;
      }

      .action-item {
        background: rgba(0, 0, 0, 0.03);
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
          background: rgba(0, 0, 0, 0.05);
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
          background: #667eea;
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
  border-top: 1px solid #e5e7eb;
  padding: 16px;

  .input-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;

    .toolbar-btn {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 16px;

      &:hover {
        background: #e5e7eb;
      }
    }
  }

  .input-container {
    display: flex;
    gap: 12px;

    textarea {
      flex: 1;
      border: 2px solid #e5e7eb;
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
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
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
</style>
