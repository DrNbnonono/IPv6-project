import axios from 'axios'

export default {
  // 获取任务列表
  getTasks() {
    return axios.get('/api/xmap/tasks')
  },
  
  // 开始扫描
  scan(params) {
    return axios.post('/api/xmap', params)
  },
  
  // 取消任务
  cancelTask(taskId) {
    return axios.post(`/api/xmap/cancel/${taskId}`)
  },
  
  // 删除任务
  deleteTask(taskId) {
    return axios.delete(`/api/xmap/${taskId}`)
  },
  
  // 获取任务详情
  getTaskDetails(taskId) {
    return axios.get(`/api/xmap/task/${taskId}`)
  },
  
  // 获取结果文件
  getResult(taskId) {
    return axios.get(`/api/xmap/result/${taskId}`, {
      responseType: 'blob'
    })
  },

   // 上传白名单
   uploadWhitelist(formData) {
    return axios.post('/api/xmap/whitelist', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  
  // 获取白名单列表
  getWhitelists() {
    return axios.get('/api/xmap/whitelists')
  },
  
  // 获取日志文件
  getLog(taskId) {
    return axios.get(`/api/xmap/log/${taskId}`, {
      responseType: 'blob'
    })
  }
}