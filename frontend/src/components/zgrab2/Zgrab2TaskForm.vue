<template>
  <div class="parameter-form-container">
    <!-- 全局消息提示 -->
    <div v-if="errorMessage" class="message-banner error-banner">{{ errorMessage }}</div>
    <div v-if="successMessage" class="message-banner success-banner">{{ successMessage }}</div>

    <div class="form-header">
      <h2 class="form-title">
        <i class="icon-scan"></i> 扫描任务配置
      </h2>
      <button @click="addTaskConfig" class="btn btn-primary add-task-btn">
        <i class="icon-plus"></i> 添加新任务
      </button>
    </div>

    <div v-if="taskConfigs.length === 0" class="empty-state">
      <p>当前没有扫描任务，请点击"添加新任务"开始配置。</p>
    </div>

    <div v-for="(task, index) in taskConfigs" :key="task.id" class="task-card">
      <div class="task-card-header">
        <h3 class="task-title">任务 #{{ index + 1 }}</h3>
        <button 
          v-if="taskConfigs.length > 1" 
          @click="removeTaskConfig(index)" 
          class="btn btn-danger btn-sm remove-task-btn"
        >
          <i class="icon-trash"></i> 移除此任务
        </button>
      </div>

      <div class="task-card-body">
        <div class="form-row">
          <!-- 任务描述 -->
          <div class="form-group flex-grow-2">
            <label :for="`description-${task.id}`">任务描述</label>
            <input 
              :id="`description-${task.id}`"
              v-model="task.description" 
              type="text" 
              placeholder="例如：扫描HTTP服务"
              maxlength="255"
              class="form-input"
            />
          </div>

          <!-- 目标地址 -->
          <div class="form-group flex-grow-2">
            <label :for="`target-${task.id}`">目标地址</label>
            <input 
              :id="`target-${task.id}`"
              v-model="task.target" 
              placeholder="例如: example.com, 2001:db8::1"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-row">
          <!-- 扫描模块 -->
          <div class="form-group">
            <label :for="`module-${task.id}`">扫描模块</label>
            <select :id="`module-${task.id}`" v-model="task.module" class="form-select" required>
              <option v-for="module in supportedModules" 
                      :value="module.module" 
                      :key="module.module">
                {{ module.module }} (默认端口: {{ module.defaultPort }})
              </option>
            </select>
          </div>

          <!-- 端口 -->
          <div class="form-group">
            <label :for="`port-${task.id}`">端口</label>
            <input 
              :id="`port-${task.id}`"
              v-model="task.port" 
              type="number" 
              :placeholder="defaultPort(task.module)"
              class="form-input"
            />
          </div>

          <!-- 输出格式 -->
          <div class="form-group">
            <label :for="`outputFormat-${task.id}`">输出格式</label>
            <select :id="`outputFormat-${task.id}`" v-model="task.outputFormat" class="form-select">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <!-- 额外参数 -->
          <div class="form-group flex-grow-2">
            <label :for="`additionalParams-${task.id}`">额外参数</label>
            <textarea 
              :id="`additionalParams-${task.id}`"
              v-model="task.additionalParams" 
              placeholder="每行一个参数，格式：参数名=参数值"
              class="form-textarea"
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <p v-if="taskConfigs.length > 0" class="form-hint">
      提示: 您可以配置多个扫描任务一次性提交，系统将按顺序执行。
    </p>

    <!-- 批量任务结果 -->
    <div v-if="batchResults.length > 0" class="batch-results-container">
      <h4>批量任务提交结果:</h4>
      <ul>
        <li v-for="(result, idx) in batchResults" :key="idx" :class="result.success ? 'result-success' : 'result-error'">
          任务 {{ idx + 1 }}: {{ result.message }}
        </li>
      </ul>
    </div>

    <div class="form-actions-footer">
      <button @click="submitBatchForm" class="btn btn-success submit-all-btn" :disabled="isLoading || taskConfigs.length === 0">
        <i class="icon-play"></i> {{ isLoading ? '正在提交...' : '开始全部扫描' }}
      </button>
      <button type="button" class="btn btn-secondary reset-all-btn" @click="resetForm" :disabled="taskConfigs.length === 0">
        <i class="icon-reset"></i> 重置所有任务
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useZgrab2Store } from '@/stores/zgrab2'

const emit = defineEmits(['start-scan'])
const props = defineProps({
  isLoading: Boolean
})

const zgrab2Store = useZgrab2Store()
const supportedModules = ref([])

// Counter for generating unique task IDs
let taskIdCounter = 0

// Create a new default task configuration
function createTaskConfig() {
  taskIdCounter++
  return {
    id: taskIdCounter,
    description: '',
    target: '',
    module: '',
    port: '',
    outputFormat: 'json',
    additionalParams: ''
  }
}

// Initialize with one task configuration
const taskConfigs = ref([createTaskConfig()])
const errorMessage = ref('')
const successMessage = ref('')
const batchResults = ref([])

// Add a new task configuration
function addTaskConfig() {
  taskConfigs.value.push(createTaskConfig())
}

// Remove a task configuration by index
function removeTaskConfig(index) {
  if (taskConfigs.value.length > 1) {
    taskConfigs.value.splice(index, 1)
  }
}

// Get default port for a module
const defaultPort = (module) => {
  const moduleInfo = supportedModules.value.find(m => m.module === module)
  return moduleInfo?.defaultPort || ''
}

// Reset the form to its initial state
const resetForm = () => {
  taskConfigs.value = [createTaskConfig()]
  errorMessage.value = ''
  successMessage.value = ''
  batchResults.value = []
}

// Submit the batch form
const submitBatchForm = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  batchResults.value = []
  
  if (taskConfigs.value.length === 0) {
    errorMessage.value = '请至少配置一个扫描任务'
    return
  }
  
  let successCount = 0
  let failureCount = 0
  
  for (let i = 0; i < taskConfigs.value.length; i++) {
    const taskConfig = taskConfigs.value[i]
    
    // Parse additional parameters
    const additionalParams = {}
    if (taskConfig.additionalParams) {
      taskConfig.additionalParams.split('\n').forEach(line => {
        const [key, value] = line.split('=')
        if (key && value) {
          additionalParams[key.trim()] = value.trim()
        }
      })
    }
    
    const params = {
      ...taskConfig,
      additionalParams,
      port: taskConfig.port || undefined
    }
    
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === false || params[key] === null || key === 'id') {
        delete params[key]
      }
    })
    
    try {
      await emit('start-scan', params)
      successCount++
      batchResults.value.push({
        success: true,
        message: `任务 #${i+1} (${taskConfig.description || '无描述'}) 提交成功`
      })
    } catch (error) {
      failureCount++
      console.error(`Task ${i+1} submission failed:`, error)
      batchResults.value.push({
        success: false,
        message: `任务 #${i+1} (${taskConfig.description || '无描述'}) 提交失败: ${error.message || '未知错误'}`
      })
    }
  }
  
  if (successCount > 0 && failureCount === 0) {
    successMessage.value = `成功提交了 ${successCount} 个扫描任务`
    resetForm() 
  } else if (successCount > 0 && failureCount > 0) {
    successMessage.value = `成功提交了 ${successCount} 个任务，但有 ${failureCount} 个任务失败`
  } else {
    errorMessage.value = '所有任务提交失败，请检查配置'
  }
}

onMounted(async () => {
  try {
    await zgrab2Store.fetchSupportedModules()
    supportedModules.value = zgrab2Store.supportedModules
  } catch (error) {
    errorMessage.value = '获取支持的模块列表失败'
  }
})
</script>

<style scoped lang="scss">
.parameter-form-container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #333;
  max-width: 100%;
  margin: 20px auto;
  padding: 20px;
  background-color: #f9fafb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.message-banner {
  padding: 12px 18px;
  margin-bottom: 20px;
  border-radius: 6px;
  font-size: 0.95em;
  text-align: center;
}

.error-banner {
  background-color: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.success-banner {
  background-color: #f0fdf4;
  color: #14532d;
  border: 1px solid #bbf7d0;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e5e7eb;
}

.form-title {
  font-size: 1.6em;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-task-btn {
  padding: 10px 18px;
  font-size: 0.95em;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  background-color: #fff;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  margin-bottom: 20px;
  color: #6b7280;
}

.task-card {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
  overflow: hidden;
}

.task-card-header {
  background-color: #f9fafb;
  padding: 10px 15px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-title {
  font-size: 1.1em;
  font-weight: 500;
  color: #111827;
  margin: 0;
}

.remove-task-btn {
  padding: 5px 8px;
  font-size: 0.8em;
}

.task-card-body {
  padding: 15px;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 15px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1 1 auto;
  min-width: 180px;
}

.form-group.flex-grow-2 {
  flex-grow: 2;
}

.form-group label {
  font-size: 0.85em;
  font-weight: 500;
  color: #374151;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 0.9em;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background-color: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.form-textarea {
  min-height: 100px;
  resize: vertical;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: #3b82f6;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

.form-hint {
  font-size: 0.9em;
  color: #6b7280;
  margin-top: 20px;
  text-align: center;
}

.batch-results-container {
  margin-top: 25px;
  padding: 18px;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.batch-results-container h4 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1.15em;
  color: #1f2937;
}

.batch-results-container ul {
  list-style-type: none;
  padding-left: 0;
  margin-bottom: 0;
}

.batch-results-container li {
  padding: 8px 0;
  font-size: 0.95em;
  border-bottom: 1px solid #f3f4f6;
}

.batch-results-container li:last-child {
  border-bottom: none;
}

.result-success {
  color: #059669;
}

.result-error {
  color: #dc2626;
}

.form-actions-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.submit-all-btn,
.reset-all-btn {
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 500;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  text-align: center;
  vertical-align: middle;
  user-select: none;
  border: 1px solid transparent;
  padding: 0.5rem 1rem;
  font-size: 0.95rem;
  line-height: 1.5;
  border-radius: 6px;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
}

.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
}

.btn-primary {
  color: #fff;
  background-color: #3b82f6;
  border-color: #3b82f6;
}
.btn-primary:hover {
  background-color: #2563eb;
  border-color: #1d4ed8;
}

.btn-secondary {
  color: #fff;
  background-color: #6b7280;
  border-color: #6b7280;
}
.btn-secondary:hover {
  background-color: #4b5563;
  border-color: #374151;
}

.btn-success {
  color: #fff;
  background-color: #10b981;
  border-color: #10b981;
}
.btn-success:hover {
  background-color: #059669;
  border-color: #047857;
}

.btn-danger {
  color: #fff;
  background-color: #ef4444;
  border-color: #ef4444;
}
.btn-danger:hover {
  background-color: #dc2626;
  border-color: #b91c1c;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Icon Styles */
.icon-scan:before { content: "📡"; margin-right: 4px; }
.icon-play:before { content: "▶️"; }
.icon-reset:before { content: "🔄"; }
.icon-plus:before { content: "➕"; }
.icon-trash:before { content: "🗑️"; }

/* Responsive adjustments */
@media (max-width: 992px) {
  .form-row {
    flex-direction: column;
    gap: 10px;
  }
  .form-group {
    min-width: 100%;
  }
}

@media (max-width: 768px) {
  .form-header {
    flex-direction: column;
    gap: 15px;
    align-items: flex-start;
  }
  .form-actions-footer {
    flex-direction: column;
    gap: 10px;
  }
  .submit-all-btn,
  .reset-all-btn {
    width: 100%;
  }
}
</style>