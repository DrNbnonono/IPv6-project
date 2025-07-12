import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import ENV_CONFIG from '@/config/env'

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: ENV_CONFIG.API_BASE_URL,
  timeout: ENV_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 调试信息
if (ENV_CONFIG.ENABLE_DEBUG) {
  console.log('🌐 API客户端配置:', {
    baseURL: ENV_CONFIG.API_BASE_URL,
    timeout: ENV_CONFIG.TIMEOUT
  })
}

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

// 响应拦截器 - 处理未授权错误和统一响应格式
apiClient.interceptors.response.use(response => {
  console.log('[Axios] 响应成功:', response.config.url)
  console.log('[Axios] 响应类型:', response.config.responseType)

  // 对于blob响应，返回完整的response对象
  if (response.config.responseType === 'blob') {
    console.log('[Axios] Blob响应，返回完整response')
    return response
  }

  console.log('[Axios] 响应数据:', response.data)
  return response.data
}, async error => {
  if (error.response?.status === 401) {
    if (!error.config._retry) {
      error.config._retry = true
      const authStore = useAuthStore()
      await authStore.refreshToken()
      return apiClient(error.config)
    } else {
      const authStore = useAuthStore()
      authStore.logout()
      window.location.href = '/login'
    }
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

  // Zgrab2相关API
  zgrab2: {
    // 获取支持的模块列表
    getSupportedModules() {
      return apiClient.get('/zgrab2/modules');
    },

    // 文件管理功能已移至统一的 /files 接口

    // 创建扫描任务
    createTask(params) {
      return apiClient.post('/zgrab2', params);
    },

    // 取消任务
    cancelTask(taskId) {
      return apiClient.post(`/zgrab2/cancel/${taskId}`);
    },

    // 获取任务列表
    getTasks(params) {
      return apiClient.get('/zgrab2/tasks', { params });
    },

    // 获取任务详情
    getTaskDetails(taskId) {
      return apiClient.get(`/zgrab2/task/${taskId}`);
    },

    // 获取任务状态
    getTaskStatus(taskId) {
      return apiClient.get(`/zgrab2/task/${taskId}/status`);
    },

    // 获取任务进度
    getTaskProgress(taskId) {
      return apiClient.get(`/zgrab2/task/${taskId}/progress`);
    },

    // 下载结果文件
    downloadResult(taskId) {
      return apiClient.get(`/zgrab2/result/${taskId}`, {
        responseType: 'blob'
      });
    },

    // 获取日志内容（在线预览）
    getLogContent(taskId) {
      return apiClient.get(`/zgrab2/log/${taskId}`);
    },

    // 删除任务
    deleteTask(taskId) {
      return apiClient.delete(`/zgrab2/${taskId}`);
    },

    // 文件管理功能已移至统一的 /files 接口
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
    // 通用搜索
    search(query) {
      return apiClient.get('/addresses/search', { params: { query } });
    },

    // 获取全球统计
    getGlobalStats(params = {}) {
      return apiClient.get('/addresses/global-stats', { params });
    },

    // 前缀相关API
    getPrefixDetail(prefixId) {
      return apiClient.get(`/addresses/prefixes/${prefixId}`);
    },

    // 协议相关API
    getProtocols() {
      return apiClient.get('/addresses/protocols');
    },
    getProtocolDetail(protocolId) {
      return apiClient.get(`/addresses/protocols/${protocolId}`);
    },
    getProtocolAsns(protocolId, limit = 20, offset = 0) {
      return apiClient.get(`/addresses/protocols/${protocolId}/asns`, {
        params: { limit, offset }
      });
    },
    getProtocolRegions(protocolId) {
      return apiClient.get(`/addresses/protocols/${protocolId}/regions`);
    },
    getAsnProtocolDetail(asn, protocolId) {
      return apiClient.get(`/addresses/asns/${asn}/protocols/${protocolId}`);
    },
    getProtocolCountries(protocolId, limit = 20, offset = 0) {
      return apiClient.get(`/addresses/protocols/${protocolId}/countries`, {
        params: { limit, offset }
      });
    },
    getCountryProtocolDetail(countryId, protocolId) {
      return apiClient.get(`/addresses/countries/${countryId}/protocols/${protocolId}`);
    },

    // 漏洞相关API
    getVulnerabilities() {
      return apiClient.get('/addresses/vulnerabilities');
    },
    getVulnerabilityDetail(vulnerabilityId) {
      return apiClient.get(`/addresses/vulnerabilities/${vulnerabilityId}`);
    },
    getVulnerabilityAsns(vulnerabilityId, limit = 20, offset = 0) {
      return apiClient.get(`/addresses/vulnerabilities/${vulnerabilityId}/asns`, {
        params: { limit, offset }
      });
    },
    getVulnerabilityRegions(vulnerabilityId) {
      return apiClient.get(`/addresses/vulnerabilities/${vulnerabilityId}/regions`);
    },
    getAsnVulnerabilityDetail(asn, vulnerabilityId) {
      return apiClient.get(`/addresses/asns/${asn}/vulnerabilities/${vulnerabilityId}`);
    },
    getVulnerabilityCountries(vulnerabilityId, limit = 20, offset = 0) {
      return apiClient.get(`/addresses/vulnerabilities/${vulnerabilityId}/countries`, {
        params: { limit, offset }
      });
    },
    getCountryVulnerabilityDetail(countryId, vulnerabilityId) {
      return apiClient.get(`/addresses/countries/${countryId}/vulnerabilities/${vulnerabilityId}`);
    }
  },

  // 文档相关 API
  docs: {
    // XMap 文档相关
    getList(lang) {
      return apiClient.get(`/docs/${lang}`)
    },
    getContent(lang, docId) {
      return apiClient.get(`/docs/${lang}/${docId}`)
    },
    updateContent(lang, docId, content) {
      return apiClient.put(`/docs/${lang}/${docId}`, { content })
    },
    
    // ZGrab2 文档相关
    getZgrab2List(lang) {
      return apiClient.get(`/docs/zgrab2/${lang}`)
    },
    getZgrab2Content(lang, docId) {
      return apiClient.get(`/docs/zgrab2/${lang}/${docId}`)
    },
    updateZgrab2Content(lang, docId, content) {
      return apiClient.put(`/docs/zgrab2/${lang}/${docId}`, { content })
    },
    getZgrab2Toc(lang) {
      return apiClient.get(`/docs/zgrab2/${lang}/toc`)
    },
    getZgrab2Modules() {
      return apiClient.get('/docs/zgrab2/modules')
    }
  },

  // 数据库管理API
  database: {
    getStats() {
      return apiClient.get('/database/stats');
    },
    importAddresses(data) {
      return apiClient.post('/database/import-addresses', data);
    },
    updateVulnerabilities(data) {
      return apiClient.post('/database/update-vulnerabilities', data);
    },
    updateProtocolSupport(data) {
      return apiClient.post('/database/update-protocol-support', data);
    },
    advancedQuery(data) {
      return apiClient.post('/database/advanced-query', data);
    },
    getCountryStats() {
      return apiClient.get('/database/country-stats');
    },
    getVulnerabilityStats() {
      return apiClient.get('/database/vulnerability-stats');
    },
    advancedQuery(data) {
      return apiClient.post('/database/advanced-query', data);
    },
    deleteAddresses(addressIds) {
      return apiClient.post('/database/delete-addresses', { addressIds });
    },
    getVulnerabilityTypes() {
      return apiClient.get('/database/vulnerability-types');
    },
    
    getProtocolTypes() {
      return apiClient.get('/database/protocol-types');
    },

    // 获取 IID 类型列表
    getIIDTypes() {
      return apiClient.get('/database/address-types');
    },
    
    // 更新 IID 类型
    updateIIDTypes(data) {
      return apiClient.post('/database/update-iid-types', data);
    },


    //---------------国家管理相关的API----------------//

    createCountry(data) {
      return apiClient.post('/database/countries', data);
    },
    updateCountry(id, data) {
      return apiClient.put(`/database/countries/${id}`, data);
    },
    deleteCountry(id) {
      return apiClient.delete(`/database/countries/${id}`);
    },

    //---------------ASN管理相关的API----------------//
    createAsn(data) {
      return apiClient.post('/database/asns', data);
    },
    updateAsn(id, data) {
      return apiClient.put(`/database/asns/${id}`, data);
    },
    deleteAsn(id) {
      return apiClient.delete(`/database/asns/${id}`);
    },

    //---------------前缀管理相关的API----------------//
    getPrefixes(params) {
      return apiClient.get('/database/prefixes', { params });
    },
    createPrefix(data) {
      return apiClient.post('/database/prefixes', data);
    },
    updatePrefix(id, data) {
      return apiClient.put(`/database/prefixes/${id}`, data);
    },
    deletePrefix(id) {
      return apiClient.delete(`/database/prefixes/${id}`);
    },

    //---------------文件管理相关API已经单独实现----------------//

    //---------------地址导入任务相关API----------------//
    createImportTask(data) {
      return apiClient.post('/database/import-tasks', data);
    },
    getImportTasks() {
      return apiClient.get('/database/import-tasks');
    },
    getImportTaskStatus(taskId) {
      return apiClient.get(`/database/import-tasks/${taskId}`);
    },
    cancelImportTask(taskId) {
      return apiClient.delete(`/database/import-tasks/${taskId}`);
    },
    deleteImportTask(taskId) {
      return apiClient.delete(`/database/import-tasks/${taskId}/delete`);
    },

    //---------------协议管理相关API----------------//
    getProtocolDefinitions() {
      return apiClient.get('/database/protocols');
    },
    createProtocolDefinition(data) {
      return apiClient.post('/database/protocols', data);
    },
    updateProtocolDefinition(id, data) {
      return apiClient.put(`/database/protocols/${id}`, data);
    },
    deleteProtocolDefinition(id) {
      return apiClient.delete(`/database/protocols/${id}`);
    },
    // 更新asn_protocol_stats
    batchUpdateAsnProtocolStats(data) {
      return apiClient.post('/database/asn-protocol-stats/batch-update', data);
    },

    //---------------漏洞管理相关API----------------//
    getVulnerabilityDefinitions() {
      return apiClient.get('/database/vulnerabilities');
    },
    createVulnerabilityDefinition(data) {
      return apiClient.post('/database/vulnerabilities', data);
    },
    updateVulnerabilityDefinition(id, data) {
      return apiClient.put(`/database/vulnerabilities/${id}`, data);
    },
    deleteVulnerabilityDefinition(id) {
      return apiClient.delete(`/database/vulnerabilities/${id}`);
    },
    // 更新asn_vulnerability_stats
    batchUpdateAsnVulnerabilityStats(data) {
      return apiClient.post('/database/asn-vulnerability-stats/batch-update', data);
    },
    //--------------查询相关的API----------------//
    getAsnsByCountry(countryId, query = '') {
      return apiClient.get(`/database/asns/country/${countryId}${query ? `?query=${query}` : ''}`);
    },
    getAllAsns(page = 1, limit = 100) {
      return apiClient.get(`/database/asns/all?page=${page}&limit=${limit}`);
    },
    searchAsns(query, countryId = null) { // 修改搜索ASN方法，添加可选的countryId参数
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (countryId) params.append('country_id', countryId);
        return apiClient.get(`/database/asns?${params.toString()}&limit=20`);
    },
    getCountries(params = {}) {
      const { page = 1, limit = 50, search = '' } = params;
      // 构建URL参数，确保所有参数都正确传递
      const urlParams = new URLSearchParams();
      urlParams.append('page', page);
      urlParams.append('limit', limit);
      if (search) {
        urlParams.append('search', search);
      }
      console.log(`API: 获取国家列表，参数: page=${page}, limit=${limit}, search=${search}`);
      return apiClient.get(`/database/countries?${urlParams.toString()}`);
    },
    searchPrefixes(query) {
      return apiClient.get(`/database/prefixes/search?query=${query}`);
    },
    getPrefixesByAsn(asn) {
      return apiClient.get(`/database/prefixes/by-asn/${asn}`);
    },
  }, 
  
  
  // 文件管理API
  files: {
    uploadFile(formData) {
      return apiClient.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: progressEvent => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`上传进度: ${percentCompleted}%`);
          // 这里可以通过事件总线或其他方式通知组件更新进度
        }
      });
    },
    getFiles(toolType, fileType, listType) {
      const params = {};
      if (toolType) params.toolType = toolType;
      if (fileType) params.fileType = fileType;
      if (listType) params.listType = listType;
      return apiClient.get('/files', {
        params
      });
    },
    deleteFile(fileId) {
      return apiClient.delete(`/files/${fileId}`);
    },
    downloadFile(fileId, fileType) {
      const params = {};
      if (fileType) params.fileType = fileType;
      return apiClient.get(`/files/${fileId}/download`, {
        params,
        responseType: 'blob'
      });
    },
    getFileContent(fileId, fileType) {
      const params = {};
      if (fileType) params.fileType = fileType;
      return apiClient.get(`/files/${fileId}/content`, {
        params
      });
    }
  },

  // JSON分析相关API
  jsonanalysis: {
    // 解析JSON文件
    parseFile(fileId) {
      return apiClient.get(`/jsonanalysis/parse/${fileId}`);
    },

    // 解析JSON文本
    parseText(data) {
      return apiClient.post('/jsonanalysis/parse-text', data);
    },

    // 获取会话数据
    getSessionData(sessionId) {
      return apiClient.get(`/jsonanalysis/session/${sessionId}`);
    },

    // 基于会话的字段提取
    extractFieldsFromSession(data) {
      return apiClient.post('/jsonanalysis/extract-fields-session', data);
    },

    // 基于会话的搜索过滤
    searchFilterFromSession(data) {
      return apiClient.post('/jsonanalysis/search-filter-session', data);
    },

    // 通用数据过滤
    filterFromSession(data) {
      return apiClient.post('/jsonanalysis/filter-session', data);
    },

    // 专门针对zgrab2结果的提取
    extractZgrab2Results(data) {
      return apiClient.post('/jsonanalysis/extract-zgrab2', data);
    },

    // 专门针对xmap结果的提取
    extractXmapResults(data) {
      return apiClient.post('/jsonanalysis/extract-xmap', data);
    },

    // 提取字段（兼容旧版本）
    extractFields(data) {
      return apiClient.post('/jsonanalysis/extract-fields', data);
    },

    // 搜索和过滤（兼容旧版本）
    searchFilter(data) {
      return apiClient.post('/jsonanalysis/search-filter', data);
    },

    // 保存处理后的JSON
    save(data) {
      return apiClient.post('/jsonanalysis/save', data);
    }
  },

  // 工作流相关API
  workflows: {
    // 获取工作流列表
    getWorkflows(params = {}) {
      return apiClient.get('/workflows', { params });
    },

    // 创建工作流
    createWorkflow(data) {
      return apiClient.post('/workflows', data);
    },

    // 获取工作流详情
    getWorkflowById(id) {
      return apiClient.get(`/workflows/${id}`);
    },

    // 更新工作流
    updateWorkflow(id, data) {
      return apiClient.put(`/workflows/${id}`, data);
    },

    // 删除工作流
    deleteWorkflow(id) {
      return apiClient.delete(`/workflows/${id}`);
    },

    // 执行工作流
    executeWorkflow(id, data) {
      return apiClient.post(`/workflows/${id}/execute`, data);
    },

    // 获取执行历史
    getExecutions(id, params = {}) {
      return apiClient.get(`/workflows/${id}/executions`, { params });
    },

    // 获取执行详情
    getExecutionDetails(executionId) {
      return apiClient.get(`/workflows/executions/${executionId}`);
    },

    // 取消执行
    cancelExecution(executionId) {
      return apiClient.post(`/workflows/executions/${executionId}/cancel`);
    },

    // 暂停执行
    pauseExecution(executionId) {
      return apiClient.post(`/workflows/executions/${executionId}/pause`);
    },

    // 恢复执行
    resumeExecution(executionId) {
      return apiClient.post(`/workflows/executions/${executionId}/resume`);
    },

    // 获取节点类型
    getNodeTypes() {
      return apiClient.get('/workflows/node-types');
    },

    // 获取工作流模板
    getTemplates() {
      return apiClient.get('/workflows/templates');
    }
  }
}
