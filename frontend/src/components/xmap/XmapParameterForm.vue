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
      <p>当前没有扫描任务，请点击“添加新任务”开始配置。</p>
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
              placeholder="例如：扫描办公网络HTTP服务"
              maxlength="255"
              class="form-input"
            />
          </div>

          <!-- 目标地址 -->
          <div class="form-group flex-grow-2">
            <label :for="`targetaddress-${task.id}`">目标地址/范围</label>
            <input 
              :id="`targetaddress-${task.id}`"
              v-model="task.targetaddress" 
              placeholder="例如: 2001:db8::/32, example.com, 192.168.1.0/24"
              class="form-input"
            />
          </div>
          
          <!-- 协议类型 -->
          <div class="form-group flex-grow-1">
            <label>协议类型</label>
            <div class="protocol-toggle-group">
              <button 
                type="button"
                :class="{ active: task.ipv6 }"
                @click="setProtocol(index, true)"
                class="toggle-btn ipv6-btn"
              >
                IPv6
              </button>
              <button 
                type="button"
                :class="{ active: !task.ipv6 }"
                @click="setProtocol(index, false)"
                class="toggle-btn ipv4-btn"
              >
                IPv4
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <!-- 扫描模式 -->
          <div class="form-group">
            <label :for="`probeModule-${task.id}`">扫描模式</label>
            <select :id="`probeModule-${task.id}`" v-model="task.probeModule" class="form-select">
              <option value="">默认模块</option>
              <option 
                v-for="moduleItem in getProbeModules(task)"
                :key="moduleItem"
                :value="moduleItem"
              >
                {{ moduleItem }}
              </option>
            </select>
          </div>

          <!-- 扫描速率 -->
          <div class="form-group">
            <label :for="`rate-${task.id}`">扫描速率 (Mbps)</label>
            <div class="input-with-unit">
              <input 
                :id="`rate-${task.id}`"
                v-model="task.rate" 
                type="number" 
                min="0.1" 
                step="0.1"
                placeholder="例如: 10"
                class="form-input"
              />
              <span class="unit-label">Mbps</span>
            </div>
          </div>

          <!-- 最大结果数 -->
          <div class="form-group">
            <label :for="`max_results-${task.id}`">最大结果数</label>
            <input 
              :id="`max_results-${task.id}`"
              v-model="task.max_results" 
              type="number" 
              min="1"
              placeholder="可选, 默认无限制"
              class="form-input"
            />
          </div>

          <!-- 扫描长度 -->
          <div class="form-group">
            <label :for="`maxlen-${task.id}`">扫描长度 (Bytes)</label>
            <input 
              :id="`maxlen-${task.id}`"
              v-model="task.maxlen" 
              type="number" 
              min="1"
              placeholder="可选, 默认自动计算"
              class="form-input"
            />
          </div>

          <!-- 目标端口 -->
          <div class="form-group">
            <label :for="`targetPort-${task.id}`">目标端口</label>
            <input 
              :id="`targetPort-${task.id}`"
              v-model="task.targetPort" 
              placeholder="可选, 例如: 80,443,100-200"
              class="form-input"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Global Whitelist Selection -->
    <div v-if="taskConfigs.length > 0" class="global-whitelist-section">
      <label>全局白名单文件 (可选, 应用于所有任务)</label>
      <XmapWhitelistSelect 
        :task-id="'global'" 
        v-model="globalWhitelistFile"
        @upload="handleGlobalWhitelistUpload"
        @error="handleWhitelistError"
      />
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
import { ref } from 'vue' // Removed computed as it's not used
import XmapWhitelistSelect from './XmapWhitelistSelect.vue'

const emit = defineEmits(['start-scan'])
const props = defineProps({
  isLoading: Boolean
})

// Counter for generating unique task IDs
let taskIdCounter = 0

// Create a new default task configuration
function createTaskConfig() {
  taskIdCounter++
  return {
    id: taskIdCounter,
    targetaddress: '',
    ipv6: true,
    ipv4: false,
    targetPort: '',
    rate: '',
    max_results: '',
    maxlen: '',
    // whitelistFile: '', // Removed: whitelist is now global
    description: '',
    probeModule: ''
  }
}

// Initialize with one task configuration
const taskConfigs = ref([createTaskConfig()])
const globalWhitelistFile = ref('') // New ref for global whitelist
const errorMessage = ref('')
const successMessage = ref('')
// const showAdvancedSettings = ref(false) // Removed as advanced settings are integrated
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

// Set protocol for a specific task
const setProtocol = (index, isIPv6) => {
  taskConfigs.value[index].ipv6 = isIPv6
  taskConfigs.value[index].ipv4 = !isIPv6
}

// Handle global whitelist upload
const handleGlobalWhitelistUpload = (file) => {
  globalWhitelistFile.value = file
  errorMessage.value = ''
  successMessage.value = '全局白名单文件上传成功'
  setTimeout(() => {
    successMessage.value = ''
  }, 3000)
}

// Handle whitelist error
const handleWhitelistError = (error) => {
  errorMessage.value = error
  successMessage.value = ''
  setTimeout(() => {
    errorMessage.value = ''
  }, 5000)
}

// Reset the form to its initial state
const resetForm = () => {
  taskConfigs.value = [createTaskConfig()]
  globalWhitelistFile.value = '' // Reset global whitelist
  errorMessage.value = ''
  successMessage.value = ''
  batchResults.value = []
}

// Get probe modules based on protocol type
const getProbeModules = (task) => {
  return task.ipv6 ? [
    'udp', 'dnsx', 'dnsa', 'dnsae', 'dnsan', 'dnsane', 'dnsane16',
    'dnsai', 'dnsaie', 'dnsap', 'dnsape', 'dnsaf', 'dnsafe',
    'tcp_syn', 'icmp_echo', 'icmp_echo_gw', 'icmp_echo_tmxd'
  ] : [
    'udp', 'dns', 'dnsr', 'dnsx', 'dnsf', 'dnsz', 'dnss', 'dnsv',
    'dnsa', 'dnsae', 'dnsan', 'dnsane', 'dnsane16', 'dnsai', 'dnsaie',
    'dnsap', 'dnsape', 'dnsaf', 'dnsafe', 'tcp_scan', 'tcp_syn', 'icmp_echo'
  ]
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
    
    const params = {
      ...taskConfig,
      ipv6: taskConfig.ipv6,
      ipv4: taskConfig.ipv4,
      rate: taskConfig.rate ? `${taskConfig.rate}M` : '',
      whitelistFile: globalWhitelistFile.value || '' // Add global whitelist
    }
    
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === false || params[key] === null || key === 'id') {
        if (key !== 'whitelistFile' || params[key] === null) { // Allow empty whitelistFile string if not null
             delete params[key];
        }
      }
    })
     if (params.whitelistFile === '') {
        delete params.whitelistFile;
    }
    
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
</script>

<style scoped lang="scss">
.parameter-form-container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #333;
  max-width: 100%; /* Changed from 900px */
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
  background-color: #fef2f2; /* Tailwind red-50 */
  color: #991b1b; /* Tailwind red-800 */
  border: 1px solid #fecaca; /* Tailwind red-300 */
}

.success-banner {
  background-color: #f0fdf4; /* Tailwind green-50 */
  color: #14532d; /* Tailwind green-900 */
  border: 1px solid #bbf7d0; /* Tailwind green-300 */
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e5e7eb; /* Tailwind gray-200 */
}

.form-title {
  font-size: 1.6em;
  font-weight: 600;
  color: #1f2937; /* Tailwind gray-800 */
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
  border: 1px dashed #d1d5db; /* Tailwind gray-300 */
  border-radius: 8px;
  margin-bottom: 20px;
  color: #6b7280; /* Tailwind gray-500 */
}

.task-card {
  background-color: #ffffff;
  border: 1px solid #e5e7eb; /* Tailwind gray-200 */
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px; /* Reduced margin for compactness */
  overflow: hidden;
}

.task-card-header {
  background-color: #f9fafb; /* Tailwind gray-50 */
  padding: 10px 15px; /* Reduced padding */
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-title {
  font-size: 1.1em; /* Reduced font size */
  font-weight: 500;
  color: #111827; /* Tailwind gray-900 */
  margin: 0;
}

.remove-task-btn {
  padding: 5px 8px; /* Reduced padding */
  font-size: 0.8em; /* Reduced font size */
}

.task-card-body {
  padding: 15px; /* Reduced padding */
}

.form-row {
  display: flex;
  flex-wrap: wrap; /* Allow wrapping on smaller screens */
  gap: 15px; /* Space between items in a row */
  margin-bottom: 15px; /* Space between rows */
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px; /* Reduced gap */
  flex: 1 1 auto; /* Allow items to grow and shrink */
  min-width: 180px; /* Minimum width for form groups */
}

.form-group.flex-grow-1 { /* For smaller elements like protocol toggle */
  flex-grow: 1;
}
.form-group.flex-grow-2 { /* For larger elements like description/target */
  flex-grow: 2;
}


.form-group label {
  font-size: 0.85em; /* Reduced font size */
  font-weight: 500;
  color: #374151; /* Tailwind gray-700 */
}

.form-input,
.form-select {
  width: 100%;
  padding: 8px 12px; /* Reduced padding */
  font-size: 0.9em; /* Reduced font size */
  border: 1px solid #d1d5db; /* Tailwind gray-300 */
  border-radius: 6px;
  background-color: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  border-color: #3b82f6; /* Tailwind blue-500 */
  outline: 0;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

.input-with-unit {
  position: relative;
  display: flex;
}

.input-with-unit .form-input {
  padding-right: 45px; /* Space for unit */
}

.unit-label {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  display: flex;
  align-items: center;
  padding: 0 10px; /* Reduced padding */
  background-color: #f3f4f6; /* Tailwind gray-100 */
  border-left: 1px solid #d1d5db;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  font-size: 0.85em; /* Reduced font size */
  color: #4b5563; /* Tailwind gray-600 */
  pointer-events: none;
}

.protocol-toggle-group {
  display: flex;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
  height: 35px; /* Match input height */
}

.toggle-btn {
  flex: 1;
  padding: 8px 10px; /* Reduced padding */
  border: none;
  background-color: #fff;
  cursor: pointer;
  font-size: 0.9em; /* Reduced font size */
  color: #374151;
  transition: background-color 0.2s ease, color 0.2s ease;
  display: flex; /* Center text */
  align-items: center; /* Center text */
  justify-content: center; /* Center text */
}

.toggle-btn:not(:last-child) {
  border-right: 1px solid #d1d5db;
}

.toggle-btn.active {
  background-color: #3b82f6; /* Tailwind blue-500 */
  color: #fff;
  font-weight: 500;
}

.toggle-btn.ipv6-btn.active {
  background-color: #10b981; /* Tailwind emerald-500 */
}

.toggle-btn.ipv4-btn.active {
  background-color: #f59e0b; /* Tailwind amber-500 */
}

.global-whitelist-section {
  margin-top: 20px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.global-whitelist-section label {
  display: block;
  font-size: 0.9em;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.form-hint {
  font-size: 0.9em;
  color: #6b7280; /* Tailwind gray-500 */
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
  border-bottom: 1px solid #f3f4f6; /* Tailwind gray-100 */
}

.batch-results-container li:last-child {
  border-bottom: none;
}

.result-success {
  color: #059669; /* Tailwind emerald-600 */
}

.result-error {
  color: #dc2626; /* Tailwind red-600 */
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
  padding: 10px 20px; /* Reduced padding */
  font-size: 0.95em; /* Reduced font size */
  font-weight: 500;
}

/* General Button Styles (reused from previous, can be global) */
.btn {
  display: inline-flex; /* Use flex for icon alignment */
  align-items: center; /* Vertically align icon and text */
  gap: 8px; /* Space between icon and text */
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
  background-color: #3b82f6; /* Tailwind blue-500 */
  border-color: #3b82f6;
}
.btn-primary:hover {
  background-color: #2563eb; /* Tailwind blue-600 */
  border-color: #1d4ed8; /* Tailwind blue-700 */
}

.btn-secondary {
  color: #fff;
  background-color: #6b7280; /* Tailwind gray-500 */
  border-color: #6b7280;
}
.btn-secondary:hover {
  background-color: #4b5563; /* Tailwind gray-600 */
  border-color: #374151; /* Tailwind gray-700 */
}

.btn-success {
  color: #fff;
  background-color: #10b981; /* Tailwind emerald-500 */
  border-color: #10b981;
}
.btn-success:hover {
  background-color: #059669; /* Tailwind emerald-600 */
  border-color: #047857; /* Tailwind emerald-700 */
}

.btn-danger {
  color: #fff;
  background-color: #ef4444; /* Tailwind red-500 */
  border-color: #ef4444;
}
.btn-danger:hover {
  background-color: #dc2626; /* Tailwind red-600 */
  border-color: #b91c1c; /* Tailwind red-700 */
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Icon Styles (ensure these are defined or use an icon library) */
.icon-scan:before { content: "📡"; margin-right: 4px; }
.icon-play:before { content: "▶️"; }
.icon-reset:before { content: "🔄"; }
.icon-plus:before { content: "➕"; }
.icon-trash:before { content: "🗑️"; }

/* Responsive adjustments */
@media (max-width: 992px) { /* Adjusted breakpoint for better wrapping */
  .form-row {
    flex-direction: column; /* Stack items in a row vertically on medium screens */
    gap: 10px;
  }
  .form-group {
    min-width: 100%; /* Full width for stacked items */
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