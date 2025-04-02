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
      tasks.value = response.data
      return response.data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchTaskDetails = async (taskId) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getTaskDetails(taskId)
      currentTask.value = response.data
      return response.data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchSupportedModules = async () => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getSupportedModules()
      supportedModules.value = response.data
      return response.data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createTask = async (params) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.createTask(params)
      return response.data.id
    } catch (err) {
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
      return response.data
    } catch (err) {
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
      return response.data
    } catch (err) {
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