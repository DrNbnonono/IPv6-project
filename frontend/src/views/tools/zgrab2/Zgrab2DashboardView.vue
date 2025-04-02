<template>
  <div class="zgrab2-dashboard">
    <div class="dashboard-header">
      <h2><i class="icon-zgrab2"></i> ZGrab2探测工具</h2>
      <div class="header-actions">
        <button @click="goToHelp" class="btn btn-help">
          <i class="icon-help"></i> 使用帮助
        </button>
      </div>
    </div>

    <div class="dashboard-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="dashboard-content">
      <div v-if="activeTab === 'config'" class="config-section">
        <Zgrab2TaskForm @task-created="handleTaskCreated" />
      </div>

      <div v-if="activeTab === 'history'" class="history-section">
        <div class="section-header">
          <h3><i class="icon-history"></i> 任务历史</h3>
          <div class="history-filters">
            <select v-model="statusFilter" @change="fetchTasks">
              <option value="">所有状态</option>
              <option value="pending">待处理</option>
              <option value="running">运行中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
          </div>
        </div>

        <div v-if="tasks.length === 0" class="no-tasks">
          暂无任务记录
        </div>
        <div v-else>
          <table class="task-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>模块</th>
                <th>目标</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id">
                <td>{{ task.id }}</td>
                <td>{{ task.params.module || 'multiple' }}</td>
                <td>{{ task.params.target }}</td>
                <td :class="`status-${task.status}`">{{ task.status }}</td>
                <td>{{ formatDate(task.created_at) }}</td>
                <td>
                  <button @click="viewTaskDetails(task.id)" class="btn btn-sm btn-primary">
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="activeTab === 'details' && currentTask" class="details-section">
        <Zgrab2TaskDetails :task="currentTask" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useZgrab2Store } from '@/stores/zgrab2'
import Zgrab2TaskForm from '@/components/zgrab2/Zgrab2TaskForm.vue'
import Zgrab2TaskDetails from '@/components/zgrab2/Zgrab2TaskDetails.vue'
import { format } from 'date-fns'

const router = useRouter()
const zgrab2Store = useZgrab2Store()

const activeTab = ref('config')
const statusFilter = ref('')
const tasks = ref([])
const currentTask = ref(null)

const tabs = [
  { id: 'config', label: '新建任务' },
  { id: 'history', label: '任务历史' },
  { id: 'details', label: '任务详情' }
]

const formatDate = (dateString) => {
  return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss')
}

const fetchTasks = async () => {
  try {
    const params = {}
    if (statusFilter.value) {
      params.status = statusFilter.value
    }
    const response = await zgrab2Store.fetchTasks(params)
    tasks.value = response
  } catch (err) {
    console.error('获取任务列表失败:', err)
  }
}

const viewTaskDetails = async (taskId) => {
  try {
    const task = await zgrab2Store.fetchTaskDetails(taskId)
    currentTask.value = task
    activeTab.value = 'details'
  } catch (err) {
    console.error('获取任务详情失败:', err)
  }
}

const handleTaskCreated = (taskId) => {
  viewTaskDetails(taskId)
}

const goToHelp = () => {
  router.push('/tools/zgrab2/help')
}

onMounted(() => {
  fetchTasks()
})
</script>

<style scoped>
.zgrab2-dashboard {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.dashboard-tabs {
  display: flex;
  margin-bottom: 20px;
  border-bottom: 1px solid #ddd;
}

.tab-button {
  padding: 10px 20px;
  background: none;
  border: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab-button.active {
  border-bottom-color: #2196f3;
  color: #2196f3;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
}

.task-table th, .task-table td {
  padding: 10px;
  border: 1px solid #ddd;
  text-align: left;
}

.task-table th {
  background-color: #f5f5f5;
}

.status-pending {
  color: #ff9800;
}

.status-running {
  color: #2196f3;
}

.status-completed {
  color: #4caf50;
}

.status-failed {
  color: #f44336;
}

.no-tasks {
  text-align: center;
  padding: 20px;
  color: #888;
}
</style>