<template>
  <div class="zgrab2-form">
    <h2>新建ZGrab2扫描任务</h2>
    
    <form @submit.prevent="submitForm">
      <div class="form-group">
        <label>扫描模式</label>
        <select v-model="form.mode" @change="handleModeChange">
          <option value="single">单模块扫描</option>
          <option value="multiple">多模块扫描</option>
        </select>
      </div>

      <div v-if="form.mode === 'single'" class="form-group">
        <label>选择模块</label>
        <select v-model="form.module" required>
          <option v-for="module in supportedModules" 
                  :value="module.module" 
                  :key="module.module">
            {{ module.module }} (默认端口: {{ module.defaultPort }})
          </option>
        </select>
      </div>
      
      <div class="form-group">
        <label>目标</label>
        <input v-model="form.target" type="text" placeholder="IP地址或域名" required>
      </div>
      
      <div v-if="form.mode === 'single'" class="form-group">
        <label>端口</label>
        <input v-model="form.port" type="number" :placeholder="defaultPort">
      </div>
      
      <div v-if="form.mode === 'multiple'" class="form-group">
        <label>配置文件</label>
        <textarea v-model="form.config" placeholder="输入INI格式的配置"></textarea>
      </div>
      
      <div class="form-actions">
        <button type="submit" :disabled="isLoading" class="btn btn-primary">
          {{ isLoading ? '提交中...' : '开始扫描' }}
        </button>
      </div>
      
      <div v-if="error" class="error">{{ error }}</div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useZgrab2Store } from '@/stores/zgrab2'

const router = useRouter()
const zgrab2Store = useZgrab2Store()

const form = ref({
  mode: 'single',
  module: '',
  target: '',
  port: '',
  config: ''
})

const isLoading = ref(false)
const error = ref(null)

const supportedModules = computed(() => zgrab2Store.supportedModules)
const defaultPort = computed(() => {
  const module = supportedModules.value.find(m => m.module === form.value.module)
  return module?.defaultPort || ''
})

const handleModeChange = () => {
  if (form.value.mode === 'multiple') {
    form.value.module = ''
    form.value.port = ''
  }
}

const submitForm = async () => {
  isLoading.value = true
  error.value = null
  
  try {
    const params = {
      target: form.value.target,
      module: form.value.mode === 'single' ? form.value.module : 'multiple',
      port: form.value.port || undefined,
      config: form.value.mode === 'multiple' ? form.value.config : undefined
    }
    
    const taskId = await zgrab2Store.createTask(params)
    router.push(`/zgrab2/${taskId}`)
  } catch (err) {
    error.value = err.message || '创建任务失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await zgrab2Store.fetchSupportedModules()
})
</script>

<style scoped>
.zgrab2-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.form-actions {
  margin-top: 20px;
}

.error {
  color: #f44336;
  margin-top: 10px;
}
</style>