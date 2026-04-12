import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useAgentStore = defineStore('agent', () => {
  // 状态
  const messages = ref([])
  const loading = ref(false)
  const error = ref(null)
  const currentTool = ref(null)
  const availableTools = ref([])
  const agentStatus = ref(null)
  const suggestions = ref([])

  // 欢迎消息
  const welcomeMessage = {
    id: 'welcome',
    role: 'assistant',
    type: 'welcome',
    content: `您好！我是ObserV6 Agent，您的IPv6网络探测智能助手。

我可以帮您：

🔍 **地址扫描** - 使用XMap检测IPv6地址活跃性
🌐 **服务探测** - 使用ZGrab2探测IPv6服务端口
📚 **知识问答** - 解答IPv6相关技术问题
⚙️ **工作流设计** - 根据需求生成探测工作流

请告诉我您需要什么帮助？`,
    timestamp: new Date().toISOString()
  }

  // 初始化消息
  const initMessages = () => {
    if (messages.value.length === 0) {
      messages.value.push({ ...welcomeMessage })
    }
  }

  // 发送消息
  const sendMessage = async (message, options = {}) => {
    loading.value = true
    error.value = null
    suggestions.value = []

    // 添加用户消息
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    messages.value.push(userMessage)

    try {
      // 调用Agent API
      const response = await api.agent.chat({
        message,
        history: messages.value.slice(-10).filter(m => m.role !== 'welcome').map(m => ({
          role: m.role,
          content: m.content
        })),
        ...options
      })

      // 添加AI响应
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message || response.content,
        type: response.type || 'text',
        toolCall: response.toolCall,
        suggestions: response.suggestions || [],
        timestamp: new Date().toISOString()
      }
      messages.value.push(aiMessage)

      // 更新当前工具
      if (response.toolCall) {
        currentTool.value = response.toolCall.tool
      }

      // 更新建议
      if (response.suggestions) {
        suggestions.value = response.suggestions
      }

      return aiMessage
    } catch (err) {
      console.error('Agent发送消息错误:', err)

      const errorMsg = err.response?.data?.message || err.message || '发送消息失败'
      error.value = errorMsg

      // 添加错误消息
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `抱歉，${errorMsg}`,
        error: true,
        timestamp: new Date().toISOString()
      }
      messages.value.push(errorMessage)

      return errorMessage
    } finally {
      loading.value = false
    }
  }

  // 获取可用工具列表
  const getTools = async () => {
    try {
      const response = await api.agent.getTools()
      availableTools.value = response.data?.tools || []
      return availableTools.value
    } catch (err) {
      console.error('获取工具列表错误:', err)
      error.value = err.message
      return []
    }
  }

  // 执行工具
  const executeTool = async (toolName, params) => {
    loading.value = true
    error.value = null

    try {
      const response = await api.agent.executeTool({
        toolName,
        params
      })

      // 添加工具执行结果消息
      const resultMessage = {
        id: Date.now(),
        role: 'assistant',
        type: 'tool_result',
        content: formatToolResult(toolName, response.data),
        toolName,
        result: response.data,
        timestamp: new Date().toISOString()
      }
      messages.value.push(resultMessage)

      return response.data
    } catch (err) {
      console.error('执行工具错误:', err)

      const errorMsg = err.response?.data?.message || err.message || '工具执行失败'
      error.value = errorMsg

      // 添加错误消息
      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `工具执行失败：${errorMsg}`,
        error: true,
        timestamp: new Date().toISOString()
      }
      messages.value.push(errorMessage)

      return null
    } finally {
      loading.value = false
    }
  }

  // 格式化工具结果
  const formatToolResult = (toolName, result) => {
    if (!result) return '执行完成'

    if (result.success) {
      return `✅ ${result.message || '执行成功'}\n\n\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\``
    } else {
      return `❌ 执行失败：${result.error || '未知错误'}`
    }
  }

  // 生成工作流
  const generateWorkflow = async (goal, constraints = '') => {
    loading.value = true
    error.value = null

    try {
      const response = await api.agent.generateWorkflow({
        goal,
        constraints
      })

      // 添加工作流生成结果
      const workflowMessage = {
        id: Date.now(),
        role: 'assistant',
        type: 'workflow',
        content: formatWorkflowResult(response),
        workflow: response.workflow,
        timestamp: new Date().toISOString()
      }
      messages.value.push(workflowMessage)

      return response.workflow
    } catch (err) {
      console.error('生成工作流错误:', err)

      const errorMsg = err.response?.data?.message || err.message || '工作流生成失败'
      error.value = errorMsg

      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `工作流生成失败：${errorMsg}`,
        error: true,
        timestamp: new Date().toISOString()
      }
      messages.value.push(errorMessage)

      return null
    } finally {
      loading.value = false
    }
  }

  // 格式化工作流结果
  const formatWorkflowResult = (response) => {
    if (!response.success) {
      return `❌ 工作流生成失败：${response.error || '未知错误'}`
    }

    let content = '✅ 工作流生成完成\n\n'

    if (response.workflow) {
      if (response.workflow.name) {
        content += `**${response.workflow.name}**\n`
      }
      if (response.workflow.description) {
        content += `${response.workflow.description}\n\n`
      }
      if (response.workflow.steps && Array.isArray(response.workflow.steps)) {
        content += '**执行步骤：**\n'
        response.workflow.steps.forEach((step, index) => {
          content += `${index + 1}. **${step.name}** (${step.tool})\n`
          content += `   - 说明: ${step.description || '无'}\n`
          if (step.params) {
            content += `   - 参数: \`${JSON.stringify(step.params)}\`\n`
          }
        })
      }
    }

    content += '\n是否需要我帮您执行这个工作流？'

    return content
  }

  // 获取Agent状态
  const getStatus = async () => {
    try {
      const response = await api.agent.getStatus()
      agentStatus.value = response.data
      return agentStatus.value
    } catch (err) {
      console.error('获取Agent状态错误:', err)
      return null
    }
  }

  // 清空对话历史
  const clearHistory = () => {
    messages.value = [{ ...welcomeMessage }]
    error.value = null
    suggestions.value = []
    currentTool.value = null
  }

  // 删除消息
  const deleteMessage = (messageId) => {
    const index = messages.value.findIndex(m => m.id === messageId)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }
  }

  return {
    // 状态
    messages,
    loading,
    error,
    currentTool,
    availableTools,
    agentStatus,
    suggestions,

    // 方法
    initMessages,
    sendMessage,
    getTools,
    executeTool,
    generateWorkflow,
    getStatus,
    clearHistory,
    deleteMessage,
    formatToolResult,
    formatWorkflowResult
  }
})
