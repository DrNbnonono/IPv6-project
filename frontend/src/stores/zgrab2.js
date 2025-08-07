import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useZgrab2Store = defineStore('zgrab2', () => {
  const tasks = ref([])
  const currentTask = ref(null)
  const supportedModules = ref([])
  const configs = ref([])
  const inputFiles = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const fetchTasks = async (params = {}) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getTasks(params)
      if (response && response.data) {
        tasks.value = response.data
        return response.data
      } else {
        tasks.value = []
        return []
      }
    } catch (err) {
      console.error('获取ZGrab2任务失败:', err)
      error.value = err
      tasks.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const fetchTaskDetails = async (taskId) => {
    isLoading.value = true
    try {
      console.log('获取任务详情，taskId:', taskId)
      if (!taskId || taskId === 'undefined') {
        throw new Error('无效的任务ID')
      }

      const response = await api.zgrab2.getTaskDetails(taskId)
      console.log('任务详情API响应:', response)

      if (response && response.success && response.data) {
        currentTask.value = response.data
        return response.data
      } else {
        currentTask.value = null
        return null
      }
    } catch (err) {
      console.error('获取ZGrab2任务详情失败:', err)
      error.value = err
      currentTask.value = null
      return null
    } finally {
      isLoading.value = false
    }
  }

  const fetchSupportedModules = async () => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.getSupportedModules()
      if (response && response.data) {
        supportedModules.value = response.data
        return response.data
      } else {
        supportedModules.value = []
        return []
      }
    } catch (err) {
      console.error('获取ZGrab2模块列表失败:', err)
      error.value = err
      supportedModules.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const fetchConfigs = async () => {
    isLoading.value = true
    try {
      console.log('开始获取配置文件列表...')
      // 使用统一的文件管理接口，指定获取配置文件
      const response = await api.files.getFiles('zgrab2', 'config')
      console.log('配置文件API响应:', response)

      if (response && response.success) {
        const configFiles = response.data || []
        console.log('获取到配置文件:', configFiles)
        configs.value = configFiles
        return configFiles
      } else {
        console.log('配置文件响应格式异常:', response)
        configs.value = []
        return []
      }
    } catch (err) {
      console.error('获取配置文件列表失败:', err)
      error.value = err
      configs.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const fetchInputFiles = async () => {
    isLoading.value = true
    try {
      console.log('开始获取输入文件列表...')
      // 使用统一的文件管理接口，指定获取输入文件
      const response = await api.files.getFiles('zgrab2', 'input')
      console.log('输入文件API响应:', response)

      if (response && response.success) {
        const inputFilesList = response.data || []
        console.log('获取到输入文件:', inputFilesList)
        inputFiles.value = inputFilesList
        return inputFilesList
      } else {
        console.log('输入文件响应格式异常:', response)
        inputFiles.value = []
        return []
      }
    } catch (err) {
      console.error('获取输入文件列表失败:', err)
      error.value = err
      inputFiles.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const uploadConfig = async (params) => {
    isLoading.value = true
    try {
      console.log('开始上传配置文件:', params)
      // 使用统一的文件上传接口
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('toolType', 'zgrab2')
      formData.append('fileType', 'config')
      formData.append('description', params.description || 'Zgrab2配置文件')

      const response = await api.files.uploadFile(formData)
      console.log('配置文件上传API响应:', response)

      if (response && response.success) {
        // 重新获取配置文件列表
        await fetchConfigs()
        return response
      } else {
        throw new Error('上传配置文件失败')
      }
    } catch (err) {
      console.error('上传配置文件失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const cancelTask = async (taskId) => {
    isLoading.value = true
    try {
      const response = await api.zgrab2.cancelTask(taskId)
      return response
    } catch (err) {
      console.error('取消ZGrab2任务失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteFile = async (fileId) => {
    isLoading.value = true
    try {
      console.log('删除文件，文件ID:', fileId)
      // 使用统一的文件删除接口
      const response = await api.files.deleteFile(fileId)
      console.log('删除文件API响应:', response)

      if (response && response.success) {
        // 重新获取文件列表
        await Promise.all([fetchConfigs(), fetchInputFiles()])
        return response
      } else {
        throw new Error('删除文件失败')
      }
    } catch (err) {
      console.error('删除文件失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getFileContent = async (fileId) => {
    isLoading.value = true
    try {
      console.log('获取文件内容，文件ID:', fileId)
      // 使用统一的文件内容获取接口
      const response = await api.files.getFileContent(fileId)
      console.log('文件内容API响应:', response)

      if (response && response.success) {
        return response.data
      } else {
        throw new Error('获取文件内容失败')
      }
    } catch (err) {
      console.error('获取文件内容失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createTask = async (params) => {
    isLoading.value = true
    try {
      console.log('创建ZGrab2任务，参数:', params)
      const response = await api.zgrab2.createTask(params)
      console.log('创建任务API响应:', response)

      if (response && response.success && response.taskId) {
        return response
      } else {
        throw new Error('创建任务失败')
      }
    } catch (err) {
      console.error('创建ZGrab2任务失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteTask = async (taskId) => {
    isLoading.value = true
    try {
      await api.zgrab2.deleteTask(taskId)
    } catch (err) {
      console.error('删除ZGrab2任务失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadResult = async (taskId) => {
    isLoading.value = true
    try {
      console.log('下载结果文件，taskId:', taskId)
      const response = await api.zgrab2.downloadResult(taskId)
      console.log('下载结果API完整响应:', response)
      console.log('响应数据类型:', typeof response.data, response.data instanceof Blob)

      // 对于blob响应，response.data应该是Blob对象
      if (response && response.data && response.data instanceof Blob) {
        const blob = response.data;

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zgrab2_result_${taskId}.jsonl`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // 延迟清理，确保下载开始
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);

        console.log('文件下载触发完成');
        return response;
      } else {
        console.error('响应结构异常:', response);
        throw new Error('下载响应无效');
      }
    } catch (err) {
      console.error('下载ZGrab2结果失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getLogContent = async (taskId) => {
    isLoading.value = true
    try {
      console.log('获取日志内容，taskId:', taskId)
      const response = await api.zgrab2.getLogContent(taskId)
      console.log('日志内容API响应:', response)

      if (response && response.success) {
        return response.data
      } else {
        throw new Error('获取日志内容失败')
      }
    } catch (err) {
      console.error('获取ZGrab2日志内容失败:', err)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    tasks,
    currentTask,
    supportedModules,
    configs,
    inputFiles,
    isLoading,
    error,
    fetchTasks,
    fetchTaskDetails,
    fetchSupportedModules,
    fetchConfigs,
    fetchInputFiles,
    uploadConfig,
    createTask,
    cancelTask,
    deleteTask,
    deleteFile,
    getFileContent,
    downloadResult,
    getLogContent
  }
})