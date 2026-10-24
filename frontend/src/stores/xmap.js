import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

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
      
      // api 层的响应拦截器已返回响应体
      const response = await api.xmap.getTasks(params)
      tasks.value = response.tasks
      pagination.value = response.pagination
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
      const response = await api.xmap.startScan(params)
      await fetchTasks()
      return response
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
      await api.xmap.cancelTask(taskId)
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
      await api.xmap.deleteTask(taskId)
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
      const response = await api.xmap.getTaskDetails(taskId)
      currentTask.value = response.task
      return response
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
      // blob 响应由拦截器原样返回（含 data）
      const response = await api.xmap.downloadResult(taskId);
  
      // 检查Blob数据是否有效
      if (!(response.data instanceof Blob)) {
        throw new Error('响应不是Blob类型');
      }
  
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `xmap_result_${taskId}.json`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('下载失败:', error);
    }
  };
  
  // 下载日志文件
  const downloadLog = async (taskId) => {
    try {
      const response = await api.xmap.downloadLog(taskId)
      
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
  const uploadWhitelist = async (formData) => {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await api.xmap.uploadWhitelist(formData)

      await fetchWhitelists()
      return response
    } catch (err) {
      error.value = err.response?.data?.message || '上传白名单失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

// 获取白名单列表 - 修改为正确的端点
// 修改后的获取白名单列表方法
const fetchWhitelists = async () => {
  try {
    const response = await api.xmap.getWhitelists({
      tool: 'xmap', // 固定只获取xmap工具的白名单
      page: 1,
      pageSize: 100 // 获取足够多的条目，或根据需求实现分页
    });

    if (response.success) {
      // 根据后端返回的数据结构调整
      whitelists.value = response.data || [];
    }
  } catch (err) {
    error.value = err.response?.data?.message || '获取白名单列表失败';
    throw err;
  }
};

  return {
    tasks,
    whitelists,
    currentTask,
    isLoading,
    error,
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