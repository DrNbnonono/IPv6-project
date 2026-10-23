import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

// 别名前缀检测：任务、已检测到的别名前缀、地址过滤。
// 响应拦截器已返回响应体；blob 响应原样返回（含 data）。错误整理成 error 文案，由页面展示。
export const useApdStore = defineStore('apd', () => {
  const tasks = ref([])
  const pagination = ref({ total: 0, page: 1, perPage: 20, totalPages: 1 })
  const aliased = ref({ items: [], total: 0, page: 1, pageSize: 50 })
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

  const fetchTasks = (status = '', page = 1) =>
    run(async () => {
      const params = { page }
      if (status) params.status = status
      const res = await api.apd.getTasks(params)
      tasks.value = res.tasks
      pagination.value = res.pagination
      return res
    }, '获取任务列表失败')

  // 创建任务；不经 run，让调用方区分“被策略拒绝(403)”与其他错误
  const createTask = async (data) => {
    error.value = ''
    try {
      const res = await api.apd.createTask(data)
      await fetchTasks('', 1)
      return res
    } catch (e) {
      error.value = messageOf(e, '创建任务失败')
      throw e
    }
  }

  const getTaskDetails = (taskId) =>
    run(async () => (await api.apd.getTaskDetails(taskId)).task, '获取任务详情失败')

  const cancelTask = (taskId, status = '') =>
    run(async () => {
      await api.apd.cancelTask(taskId)
      await fetchTasks(status, pagination.value.page)
    }, '终止任务失败')

  const deleteTask = (taskId, status = '') =>
    run(async () => {
      await api.apd.deleteTask(taskId)
      await fetchTasks(status, pagination.value.page)
    }, '删除任务失败')

  const downloadResult = (taskId) =>
    run(async () => {
      const res = await api.apd.downloadResult(taskId)
      if (!(res.data instanceof Blob)) throw new Error('响应不是文件')
      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `apd_result_${taskId}.json`
      document.body.appendChild(link)
      link.click()
      setTimeout(() => {
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }, 100)
    }, '下载结果失败')

  const fetchAliased = (params = {}) =>
    run(async () => {
      const res = await api.apd.getAliasedPrefixes(params)
      aliased.value = res.data
      return res
    }, '获取别名前缀失败')

  const removeAliased = (id, params = {}) =>
    run(async () => {
      await api.apd.removeAliasedPrefix(id)
      await fetchAliased(params)
    }, '移除失败')

  // 用户上传的文件（所有工具），供选择地址文件
  const fetchAddressFiles = () =>
    run(async () => {
      const res = await api.files.getFiles()
      addressFiles.value = res.data || []
      return res
    }, '获取文件列表失败')

  const filterAddresses = (data) =>
    run(async () => (await api.apd.filterAddresses(data)).data, '过滤失败')

  return {
    tasks, pagination, aliased, addressFiles, isLoading, error,
    fetchTasks, createTask, getTaskDetails, cancelTask, deleteTask, downloadResult,
    fetchAliased, removeAliased, fetchAddressFiles, filterAddresses
  }
})
