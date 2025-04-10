import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
const authStore = useAuthStore()
// 创建 axios 实例
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 添加 token 到请求头
apiClient.interceptors.request.use(config => {
  const authStore = useAuthStore()

  console.group(`[Axios] 请求拦截器 ${config.url}`)
  console.log('完整配置:', config)
  console.log('请求头:', config.headers)
  console.groupEnd()
  // 确保store已初始化
  if (!authStore.token && localStorage.getItem('token')) {
    authStore.init()
  }
  console.log('[Axios] 正在处理请求:', config.url)
  console.log('[Axios] 当前token:', authStore.token)
  if (authStore.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${authStore.token}`
    console.log('已设置请求头:', config.headers)
  }
  return config
}, error => {
    console.log('[Axios] 请求错误:', error)
  return Promise.reject(error)
})

// 响应拦截器 - 处理未授权错误
apiClient.interceptors.response.use(response => {
  console.log('[Axios] 响应成功:', response.config.url)
  return response.data
}, error => {
  if (error.response?.status === 401) {
    const authStore = useAuthStore()
    authStore.logout()
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

// src/api/index.js
apiClient.interceptors.response.use(response => response, async error => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      await authStore.refreshToken()
      return apiClient(error.config)
    }
    return Promise.reject(error)
  })

export default {
  // 认证相关 API
  auth: {
    login(credentials) {
      return apiClient.post('/auth/login', credentials)
    }
  },
  
  // XMap相关 API
  xmap: {
    getTasks() {
      return apiClient.get('/xmap/tasks')
    },
    startScan(params) {
      return apiClient.post('/xmap', params)
    },
    cancelTask(taskId) {
      return apiClient.post(`/xmap/cancel/${taskId}`)
    },
    deleteTask(taskId) {
      return apiClient.delete(`/xmap/${taskId}`)
    },
    getTaskDetails(taskId) {
      return apiClient.get(`/xmap/task/${taskId}`)
    },
    downloadResult(taskId) {
      return apiClient.get(`/xmap/result/${taskId}`, {
        responseType: 'blob'
      })
    },
    downloadLog(taskId) {
      return apiClient.get(`/xmap/log/${taskId}`, {
        responseType: 'blob'
      })
    },
    uploadWhitelist(formData) {
      return apiClient.post('/xmap/whitelist', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
    },
    getWhitelists() {
      return apiClient.get('/xmap/whitelists')
    },
    
  },

  //zgrab2相关的API，后面一定会修改,等我无聊了
  zgrab2: {
    createTask(params) {
      return apiClient.post('/zgrab2', params);
    },
    getTasks(params) {
      return apiClient.get('/zgrab2', { params });
    },
    getTaskDetails(taskId) {
      return apiClient.get(`/zgrab2/${taskId}`);
    },
    deleteTask(taskId) {
      return apiClient.delete(`/zgrab2/${taskId}`);
    },
    downloadResult(taskId) {
      return apiClient.get(`/zgrab2/${taskId}/result`, {
        responseType: 'blob'
      });
    },
    downloadLog(taskId) {
      return apiClient.get(`/zgrab2/${taskId}/log`, {
        responseType: 'blob'
      });
    },
    getSupportedModules() {
      return apiClient.get('/zgrab2/supported-modules');
    },
    getTaskStatus(taskId) {
      return apiClient.get(`/zgrab2/${taskId}/status`);
    },
    getTaskProgress(taskId) {
      return apiClient.get(`/zgrab2/${taskId}/progress`);
    },
},
  
  // 探测平台相关 API
  detection: {
    getMapData() {
      return apiClient.get('/addresses/map-data')
    },
    getCountryRanking(params = { sort: 'total_active_ipv6', order: 'desc', limit: 10 }) {
      return apiClient.get('/addresses/countries/ranking', { params })
    },
    getAsnRanking(params = { sort: 'total_active_ipv6', order: 'desc', limit: 10 }) {
      return apiClient.get('/addresses/asns/ranking', { params })
    },
    getCountryDetail(countryId) {
      return apiClient.get(`/addresses/countries/${countryId}`)
    },
    getAsnDetail(asn) {
      return apiClient.get(`/addresses/asns/${asn}`)
    },
    searchIPv6(query) {
      return apiClient.get('/addresses/search', { params: { query } });
    },

  },

  // 文档相关 API
  docs: {
    getList(lang) {
      return apiClient.get(`/docs/${lang}`)
    },
    getContent(lang, docId) {
      return apiClient.get(`/docs/${lang}/${docId}`)
    },
    updateContent(lang, docId, content) {
      return apiClient.put(`/docs/${lang}/${docId}`, { content })
    }
  },

  // 数据库管理API
  database: {
    // 获取数据库统计信息
    getStats() {
      return apiClient.get('/admin/database/stats');
    },
    
    // 批量导入IPv6地址
    importAddresses(data) {
      return apiClient.post('/admin/database/import-addresses', data);
    },
    
    // 更新漏洞信息
    updateVulnerabilities(data) {
      return apiClient.post('/admin/database/update-vulnerabilities', data);
    },
    
    // 更新协议支持信息
    updateProtocolSupport(data) {
      return apiClient.post('/admin/database/update-protocol-support', data);
    },
    
    // 高级查询
    advancedQuery(params) {
      return apiClient.get('/admin/database/query', { params });
    },
    
    // 获取国家统计
    getCountryStats() {
      return apiClient.get('/admin/database/country-stats');
    },
    
    // 获取漏洞统计
    getVulnerabilityStats() {
      return apiClient.get('/admin/database/vulnerability-stats');
    }
  },
}