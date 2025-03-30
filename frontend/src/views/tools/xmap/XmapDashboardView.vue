<template>
  <div class="xmap-dashboard">
    <div class="dashboard-header">
      <div class="header-content">
        <h2>
          <i class="icon-xmap"></i> XMap探测工具
        </h2>
        <div class="header-actions">
          <button class="btn btn-help" @click="goToHelp">
            <i class="icon-help"></i> 使用帮助
          </button>
        </div>
      </div>
      <p class="subtitle">高效IPv6网络探测与扫描工具</p>
    </div>
    
    <div class="dashboard-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon"></i>
        <span>{{ tab.label }}</span>
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
      </button>
    </div>
    
    <div class="dashboard-content">
      <div v-if="activeTab === 'config'" class="config-section">
        <div class="section-header">
          <h3><i class="icon-config"></i> 扫描配置</h3>
          <p>配置XMap扫描参数，开始新的探测任务</p>
        </div>
        <XmapParameterForm 
          @start-scan="handleStartScan"
          :is-loading="xmapStore.isLoading"
        />
      </div>
      
      <div v-if="activeTab === 'history'" class="history-section">
        <div class="section-header">
          <h3><i class="icon-history"></i> 任务历史</h3>
          <div class="history-filters">
            <select v-model="filterStatus" @change="handleFilterChange" class="filter-select">
              <option value="">全部状态</option>
              <option value="running">运行中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="canceled">已取消</option>
            </select>
            <button class="btn btn-refresh" @click="refreshTasks">
              <i class="icon-refresh"></i> 刷新
            </button>
          </div>
        </div>
        
        <div v-if="xmapStore.tasks.length === 0" class="empty-state">
          <i class="icon-empty"></i>
          <p>暂无任务记录</p>
          <button class="btn btn-primary" @click="activeTab = 'config'">
            <i class="icon-plus"></i> 创建新任务
          </button>
        </div>
        
        <XmapTaskHistory 
          v-else
          :tasks="xmapStore.tasks"
          :pagination="xmapStore.pagination"
          @cancel-task="handleCancelTask"
          @delete-task="handleDeleteTask"
          @view-log="handleViewLog"
          @download-result="handleDownloadResult"
          @view-details="handleViewDetails"
          @page-change="handlePageChange"
        />
      </div>
      
      <div v-if="activeTab === 'help'" class="help-section">
        <XmapHelpView />
      </div>
      
      <div v-if="activeTab === 'details' && xmapStore.currentTask" class="details-section">
        <div class="section-header">
          <button class="btn btn-back" @click="activeTab = 'history'">
            <i class="icon-arrow-left"></i> 返回任务列表
          </button>
          <h3>任务详情 - ID: {{ xmapStore.currentTask.id }}</h3>
        </div>
        
        <XmapTaskDetails :task="xmapStore.currentTask" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useXmapStore } from '@/stores/xmap'
import { useRouter } from 'vue-router'
import XmapParameterForm from '@/components/xmap/XmapParameterForm.vue'
import XmapTaskHistory from '@/components/xmap/XmapTaskHistory.vue'
import XmapTaskDetails from '@/components/xmap/XmapTaskDetails.vue'
import XmapHelpView from './XmapHelpView.vue'

const xmapStore = useXmapStore()
const router = useRouter()
const activeTab = ref('config')
const filterStatus = ref('')

const tabs = [
  { id: 'config', label: '扫描配置', icon: 'icon-config' },
  { id: 'history', label: '任务历史', icon: 'icon-history' },
  { id: 'help', label: '使用帮助', icon: 'icon-help', badge: '新' },
  { id: 'details', label: '任务详情', icon: 'icon-detail', show: false }
]

const refreshTasks = () => {
  xmapStore.fetchTasks(filterStatus.value)
}

const goToHelp = () => {
  activeTab.value = 'help'
}

const handleStartScan = async (params) => {
  try {
    await xmapStore.startScan(params)
    activeTab.value = 'history'
    filterStatus.value = ''
  } catch (error) {
    console.error('Scan failed:', error)
  }
}

const handleCancelTask = async (taskId) => {
  try {
    await xmapStore.cancelTask(taskId)
  } catch (error) {
    console.error('Cancel failed:', error)
  }
}

const handleDeleteTask = async (taskId) => {
  try {
    await xmapStore.deleteTask(taskId)
  } catch (error) {
    console.error('Delete failed:', error)
  }
}

const handleViewLog = (taskId) => {
  xmapStore.downloadLog(taskId)
}

const handleDownloadResult = (taskId) => {
  xmapStore.downloadResult(taskId)
}

const handleViewDetails = async (taskId) => {
  try {
    await xmapStore.getTaskDetails(taskId)
    tabs[3].show = true
    activeTab.value = 'details'
  } catch (error) {
    console.error('Get details failed:', error)
  }
}

const handlePageChange = (newPage) => {
  xmapStore.fetchTasks(filterStatus.value, newPage)
}

const handleFilterChange = () => {
  xmapStore.fetchTasks(filterStatus.value)
}

onMounted(() => {
  xmapStore.fetchTasks()
  xmapStore.fetchWhitelists()
})
</script>

<style scoped lang="scss">
.xmap-dashboard {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.dashboard-header {
  padding: 1.5rem 2rem 0;
  background-color: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    
    i {
      font-size: 1.8rem;
    }
  }
  
  .subtitle {
    margin: 0.5rem 0 0;
    color: #718096;
    font-size: 0.95rem;
  }
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.dashboard-tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 2rem;
  background-color: #f8fafc;
}

.tab-button {
  padding: 1rem 1.5rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 0.95rem;
  color: #718096;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  position: relative;
  transition: all 0.2s ease;
  
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
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.6rem;
    background-color: #ff4757;
    color: white;
    padding: 0.1rem 0.4rem;
    border-radius: 10px;
  }
}

.dashboard-content {
  padding: 2rem;
}

.section-header {
  margin-bottom: 1.5rem;
  
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.3rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  p {
    margin: 0;
    color: #718096;
    font-size: 0.95rem;
  }
}

.history-filters {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

.filter-select {
  padding: 0.6rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background-color: white;
  
  &:focus {
    outline: none;
    border-color: #42b983;
  }
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
    font-size: 1.1rem;
  }
}

.btn {
  padding: 0.7rem 1.2rem;
  border-radius: 6px;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  
  &-primary {
    background-color: #42b983;
    color: white;
    
    &:hover {
      background-color: #3aa876;
    }
  }
  
  &-help {
    background-color: #edf2f7;
    color: #4a5568;
    
    &:hover {
      background-color: #e2e8f0;
    }
  }
  
  &-refresh {
    background-color: #4299e1;
    color: white;
    
    &:hover {
      background-color: #3182ce;
    }
  }
  
  &-back {
    background-color: #edf2f7;
    color: #4a5568;
    margin-right: 1rem;
    
    &:hover {
      background-color: #e2e8f0;
    }
  }
}

/* 图标样式 */
.icon-xmap:before { content: "📡"; }
.icon-help:before { content: "❓"; }
.icon-config:before { content: "⚙️"; }
.icon-history:before { content: "🕒"; }
.icon-detail:before { content: "📝"; }
.icon-refresh:before { content: "🔄"; }
.icon-empty:before { content: "📭"; }
.icon-plus:before { content: "➕"; }
.icon-arrow-left:before { content: "⬅️"; }
</style>