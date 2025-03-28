<template>
    <div class="task-history">
      <table v-if="tasks.length > 0">
        <thead>
          <tr>
            <th>任务ID</th>
            <th>命令</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id">
            <td>{{ task.id }}</td>
            <td class="command-cell">{{ task.command }}</td>
            <td :class="'status-' + task.status">{{ task.status }}</td>
            <td>{{ formatDate(task.created_at) }}</td>
            <td class="actions">
              <button 
                v-if="['running'].includes(task.status)"
                @click="$emit('cancel-task', task.id)"
              >
                取消
              </button>
              <button 
                v-if="['completed', 'failed', 'canceled'].includes(task.status)"
                @click="$emit('delete-task', task.id)"
              >
                删除
              </button>
              <button 
                v-if="['completed', 'failed'].includes(task.status)"
                @click="$emit('view-log', task.id)"
              >
                日志
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="no-tasks">
        暂无任务记录
      </div>
    </div>
  </template>
  
  <script setup>
  defineProps({
    tasks: {
      type: Array,
      required: true,
      default: () => []
    }
  })
  
  defineEmits(['cancel-task', 'delete-task', 'view-log'])
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }
  </script>
  
  <style scoped>
  .task-history {
    margin-top: 20px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
  }
  .command-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .actions button {
    margin-right: 5px;
    padding: 3px 8px;
  }
  .no-tasks {
    padding: 20px;
    text-align: center;
    color: #888;
  }
  </style>