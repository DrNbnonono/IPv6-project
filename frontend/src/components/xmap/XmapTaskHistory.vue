<template>
    <div class="task-history">
      <div v-if="tasks.length === 0" class="empty-state">
        <p>暂无任务记录</p>
      </div>
      
      <table v-else class="task-table">
        <thead>
          <tr>
            <th>任务ID</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="task in tasks" :key="task.id">
            <!-- 主任务行 -->
            <tr @click="toggleTaskExpansion(task.id)" class="task-row">
              <td>{{ task.id }}</td>
              <td :class="'status-' + task.status">
                <span>{{ getStatusText(task.status) }}</span>
                <span v-if="task.error_message" class="error-hint" title="查看错误详情">!</span>
              </td>
              <td>{{ formatDate(task.created_at) }}</td>
              <td class="actions">
                <button 
                  v-if="task.status === 'running'"
                  @click.stop="emit('cancel-task', task.id)"
                  class="btn btn-warning"
                  title="取消任务"
                >
                  取消
                </button>
                
                <button 
                  v-if="['pending', 'completed', 'failed', 'canceled'].includes(task.status)"
                  @click.stop="handleDelete(task)"
                  class="btn btn-danger"
                  title="删除任务"
                >
                  删除
                </button>
                
                <button 
                  v-if="['completed', 'failed', 'canceled'].includes(task.status) && task.output_path"
                  @click.stop="emit('download-result', task.id)"
                  class="btn btn-success"
                  title="下载结果"
                >
                  结果
                </button>
                
                <button 
                  @click.stop="emit('view-details', task.id)"
                  class="btn btn-secondary"
                  title="查看详情"
                >
                  详情
                </button>
              </td>
            </tr>
            
            <!-- 展开的命令行 -->
            <tr v-if="expandedTasks.includes(task.id)" class="command-row">
              <td colspan="4">
                <div class="command-container">
                  <div class="command-line">
                    <strong>执行命令:</strong> 
                    <code>{{ task.command }}</code>
                  </div>
                  <div v-if="task.description" class="task-description">
                    <strong>任务描述:</strong> {{ task.description }}
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
  
      <!-- 分页控件 -->
      <div v-if="tasks.length > 0" class="pagination">
        <button 
          @click="changePage(pagination.page - 1)"
          :disabled="pagination.page <= 1"
          class="btn btn-pagination"
        >
          上一页
        </button>
        
        <span class="page-info">
          第 {{ pagination.page }} 页 / 共 {{ pagination.totalPages }} 页
        </span>
        
        <button 
          @click="changePage(pagination.page + 1)"
          :disabled="pagination.page >= pagination.totalPages"
          class="btn btn-pagination"
        >
          下一页
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  
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
    'page-change'
  ])
  
  const expandedTasks = ref([])
  
  const toggleTaskExpansion = (taskId) => {
    const index = expandedTasks.value.indexOf(taskId)
    if (index >= 0) {
      expandedTasks.value.splice(index, 1)
    } else {
      expandedTasks.value.push(taskId)
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
  
  const changePage = (newPage) => {
    expandedTasks.value = [] // 切换页面时收起所有展开的任务
    emit('page-change', newPage)
  }
  </script>
  
  <style scoped lang="scss">
  .task-history {
    .empty-state {
      padding: 2rem;
      text-align: center;
      color: #666;
      background-color: #f8f9fa;
      border-radius: 8px;
    }
  }
  
  .task-table {
    width: 100%;
    border-collapse: collapse;
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    
    th {
      background-color: #f8f9fa;
      font-weight: 500;
    }
    
    .task-row {
      cursor: pointer;
      
      &:hover {
        background-color: #f5f5f5;
      }
    }
    
    .command-row {
      background-color: #f8f9fa;
      
      td {
        padding: 0;
      }
      
      .command-container {
        padding: 1rem;
      }
    }
  }
  
  .status-pending {
    color: #2196f3;
  }
  
  .status-running {
    color: #ff9800;
  }
  
  .status-completed {
    color: #4caf50;
  }
  
  .status-failed, .status-canceled {
    color: #f44336;
  }
  
  .error-hint {
    display: inline-block;
    margin-left: 0.5rem;
    width: 18px;
    height: 18px;
    line-height: 18px;
    text-align: center;
    background-color: #f44336;
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
    cursor: help;
  }
  
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    
    button {
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      
      &:hover {
        opacity: 0.9;
        transform: translateY(-1px);
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
      background-color: #ff9800;
      color: white;
    }
    
    .btn-danger {
      background-color: #f44336;
      color: white;
    }
    
    .btn-info {
      background-color: #2196f3;
      color: white;
    }
    
    .btn-success {
      background-color: #4caf50;
      color: white;
    }
    
    .btn-secondary {
      background-color: #f0f0f0;
      color: #333;
    }
  }
  
  .command-line {
    margin-bottom: 0.5rem;
    word-break: break-all;
    
    code {
      display: inline;
      padding: 0.2rem 0.4rem;
      background-color: #f0f0f0;
      border-radius: 3px;
      font-family: monospace;
    }
  }
  
  .task-description {
    color: #666;
    font-size: 0.9rem;
  }
  
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
    
    .btn-pagination {
      padding: 0.5rem 1rem;
      background-color: #f0f0f0;
      color: #333;
      cursor: pointer;
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    
    .page-info {
      color: #666;
    }
  }
  </style>