<template>
  <div class="task-details-container">
    <div class="task-header">
      <button class="btn btn-back" @click="handleClose">
        <i class="icon icon-arrow-left"></i> 返回任务列表
      </button>
      <h3>任务详情 - ID: {{ task.id }}</h3>
    </div>
    
    <div class="detail-sections">
      <!-- 基本信息部分 -->
      <div class="detail-section">
        <div class="section-header">
          <h4><i class="icon icon-info"></i> 基本信息</h4>
        </div>
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
        <div class="section-header">
          <h4><i class="icon icon-terminal"></i> 执行信息</h4>
        </div>
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
        <div class="section-header">
          <h4><i class="icon icon-result"></i> 扫描结果</h4>
        </div>
        <div v-if="task.hasResultFile" class="result-actions">
          <button @click="handleDownload" class="btn btn-primary">
            <i class="icon icon-download"></i> 下载结果文件 ({{ formatFileSize(task.resultFileSize) }})
          </button>
        </div>
        <div v-else class="no-result">
          <i class="icon icon-warning"></i> 未找到结果文件
        </div>
      </div>

      <!-- 扫描进度部分 -->
      <div class="detail-section">
        <div class="section-header">
          <h4><i class="icon icon-progress"></i> 扫描状态 <span v-if="task.status === 'running'" class="refresh-info">(每2秒自动刷新)</span></h4>
        </div>
        <div v-if="task.hasProgressFile && task.progress" class="progress-section">
          <div class="progress-stats">
            <div class="stat-item">
              <label>进度:</label>
              <span class="stat-value">{{ parseFloat(task.progress.latest['percent-complete']).toFixed(2) }}%</span>
              <div class="progress-bar">
                <div class="progress-fill" :style="{width: parseFloat(task.progress.latest['percent-complete']).toFixed(2) + '%'}"></div>
              </div>
            </div>
            <div class="stat-item">
              <label>已用时间:</label>
              <span class="stat-value">{{ formatSeconds(task.progress.latest['time-elapsed']) }}</span>
            </div>
            <div class="stat-item">
              <label>剩余时间:</label>
              <span class="stat-value">{{ formatSeconds(task.progress.latest['time-remaining']) }}</span>
            </div>
            <div class="stat-item">
              <label>成功率:</label>
              <span class="stat-value">{{ parseFloat(task.progress.latest['hit-rate']).toFixed(2) }}%</span>
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
          <i class="icon icon-loading"></i> 正在等待扫描状态更新...
        </div>
        <div v-else class="no-progress">
          <i class="icon icon-warning"></i> 无法获取扫描状态
        </div>
      </div>

      <!-- 错误信息部分 -->
      <div v-if="task.error_message" class="detail-section error-section">
        <div class="section-header">
          <h4><i class="icon icon-error"></i> 错误信息</h4>
        </div>
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
const handleDownload = async () => {
  try {
    await xmapStore.downloadResult(props.task.id)
  } catch (error) {
    console.error('下载失败:', error)
  }
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
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
  
  h3 {
    margin: 0;
    font-size: 1.5rem;
    color: #2d3748;
  }
}

.btn-back {
  padding: 0.6rem 1rem;
  background-color: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #4a5568;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #edf2f7;
    border-color: #cbd5e0;
  }
}

.detail-sections {
  display: grid;
  gap: 1.5rem;
}

.detail-section {
  background-color: #f8fafc;
  border-radius: 10px;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
}

.section-header {
  margin-bottom: 1.5rem;
  
  h4 {
    margin: 0;
    font-size: 1.1rem;
    color: #2d3748;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    
    .icon {
      color: #4299e1;
    }
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}

.detail-item {
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #718096;
    font-weight: 500;
  }
  
  span {
    font-size: 1rem;
    color: #2d3748;
    font-weight: 500;
  }
}

.status-running {
  color: #ed8936;
}

.status-completed {
  color: #48bb78;
}

.status-failed, .status-canceled {
  color: #f56565;
}

.status-pending {
  color: #4299e1;
}

.command-box, .description-box {
  margin-bottom: 1.5rem;
  
  label {
    display: block;
    margin-bottom: 0.8rem;
    font-size: 0.95rem;
    color: #718096;
    font-weight: 500;
  }
  
  pre, p {
    margin: 0;
    padding: 1rem;
    background-color: white;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    font-family: 'Consolas', 'Monaco', monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.result-actions {
  .btn-primary {
    padding: 0.8rem 1.5rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      background-color: #3182ce;
    }
  }
}

.no-result, .no-progress {
  padding: 1rem;
  background-color: #fffaf0;
  border-radius: 8px;
  border: 1px solid #feebc8;
  color: #dd6b20;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.progress-section {
  .progress-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .stat-item {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
      color: #718096;
    }
    
    .stat-value {
      font-size: 1.2rem;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 0.5rem;
      display: block;
    }
    
    .progress-bar {
      height: 6px;
      background-color: #edf2f7;
      border-radius: 3px;
      overflow: hidden;
      
      .progress-fill {
        height: 100%;
        background-color: #4299e1;
        border-radius: 3px;
        transition: width 0.5s ease;
      }
    }
  }
}

.progress-details {
  h5 {
    margin: 1.5rem 0 1rem;
    font-size: 1rem;
    color: #4a5568;
  }
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  background-color: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  
  th, td {
    padding: 0.8rem 1rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  
  th {
    background-color: #f7fafc;
    font-weight: 500;
    color: #4a5568;
  }
  
  tr:hover {
    background-color: #f8fafc;
  }
}

.error-section {
  background-color: #fff5f5;
  border-color: #fed7d7;
  
  .section-header h4 {
    color: #f56565;
    
    .icon {
      color: #f56565;
    }
  }
}

.error-message {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 1rem;
  background-color: white;
  border-radius: 8px;
  color: #f56565;
  font-family: monospace;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #fed7d7;
}

.refresh-info {
  font-size: 0.85rem;
  color: #718096;
  font-weight: normal;
  margin-left: 0.5rem;
}

/* 图标样式 */
.icon {
  font-style: normal;
  
  &-arrow-left:before { content: "←"; }
  &-info:before { content: "ℹ️"; }
  &-terminal:before { content: "💻"; }
  &-result:before { content: "📊"; }
  &-progress:before { content: "⏳"; }
  &-error:before { content: "❌"; }
  &-download:before { content: "⬇️"; }
  &-warning:before { content: "⚠️"; }
  &-loading {
    display: inline-block;
    animation: spin 1s linear infinite;
    
    &:before { content: "🔄"; }
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>