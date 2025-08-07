<template>
  <div class="task-history">
    <!-- 始终显示的表头和控件 -->
    <div class="table-header">
      <div class="header-title">
        <h3><i class="icon icon-history"></i> 任务历史</h3>
        <span class="task-count">{{ tasks.length }}个任务</span>
      </div>
      <div class="header-actions">
        <select v-model="filterStatus" @change="handleFilterChange" class="filter-select">
          <option value="">全部状态</option>
          <option value="running">运行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="canceled">已取消</option>
        </select>
        <button class="btn btn-refresh" @click="handleRefresh">
          <i class="icon icon-refresh"></i> 刷新
        </button>
      </div>
    </div>

    <!-- 空状态显示 -->
    <div v-if="tasks.length === 0" class="empty-state">
      <div class="empty-content">
        <i class="icon icon-empty"></i>
        <h3>暂无任务记录</h3>
        <p v-if="!filterStatus">您还没有创建任何扫描任务</p>
        <p v-else>当前状态下没有任务记录</p>
        <button v-if="!filterStatus" class="btn btn-primary" @click="$emit('create-task')">
          <i class="icon icon-plus"></i> 创建新任务
        </button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-else>
      
      <div class="table-container">
        <table class="task-table">
          <thead>
            <tr>
              <th>任务ID</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>执行命令</th>
              <th>任务描述</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in tasks" :key="task.id" class="task-row">
              <td>{{ task.id }}</td>
              <td :class="'status-' + task.status">
                <span>{{ getStatusText(task.status) }}</span>
                <span v-if="task.error_message" class="error-hint" title="查看错误详情">!</span>
              </td>
              <td>{{ formatDate(task.created_at) }}</td>
              <td class="command-cell">
                <code>{{ task.command }}</code>
              </td>
              <td class="description-cell">
                {{ task.description || '无描述' }}
              </td>
              <td class="actions">
                <button 
                  v-if="task.status === 'running'"
                  @click="$emit('cancel-task', task.id)"
                  class="btn btn-warning"
                  title="取消任务"
                >
                  <i class="icon icon-cancel"></i>
                </button>
                
                <button 
                  v-if="['pending', 'completed', 'failed', 'canceled'].includes(task.status)"
                  @click="handleDelete(task)"
                  class="btn btn-danger"
                  title="删除任务"
                >
                  <i class="icon icon-delete"></i>
                </button>
                
                <button 
                  v-if="['completed', 'failed', 'canceled'].includes(task.status) && task.output_path"
                  @click="$emit('download-result', task.id)"
                  class="btn btn-success"
                  title="下载结果"
                >
                  <i class="icon icon-download"></i>
                </button>
                
                <button 
                  @click="$emit('view-details', task.id)"
                  class="btn btn-info"
                  title="查看详情"
                >
                  <i class="icon icon-detail"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页控件 -->
      <div v-if="tasks.length > 0" class="pagination">
        <button 
          @click="$emit('page-change', pagination.page - 1)"
          :disabled="pagination.page <= 1"
          class="btn btn-pagination"
        >
          <i class="icon icon-arrow-left"></i> 上一页
        </button>
        
        <span class="page-info">
          第 {{ pagination.page }} 页 / 共 {{ pagination.totalPages }} 页
        </span>
        
        <button 
          @click="$emit('page-change', pagination.page + 1)"
          :disabled="pagination.page >= pagination.totalPages"
          class="btn btn-pagination"
        >
          下一页 <i class="icon icon-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useXmapStore } from '@/stores/xmap'

const xmapStore = useXmapStore()

const { tasks, pagination } = defineProps({
  tasks: {
    type: Array,
    required: true,
    default: () => []
  },
  pagination: {
    type: Object,
    required: true,
    default: () => ({
      page: 1,
      perPage: 20,
      total: 0,
      totalPages: 1
    })
  }
})

const emit = defineEmits([
  'cancel-task',
  'delete-task',
  'view-log',
  'download-result',
  'view-details',
  'page-change',
  'filter-change',
  'refresh',
  'create-task'
])

const filterStatus = ref('')

// 刷新任务列表
const handleRefresh = async () => {
  try {
    await xmapStore.fetchTasks(filterStatus.value)
    emit('refresh') // 保持向上传递事件以便父组件知道刷新了
  } catch (error) {
    console.error('刷新任务失败:', error)
  }
}

// 处理过滤状态变化
const handleFilterChange = async () => {
  try {
    await xmapStore.fetchTasks(filterStatus.value)
    emit('filter-change', filterStatus.value)
  } catch (error) {
    console.error('过滤任务失败:', error)
  }
}

const handleDelete = (task) => {
  if (confirm(`确定要删除任务 ${task.id} 吗？此操作将删除任务记录和相关文件，且不可恢复。`)) {
    emit('delete-task', task.id)
  }
}

const getStatusText = (status) => {
  const statusMap = {
    pending: '等待中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消'
  }
  return statusMap[status] || status
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString()
}
</script>

<style scoped lang="scss">
.task-history {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 1.5rem;
}

.empty-state {
  padding: 3rem 0;
  text-align: center;
  
  .empty-content {
    max-width: 400px;
    margin: 0 auto;
    
    .icon {
      font-size: 4rem;
      color: #cbd5e0;
      margin-bottom: 1.5rem;
      display: block;
    }
    
    h3 {
      margin: 0 0 0.5rem;
      color: #4a5568;
    }
    
    p {
      margin: 0 0 1.5rem;
      color: #718096;
    }
  }
}

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

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 1rem;
    
    h3 {
      margin: 0;
      font-size: 1.3rem;
      color: #2d3748;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    
    .task-count {
      font-size: 0.9rem;
      background-color: #edf2f7;
      padding: 0.3rem 0.8rem;
      border-radius: 12px;
      color: #4a5568;
    }
  }
  
  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
}

.filter-select {
  padding: 0.6rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  background-color: white;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #4299e1;
  }
}

.btn-refresh {
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

.table-container {
  overflow-x: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  
  th {
    background-color: #f7fafc;
    font-weight: 500;
    color: #4a5568;
    white-space: nowrap;
  }
  
  .task-row {
    transition: all 0.2s ease;
    
    &:hover {
      background-color: #f8fafc;
    }
  }
  
  .command-cell {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    
    code {
      display: inline;
      padding: 0.2rem 0.4rem;
      background-color: #edf2f7;
      border-radius: 3px;
      font-family: monospace;
    }
  }
  
  .description-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #718096;
  }
}

.status-pending {
  color: #4299e1;
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

.error-hint {
  display: inline-block;
  margin-left: 0.5rem;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  background-color: #f56565;
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  cursor: help;
}

.actions {
  display: flex;
  gap: 0.5rem;
  
  button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1rem;
    
    &:hover {
      transform: scale(1.1);
    }
    
    &[title]:hover:after {
      content: attr(title);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background-color: #333;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      white-space: nowrap;
      z-index: 10;
    }
  }
  
  .btn-warning {
    background-color: #ed8936;
    color: white;
  }
  
  .btn-danger {
    background-color: #f56565;
    color: white;
  }
  
  .btn-success {
    background-color: #48bb78;
    color: white;
  }
  
  .btn-info {
    background-color: #4299e1;
    color: white;
  }
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
  
  .btn-pagination {
    padding: 0.6rem 1.2rem;
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
    
    &:hover:not(:disabled) {
      background-color: #edf2f7;
      border-color: #cbd5e0;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  
  .page-info {
    color: #718096;
    font-size: 0.95rem;
  }
}

/* 图标样式 */
.icon {
  font-style: normal;
  
  &-history:before { content: "🕒"; }
  &-empty:before { content: "📭"; }
  &-plus:before { content: "➕"; }
  &-refresh:before { content: "🔄"; }
  &-cancel:before { content: "✖️"; }
  &-delete:before { content: "🗑️"; }
  &-download:before { content: "⬇️"; }
  &-detail:before { content: "🔍"; }
  &-arrow-left:before { content: "←"; }
  &-arrow-right:before { content: "→"; }
}
</style>