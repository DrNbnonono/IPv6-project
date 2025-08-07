import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useWorkflowStore = defineStore('workflow', () => {
  // 状态
  const workflows = ref([])
  const currentWorkflow = ref(null)
  const executions = ref([])
  const currentExecution = ref(null)
  const nodeTypes = ref({})
  const templates = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const pagination = ref({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  })

  // 计算属性
  const activeWorkflows = computed(() => 
    workflows.value.filter(w => w.status === 'active')
  )

  const draftWorkflows = computed(() => 
    workflows.value.filter(w => w.status === 'draft')
  )

  // 获取工作流列表
  const fetchWorkflows = async (params = {}) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.getWorkflows(params)
      if (response.success) {
        workflows.value = response.data.workflows
        pagination.value = response.data.pagination
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取工作流列表失败'
      console.error('获取工作流列表失败:', err)
    } finally {
      isLoading.value = false
    }
  }

  // 创建工作流
  const createWorkflow = async (workflowData) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.createWorkflow(workflowData)
      if (response.success) {
        await fetchWorkflows() // 刷新列表
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '创建工作流失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取工作流详情
  const fetchWorkflowById = async (id) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.getWorkflowById(id)
      if (response.success) {
        currentWorkflow.value = response.data
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取工作流详情失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 更新工作流
  const updateWorkflow = async (id, workflowData) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.updateWorkflow(id, workflowData)
      if (response.success) {
        await fetchWorkflows() // 刷新列表
        if (currentWorkflow.value && currentWorkflow.value.id === id) {
          await fetchWorkflowById(id) // 刷新当前工作流
        }
        return response
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '更新工作流失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 删除工作流
  const deleteWorkflow = async (id) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.deleteWorkflow(id)
      if (response.success) {
        await fetchWorkflows() // 刷新列表
        if (currentWorkflow.value && currentWorkflow.value.id === id) {
          currentWorkflow.value = null
        }
        return response
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '删除工作流失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 执行工作流
  const executeWorkflow = async (id, executionData) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.executeWorkflow(id, executionData)
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '执行工作流失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取执行历史
  const fetchExecutions = async (workflowId, params = {}) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.getExecutions(workflowId, params)
      if (response.success) {
        executions.value = response.data.executions
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取执行历史失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取执行详情
  const fetchExecutionDetails = async (executionId) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.workflows.getExecutionDetails(executionId)
      if (response.success) {
        currentExecution.value = response.data
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取执行详情失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 取消执行
  const cancelExecution = async (executionId) => {
    try {
      const response = await api.workflows.cancelExecution(executionId)
      if (response.success) {
        // 刷新执行详情
        if (currentExecution.value && currentExecution.value.id === executionId) {
          await fetchExecutionDetails(executionId)
        }
        return response
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '取消执行失败'
      throw err
    }
  }

  // 暂停执行
  const pauseExecution = async (executionId) => {
    try {
      const response = await api.workflows.pauseExecution(executionId)
      if (response.success) {
        if (currentExecution.value && currentExecution.value.id === executionId) {
          await fetchExecutionDetails(executionId)
        }
        return response
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '暂停执行失败'
      throw err
    }
  }

  // 恢复执行
  const resumeExecution = async (executionId) => {
    try {
      const response = await api.workflows.resumeExecution(executionId)
      if (response.success) {
        if (currentExecution.value && currentExecution.value.id === executionId) {
          await fetchExecutionDetails(executionId)
        }
        return response
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '恢复执行失败'
      throw err
    }
  }

  // 获取节点类型
  const fetchNodeTypes = async () => {
    try {
      const response = await api.workflows.getNodeTypes()
      if (response.success) {
        nodeTypes.value = response.data
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取节点类型失败'
      throw err
    }
  }

  // 获取工作流模板
  const fetchTemplates = async () => {
    try {
      const response = await api.workflows.getTemplates()
      if (response.success) {
        templates.value = response.data
        return response.data
      } else {
        throw new Error(response.message)
      }
    } catch (err) {
      error.value = err.message || '获取工作流模板失败'
      throw err
    }
  }

  // 清除当前工作流
  const clearCurrentWorkflow = () => {
    currentWorkflow.value = null
  }

  // 清除当前执行
  const clearCurrentExecution = () => {
    currentExecution.value = null
  }

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  return {
    // 状态
    workflows,
    currentWorkflow,
    executions,
    currentExecution,
    nodeTypes,
    templates,
    isLoading,
    error,
    pagination,
    
    // 计算属性
    activeWorkflows,
    draftWorkflows,
    
    // 方法
    fetchWorkflows,
    createWorkflow,
    fetchWorkflowById,
    updateWorkflow,
    deleteWorkflow,
    executeWorkflow,
    fetchExecutions,
    fetchExecutionDetails,
    cancelExecution,
    pauseExecution,
    resumeExecution,
    fetchNodeTypes,
    fetchTemplates,
    clearCurrentWorkflow,
    clearCurrentExecution,
    clearError
  }
})
