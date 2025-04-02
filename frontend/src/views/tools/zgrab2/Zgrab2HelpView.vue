<template>
  <div class="zgrab2-help">
    <div class="help-header">
      <h1><i class="icon-help"></i> ZGrab2 使用帮助</h1>
      <button class="btn btn-back" @click="goBack">
        <i class="icon-arrow-left"></i> 返回
      </button>
    </div>

    <div class="help-content">
      <div class="help-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTab === 'guide'" class="guide-section">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else class="markdown-content" v-html="compiledMarkdown"></div>
      </div>

      <div v-if="activeTab === 'modules'" class="modules-section">
        <h2>支持的模块列表</h2>
        <div v-if="loadingModules" class="loading">加载中...</div>
        <div v-else-if="modulesError" class="error">{{ modulesError }}</div>
        <div v-else>
          <table class="modules-table">
            <thead>
              <tr>
                <th>模块名称</th>
                <th>默认端口</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="module in supportedModules" :key="module.module">
                <td>{{ module.module }}</td>
                <td>{{ module.defaultPort }}</td>
                <td>{{ module.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useZgrab2Store } from '@/stores/zgrab2'
import { marked } from 'marked'

const router = useRouter()
const zgrab2Store = useZgrab2Store()

const activeTab = ref('guide')
const loading = ref(true)
const error = ref(null)
const loadingModules = ref(true)
const modulesError = ref(null)
const helpContent = ref('')
const supportedModules = ref([])

const tabs = [
  { id: 'guide', label: '使用指南' },
  { id: 'modules', label: '模块列表' }
]

const compiledMarkdown = computed(() => {
  return marked(helpContent.value)
})

const fetchHelpContent = async () => {
  loading.value = true
  try {
    const response = await fetch('/assets/zgrab2/docs/Getting-Started-Guide.md')
    helpContent.value = await response.text()
  } catch (err) {
    error.value = '加载帮助文档失败'
  } finally {
    loading.value = false
  }
}

const fetchSupportedModules = async () => {
  loadingModules.value = true
  try {
    await zgrab2Store.fetchSupportedModules()
    supportedModules.value = zgrab2Store.supportedModules
  } catch (err) {
    modulesError.value = '加载模块列表失败'
  } finally {
    loadingModules.value = false
  }
}

const goBack = () => {
  router.push('/tools/zgrab2')
}

onMounted(() => {
  fetchHelpContent()
  fetchSupportedModules()
})
</script>

<style scoped>
.zgrab2-help {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.help-tabs {
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

.markdown-content {
  padding: 20px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.modules-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

.modules-table th, .modules-table td {
  padding: 12px;
  border: 1px solid #ddd;
  text-align: left;
}

.modules-table th {
  background-color: #f5f5f5;
}

.loading, .error {
  text-align: center;
  padding: 40px;
}

.error {
  color: #f44336;
}
</style>