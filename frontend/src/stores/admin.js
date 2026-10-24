import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

// 管理员页的数据：扫描策略（白名单/黑名单）、用户配额、审计日志。
// 请求错误统一整理成 error 文案，由页面展示；响应拦截器已返回响应体 { success, data, message }。
export const useAdminStore = defineStore('admin', () => {
  const policy = ref(null)
  const quotas = ref({ defaults: null, items: [] })
  const users = ref([])
  const audit = ref({ total: 0, page: 1, pageSize: 50, items: [] })
  const apiKeys = ref({ scopes: [], items: [] })
  const isLoading = ref(false)
  const error = ref('')

  const messageOf = (e, fallback) => e?.response?.data?.message || e?.message || fallback

  // 执行一个请求：成功返回响应体，失败把原因记入 error 后重新抛出，让调用方决定是否提示
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

  const fetchPolicy = () =>
    run(async () => {
      const res = await api.admin.getScanPolicy()
      policy.value = res.data
      return res
    }, '获取扫描策略失败')

  const addEntry = (kind, cidr, note) =>
    run(async () => {
      const data = { cidr, note: note || undefined }
      const res = kind === 'allowlist'
        ? await api.admin.addAllowlistEntry(data)
        : await api.admin.addBlacklistEntry(data)
      await fetchPolicy()
      return res
    }, '添加失败')

  const removeEntry = (kind, id) =>
    run(async () => {
      const res = kind === 'allowlist'
        ? await api.admin.removeAllowlistEntry(id)
        : await api.admin.removeBlacklistEntry(id)
      await fetchPolicy()
      return res
    }, '移除失败')

  const fetchQuotas = () =>
    run(async () => {
      const [quotaRes, userRes] = await Promise.all([api.admin.getQuotas(), api.admin.getUsers()])
      quotas.value = quotaRes.data
      users.value = userRes.data
    }, '获取用户配额失败')

  // maxRate / dailyScanLimit 传 null 表示恢复默认，不传表示保持不变
  const saveQuota = (userId, payload) =>
    run(async () => {
      const res = await api.admin.setQuota(userId, payload)
      await fetchQuotas()
      return res
    }, '保存配额失败')

  const resetQuota = (userId) =>
    run(async () => {
      const res = await api.admin.clearQuota(userId)
      await fetchQuotas()
      return res
    }, '恢复默认配额失败')

  const fetchAuditLogs = (filters = {}) =>
    run(async () => {
      const params = {}
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== null && value !== undefined) params[key] = value
      }
      const res = await api.admin.getAuditLogs(params)
      audit.value = res.data
      return res
    }, '获取审计日志失败')

  const fetchApiKeys = () =>
    run(async () => {
      const res = await api.admin.getApiKeys()
      apiKeys.value = res.data
      return res
    }, '获取 API 密钥失败')

  // 返回响应体；res.data.key 是明文密钥，只此一次，调用方负责展示后丢弃
  const createApiKey = (payload) =>
    run(async () => {
      const res = await api.admin.createApiKey(payload)
      await fetchApiKeys()
      return res
    }, '创建 API 密钥失败')

  const revokeApiKey = (id) =>
    run(async () => {
      const res = await api.admin.revokeApiKey(id)
      await fetchApiKeys()
      return res
    }, '吊销 API 密钥失败')

  return {
    policy, quotas, users, audit, apiKeys, isLoading, error,
    fetchPolicy, addEntry, removeEntry,
    fetchQuotas, saveQuota, resetQuota,
    fetchAuditLogs,
    fetchApiKeys, createApiKey, revokeApiKey
  }
})
