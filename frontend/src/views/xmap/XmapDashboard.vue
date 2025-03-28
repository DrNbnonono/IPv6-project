<template>
  <div class="xmap-container">
    <Sidebar :active-tab="activeTab" @change-tab="changeTab" />
    
    <div class="main-content">
      <!-- 参数配置区域 -->
      <div v-if="activeTab === 'config'" class="config-section">
        <h2>XMap 参数配置</h2>
        <ParameterForm 
          @start-scan="handleStartScan"
          :is-loading="isScanning"
        />
        
        <!-- 白名单上传状态提示 -->
        <div v-if="uploadStatus.message" 
             :class="['upload-status', uploadStatus.type]">
          {{ uploadStatus.message }}
        </div>
      </div>
      
      <!-- 任务历史区域 -->
      <div v-if="activeTab === 'history'" class="history-section">
        <div class="section-header">
          <h2>任务历史</h2>
          <button @click="refreshTasks" class="refresh-btn">
            <i class="fas fa-sync-alt"></i> 刷新
          </button>
        </div>
        
        <TaskHistory 
          :tasks="tasks"
          @cancel-task="handleCancelTask"
          @delete-task="handleDeleteTask"
          @view-log="handleViewLog"
          @download-result="handleDownloadResult"
        />
        
        <!-- 日志查看模态框 -->
        <div v-if="showLogModal" class="log-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>任务日志 (ID: {{ currentTaskId }})</h3>
              <button @click="showLogModal = false" class="close-btn">
                &times;
              </button>
            </div>
            <div class="log-content">
              <pre v-if="logContent">{{ logContent }}</pre>
              <div v-else class="loading">加载中...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted } from 'vue'
import { useXmapStore } from '@/stores/xmapStore'
import { storeToRefs } from 'pinia'
import Sidebar from '@/components/common/Sidebar.vue'
import ParameterForm from '@/components/common/ParameterForm.vue'
import TaskHistory from '@/components/common/TaskHistory.vue'

const activeTab = ref('config')
const xmapStore = useXmapStore()
const { tasks, isScanning, whitelists } = storeToRefs(xmapStore)

// 新增状态
const uploadStatus = ref({
  message: '',
  type: '' // 'success' 或 'error'
})
const showLogModal = ref(false)
const currentTaskId = ref(null)
const logContent = ref('')

// 初始化加载任务列表和白名单
onMounted(async () => {
  await xmapStore.fetchTasks()
  await xmapStore.fetchWhitelists()
})

const changeTab = (tab) => {
  activeTab.value = tab
}

const refreshTasks = async () => {
  await xmapStore.fetchTasks()
}

const handleStartScan = async (params) => {
  try {
    await xmapStore.startScan(params)
    uploadStatus.value = {
      message: '扫描任务已开始',
      type: 'success'
    }
    // 3秒后自动清除状态
    setTimeout(() => {
      uploadStatus.value = { message: '', type: '' }
    }, 3000)
  } catch (error) {
    uploadStatus.value = {
      message: `任务创建失败: ${error.message}`,
      type: 'error'
    }
  }
}

const handleCancelTask = async (taskId) => {
  if (confirm('确定要取消此任务吗？')) {
    await xmapStore.cancelTask(taskId)
  }
}

const handleDeleteTask = async (taskId) => {
  if (confirm('确定要删除此任务吗？相关文件也将被删除')) {
    await xmapStore.deleteTask(taskId)
  }
}

const handleViewLog = async (taskId) => {
  currentTaskId.value = taskId
  showLogModal.value = true
  try {
    // 这里应该调用API获取日志内容
    // 示例: logContent.value = await xmapApi.getLogContent(taskId)
    // 暂时模拟数据
    logContent.value = `日志内容示例 - 任务ID: ${taskId}\n状态: 已完成\n扫描目标: example.com`
  } catch (error) {
    logContent.value = `无法加载日志: ${error.message}`
  }
}

const handleDownloadResult = async (taskId) => {
  try {
    await xmapStore.downloadResult(taskId)
  } catch (error) {
    alert(`下载失败: ${error.message}`)
  }
}
</script>

<style scoped>
.xmap-container {
  display: flex;
  min-height: calc(100vh - 60px);
}

.main-content {
  flex: 1;
  padding: 20px;
}

.config-section, .history-section {
  background: #fff;
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.refresh-btn {
  padding: 5px 10px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.upload-status {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
}

.upload-status.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.upload-status.error {
  background: #ffebee;
  color: #c62828;
}

/* 日志模态框样式 */
.log-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  width: 80%;
  max-width: 800px;
  max-height: 80vh;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.log-content {
  padding: 20px;
  overflow: auto;
  flex-grow: 1;
}

.log-content pre {
  white-space: pre-wrap;
  font-family: monospace;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #666;
}
</style>