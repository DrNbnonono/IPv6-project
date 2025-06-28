import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useZgrab2Store = defineStore('zgrab2', () => {
  const tasks = ref([])
  const currentTask = ref(null)
  const supportedModules = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const fetchTasks = async (params = {}) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getTasks(params)
      if (response && response.data) {
        tasks.value = response.data
        return response.data
      } else {
        tasks.value = []
        return []
      }
    } catch (err) {
      console.error('获取ZGrab2任务失败:', err)
      error.value = err
      tasks.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const fetchTaskDetails = async (taskId) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getTaskDetails(taskId)
      if (response && response.data) {
        currentTask.value = response.data
        return response.data
      } else {
        currentTask.value = null
        return null
      }
    } catch (err) {
      console.error('获取ZGrab2任务详情失败:', err)
      error.value = err
      currentTask.value = null
      return null
    } finally {
      isLoading.value = false
    }
  }

  const fetchSupportedModules = async () => {
    isLoading.value = true
    try {
      const response = await api.docs.getZgrab2Modules()
      if (response && response.modules) {
        supportedModules.value = response.modules
        return response.modules
      } else {
        supportedModules.value = []
        return []
      }
    } catch (err) {
      console.error('获取ZGrab2模块列表失败:', err)
      error.value = err
      supportedModules.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const createTask = async (params) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.createTask(params)
      if (response && response.taskId) {
        return response.taskId
      } else {
        throw new Error('创建任务失败')
      }
    } catch (err) {
      console.error('创建ZGrab2任务失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteTask = async (taskId) => {
    isLoading.value = true
    try {
      await api.zgrab2.deleteTask(taskId)
    } catch (err) {
      console.error('删除ZGrab2任务失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadResult = async (taskId) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.downloadResult(taskId)
      return response
    } catch (err) {
      console.error('下载ZGrab2结果失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadLog = async (taskId) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.downloadLog(taskId)
      return response
    } catch (err) {
      console.error('下载ZGrab2日志失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    tasks,
    currentTask,
    supportedModules,
    isLoading,
    error,
    fetchTasks,
    fetchTaskDetails,
    fetchSupportedModules,
    createTask,
    deleteTask,
    downloadResult,
    downloadLog
  }
})