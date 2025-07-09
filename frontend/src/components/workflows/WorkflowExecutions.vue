<template>
  <div class="workflow-executions">
    <!-- 头部 -->
    <div class="executions-header">
      <div class="header-left">
        <button @click="$emit('back-to-list')" class="btn btn-back">
          <i class="icon-arrow-left"></i> 返回列表
        </button>
        <div class="header-info">
          <h2>执行历史</h2>
          <p v-if="currentWorkflow">{{ currentWorkflow.name }}</p>
        </div>
      </div>
      <div class="header-right">
        <button @click="refreshExecutions" class="btn btn-refresh">
          <i class="icon-refresh"></i> 刷新
        </button>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="executions-filters">
      <select v-model="filterStatus" @change="handleFilterChange" class="filter-select">
        <option value="">全部状态</option>
        <option value="pending">等待中</option>
        <option value="running">运行中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
        <option value="canceled">已取消</option>
        <option value="paused">已暂停</option>
      </select>
    </div>

    <!-- 执行列表 -->
    <div class="executions-content">
      <div v-if="workflowStore.isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>正在加载执行历史...</p>
      </div>

      <div v-else-if="executions.length === 0" class="empty-state">
        <div class="empty-icon">
          <i class="icon-history"></i>
        </div>
        <h3>暂无执行记录</h3>
        <p>该工作流还没有执行记录</p>
      </div>

      <div v-else class="executions-list">
        <div 
          v-for="execution in executions" 
          :key="execution.id"
          class="execution-card"
          @click="viewExecutionDetails(execution)"
        >
          <div class="execution-header">
            <div class="execution-info">
              <h3>{{ execution.name }}</h3>
              <p>{{ execution.description || '无描述' }}</p>
            </div>
            <div class="execution-status" :class="execution.status">
              {{ getStatusText(execution.status) }}
            </div>
          </div>

          <div class="execution-body">
            <div class="execution-stats">
              <div class="stat-item">
                <span class="stat-label">开始时间</span>
                <span class="stat-value">{{ formatDate(execution.started_at || execution.created_at) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">完成时间</span>
                <span class="stat-value">{{ execution.completed_at ? formatDate(execution.completed_at) : '-' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">执行时长</span>
                <span class="stat-value">{{ getDuration(execution) }}</span>
              </div>
            </div>

            <!-- 进度条 -->
            <div v-if="execution.progress" class="execution-progress">
              <div class="progress-bar">
                <div 
                  class="progress-fill" 
                  :style="{ width: getProgressPercentage(execution.progress) + '%' }"
                ></div>
              </div>
              <span class="progress-text">
                {{ execution.progress.completedNodes || 0 }} / {{ execution.progress.totalNodes || 0 }} 节点已完成
              </span>
            </div>

            <!-- 当前节点 -->
            <div v-if="execution.current_node_id && execution.status === 'running'" class="current-node">
              <i class="icon-play"></i>
              <span>正在执行: {{ execution.current_node_id }}</span>
            </div>

            <!-- 错误信息 -->
            <div v-if="execution.error_message" class="execution-error">
              <i class="icon-warning"></i>
              <span>{{ execution.error_message }}</span>
            </div>
          </div>

          <div class="execution-actions">
            <button @click.stop="viewExecutionDetails(execution)" class="action-btn">
              <i class="icon-eye"></i> 查看详情
            </button>
            <button 
              v-if="execution.status === 'running'"
              @click.stop="pauseExecution(execution)"
              class="action-btn"
            >
              <i class="icon-pause"></i> 暂停
            </button>
            <button 
              v-if="execution.status === 'paused'"
              @click.stop="resumeExecution(execution)"
              class="action-btn"
            >
              <i class="icon-play"></i> 恢复
            </button>
            <button 
              v-if="['running', 'paused', 'pending'].includes(execution.status)"
              @click.stop="cancelExecution(execution)"
              class="action-btn danger"
            >
              <i class="icon-stop"></i> 取消
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行详情对话框 -->
    <div v-if="showDetailsDialog" class="modal-overlay" @click="showDetailsDialog = false">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>执行详情</h3>
          <button @click="showDetailsDialog = false" class="modal-close">
            <i class="icon-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <div v-if="selectedExecution" class="execution-details">
            <!-- 基本信息 -->
            <div class="details-section">
              <h4>基本信息</h4>
              <div class="details-grid">
                <div class="detail-item">
                  <label>执行名称</label>
                  <span>{{ selectedExecution.name }}</span>
                </div>
                <div class="detail-item">
                  <label>状态</label>
                  <span class="status-badge" :class="selectedExecution.status">
                    {{ getStatusText(selectedExecution.status) }}
                  </span>
                </div>
                <div class="detail-item">
                  <label>开始时间</label>
                  <span>{{ formatDate(selectedExecution.started_at || selectedExecution.created_at) }}</span>
                </div>
                <div class="detail-item">
                  <label>完成时间</label>
                  <span>{{ selectedExecution.completed_at ? formatDate(selectedExecution.completed_at) : '-' }}</span>
                </div>
              </div>
            </div>

            <!-- 节点执行状态 -->
            <div class="details-section">
              <h4>节点执行状态</h4>
              <div v-if="selectedExecution.nodeExecutions" class="node-executions">
                <div 
                  v-for="nodeExec in selectedExecution.nodeExecutions" 
                  :key="nodeExec.id"
                  class="node-execution-item"
                  :class="nodeExec.status"
                >
                  <div class="node-exec-header">
                    <div class="node-exec-info">
                      <span class="node-id">{{ nodeExec.node_id }}</span>
                      <span class="node-type">{{ nodeExec.node_type }}</span>
                    </div>
                    <div class="node-exec-status" :class="nodeExec.status">
                      {{ getNodeStatusText(nodeExec.status) }}
                    </div>
                  </div>
                  <div v-if="nodeExec.error_message" class="node-exec-error">
                    {{ nodeExec.error_message }}
                  </div>
                  <div class="node-exec-times">
                    <span v-if="nodeExec.started_at">开始: {{ formatTime(nodeExec.started_at) }}</span>
                    <span v-if="nodeExec.completed_at">完成: {{ formatTime(nodeExec.completed_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showDetailsDialog = false" class="btn btn-secondary">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps({
  workflowId: {
    type: [String, Number],
    required: true
  }
})

const emit = defineEmits(['back-to-list'])

const workflowStore = useWorkflowStore()

// 响应式数据
const filterStatus = ref('')
const executions = ref([])
const currentWorkflow = ref(null)
const showDetailsDialog = ref(false)
const selectedExecution = ref(null)

// 计算属性
const filteredExecutions = computed(() => {
  if (!filterStatus.value) return executions.value
  return executions.value.filter(exec => exec.status === filterStatus.value)
})

// 方法
const refreshExecutions = async () => {
  try {
    const result = await workflowStore.fetchExecutions(props.workflowId, {
      status: filterStatus.value
    })
    executions.value = result.executions
  } catch (error) {
    console.error('获取执行历史失败:', error)
  }
}

const handleFilterChange = () => {
  refreshExecutions()
}

const viewExecutionDetails = async (execution) => {
  try {
    selectedExecution.value = await workflowStore.fetchExecutionDetails(execution.id)
    showDetailsDialog.value = true
  } catch (error) {
    console.error('获取执行详情失败:', error)
  }
}

const pauseExecution = async (execution) => {
  try {
    await workflowStore.pauseExecution(execution.id)
    await refreshExecutions()
  } catch (error) {
    console.error('暂停执行失败:', error)
  }
}

const resumeExecution = async (execution) => {
  try {
    await workflowStore.resumeExecution(execution.id)
    await refreshExecutions()
  } catch (error) {
    console.error('恢复执行失败:', error)
  }
}

const cancelExecution = async (execution) => {
  if (confirm('确定要取消此执行吗？')) {
    try {
      await workflowStore.cancelExecution(execution.id)
      await refreshExecutions()
    } catch (error) {
      console.error('取消执行失败:', error)
    }
  }
}

const getStatusText = (status) => {
  const texts = {
    pending: '等待中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消',
    paused: '已暂停'
  }
  return texts[status] || status
}

const getNodeStatusText = (status) => {
  const texts = {
    pending: '等待',
    running: '运行',
    completed: '完成',
    failed: '失败',
    skipped: '跳过'
  }
  return texts[status] || status
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

const formatTime = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleTimeString('zh-CN')
}

const getDuration = (execution) => {
  if (!execution.started_at) return '-'
  
  const start = new Date(execution.started_at)
  const end = execution.completed_at ? new Date(execution.completed_at) : new Date()
  const duration = Math.floor((end - start) / 1000)
  
  if (duration < 60) return `${duration}秒`
  if (duration < 3600) return `${Math.floor(duration / 60)}分${duration % 60}秒`
  return `${Math.floor(duration / 3600)}时${Math.floor((duration % 3600) / 60)}分`
}

const getProgressPercentage = (progress) => {
  if (!progress || !progress.totalNodes) return 0
  return Math.round((progress.completedNodes / progress.totalNodes) * 100)
}

// 生命周期
onMounted(async () => {
  if (props.workflowId) {
    currentWorkflow.value = await workflowStore.fetchWorkflowById(props.workflowId)
    await refreshExecutions()
  }
})

// 监听工作流ID变化
watch(() => props.workflowId, async (newId) => {
  if (newId) {
    currentWorkflow.value = await workflowStore.fetchWorkflowById(newId)
    await refreshExecutions()
  }
})
</script>

<style scoped>
.workflow-executions {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.executions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-back {
  padding: 8px 16px;
  background: #f4f4f5;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
  transition: all 0.2s;
}

.btn-back:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.header-info h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  color: #303133;
}

.header-info p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.btn-refresh {
  padding: 8px 16px;
  background: #f4f4f5;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
  transition: all 0.2s;
}

.btn-refresh:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.executions-filters {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: white;
  font-size: 14px;
  min-width: 120px;
}

.executions-content {
  flex: 1;
  overflow: hidden;
  padding: 24px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  background: #f4f4f5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.empty-icon i {
  font-size: 32px;
  color: #c0c4cc;
}

.empty-state h3 {
  margin: 0 0 12px 0;
  font-size: 20px;
  color: #303133;
}

.empty-state p {
  margin: 0;
  color: #909399;
  font-size: 16px;
}

.executions-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
}

.execution-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.execution-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.execution-header {
  padding: 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.execution-info h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
  font-weight: 600;
}

.execution-info p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.execution-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.execution-status.pending {
  background: #f4f4f5;
  color: #909399;
}

.execution-status.running {
  background: #ecf5ff;
  color: #409eff;
}

.execution-status.completed {
  background: #e1f3d8;
  color: #67c23a;
}

.execution-status.failed {
  background: #fef0f0;
  color: #f56c6c;
}

.execution-status.canceled {
  background: #fdf6ec;
  color: #e6a23c;
}

.execution-status.paused {
  background: #f4f4f5;
  color: #909399;
}

.execution-body {
  padding: 20px;
}

.execution-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.stat-value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.execution-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #409eff;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: #909399;
}

.current-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #ecf5ff;
  border-radius: 4px;
  font-size: 14px;
  color: #409eff;
  margin-bottom: 16px;
}

.execution-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fef0f0;
  border-radius: 4px;
  font-size: 14px;
  color: #f56c6c;
  margin-bottom: 16px;
}

.execution-actions {
  padding: 16px 20px;
  background: #fafafa;
  display: flex;
  gap: 8px;
  border-top: 1px solid #f0f0f0;
}

.action-btn {
  padding: 6px 12px;
  background: none;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.action-btn:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.action-btn.danger:hover {
  color: #f56c6c;
  border-color: #f56c6c;
  background: #fef0f0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 800px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
}

.modal-content.large {
  width: 1000px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #909399;
  cursor: pointer;
  padding: 4px;
}

.modal-close:hover {
  color: #606266;
}

.modal-body {
  padding: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
}

.btn-secondary {
  padding: 8px 16px;
  background: #909399;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover {
  background: #73767a;
}

.execution-details {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.details-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #303133;
  font-weight: 600;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item label {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.detail-item span {
  font-size: 14px;
  color: #303133;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  width: fit-content;
}

.status-badge.pending {
  background: #f4f4f5;
  color: #909399;
}

.status-badge.running {
  background: #ecf5ff;
  color: #409eff;
}

.status-badge.completed {
  background: #e1f3d8;
  color: #67c23a;
}

.status-badge.failed {
  background: #fef0f0;
  color: #f56c6c;
}

.status-badge.canceled {
  background: #fdf6ec;
  color: #e6a23c;
}

.status-badge.paused {
  background: #f4f4f5;
  color: #909399;
}

.node-executions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-execution-item {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
}

.node-execution-item.completed {
  border-color: #67c23a;
  background: #f0f9ff;
}

.node-execution-item.failed {
  border-color: #f56c6c;
  background: #fef0f0;
}

.node-execution-item.running {
  border-color: #409eff;
  background: #ecf5ff;
}

.node-exec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.node-exec-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-id {
  font-weight: 600;
  color: #303133;
}

.node-type {
  font-size: 12px;
  color: #909399;
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 3px;
}

.node-exec-status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.node-exec-status.pending {
  background: #f4f4f5;
  color: #909399;
}

.node-exec-status.running {
  background: #ecf5ff;
  color: #409eff;
}

.node-exec-status.completed {
  background: #e1f3d8;
  color: #67c23a;
}

.node-exec-status.failed {
  background: #fef0f0;
  color: #f56c6c;
}

.node-exec-status.skipped {
  background: #fdf6ec;
  color: #e6a23c;
}

.node-exec-error {
  color: #f56c6c;
  font-size: 12px;
  margin-bottom: 8px;
  padding: 8px;
  background: #fef0f0;
  border-radius: 4px;
}

.node-exec-times {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}
</style>
