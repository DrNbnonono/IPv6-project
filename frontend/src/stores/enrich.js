import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

// 结果富化：地址 IID 分类、按类型过滤，以及（管理员）库内富化任务。
// 响应拦截器已返回响应体。错误整理成 error 文案，由页面展示。
export const useEnrichStore = defineStore('enrich', () => {
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

  const classify = (addresses) => run(async () => (await api.enrich.classify(addresses)).data, '分类失败')

  const filter = (data) => run(async () => (await api.enrich.filter(data)).data, '过滤失败')

  const fetchTasks = (status = '', page = 1) =>
    run(async () => {
      const params = { page }
      if (status) params.status = status
      const res = await api.enrich.getTasks(params)
      tasks.value = res.tasks
      pagination.value = res.pagination
      return res
    }, '获取任务列表失败')

  const createTask = async (data) => {
    error.value = ''
    try {
      const res = await api.enrich.createTask(data)
      await fetchTasks('', 1)
      return res
    } catch (e) {
      error.value = messageOf(e, '创建任务失败')
      throw e
    }
  }

  const getTaskDetails = (taskId) =>
    run(async () => (await api.enrich.getTaskDetails(taskId)).task, '获取任务详情失败')

  const cancelTask = (taskId, status = '') =>
    run(async () => {
      await api.enrich.cancelTask(taskId)
      await fetchTasks(status, pagination.value.page)
    }, '终止任务失败')

  // 用户上传的文件（所有工具），供选择地址文件
  const fetchAddressFiles = () =>
    run(async () => {
      const res = await api.files.getFiles()
      addressFiles.value = res.data || []
      return res
    }, '获取文件列表失败')

  return {
    tasks, pagination, addressFiles, isLoading, error,
    classify, filter, fetchTasks, createTask, getTaskDetails, cancelTask, fetchAddressFiles
  }
})
