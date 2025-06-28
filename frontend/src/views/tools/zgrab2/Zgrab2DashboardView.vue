<template>
  <div class="zgrab2-dashboard">
    <div class="unified-header">
      <div class="header-main-content">
        <div class="header-title-subtitle">
          <h2>
            <i class="icon-zgrab2"></i> ZGrab2探测工具
          </h2>
          <p class="subtitle">高效协议探测与扫描工具</p>
        </div>
      </div>
      <div class="dashboard-tabs-container">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
          :disabled="tab.id === 'details' && !zgrab2Store.currentTask" 
        >
          <i :class="tab.icon"></i>
          <span>{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </div>
    </div>
    
    <div class="dashboard-content">
      <div v-if="activeTab === 'config'" class="config-section">
        <Zgrab2TaskForm 
          @start-scan="handleStartScan"
          :is-loading="zgrab2Store.isLoading"
        />
      </div>
      
      <div v-if="activeTab === 'history'" class="history-section">
        <div class="history-filters-standalone">
          <select v-model="filterStatus" @change="handleFilterChange" class="filter-select">
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="running">运行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
          <button class="btn btn-refresh" @click="refreshTasks">
            <i class="icon-refresh"></i> 刷新
          </button>
        </div>
        
        <div v-if="zgrab2Store.tasks.length === 0 && !zgrab2Store.isLoading" class="empty-state">
          <i class="icon-empty"></i>
          <p>暂无任务记录</p>
          <button class="btn btn-primary" @click="activeTab = 'config'">
            <i class="icon-plus"></i> 创建新任务
          </button>
        </div>
        <div v-else-if="zgrab2Store.isLoading" class="loading-state">
          <p>正在加载任务...</p> 
        </div>
        <Zgrab2TaskHistory 
          v-else
          :tasks="zgrab2Store.tasks"
          :pagination="zgrab2Store.pagination"
          @delete-task="handleDeleteTask"
          @view-log="handleViewLog"
          @download-result="handleDownloadResult"
          @view-details="handleViewDetails"
          @page-change="handlePageChange"
        />
      </div>
      
      <div v-if="activeTab === 'help'" class="help-section">
        <Zgrab2HelpView />
      </div>
      
      <div v-if="activeTab === 'details'" class="details-section">
        <div v-if="zgrab2Store.currentTask">
          <div class="details-header-controls">
            <button class="btn btn-back" @click="activeTab = 'history'">
              <i class="icon-arrow-left"></i> 返回任务列表
            </button>
          </div>
          <Zgrab2TaskDetails :task="zgrab2Store.currentTask" />
        </div>
        <div v-else class="empty-state">
            <i class="icon-empty"></i>
            <p>请先从任务历史中选择一个任务查看详情。</p>
            <button class="btn btn-primary" @click="activeTab = 'history'">
              <i class="icon-history"></i> 前往任务历史
            </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useZgrab2Store } from '@/stores/zgrab2'
import { useRouter } from 'vue-router'
import Zgrab2TaskForm from '@/components/zgrab2/Zgrab2TaskForm.vue'
import Zgrab2TaskHistory from '@/components/zgrab2/Zgrab2TaskHistory.vue'
import Zgrab2TaskDetails from '@/components/zgrab2/Zgrab2TaskDetails.vue'
import Zgrab2HelpView from './Zgrab2HelpView.vue'

const zgrab2Store = useZgrab2Store()
const router = useRouter()
const activeTab = ref('config')
const filterStatus = ref('')

const tabs = [
  { id: 'config', label: '扫描配置', icon: 'icon-config' },
  { id: 'history', label: '任务历史', icon: 'icon-history' },
  { id: 'help', label: '使用帮助', icon: 'icon-help', badge: '新' },
  { id: 'details', label: '任务详情', icon: 'icon-detail' } 
]

const refreshTasks = async () => {
  try {
    await zgrab2Store.fetchTasks(filterStatus.value)
  } catch (error) {
    console.error('刷新任务失败:', error)
  }
}

const handleStartScan = async (params) => {
  try {
    const result = await zgrab2Store.createTask(params)
    activeTab.value = 'history'
    filterStatus.value = ''
    return result
  } catch (error) {
    console.error('Scan failed:', error)
    throw error
  }
}

const handleDeleteTask = async (taskId) => {
  try {
    await zgrab2Store.deleteTask(taskId)
    // 刷新任务列表
    await refreshTasks()
  } catch (error) {
    console.error('Delete failed:', error)
  }
}

const handleViewLog = async (taskId) => {
  try {
    await zgrab2Store.downloadLog(taskId)
  } catch (error) {
    console.error('下载日志失败:', error)
  }
}

const handleDownloadResult = async (taskId) => {
  try {
    await zgrab2Store.downloadResult(taskId)
  } catch (error) {
    console.error('下载结果失败:', error)
  }
}

const handleViewDetails = async (taskId) => {
  try {
    await zgrab2Store.fetchTaskDetails(taskId)
    activeTab.value = 'details'
  } catch (error) {
    console.error('Get details failed:', error)
  }
}

const handlePageChange = async (newPage) => {
  try {
    await zgrab2Store.fetchTasks(filterStatus.value, newPage)
  } catch (error) {
    console.error('切换页面失败:', error)
  }
}

const handleFilterChange = async () => {
  try {
    await zgrab2Store.fetchTasks(filterStatus.value)
  } catch (error) {
    console.error('过滤任务失败:', error)
  }
}

onMounted(async () => {
  try {
    await zgrab2Store.fetchTasks()
  } catch (error) {
    console.error('初始化ZGrab2任务失败:', error)
  }
})
</script>

<style scoped lang="scss">
.zgrab2-dashboard {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.unified-header {
  padding: 1rem 1.5rem;
  background-color: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  display: flex;
  flex-direction: column;
}

.header-main-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.dashboard-tabs-container {
  display: flex;
  margin-top: 0.8rem; 
  width: 100%;
  overflow-x: auto; 
  .tab-button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.details-section .empty-state {
  margin-top: 2rem;
}

.loading-state {
  text-align: center;
  padding: 3rem 0;
  color: #718096;
  font-size: 1rem;
}

.header-title-subtitle {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  h2 {
    margin: 0;
    font-size: 1.3rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    
    i {
      font-size: 1.5rem;
    }
  }
  
  .subtitle {
    margin: 0;
    color: #718096;
    font-size: 0.85rem;
  }
}

.tab-button {
  padding: 0.7rem 1.2rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: #718096;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  &:hover {
    color: #4299e1;
  }
  
  &.active {
    color: #42b983;
    border-bottom-color: #42b983;
    font-weight: 500;
  }
  
  .tab-badge {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    font-size: 0.55rem;
    background-color: #ff4757;
    color: white;
    padding: 0.1rem 0.3rem;
    border-radius: 8px;
  }
}

.dashboard-content {
  padding: 1.5rem;
}

.history-filters-standalone {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  .filter-select {
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
  }
  .btn-refresh {
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
  }
}

.details-header-controls {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 1.5rem;
}

.btn-back {
  font-size: 0.85rem;
  padding: 0.4rem 0.8rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 0;
  color: #a0aec0;
  
  i {
    font-size: 3rem;
    opacity: 0.5;
    margin-bottom: 1rem;
    display: block;
  }
  
  p {
    margin: 0 0 1.5rem;
    font-size: 0.9rem;
  }
  .btn-primary {
    font-size: 0.85rem;
  }
}

@media (min-width: 768px) {
  .unified-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .header-main-content {
    flex-grow: 1;
  }
  .dashboard-tabs-container {
    margin-top: 0;
    margin-left: 1.5rem;
    width: auto;
    overflow-x: visible;
  }
}
</style>