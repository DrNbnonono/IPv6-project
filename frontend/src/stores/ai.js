import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useAIStore = defineStore('ai', () => {
  // Detection AI 状态
  const detectionMessages = ref([])
  const detectionLoading = ref(false)
  const detectionError = ref(null)

  // Tools AI 状态
  const toolsMessages = ref([])
  const toolsLoading = ref(false)
  const toolsError = ref(null)

  // Detection AI: 数据分析助手
  const sendDetectionMessage = async (message, context = {}) => {
    detectionLoading.value = true
    detectionError.value = null

    // 添加用户消息
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    detectionMessages.value.push(userMessage)

    try {
      // TODO: 后端实现后替换为真实API调用
      const response = await api.ai.detectionChat({
        message,
        context,
        history: detectionMessages.value.slice(-10) // 发送最近10条消息作为上下文
      })

      // 添加AI响应
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message || response.content,
        data: response.data, // 可能包含图表数据、统计数据等
        timestamp: new Date().toISOString()
      }
      detectionMessages.value.push(aiMessage)

      return aiMessage
    } catch (error) {
      console.error('Detection AI 错误:', error)
      detectionError.value = error.message || '发送消息失败'
      
      // 添加错误消息
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '抱歉，我遇到了一些问题。请稍后再试。',
        error: true,
        timestamp: new Date().toISOString()
      }
      detectionMessages.value.push(errorMessage)
      
      throw error
    } finally {
      detectionLoading.value = false
    }
  }

  // Tools AI: 探测助手（集成LangChain/MCP）
  const sendToolsMessage = async (message, context = {}) => {
    toolsLoading.value = true
    toolsError.value = null

    // 添加用户消息
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    toolsMessages.value.push(userMessage)

    try {
      // TODO: 后端实现后替换为真实API调用
      const response = await api.ai.toolsChat({
        message,
        context,
        history: toolsMessages.value.slice(-10)
      })

      // 添加AI响应
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.message || response.content,
        actions: response.actions, // 可能包含建议的探测命令、工作流等
        timestamp: new Date().toISOString()
      }
      toolsMessages.value.push(aiMessage)

      return aiMessage
    } catch (error) {
      console.error('Tools AI 错误:', error)
      toolsError.value = error.message || '发送消息失败'
      
      // 添加错误消息
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '抱歉，我遇到了一些问题。请稍后再试。',
        error: true,
        timestamp: new Date().toISOString()
      }
      toolsMessages.value.push(errorMessage)
      
      throw error
    } finally {
      toolsLoading.value = false
    }
  }

  // 清空Detection对话历史
  const clearDetectionHistory = () => {
    detectionMessages.value = []
    detectionError.value = null
  }

  // 清空Tools对话历史
  const clearToolsHistory = () => {
    toolsMessages.value = []
    toolsError.value = null
  }

  // 删除特定消息
  const deleteDetectionMessage = (messageId) => {
    const index = detectionMessages.value.findIndex(m => m.id === messageId)
    if (index !== -1) {
      detectionMessages.value.splice(index, 1)
    }
  }

  const deleteToolsMessage = (messageId) => {
    const index = toolsMessages.value.findIndex(m => m.id === messageId)
    if (index !== -1) {
      toolsMessages.value.splice(index, 1)
    }
  }

  return {
    // Detection AI
    detectionMessages,
    detectionLoading,
    detectionError,
    sendDetectionMessage,
    clearDetectionHistory,
    deleteDetectionMessage,

    // Tools AI
    toolsMessages,
    toolsLoading,
    toolsError,
    sendToolsMessage,
    clearToolsHistory,
    deleteToolsMessage
  }
})
