<template>
  <div class="xmap-dashboard">
    <div class="unified-header">
      <div class="header-main-content">
        <div class="header-title-subtitle">
          <h2>
            <i class="icon-xmap"></i> XMap探测工具
          </h2>
          <p class="subtitle">高效IPv6网络探测与扫描工具</p>
        </div>
        <!-- Removed header-actions div and the help button -->
      </div>
      <div class="dashboard-tabs-container">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
          :disabled="tab.id === 'details' && !xmapStore.currentTask" 
        >
          <i :class="tab.icon"></i>
          <span>{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </div>
    </div>
    
    <div class="dashboard-content">
      <div v-if="activeTab === 'config'" class="config-section">
        <XmapParameterForm 
          @start-scan="handleStartScan"
          :is-loading="xmapStore.isLoading"
        />
      </div>
      
      <div v-if="activeTab === 'history'" class="history-section">
        <div class="history-filters-standalone">
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
        
        <div v-if="xmapStore.tasks.length === 0 && !xmapStore.isLoading" class="empty-state">
          <i class="icon-empty"></i>
          <p>暂无任务记录</p>
          <button class="btn btn-primary" @click="activeTab = 'config'">
            <i class="icon-plus"></i> 创建新任务
          </button>
        </div>
        <div v-else-if="xmapStore.isLoading" class="loading-state">
          <p>正在加载任务...</p> 
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
      
      <div v-if="activeTab === 'details'" class="details-section">
        <div v-if="xmapStore.currentTask">
          <div class="details-header-controls">
            <button class="btn btn-back" @click="activeTab = 'history'">
              <i class="icon-arrow-left"></i> 返回任务列表
            </button>
          </div>
          <XmapTaskDetails :task="xmapStore.currentTask" />
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

// tabs array remains the same, 'details' tab is always included
const tabs = [
  { id: 'config', label: '扫描配置', icon: 'icon-config' },
  { id: 'history', label: '任务历史', icon: 'icon-history' },
  { id: 'help', label: '使用帮助', icon: 'icon-help', badge: '新' },
  { id: 'details', label: '任务详情', icon: 'icon-detail' } 
];

const refreshTasks = () => {
  xmapStore.fetchTasks(filterStatus.value)
}

const goToHelp = () => {
  activeTab.value = 'help'
}

const handleStartScan = async (params) => {
  try {
    const result = await xmapStore.startScan(params)
    activeTab.value = 'history'
    filterStatus.value = ''
    return result  // Return the result so we can use it in the form
  } catch (error) {
    console.error('Scan failed:', error)
    throw error  // Rethrow the error so it can be handled by the form
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
    // No need to manipulate tabs[3].show, v-for filter handles it
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

.unified-header {
  padding: 1rem 1.5rem;
  background-color: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  display: flex;
  flex-direction: column; // Stack main content and tabs vertically first
}

.header-main-content {
  display: flex;
  justify-content: space-between; // This will push title to left, actions to right
  align-items: center;
  width: 100%;
  // Removed header-actions specific margin as it's no longer needed or the div is removed
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
  margin-top: 2rem; /* Add some spacing for the empty state in details tab */
}

.loading-state {
  text-align: center;
  padding: 3rem 0;
  color: #718096;
  font-size: 1rem;
}

.header-title-subtitle {
  display: flex;
  align-items: baseline; // Align title and subtitle along their baseline
  gap: 1rem; // Space between title and subtitle
  h2 {
    margin: 0;
    font-size: 1.3rem; // Reduced font size
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.6rem; // Reduced gap
    
    i {
      font-size: 1.5rem; // Reduced icon size
    }
  }
  
  .subtitle {
    margin: 0;
    color: #718096;
    font-size: 0.85rem; // Reduced font size
  }
}

.header-actions {
  display: flex;
  gap: 0.8rem; // Reduced gap
  margin-left: auto; // Push help button to the right if title/subtitle take less space
}

.btn-help {
  font-size: 0.85rem; // Reduced font size
  padding: 0.4rem 0.8rem; // Adjust padding
}

.dashboard-tabs-container {
  display: flex;
  margin-top: 0.8rem; // Space between title row and tabs row
  width: 100%;
  overflow-x: auto; // Allow horizontal scrolling for tabs if they overflow
}

.tab-button {
  padding: 0.7rem 1.2rem; // Reduced padding
  background: none;
  border: none;
  border-bottom: 2px solid transparent; // Slightly thinner border
  cursor: pointer;
  font-size: 0.9rem; // Reduced font size
  color: #718096;
  display: flex;
  align-items: center;
  gap: 0.5rem; // Reduced gap
  position: relative;
  transition: all 0.2s ease;
  white-space: nowrap; // Prevent tab text from wrapping
  
  &:hover {
    color: #4299e1;
  }
  
  &.active {
    color: #42b983;
    border-bottom-color: #42b983;
    font-weight: 500;
  }
  
  .tab-badge {
    // Style remains similar, adjust if needed
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
  padding: 1.5rem; // Slightly reduced padding
}

/* Removed .section-header styles as the element is removed or repurposed */

.history-filters-standalone {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem; // Space before the task list or empty state
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
  justify-content: flex-start; /* Align button to the left */
  align-items: center;
  margin-bottom: 1.5rem;
}

.btn-back {
  font-size: 0.85rem; // Reduced font size
  padding: 0.4rem 0.8rem; // Adjust padding
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
    font-size: 0.9rem; // Reduced font size
  }
  .btn-primary {
    font-size: 0.85rem; // Reduced font size
  }
}

// Adjustments for responsiveness if needed
@media (min-width: 768px) { // Example breakpoint
  .unified-header {
    flex-direction: row; // Title/subtitle/actions and tabs on the same row for wider screens
    align-items: center;
    justify-content: space-between;
  }
  .header-main-content {
    flex-grow: 1; // Allow title/subtitle to take available space
  }
  .dashboard-tabs-container {
    margin-top: 0; // No margin when on the same row
    margin-left: 1.5rem; // Space between main header content and tabs
    width: auto; // Let it size based on content
    overflow-x: visible;
  }
}

</style>