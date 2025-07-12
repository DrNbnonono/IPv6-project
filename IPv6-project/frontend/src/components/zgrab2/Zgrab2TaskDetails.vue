<template>
  <div class="zgrab2-task-details">
    <div v-if="isLoading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="task-header">
        <h2>ZGrab2 任务详情 #{{ task.id }}</h2>
        <div class="task-actions">
          <button @click="downloadResult" class="btn btn-primary">
            下载结果文件
          </button>
          <button @click="viewLog" class="btn btn-secondary">
            查看日志
          </button>
          <button @click="deleteTask" class="btn btn-danger">
            删除任务
          </button>
        </div>
      </div>

      <div class="task-info">
        <div class="info-row">
          <span class="info-label">状态:</span>
          <span :class="`status-${task.status}`">{{ getStatusText(task.status) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">描述:</span>
          <span>{{ task.description || '无描述' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">任务类型:</span>
          <span>{{ task.task_type }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">创建时间:</span>
          <span>{{ formatDate(task.created_at) }}</span>
        </div>
        <div v-if="task.completed_at" class="info-row">
          <span class="info-label">完成时间:</span>
          <span>{{ formatDate(task.completed_at) }}</span>
        </div>
        <div v-if="task.error_message" class="info-row">
          <span class="info-label">错误信息:</span>
          <span class="error-text">{{ task.error_message }}</span>
        </div>
      </div>

      <div class="content-grid">
        <div class="left-column">
          <div class="command-section card">
            <h3><i class="icon-terminal"></i> 执行命令</h3>
            <div class="command-container">
              <pre class="command-text">{{ task.command }}</pre>
              <button @click="copyCommand" class="btn btn-sm btn-copy">
                <i class="icon-copy"></i> 复制
              </button>
            </div>
          </div>

          <div class="result-section card">
            <h3><i class="icon-chart"></i> 扫描结果</h3>
            <div v-if="!task.result || task.result.length === 0" class="no-result">
              <div class="status-indicator">
                <i v-if="task.status === 'running'" class="icon-loading spinning"></i>
                <i v-else-if="task.status === 'failed'" class="icon-error"></i>
                <i v-else class="icon-info"></i>
              </div>
              <p v-if="task.status === 'running'">任务正在运行中...</p>
              <p v-else-if="task.status === 'failed'">任务执行失败</p>
              <p v-else>暂无扫描结果</p>
            </div>
            <div v-else>
              <div class="result-tabs">
                <button
                  v-for="tab in resultTabs"
                  :key="tab.key"
                  :class="['tab-button', { active: activeResultTab === tab.key }]"
                  @click="activeResultTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div v-if="activeResultTab === 'raw'" class="result-content">
                <div class="result-preview">
                  <pre class="result-text">{{ truncatedResult }}</pre>
                  <div v-if="isResultTruncated" class="truncated-notice">
                    <p>结果已截断，显示前 {{ maxResultLength }} 个字符</p>
                    <button @click="downloadResult" class="btn btn-sm btn-primary">
                      <i class="icon-download"></i> 下载完整结果
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="activeResultTab === 'summary'" class="result-content">
                <div class="result-summary">
                  <div class="summary-item">
                    <span class="label">结果文件:</span>
                    <span class="value">{{ getFileName(task.output_path) }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">日志文件:</span>
                    <span class="value">{{ getFileName(task.log_path) }}</span>
                  </div>
                  <div class="summary-actions">
                    <button @click="downloadResult" class="btn btn-primary">
                      <i class="icon-download"></i> 下载结果
                    </button>
                    <button @click="viewLog" class="btn btn-secondary">
                      <i class="icon-file"></i> 查看日志
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="right-column">
          <div class="stats-section card">
            <h3><i class="icon-stats"></i> 任务统计</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">{{ task.status }}</div>
                <div class="stat-label">状态</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ getTaskDuration() }}</div>
                <div class="stat-label">执行时长</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ task.task_type }}</div>
                <div class="stat-label">任务类型</div>
              </div>
            </div>
          </div>

          <div v-if="task.log" class="log-section card">
            <h3><i class="icon-file"></i> 执行日志</h3>
            <div class="log-container">
              <pre class="log-content">{{ truncatedLog }}</pre>
              <div v-if="isLogTruncated" class="truncated-notice">
                <p>日志已截断，显示前 {{ maxLogLength }} 个字符</p>
                <button @click="viewLog" class="btn btn-sm btn-secondary">
                  <i class="icon-eye"></i> 查看完整日志
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useZgrab2Store } from '@/stores/zgrab2'
import { format } from 'date-fns'

// 定义props
const props = defineProps({
  task: {
    type: Object,
    required: true
  }
})

const router = useRouter()
const zgrab2Store = useZgrab2Store()

const taskId = computed(() => props.task?.id)
const isLoading = ref(true)
const error = ref(null)
const activeResultTab = ref('summary')
const showDetails = ref({})
const elapsedTime = ref('')
const maxResultLength = 1000
const maxLogLength = 500
let intervalId = null

const resultTabs = [
  { key: 'summary', label: '结果摘要' },
  { key: 'raw', label: '原始数据' }
]

const task = computed(() => props.task)
const formattedResult = computed(() => {
  if (!task.value?.result) return ''
  return JSON.stringify(task.value.result, null, 2)
})

const parsedResults = computed(() => {
  if (!task.value?.result) return []
  return Object.entries(task.value.result).map(([ip, data]) => ({
    ip,
    module: task.value.params.module,
    status: data.status || 'unknown',
    data
  }))
})

const formatDate = (dateString) => {
  return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss')
}

const getStatusText = (status) => {
  const statusMap = {
    'pending': '等待中',
    'running': '运行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

// 截断结果显示
const truncatedResult = computed(() => {
  if (!task.value?.result) return ''
  const resultStr = JSON.stringify(task.value.result, null, 2)
  if (resultStr.length <= maxResultLength) return resultStr
  return resultStr.substring(0, maxResultLength) + '...'
})

const isResultTruncated = computed(() => {
  if (!task.value?.result) return false
  const resultStr = JSON.stringify(task.value.result, null, 2)
  return resultStr.length > maxResultLength
})

// 截断日志显示
const truncatedLog = computed(() => {
  if (!task.value?.log) return ''
  if (task.value.log.length <= maxLogLength) return task.value.log
  return task.value.log.substring(0, maxLogLength) + '...'
})

const isLogTruncated = computed(() => {
  if (!task.value?.log) return false
  return task.value.log.length > maxLogLength
})

// 获取文件名
const getFileName = (filePath) => {
  if (!filePath) return '无'
  return filePath.split('/').pop()
}

// 获取任务执行时长
const getTaskDuration = () => {
  if (!task.value?.created_at) return '未知'

  const start = new Date(task.value.created_at)
  const end = task.value.completed_at ? new Date(task.value.completed_at) : new Date()
  const diff = end - start

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// 复制命令
const copyCommand = async () => {
  try {
    await navigator.clipboard.writeText(task.value.command)
    alert('命令已复制到剪贴板')
  } catch (err) {
    console.error('复制失败:', err)
    alert('复制失败')
  }
}

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const toggleDetail = (index) => {
  showDetails.value = {
    ...showDetails.value,
    [index]: !showDetails.value[index]
  }
}

const downloadResult = async () => {
  try {
    console.log('任务详情页面下载结果，taskId:', taskId.value)
    const response = await zgrab2Store.downloadResult(taskId.value)
    console.log('下载结果响应:', response)
  } catch (err) {
    console.error('下载结果失败:', err)
    alert(err.message || '下载结果失败')
  }
}

const viewLog = async () => {
  try {
    console.log('任务详情页面查看日志，taskId:', taskId.value)
    const logData = await zgrab2Store.getLogContent(taskId.value)
    if (logData && logData.content) {
      alert(`日志内容:\n\n${logData.content}`)
    } else {
      alert('日志内容为空')
    }
  } catch (err) {
    console.error('获取日志失败:', err)
    alert(err.message || '获取日志失败')
  }
}

const deleteTask = async () => {
  if (confirm('确定要删除此任务吗？')) {
    try {
      console.log('任务详情页面删除任务，taskId:', taskId.value)
      await zgrab2Store.deleteTask(taskId.value)
      // 不需要跳转，因为这是在详情页面中
      alert('任务删除成功')
    } catch (err) {
      console.error('删除任务失败:', err)
      alert(err.message || '删除任务失败')
    }
  }
}

const updateElapsedTime = () => {
  if (task.value?.started_at && !task.value?.completed_at) {
    const start = new Date(task.value.started_at)
    const now = new Date()
    const diff = now - start
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    elapsedTime.value = `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (task.value?.completed_at) {
    clearInterval(intervalId)
  }
}

// 由于任务详情是通过props传递的，不需要单独获取
// const fetchTaskDetails = async () => {
//   isLoading.value = true
//   error.value = null

//   try {
//     await zgrab2Store.fetchTaskDetails(taskId)
//     updateElapsedTime()
//     intervalId = setInterval(updateElapsedTime, 1000)
//   } catch (err) {
//     error.value = err.message || '获取任务详情失败'
//   } finally {
//     isLoading.value = false
//   }
// }

onMounted(() => {
  isLoading.value = false
  // fetchTaskDetails()
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>

<style scoped>
.zgrab2-task-details {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.task-header h2 {
  color: #333;
  margin: 0;
}

.task-actions {
  display: flex;
  gap: 12px;
}

.task-info {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.info-row {
  display: flex;
  margin-bottom: 12px;
  align-items: center;
}

.info-label {
  font-weight: 600;
  min-width: 120px;
  color: #555;
}

/* 网格布局 */
.content-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
  margin-top: 20px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 卡片样式 */
.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  border: 1px solid #e1e5e9;
  transition: box-shadow 0.3s ease;
}

.card:hover {
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
}

.card h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 状态样式 */
.status-pending {
  color: #ff9800;
  font-weight: 600;
}

.status-running {
  color: #2196f3;
  font-weight: 600;
}

.status-completed {
  color: #4caf50;
  font-weight: 600;
}

.status-failed {
  color: #f44336;
  font-weight: 600;
}

.status-cancelled {
  color: #9e9e9e;
  font-weight: 600;
}

/* 命令区域 */
.command-container {
  position: relative;
}

.command-text {
  background: #2d3748;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.btn-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  font-size: 12px;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 结果区域 */
.result-tabs {
  display: flex;
  margin-bottom: 16px;
  border-bottom: 2px solid #e1e5e9;
}

.tab-button {
  padding: 12px 20px;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
  color: #6c757d;
  border-bottom: 2px solid transparent;
  transition: all 0.3s ease;
}

.tab-button:hover {
  color: #495057;
  background: #f8f9fa;
}

.tab-button.active {
  color: #2196f3;
  border-bottom-color: #2196f3;
  background: none;
}

.result-preview {
  position: relative;
}

.result-text {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.truncated-notice {
  margin-top: 12px;
  padding: 12px;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  text-align: center;
}

.truncated-notice p {
  margin: 0 0 8px 0;
  color: #856404;
  font-size: 14px;
}

/* 结果摘要 */
.result-summary {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
}

.summary-item:last-child {
  border-bottom: none;
}

.summary-item .label {
  font-weight: 600;
  color: #495057;
}

.summary-item .value {
  color: #6c757d;
  font-family: monospace;
}

.summary-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* 统计区域 */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #6c757d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 日志区域 */
.log-container {
  position: relative;
}

.log-content {
  background: #2d3748;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
}

/* 状态指示器 */
.status-indicator {
  font-size: 24px;
  margin-bottom: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.no-result {
  text-align: center;
  padding: 40px 20px;
  color: #6c757d;
}

.no-result p {
  margin: 8px 0;
  font-size: 16px;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
}

.error {
  color: #f44336;
}

.error-text {
  color: #f44336;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .task-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .task-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .zgrab2-task-details {
    padding: 16px;
  }

  .card {
    padding: 16px;
  }

  .summary-actions {
    flex-direction: column;
  }

  .command-text,
  .result-text,
  .log-content {
    font-size: 11px;
  }
}
</style>