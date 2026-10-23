import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

// 导入批次与批次差异。响应拦截器已返回响应体；错误整理成 error 文案，由页面展示。
export const useHistoryStore = defineStore('history', () => {
  const batches = ref([])
  const pagination = ref({ total: 0, page: 1, perPage: 20, totalPages: 1 })
  const isLoading = ref(false)
  const error = ref('')

  const messageOf = (e, fallback) => e?.response?.data?.message || e?.message || fallback

  const fetchBatches = async ({ prefixId, page = 1 } = {}) => {
    isLoading.value = true
    error.value = ''
    try {
      const params = { page }
      if (prefixId) params.prefixId = prefixId
      const res = await api.history.getBatches(params)
      batches.value = res.data.batches
      pagination.value = res.data.pagination
      return res.data
    } catch (e) {
      error.value = messageOf(e, '获取批次列表失败')
      throw e
    } finally {
      isLoading.value = false
    }
  }

  // 差异：kind 省略时只要数量；after 为上一页最后一个 address_id。错误由调用方展示（不污染列表页的 error）
  const fetchDiff = async ({ batchA, batchB, kind, after, pageSize }) => {
    const params = { batchA, batchB }
    if (kind) params.kind = kind
    if (after) params.after = after
    if (pageSize) params.pageSize = pageSize
    try {
      return (await api.history.getDiff(params)).data
    } catch (e) {
      throw new Error(messageOf(e, '获取批次差异失败'))
    }
  }

  return { batches, pagination, isLoading, error, fetchBatches, fetchDiff }
})
