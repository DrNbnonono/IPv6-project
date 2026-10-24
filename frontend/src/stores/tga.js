import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

// 目标生成：算法说明、任务、结果下载。
// 响应拦截器已返回响应体；blob 响应原样返回（含 data）。错误整理成 error 文案，由页面展示。
export const useTgaStore = defineStore('tga', () => {
  const algorithms = ref([])
  const limits = ref({ defaultBudget: 10000, maxBudget: 1000000, defaultSeedLimit: 100000, maxSeedLimit: 500000 })
  const tasks = ref([])
  const pagination = ref({ total: 0, page: 1, perPage: 20, totalPages: 1 })
  const addressFiles = ref([])
  const isLoading = ref(false)
  const error = ref('')

  const messageOf = (e, fallback) => e?.response?.data?.message || e?.message || fallback

  const run = async (fn, fallback) => {
    isLoading.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e) {
      error.value = messageOf(e, fallback)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  const fetchAlgorithms = () =>
    run(async () => {
      const res = await api.tga.getAlgorithms()
      algorithms.value = res.data.algorithms
      limits.value = res.data.limits
      return res.data
    }, '获取算法列表失败')

  const fetchTasks = (status = '', page = 1) =>
    run(async () => {
      const params = { page }
      if (status) params.status = status
      const res = await api.tga.getTasks(params)
      tasks.value = res.tasks
      pagination.value = res.pagination
      return res
    }, '获取任务列表失败')

  // 创建任务；不经 run，错误文案照常写入 error
  const createTask = async (data) => {
    error.value = ''
    try {
      const res = await api.tga.createTask(data)
      await fetchTasks('', 1)
      return res
    } catch (e) {
      error.value = messageOf(e, '创建任务失败')
      throw e
    }
  }

  const getTaskDetails = (taskId) =>
    run(async () => (await api.tga.getTaskDetails(taskId)).task, '获取任务详情失败')

  const cancelTask = (taskId, status = '') =>
    run(async () => {
      await api.tga.cancelTask(taskId)
      await fetchTasks(status, pagination.value.page)
    }, '终止任务失败')

  const deleteTask = (taskId, status = '') =>
    run(async () => {
      await api.tga.deleteTask(taskId)
      await fetchTasks(status, pagination.value.page)
    }, '删除任务失败')

  const downloadResult = (taskId) =>
    run(async () => {
      const res = await api.tga.downloadResult(taskId)
      if (!(res.data instanceof Blob)) throw new Error('响应不是文件')
      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `tga_${taskId}.txt`
      document.body.appendChild(link)
      link.click()
      setTimeout(() => {
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }, 100)
    }, '下载结果失败')

  // 用户上传的文件（所有工具），供选择种子文件
  const fetchAddressFiles = () =>
    run(async () => {
      const res = await api.files.getFiles()
      addressFiles.value = res.data || []
      return res
    }, '获取文件列表失败')

  return {
    algorithms, limits, tasks, pagination, addressFiles, isLoading, error,
    fetchAlgorithms, fetchTasks, createTask, getTaskDetails, cancelTask, deleteTask, downloadResult, fetchAddressFiles
  }
})
