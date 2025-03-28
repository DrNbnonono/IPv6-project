<template>
    <div class="task-history">
      <table>
        <thead>
          <tr>
            <th>任务ID</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id">
            <td>{{ task.id }}</td>
            <td>{{ task.status }}</td>
            <td>{{ new Date(task.created_at).toLocaleString() }}</td>
            <td>
              <button 
                v-if="['completed', 'failed'].includes(task.status)"
                @click="downloadLog(task.id)"
              >
                下载日志
              </button>
              <!-- 其他操作按钮... -->

              <!-- 在操作按钮部分添加下载按钮 -->
            <button 
            v-if="['completed'].includes(task.status)"
            @click="$emit('download-result', task.id)"
            >
            下载结果
            </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
  
  <script setup>
  import { useXmapStore } from '@/stores/xmapStore'
  
  const xmapStore = useXmapStore()
  
  const downloadLog = (taskId) => {
    xmapStore.downloadLog(taskId)
  }
  </script>