<template>
    <div class="xmap-dashboard">
        
        <div v-if="xmapStore.error" class="error-message">
            {{ xmapStore.error }}
        </div>
        <div v-if="xmapStore.isLoading" class="loading-overlay">
            加载中...
        </div>
    
    <div v-if="xmapStore.isLoading" class="loading-overlay">
      加载中...
    </div>
    
      <div class="dashboard-header">
        <h2>{{ t('XMap探测工具') }}</h2>
        <p>{{ t('XMap是一款基于IPv6的网络探测工具，可以快速发现IPv6网络中的各种设备、服务、漏洞等信息。') }}</p>
      </div>
      <div v-if="activeTab === 'history' && xmapStore.tasks.length === 0" class="empty-state">
      暂无任务记录
      </div>
      <div class="dashboard-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ t(`xmap.tabs.${tab.id}`) }}
        </button>
      </div>
      
      <div class="dashboard-content">
        <div v-if="activeTab === 'config'" class="config-section">
          <XmapParameterForm 
            @start-scan="handleStartScan"
            :is-loading="xmapStore.isLoading"
          />
        </div>
        
        <div v-if="activeTab === 'history'" class="history-section">
        <div class="history-filters">
            <label>状态过滤:</label>
            <select v-model="filterStatus" @change="handleFilterChange">
            <option value="">全部状态</option>
            <option value="running">运行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
            <option value="canceled">已取消</option>
            </select>
        </div>
        
        <XmapTaskHistory 
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
          <button class="btn btn-back" @click="activeTab = 'history'">
            &lt; {{ t('common.back') }}
          </button>
          
          <XmapTaskDetails :task="xmapStore.currentTask" />
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, watch } from 'vue'
  import { useXmapStore } from '@/stores/xmap'
  import { useAuthStore } from '@/stores/auth'
  import { useI18n } from 'vue-i18n'
  import { useRoute } from 'vue-router'
  import axios from 'axios';

  import XmapParameterForm from '@/components/xmap/XmapParameterForm.vue'
  import XmapTaskHistory from '@/components/xmap/XmapTaskHistory.vue'
  import XmapTaskDetails from '@/components/xmap/XmapTaskDetails.vue'
  import XmapHelpView from './XmapHelpView.vue'
  
  const route = useRoute()
  const { t } = useI18n()
  const xmapStore = useXmapStore()
  const authStore = useAuthStore()
  const activeTab = ref('config')
  const filterStatus = ref('')
  
  // 确保每次激活页面都检查认证状态
  const initData = async () => {
  console.log('当前认证状态:', authStore.isAuthenticated)
  console.log('当前token:', authStore.token)
  
  if (!authStore.isAuthenticated) {
    console.error('未认证状态，停止加载数据')
    return
  }

  try {
    // 并行加载所需数据
    await Promise.all([
      xmapStore.fetchTasks(),
      xmapStore.fetchWhitelists()
    ])
  } catch (error) {
    console.error('数据加载失败:', error)
  }
}

  // 添加认证状态监听
    watch(() => authStore.isAuthenticated, initData,(newVal) => {
        if (newVal) loadData()
    })
  const tabs = [
    { id: 'config', label: 'Config' },
    { id: 'history', label: 'History' },
    { id: 'help', label: 'Help' },
    { id: 'details', label: 'Details', show: false }
  ]
  console.log('组件挂载时token状态:', {
  storeToken: authStore.token,
  localStorageToken: localStorage.getItem('token'),
  headers: axios.defaults.headers.common
})


// 修改加载逻辑
const loadData = async () => {
    // 在loadData方法中添加：
   console.log('当前请求使用的token:', authStore.token)
   console.log('请求头验证:', {
  url: '/api/xmap/tasks',
  headers: {
    Authorization: `Bearer ${authStore.token}`.slice(0, 20) + '...'
  }
})
  try {
    await Promise.all([
      xmapStore.fetchTasks(),
      xmapStore.fetchWhitelists()
    ])
  } catch (error) {
    console.error('加载失败:', error.message)
  }
}

  onMounted(() => {
    xmapStore.fetchTasks()
    xmapStore.fetchWhitelists()
    setTimeout(initData, 50)
    console.group('[XmapDashboard] 页面加载')
    console.log('路由参数:', route.params)
    console.log('即将发起API请求...')
    console.groupEnd()
  })

  watch(
  () => route.path,
  (newPath) => {
    if (newPath.includes('/tools/xmap')) {
      console.group('[XmapDashboard] 路由跳转检测')
      console.log('从其他页面跳转进入XMap页面')
      console.groupEnd()
     }
   }
  )
  const handlePageChange = (newPage) => {
  xmapStore.fetchTasks(filterStatus.value, newPage)
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
  
  const handleFilterChange = () => {
    xmapStore.fetchTasks(filterStatus.value)
  }
  </script>
  
  <style scoped lang="scss">
  .xmap-dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  .dashboard-header {
    margin-bottom: 2rem;
    
    h2 {
      margin-bottom: 0.5rem;
      color: #35495e;
    }
    
    p {
      color: #666;
      margin: 0;
    }
  }
  
  .dashboard-tabs {
    display: flex;
    border-bottom: 1px solid #ddd;
    margin-bottom: 1.5rem;
  }
  
  .tab-button {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    color: #666;
    transition: all 0.2s ease;
    
    &:hover {
      color: #35495e;
    }
    
    &.active {
      color: #42b983;
      border-bottom-color: #42b983;
      font-weight: 500;
    }
  }
  
  .dashboard-content {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .config-section,
  .history-section,
  .help-section,
  .details-section {
    padding: 1rem 0;
  }
  
  .history-filters {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    
    label {
      font-weight: 500;
    }
    
    select {
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
  }
  
  .btn-back {
    margin-bottom: 1rem;
    padding: 0.5rem 1rem;
    background-color: #f0f0f0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    
    &:hover {
      background-color: #e0e0e0;
    }
  }
  </style>