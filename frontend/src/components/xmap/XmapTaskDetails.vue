<template>
    <div class="task-details-container">
      <div class="task-header">
        <h3>任务详情 - ID: {{ task.id }}</h3>
        <button class="btn btn-back" @click="handleClose">
          &lt; 返回列表
        </button>
      </div>
      
      <div class="detail-sections">
        <!-- 基本信息部分 -->
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>状态:</label>
              <span :class="'status-' + task.status">{{ getStatusText(task.status) }}</span>
            </div>
            
            <div class="detail-item">
              <label>创建时间:</label>
              <span>{{ formatDate(task.created_at) }}</span>
            </div>
            
            <div v-if="task.completed_at" class="detail-item">
              <label>完成时间:</label>
              <span>{{ formatDate(task.completed_at) }}</span>
            </div>
            
            <div v-if="task.exit_code !== null" class="detail-item">
              <label>退出码:</label>
              <span>{{ task.exit_code }}</span>
            </div>
          </div>
        </div>
  
        <!-- 命令和描述部分 -->
        <div class="detail-section">
          <h4>执行信息</h4>
          <div class="command-box">
            <label>执行命令:</label>
            <pre>{{ task.command }}</pre>
          </div>
          <div v-if="task.description" class="description-box">
            <label>任务描述:</label>
            <p>{{ task.description }}</p>
          </div>
        </div>
  
        <!-- 结果文件部分 -->
        <div class="detail-section">
          <h4>扫描结果</h4>
          <div v-if="task.hasResultFile" class="result-actions">
            <button @click="handleDownload" class="btn btn-primary">
              <i class="icon-download"></i> 下载结果文件 ({{ formatFileSize(task.resultFileSize) }})
            </button>
          </div>
          <div v-else class="no-result">
            <i class="icon-warning"></i> 未找到结果文件
          </div>
        </div>
  
        <!-- 扫描进度部分 -->
        <div class="detail-section">
          <h4>扫描状态 <span v-if="task.status === 'running'" class="refresh-info">(每2秒自动刷新)</span></h4>
          <div v-if="task.hasProgressFile && task.progress" class="progress-section">
            <div class="progress-stats">
              <div class="stat-item">
                <label>进度:</label>
                <span>{{ parseFloat(task.progress.latest['percent-complete']).toFixed(2) }}%</span>
              </div>
              <div class="stat-item">
                <label>已用时间:</label>
                <span>{{ formatSeconds(task.progress.latest['time-elapsed']) }}</span>
              </div>
              <div class="stat-item">
                <label>剩余时间:</label>
                <span>{{ formatSeconds(task.progress.latest['time-remaining']) }}</span>
              </div>
              <div class="stat-item">
                <label>成功率:</label>
                <span>{{ parseFloat(task.progress.latest['hit-rate']).toFixed(2) }}%</span>
              </div>
            </div>
  
            <div class="progress-details">
              <h5>详细统计</h5>
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>总计</th>
                    <th>最近1秒</th>
                    <th>平均值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>发送总数</td>
                    <td>{{ task.progress.latest['sent-total'] }}</td>
                    <td>{{ task.progress.latest['sent-last-one-sec'] }}</td>
                    <td>{{ task.progress.latest['sent-avg-per-sec'] }}</td>
                  </tr>
                  <tr>
                    <td>发送带宽</td>
                    <td>-</td>
                    <td>{{ formatBandwidth(task.progress.latest['sent-bandwidth-last-one-sec']) }}</td>
                    <td>{{ formatBandwidth(task.progress.latest['sent-bandwidth-avg-per-sec']) }}</td>
                  </tr>
                  <tr>
                    <td>成功接收</td>
                    <td>{{ task.progress.latest['recv-success-total'] }}</td>
                    <td>{{ task.progress.latest['recv-success-last-one-sec'] }}</td>
                    <td>{{ task.progress.latest['recv-success-avg-per-sec'] }}</td>
                  </tr>
                  <tr>
                    <td>数据包丢失</td>
                    <td>{{ task.progress.latest['pcap-drop-total'] }}</td>
                    <td>{{ task.progress.latest['drop-last-one-sec'] }}</td>
                    <td>{{ task.progress.latest['drop-avg-per-sec'] }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else-if="task.status === 'running'" class="no-progress">
            <i class="icon-warning"></i> 正在等待扫描状态更新...
          </div>
          <div v-else class="no-progress">
            <i class="icon-warning"></i> 无法获取扫描状态
          </div>
        </div>
  
        <!-- 错误信息部分 -->
        <div v-if="task.error_message" class="detail-section error-section">
          <h4>错误信息</h4>
          <pre class="error-message">{{ task.error_message }}</pre>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { defineProps, defineEmits, onMounted, onUnmounted, ref } from 'vue'
  import { useXmapStore } from '@/stores/xmap'
  
  const xmapStore = useXmapStore()
  const props = defineProps({
    task: {
      type: Object,
      required: true
    }
  })
  
  const emit = defineEmits(['close-details'])
  
  // 自动刷新相关
  const refreshInterval = ref(null)
  const localTask = ref({ ...props.task })
  
  // 设置自动刷新
  const setupAutoRefresh = () => {
    if (props.task.status === 'running') {
      refreshInterval.value = setInterval(async () => {
        try {
          const updatedTask = await xmapStore.getTaskDetails(props.task.id)
          localTask.value = updatedTask.task
        } catch (error) {
          console.error('刷新任务状态失败:', error)
        }
      }, 2000)
    }
  }
  
  // 清除定时器
  const clearAutoRefresh = () => {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value)
      refreshInterval.value = null
    }
  }
  
  // 处理下载
  const handleDownload = () => {
    xmapStore.downloadResult(localTask.value.id)
  }
  
  // 处理关闭
  const handleClose = () => {
    clearAutoRefresh()
    emit('close-details')
  }
  
  // 状态文本
  const getStatusText = (status) => {
    const statusMap = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      canceled: '已取消',
      pending: '等待中'
    }
    return statusMap[status] || status
  }
  
  // 格式化日期
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }
  
  // 格式化秒数
  const formatSeconds = (seconds) => {
    const sec = parseInt(seconds)
    if (isNaN(sec)) return '-'
    
    const hours = Math.floor(sec / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    const remainingSec = sec % 60
    
    return `${hours > 0 ? hours + '小时 ' : ''}${minutes > 0 ? minutes + '分钟 ' : ''}${remainingSec}秒`
  }
  
  // 格式化带宽
  const formatBandwidth = (bits) => {
    const bps = parseInt(bits)
    if (isNaN(bps)) return '-'
    
    if (bps < 1000) return `${bps} bps`
    if (bps < 1000000) return `${(bps / 1000).toFixed(1)} Kbps`
    return `${(bps / 1000000).toFixed(1)} Mbps`
  }
  
  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  // 生命周期钩子
  onMounted(() => {
    setupAutoRefresh()
  })
  
  onUnmounted(() => {
    clearAutoRefresh()
  })

  
  </script>

  <style scoped lang="scss">
  .task-details-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  
  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eee;
    
    h3 {
      margin: 0;
      color: #35495e;
    }
  }
  
  .btn-back {
    padding: 0.5rem 1rem;
    background-color: #f0f0f0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    
    &:hover {
      background-color: #e0e0e0;
    }
  }
  
  .detail-sections {
    display: grid;
    gap: 1.5rem;
  }
  
  .detail-section {
    background-color: #f8f9fa;
    border-radius: 6px;
    padding: 1.25rem;
    
    h4 {
      margin-top: 0;
      margin-bottom: 1rem;
      color: #2c3e50;
      font-size: 1.1rem;
    }
  }
  
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .detail-item {
    label {
      display: block;
      margin-bottom: 0.25rem;
      font-weight: 500;
      color: #666;
      font-size: 0.9rem;
    }
    
    span {
      font-size: 1rem;
    }
  }
  
  .status-running {
    color: #ff9800;
  }
  
  .status-completed {
    color: #4caf50;
  }
  
  .status-failed, .status-canceled {
    color: #f44336;
  }
  
  .status-pending {
    color: #2196f3;
  }
  
  .command-box, .description-box {
    margin-bottom: 1rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #666;
    }
    
    pre, p {
      margin: 0;
      padding: 0.75rem;
      background-color: white;
      border-radius: 4px;
      border: 1px solid #eee;
    }
  }
  
  .result-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    
    .file-info {
      color: #666;
      font-size: 0.9rem;
    }
  }
  
  .no-result, .no-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #f44336;
    padding: 0.75rem;
    background-color: #ffebee;
    border-radius: 4px;
  }
  
  .progress-section {
    display: grid;
    gap: 1.5rem;
  }
  
  .progress-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    padding: 1rem;
    background-color: white;
    border-radius: 4px;
    border: 1px solid #eee;
  }
  
  .stat-item {
    display: flex;
    flex-direction: column;
    
    label {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 0.25rem;
    }
    
    span {
      font-size: 1.1rem;
      font-weight: 500;
    }
  }
  
  .progress-details {
    h5 {
      margin-top: 0;
      margin-bottom: 1rem;
      color: #2c3e50;
    }
  }
  
  .stats-table {
    width: 100%;
    border-collapse: collapse;
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    
    th {
      background-color: #f5f5f5;
      font-weight: 500;
    }
    
    tr:hover {
      background-color: #f9f9f9;
    }
  }
  
  .error-section {
    background-color: #ffebee;
    border: 1px solid #ffcdd2;
  }
  
  .error-message {
    white-space: pre-wrap;
    word-break: break-word;
    padding: 1rem;
    background-color: white;
    border-radius: 4px;
    color: #f44336;
    font-family: monospace;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    
    &-primary {
      background-color: #42b983;
      color: white;
      
      &:hover {
        background-color: #3aa876;
      }
    }
  }
  
  .icon-download, .icon-warning {
    font-size: 1rem;
  }
  
  .icon-download:before {
    content: "↓";
  }
  
  .icon-warning:before {
    content: "⚠";
  }

  .refresh-label {
  font-size: 0.8rem;
  color: #666;
  font-weight: normal;
}

.error-hint {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #666;
}

.refresh-info {
  font-size: 0.8rem;
  color: #666;
  font-weight: normal;
}

.no-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #fff3e0;
  border-radius: 4px;
  color: #ff9800;
}
  </style>