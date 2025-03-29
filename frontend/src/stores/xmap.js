import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

export const useXmapStore = defineStore('xmap', () => {
  const tasks = ref([])
  const whitelists = ref([])
  const isLoading = ref(false)
  const currentTask = ref(null)
  const error = ref(null)
  const authStore = useAuthStore()
  const pagination = ref({
    page:1,
    perPage: 20,
    total: 0,
    totalPages: 1
  })

  
  // 双重验证
  if (!authStore.token) {
    console.error('中止请求：无有效token')
    throw new Error('认证无效')
  }

  const checkAuth = () => {
    if (!authStore.isAuthenticated) {
      throw new Error('请先登录后再进行操作')
    }
  }
  // 获取任务列表（支持状态过滤和分页）
  const fetchTasks = async (status = null, page = 1) => {
    isLoading.value = true
    error.value = null
    
    try {
      const params = { page }
      if (status) params.status = status
      
      const response = await axios.get('/api/xmap/tasks', { params })
      tasks.value = response.data.tasks
      pagination.value = response.data.pagination
    } catch (err) {
      error.value = err.response?.data?.message || '获取任务列表失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 开始扫描任务（支持所有XMap参数）
  const startScan = async (params) => {
    isLoading.value = true
    error.value = null
    checkAuth()
    try {
      const response = await axios.post('/api/xmap', params)
      await fetchTasks()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || '扫描任务启动失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 取消任务
  const cancelTask = async (taskId) => {
    try {
      await axios.post(`/api/xmap/cancel/${taskId}`)
      await fetchTasks()
    } catch (err) {
      error.value = err.response?.data?.message || '取消任务失败'
      throw err
    }
  }

  // 删除任务（添加确认对话框）
  const deleteTask = async (taskId) => {
    if (!confirm('确定要删除此任务吗？此操作将删除任务记录和相关文件，且不可恢复。')) {
      return
    }
    
    try {
      await axios.delete(`/api/xmap/${taskId}`)
      await fetchTasks(pagination.value.page)
    } catch (err) {
      error.value = err.response?.data?.message || '删除任务失败'
      throw err
    }
  }

  // 获取任务详情
  const getTaskDetails = async (taskId) => {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await axios.get(`/api/xmap/task/${taskId}`)
      currentTask.value = response.data.task
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || '获取任务详情失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 下载结果文件
  const downloadResult = async (taskId) => {
    try {
      const response = await axios.get(`/api/xmap/result/${taskId}`, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `xmap_result_${taskId}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      error.value = err.response?.data?.message || '下载结果失败'
      throw err
    }
  }

  // 下载日志文件
  const downloadLog = async (taskId) => {
    try {
      const response = await axios.get(`/api/xmap/log/${taskId}`, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `xmap_log_${taskId}.log`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      error.value = err.response?.data?.message || '下载日志失败'
      throw err
    }
  }

  // 上传白名单文件
  const uploadWhitelist = async (file) => {
    isLoading.value = true
    error.value = null
    
    try {
      const formData = new FormData()
      formData.append('whitelistFile', file)
      
      const response = await axios.post('/api/xmap/whitelist', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      await fetchWhitelists()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || '上传白名单失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取白名单列表
  const fetchWhitelists = async () => {
    try {
      const response = await axios.get('/api/xmap/whitelists')
      whitelists.value = response.data.whitelists
    } catch (err) {
      error.value = err.response?.data?.message || '获取白名单列表失败'
      throw err
    }
  }

  return {
    tasks,
    whitelists,
    currentTask,
    isLoading,
    error,
    pagination,
    fetchTasks,
    startScan,
    cancelTask,
    deleteTask,
    getTaskDetails,
    downloadResult,
    downloadLog,
    uploadWhitelist,
    fetchWhitelists
  }
})