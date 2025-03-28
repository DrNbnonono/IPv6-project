import { defineStore } from 'pinia'
import { ref } from 'vue'
import xmapApi from '@/api/xmapApi'

export const useXmapStore = defineStore('xmap', () => {
    const tasks = ref([])
    const isScanning = ref(false)
    const whitelists = ref([])
    
    // 获取任务列表
    const fetchTasks = async () => {
      try {
        const response = await xmapApi.getTasks()
        tasks.value = response.data.tasks
      } catch (error) {
        console.error('获取任务列表失败:', error)
      }
    }
    
    // 获取白名单列表
    const fetchWhitelists = async () => {
      try {
        const response = await xmapApi.getWhitelists()
        whitelists.value = response.data.whitelists
      } catch (error) {
        console.error('获取白名单失败:', error)
      }
    }
  
    // 上传白名单
    const uploadWhitelist = async (file) => {
      const formData = new FormData()
      formData.append('whitelistFile', file)
      await xmapApi.uploadWhitelist(formData)
      await fetchWhitelists()
    }
  
    // 下载日志
    const downloadLog = async (taskId) => {
      try {
        const response = await xmapApi.getLog(taskId)
        const url = window.URL.createObjectURL(new Blob([response.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `xmap_log_${taskId}.log`)
        document.body.appendChild(link)
        link.click()
        link.remove()
      } catch (error) {
        console.error('下载日志失败:', error)
      }
    }

    // 下载结果
    const downloadResult = async (taskId) => {
        try {
          const response = await xmapApi.getResult(taskId)
          const url = window.URL.createObjectURL(new Blob([response.data]))
          const link = document.createElement('a')
          link.href = url
          link.setAttribute('download', `xmap_result_${taskId}.json`)
          document.body.appendChild(link)
          link.click()
          link.remove()
        } catch (error) {
          throw new Error('下载失败: ' + error.message)
        }
      }
  
  // 开始扫描
  const startScan = async (params) => {
    isScanning.value = true
    try {
      await xmapApi.scan(params)
      await fetchTasks() // 刷新任务列表
    } finally {
      isScanning.value = false
    }
  }
  
  // 取消任务
  const cancelTask = async (taskId) => {
    await xmapApi.cancelTask(taskId)
    await fetchTasks()
  }
  
  // 删除任务
  const deleteTask = async (taskId) => {
    await xmapApi.deleteTask(taskId)
    await fetchTasks()
  }
  
  return {
    tasks,
    isScanning,
    fetchTasks,
    startScan,
    cancelTask,
    deleteTask,
    uploadWhitelist,
    downloadResult,
    downloadLog
  }
})