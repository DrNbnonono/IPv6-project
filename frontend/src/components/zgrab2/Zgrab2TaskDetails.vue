<template>
  <div class="zgrab2-task-details">
    <div v-if="isLoading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="task-header">
        <h2>ZGrab2 任务详情 #{{ task.id }}</h2>
        <div class="task-actions">
          <button @click="downloadResult" class="btn btn-primary">
            下载结果文件 ({{ formatFileSize(task.resultFileSize) }})
          </button>
          <button @click="downloadLog" class="btn btn-secondary">
            下载日志文件 ({{ formatFileSize(task.logFileSize) }})
          </button>
          <button @click="deleteTask" class="btn btn-danger">
            删除任务
          </button>
        </div>
      </div>

      <div class="task-info">
        <div class="info-row">
          <span class="info-label">状态:</span>
          <span :class="`status-${task.status}`">{{ task.status }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">模块:</span>
          <span>{{ task.params.module || 'multiple' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">目标:</span>
          <span>{{ task.params.target }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">创建时间:</span>
          <span>{{ formatDate(task.created_at) }}</span>
        </div>
        <div v-if="task.started_at" class="info-row">
          <span class="info-label">开始时间:</span>
          <span>{{ formatDate(task.started_at) }}</span>
        </div>
        <div v-if="task.completed_at" class="info-row">
          <span class="info-label">完成时间:</span>
          <span>{{ formatDate(task.completed_at) }}</span>
        </div>
        <div v-if="elapsedTime" class="info-row">
          <span class="info-label">已运行时间:</span>
          <span>{{ elapsedTime }}</span>
        </div>
      </div>

      <div class="command-section">
        <h3>执行命令</h3>
        <pre>{{ task.params.command }}</pre>
      </div>

      <div v-if="task.params.module === 'multiple'" class="config-section">
        <h3>配置文件内容</h3>
        <pre>{{ task.params.config }}</pre>
      </div>

      <div class="result-section">
        <h3>扫描结果</h3>
        <div v-if="!task.result || task.result.length === 0" class="no-result">
          暂无扫描结果
        </div>
        <div v-else>
          <div class="result-tabs">
            <button 
              v-for="tab in resultTabs" 
              :key="tab.key"
              :class="['tab-button', { active: activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          
          <div v-if="activeTab === 'raw'" class="result-content">
            <pre>{{ formattedResult }}</pre>
          </div>
          
          <div v-if="activeTab === 'table'" class="result-content">
            <table class="result-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>模块</th>
                  <th>状态</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in parsedResults" :key="index">
                  <td>{{ item.ip }}</td>
                  <td>{{ item.module }}</td>
                  <td :class="`status-${item.status}`">{{ item.status }}</td>
                  <td>
                    <button 
                      @click="toggleDetail(index)"
                      class="btn btn-sm btn-info"
                    >
                      {{ showDetails[index] ? '隐藏' : '查看' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useZgrab2Store } from '@/stores/zgrab2'
import { format } from 'date-fns'
import { saveAs } from 'file-saver'

const route = useRoute()
const router = useRouter()
const zgrab2Store = useZgrab2Store()

const taskId = route.params.taskId
const isLoading = ref(true)
const error = ref(null)
const activeTab = ref('raw')
const showDetails = ref({})
const elapsedTime = ref('')
let intervalId = null

const resultTabs = [
  { key: 'raw', label: '原始数据' },
  { key: 'table', label: '表格视图' }
]

const task = computed(() => zgrab2Store.currentTask)
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
    const response = await zgrab2Store.downloadResult(taskId)
    saveAs(response, `zgrab2-result-${taskId}.json`)
  } catch (err) {
    alert(err.message || '下载结果失败')
  }
}

const downloadLog = async () => {
  try {
    const response = await zgrab2Store.downloadLog(taskId)
    saveAs(response, `zgrab2-log-${taskId}.log`)
  } catch (err) {
    alert(err.message || '下载日志失败')
  }
}

const deleteTask = async () => {
  if (confirm('确定要删除此任务吗？')) {
    try {
      await zgrab2Store.deleteTask(taskId)
      router.push('/zgrab2')
    } catch (err) {
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

const fetchTaskDetails = async () => {
  isLoading.value = true
  error.value = null
  
  try {
    await zgrab2Store.fetchTaskDetails(taskId)
    updateElapsedTime()
    intervalId = setInterval(updateElapsedTime, 1000)
  } catch (err) {
    error.value = err.message || '获取任务详情失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchTaskDetails()
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>

<style scoped>
.zgrab2-task-details {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.task-actions {
  display: flex;
  gap: 10px;
}

.task-info {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  margin-bottom: 8px;
}

.info-label {
  font-weight: bold;
  min-width: 100px;
}

.status-pending {
  color: #ff9800;
}

.status-running {
  color: #2196f3;
}

.status-completed {
  color: #4caf50;
}

.status-failed {
  color: #f44336;
}

.command-section,
.config-section,
.result-section {
  margin-bottom: 20px;
}

.result-tabs {
  display: flex;
  margin-bottom: 10px;
}

.tab-button {
  padding: 8px 16px;
  background: #f5f5f5;
  border: none;
  cursor: pointer;
}

.tab-button.active {
  background: #2196f3;
  color: white;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
}

.result-table th,
.result-table td {
  padding: 8px;
  border: 1px solid #ddd;
  text-align: left;
}

.result-table th {
  background: #f5f5f5;
}

.loading,
.error {
  text-align: center;
  padding: 20px;
}

.error {
  color: #f44336;
}

.no-result {
  text-align: center;
  padding: 20px;
  color: #888;
}
</style>