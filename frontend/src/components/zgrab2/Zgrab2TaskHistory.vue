<template>
  <div class="task-history">
    <div class="task-list">
      <div v-for="task in tasks" :key="task.id" class="task-item">
        <div class="task-header">
          <div class="task-title">
            <span class="task-id">#{{ task.id }}</span>
            <span class="task-description">{{ task.description || '无描述' }}</span>
          </div>
          <div class="task-status" :class="task.status">
            {{ getStatusText(task.status) }}
          </div>
        </div>

        <div class="task-info">
          <div class="info-row">
            <span class="info-label">模块:</span>
            <span class="info-value">{{ task.params?.module || '未知' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">目标:</span>
            <span class="info-value">{{ task.params?.target || '未知' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">端口:</span>
            <span class="info-value">{{ task.params?.port || '默认' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间:</span>
            <span class="info-value">{{ formatDate(task.created_at) }}</span>
          </div>
          <div v-if="task.completed_at" class="info-row">
            <span class="info-label">完成时间:</span>
            <span class="info-value">{{ formatDate(task.completed_at) }}</span>
          </div>
        </div>

        <div class="task-actions">
          <button
            v-if="task.status === 'running'"
            @click="$emit('cancel-task', task.id)"
            class="btn btn-warning btn-sm"
          >
            <i class="icon-stop"></i> 取消任务
          </button>
          <button
            v-if="task.status === 'completed'"
            @click="$emit('download-result', task.id)"
            class="btn btn-primary btn-sm"
          >
            <i class="icon-download"></i> 下载结果
          </button>
          <button
            @click="$emit('view-log', task.id)"
            class="btn btn-secondary btn-sm"
          >
            <i class="icon-file"></i> 查看日志
          </button>
          <button 
            @click="$emit('view-details', task.id)" 
            class="btn btn-info btn-sm"
          >
            <i class="icon-detail"></i> 查看详情
          </button>
          <button 
            @click="$emit('delete-task', task.id)" 
            class="btn btn-danger btn-sm"
          >
            <i class="icon-trash"></i> 删除
          </button>
        </div>
      </div>
    </div>

    <!-- 分页控件 -->
    <div v-if="pagination && pagination.totalPages > 1" class="pagination">
      <button 
        :disabled="pagination.page === 1"
        @click="$emit('page-change', pagination.page - 1)"
        class="btn btn-page"
      >
        <i class="icon-arrow-left"></i> 上一页
      </button>
      
      <span class="page-info">
        第 {{ pagination.page }} 页，共 {{ pagination.totalPages }} 页
      </span>
      
      <button 
        :disabled="pagination.page === pagination.totalPages"
        @click="$emit('page-change', pagination.page + 1)"
        class="btn btn-page"
      >
        下一页 <i class="icon-arrow-right"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { format } from 'date-fns'

const props = defineProps({
  tasks: {
    type: Array,
    required: true
  },
  pagination: {
    type: Object,
    default: () => ({
      page: 1,
      totalPages: 1
    })
  }
})

const getStatusText = (status) => {
  const statusMap = {
    'pending': '待处理',
    'running': '运行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

const formatDate = (dateString) => {
  return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss')
}
</script>

<style scoped lang="scss">
.task-history {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-item {
  background-color: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    transform: translateY(-1px);
  }
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  .task-id {
    font-weight: 600;
    color: #374151;
  }
  
  .task-description {
    color: #6b7280;
  }
}

.task-status {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  
  &.pending {
    background-color: #fef3c7;
    color: #92400e;
  }
  
  &.running {
    background-color: #dbeafe;
    color: #1e40af;
  }
  
  &.completed {
    background-color: #dcfce7;
    color: #166534;
  }
  
  &.failed {
    background-color: #fee2e2;
    color: #991b1b;
  }
}

.task-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background-color: #f9fafb;
  border-radius: 6px;
}

.info-row {
  display: flex;
  gap: 0.5rem;
  
  .info-label {
    font-weight: 500;
    color: #4b5563;
    min-width: 80px;
  }
  
  .info-value {
    color: #1f2937;
  }
}

.task-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.3s ease;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  &:hover::before {
    left: 100%;
  }

  &.btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    border-radius: 6px;
  }

  &.btn-primary {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #2563eb, #1e40af);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.btn-secondary {
    background: linear-gradient(135deg, #6b7280, #4b5563);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #4b5563, #374151);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.btn-info {
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.btn-warning {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #d97706, #b45309);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.btn-danger {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;

    &::before {
      display: none;
    }
  }
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
  padding: 1rem;
  
  .btn-page {
    background-color: #f3f4f6;
    color: #374151;
    
    &:hover:not(:disabled) {
      background-color: #e5e7eb;
    }
  }
  
  .page-info {
    color: #6b7280;
    font-size: 0.875rem;
  }
}

/* Icon styles */
.icon-download:before { content: "⬇️"; }
.icon-file:before { content: "📄"; }
.icon-detail:before { content: "👁️"; }
.icon-trash:before { content: "🗑️"; }
.icon-stop:before { content: "⏹️"; }
.icon-arrow-left:before { content: "←"; }
.icon-arrow-right:before { content: "→"; }

@media (max-width: 768px) {
  .task-info {
    grid-template-columns: 1fr;
  }
  
  .task-actions {
    flex-direction: column;
    
    .btn {
      width: 100%;
      justify-content: center;
    }
  }
}
</style>
