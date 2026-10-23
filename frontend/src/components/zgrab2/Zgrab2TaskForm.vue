<template>
  <div class="zgrab2-form-container">
    <!-- 全局消息提示 -->
    <div v-if="errorMessage" class="message-banner error-banner">{{ errorMessage }}</div>
    <div v-if="successMessage" class="message-banner success-banner">{{ successMessage }}</div>

    <div class="form-header">
      <h2 class="form-title">
        <i class="icon-scan"></i> Zgrab2 扫描任务配置
      </h2>
    </div>

    <div class="task-form">
      <div class="form-section">
        <ScanPresetPanel :modules="supportedModules" @applied="onPresetApplied" />
      </div>

      <div class="form-section">
        <h3 class="section-title">基本配置</h3>

        <div class="form-row">
          <!-- 任务描述 -->
          <div class="form-group flex-grow-2">
            <label for="description">任务描述</label>
            <input
              id="description"
              v-model="taskConfig.description"
              type="text"
              placeholder="例如：扫描HTTP服务"
              maxlength="255"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-row">
          <!-- 扫描模式 -->
          <div class="form-group">
            <label for="scanMode">扫描模式</label>
            <select id="scanMode" v-model="taskConfig.scanMode" class="form-select" @change="onScanModeChange">
              <option value="single">单模块扫描</option>
              <option value="multiple">多模块扫描(配置文件)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 单模块扫描配置 -->
      <div v-if="taskConfig.scanMode === 'single'" class="form-section">
        <h3 class="section-title">单模块扫描配置</h3>

        <div class="form-row">
          <!-- 扫描模块 -->
          <div class="form-group">
            <label for="module">扫描模块</label>
            <select id="module" v-model="taskConfig.module" class="form-select" required>
              <option value="">请选择模块</option>
              <option v-for="module in supportedModules"
                      :value="module.module"
                      :key="module.module">
                {{ module.module }} - {{ module.description }} (默认端口: {{ module.defaultPort }})
              </option>
            </select>
          </div>

          <!-- 端口 -->
          <div class="form-group">
            <label for="port">端口</label>
            <input
              id="port"
              v-model="taskConfig.port"
              type="number"
              :placeholder="getDefaultPort()"
              class="form-input"
            />
          </div>
        </div>


        <div class="form-row">
          <!-- 额外参数 -->
          <div class="form-group flex-grow-2">
            <label for="additionalParams">额外参数 (可选)</label>
            <textarea
              id="additionalParams"
              v-model="taskConfig.additionalParams"
              placeholder="例如: timeout=30,retries=3 (每行一个参数，格式: key=value)"
              rows="3"
              class="form-textarea"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- 多模块扫描配置 -->
      <div v-if="taskConfig.scanMode === 'multiple'" class="form-section">
        <h3 class="section-title">多模块扫描配置</h3>

        <div class="form-row">
          <!-- 配置文件选择 -->
          <div class="form-group flex-grow-2">
            <label for="configFile">配置文件</label>
            <div class="file-select-group">
              <select id="configFile" v-model="taskConfig.configFile" class="form-select">
                <option value="">请选择配置文件</option>
                <option v-for="config in configs"
                        :value="config.file_name"
                        :key="config.id">
                  {{ config.file_name }}
                </option>
              </select>
              <button @click="showConfigUpload = true" class="btn btn-secondary btn-sm">
                <i class="icon-upload"></i> 上传新配置
              </button>
              <button @click="showConfigManager = true" class="btn btn-secondary btn-sm">
                <i class="icon-manage"></i> 管理文件
              </button>
            </div>
          </div>
        </div>

        <!-- 配置文件内容预览 -->
        <div v-if="taskConfig.configFile" class="config-preview">
          <h4>配置文件示例格式：</h4>
          <pre class="config-example">
[http]
name="http"
port=80
endpoint="/"

[https]
name="https"
port=443
endpoint="/"
          </pre>
        </div>
      </div>

      <!-- 输入文件配置 -->
      <div class="form-section">
        <h3 class="section-title">输入文件配置</h3>

        <div class="form-row">
          <!-- 输入文件选择 -->
          <div class="form-group flex-grow-2">
            <label for="inputFile">输入文件</label>
            <div class="file-select-group">
              <select id="inputFile" v-model="taskConfig.inputFile" class="form-select" required>
                <option value="">请选择输入文件</option>
                <option v-for="file in inputFiles"
                        :value="file.file_name"
                        :key="file.id">
                  {{ file.file_name }}
                </option>
              </select>
              <button @click="showFileUpload = true" class="btn btn-secondary btn-sm">
                <i class="icon-upload"></i> 上传新文件
              </button>
              <button @click="showInputManager = true" class="btn btn-secondary btn-sm">
                <i class="icon-manage"></i> 管理文件
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 提交按钮 -->
      <div class="form-actions">
        <button @click="submitTask" :disabled="isSubmitting || !isFormValid" class="btn btn-primary btn-lg">
          <i v-if="isSubmitting" class="icon-loading"></i>
          <i v-else class="icon-play"></i>
          {{ isSubmitting ? '正在启动...' : '启动扫描' }}
        </button>
      </div>
    </div>

    <!-- 配置文件上传对话框 -->
    <div v-if="showConfigUpload" class="modal-overlay" @click="showConfigUpload = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>上传配置文件</h3>
          <button @click="showConfigUpload = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="upload-method-tabs">
            <button
              @click="configUploadMethod = 'file'"
              :class="['tab-btn', { active: configUploadMethod === 'file' }]"
            >
              文件上传
            </button>
            <button
              @click="configUploadMethod = 'text'"
              :class="['tab-btn', { active: configUploadMethod === 'text' }]"
            >
              文本输入
            </button>
          </div>

          <!-- 文件上传方式 -->
          <div v-if="configUploadMethod === 'file'" class="upload-section">
            <div class="form-group">
              <label for="configFileInput">选择配置文件</label>
              <input
                id="configFileInput"
                type="file"
                accept=".ini,.txt"
                @change="handleConfigFileSelect"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="configFileDescription">文件描述 (可选)</label>
              <input
                id="configFileDescription"
                v-model="configUpload.description"
                type="text"
                placeholder="例如: HTTP和HTTPS扫描配置"
                class="form-input"
              />
            </div>
          </div>

          <!-- 文本输入方式 -->
          <div v-if="configUploadMethod === 'text'" class="upload-section">
            <div class="form-group">
              <label for="configFileName">文件名</label>
              <input
                id="configFileName"
                v-model="configUpload.fileName"
                type="text"
                placeholder="例如: my-config.ini"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="configContent">配置内容</label>
              <textarea
                id="configContent"
                v-model="configUpload.content"
                placeholder="请输入INI格式的配置内容..."
                rows="10"
                class="form-textarea"
              ></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showConfigUpload = false" class="btn btn-secondary">取消</button>
          <button
            @click="uploadConfig"
            :disabled="configUploadMethod === 'file' ? !configUpload.file : (!configUpload.fileName || !configUpload.content)"
            class="btn btn-primary"
          >
            上传
          </button>
        </div>
      </div>
    </div>

    <!-- 文件上传对话框 -->
    <div v-if="showFileUpload" class="modal-overlay" @click="showFileUpload = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>上传输入文件</h3>
          <button @click="showFileUpload = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="upload-section">
            <div class="form-group">
              <label for="fileInput">选择文件</label>
              <input
                id="fileInput"
                type="file"
                accept=".txt,.csv"
                @change="handleFileSelect"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="fileDescription">文件描述 (可选)</label>
              <input
                id="fileDescription"
                v-model="fileUpload.description"
                type="text"
                placeholder="例如: IPv6地址列表"
                class="form-input"
              />
            </div>
            <div class="upload-info">
              <p><strong>文件要求：</strong></p>
              <ul>
                <li>支持的文件格式：.txt, .csv</li>
                <li>文件内容应该是每行一个IP地址或域名</li>
                <li>文件大小不超过100MB</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showFileUpload = false" class="btn btn-secondary">取消</button>
          <button
            @click="uploadInputFile"
            :disabled="!fileUpload.file || isUploading"
            class="btn btn-primary"
          >
            <i v-if="isUploading" class="icon-loading"></i>
            {{ isUploading ? '上传中...' : '上传文件' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 配置文件管理对话框 -->
    <div v-if="showConfigManager" class="modal-overlay" @click="showConfigManager = false">
      <div class="modal-content file-manager-modal" @click.stop>
        <div class="modal-header">
          <h3>配置文件管理</h3>
          <button @click="showConfigManager = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-list">
            <div v-if="configs.length === 0" class="empty-state">
              <p>暂无配置文件</p>
            </div>
            <div v-for="config in configs" :key="config.id" class="file-item">
              <div class="file-info">
                <div class="file-name">{{ config.file_name }}</div>
                <div class="file-meta">
                  <span>{{ formatDate(config.uploaded_at) }}</span>
                  <span v-if="config.description">{{ config.description }}</span>
                </div>
              </div>
              <div class="file-actions">
                <button @click="viewFileContent(config)" class="btn btn-secondary btn-sm">
                  <i class="icon-view"></i> 查看
                </button>
                <button @click="deleteFileConfirm(config)" class="btn btn-danger btn-sm">
                  <i class="icon-delete"></i> 删除
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showConfigManager = false" class="btn btn-primary">关闭</button>
        </div>
      </div>
    </div>

    <!-- 输入文件管理对话框 -->
    <div v-if="showInputManager" class="modal-overlay" @click="showInputManager = false">
      <div class="modal-content file-manager-modal" @click.stop>
        <div class="modal-header">
          <h3>输入文件管理</h3>
          <button @click="showInputManager = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-list">
            <div v-if="inputFiles.length === 0" class="empty-state">
              <p>暂无输入文件</p>
            </div>
            <div v-for="file in inputFiles" :key="file.id" class="file-item">
              <div class="file-info">
                <div class="file-name">{{ file.file_name }}</div>
                <div class="file-meta">
                  <span>{{ formatDate(file.uploaded_at) }}</span>
                  <span v-if="file.description">{{ file.description }}</span>
                </div>
              </div>
              <div class="file-actions">
                <button @click="viewFileContent(file)" class="btn btn-secondary btn-sm">
                  <i class="icon-view"></i> 查看
                </button>
                <button @click="deleteFileConfirm(file)" class="btn btn-danger btn-sm">
                  <i class="icon-delete"></i> 删除
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showInputManager = false" class="btn btn-primary">关闭</button>
        </div>
      </div>
    </div>

    <!-- 文件内容查看对话框 -->
    <div v-if="showFileContent" class="modal-overlay" @click="showFileContent = false">
      <div class="modal-content file-content-modal" @click.stop>
        <div class="modal-header">
          <h3>文件内容 - {{ currentFileContent.fileName }}</h3>
          <button @click="showFileContent = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <pre class="file-content">{{ currentFileContent.content }}</pre>
        </div>
        <div class="modal-footer">
          <button @click="showFileContent = false" class="btn btn-primary">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useZgrab2Store } from '@/stores/zgrab2'
import { useFileStore } from '@/stores/file'
import ScanPresetPanel from './ScanPresetPanel.vue'

const emit = defineEmits(['task-created'])

const zgrab2Store = useZgrab2Store()
const fileStore = useFileStore()

// 响应式数据
const supportedModules = ref([])
const configs = ref([])
const inputFiles = ref([])
const errorMessage = ref('')
const successMessage = ref('')
const isSubmitting = ref(false)
const isUploading = ref(false)
const showConfigUpload = ref(false)
const showFileUpload = ref(false)
const showConfigManager = ref(false)
const showInputManager = ref(false)
const showFileContent = ref(false)
const currentFileContent = ref({ fileName: '', content: '' })

// 任务配置
const taskConfig = ref({
  description: '',
  scanMode: 'single', // 'single' 或 'multiple'
  module: '',
  port: '',
  inputFile: '',
  configFile: '',
  additionalParams: ''
})

// 配置文件上传
const configUpload = ref({
  fileName: '',
  content: '',
  description: '',
  file: null
})

const configUploadMethod = ref('file') // 'file' 或 'text'

// 输入文件上传
const fileUpload = ref({
  file: null,
  description: ''
})

// 计算属性
const isFormValid = computed(() => {
  const basic = taskConfig.value.inputFile && taskConfig.value.description

  if (taskConfig.value.scanMode === 'single') {
    return basic && taskConfig.value.module
  } else {
    return basic && taskConfig.value.configFile
  }
})

// 获取默认端口
const getDefaultPort = () => {
  if (!taskConfig.value.module) return ''
  const moduleInfo = supportedModules.value.find(m => m.module === taskConfig.value.module)
  return moduleInfo?.defaultPort || ''
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 扫描模式改变时的处理
const onScanModeChange = () => {
  // 清空相关字段
  taskConfig.value.module = ''
  taskConfig.value.port = ''
  taskConfig.value.configFile = ''
  taskConfig.value.additionalParams = ''
}

// 套用预设后：切到多模块扫描并选中生成的配置文件（配置文件列表已由 store 刷新）
const onPresetApplied = ({ fileName, name }) => {
  errorMessage.value = ''
  taskConfig.value.scanMode = 'multiple'
  taskConfig.value.module = ''
  taskConfig.value.port = ''
  taskConfig.value.configFile = fileName
  configs.value = zgrab2Store.configs
  if (!taskConfig.value.description) taskConfig.value.description = `扫描预设：${name}`
  successMessage.value = `已套用预设“${name}”，请选择输入文件后启动扫描`
}

// 上传配置文件
const uploadConfig = async () => {
  try {
    if (configUploadMethod.value === 'file') {
      // 文件上传方式
      if (!configUpload.value.file) {
        errorMessage.value = '请选择配置文件'
        return
      }

      await zgrab2Store.uploadConfig({
        file: configUpload.value.file,
        description: configUpload.value.description || 'Zgrab2配置文件'
      })
    } else {
      // 文本输入方式 - 创建临时文件
      if (!configUpload.value.fileName || !configUpload.value.content) {
        errorMessage.value = '文件名和配置内容不能为空'
        return
      }

      let fileName = configUpload.value.fileName
      if (!fileName.endsWith('.ini')) {
        fileName += '.ini'
      }

      // 创建文件对象
      const blob = new Blob([configUpload.value.content], { type: 'text/plain' })
      const file = new File([blob], fileName, { type: 'text/plain' })

      await zgrab2Store.uploadConfig({
        file: file,
        description: configUpload.value.description || 'Zgrab2配置文件'
      })
    }

    // 重新获取配置文件列表
    await loadConfigs()

    // 清空上传表单
    configUpload.value.fileName = ''
    configUpload.value.content = ''
    configUpload.value.description = ''
    configUpload.value.file = null
    showConfigUpload.value = false

    successMessage.value = '配置文件上传成功'
  } catch (error) {
    errorMessage.value = '配置文件上传失败: ' + (error.message || '未知错误')
  }
}

// 处理文件选择
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    fileUpload.value.file = file
  }
}

// 处理配置文件选择
const handleConfigFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    configUpload.value.file = file
  }
}

// 上传输入文件
const uploadInputFile = async () => {
  if (!fileUpload.value.file) return

  isUploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', fileUpload.value.file)
    formData.append('toolType', 'zgrab2')
    formData.append('fileType', 'input')  // 指定为输入文件
    formData.append('description', fileUpload.value.description || '')

    await fileStore.uploadFile(formData)

    // 重新获取输入文件列表
    await loadInputFiles()

    // 清空上传表单
    fileUpload.value.file = null
    fileUpload.value.description = ''
    showFileUpload.value = false

    successMessage.value = '输入文件上传成功'
  } catch (error) {
    errorMessage.value = '输入文件上传失败: ' + (error.message || '未知错误')
  } finally {
    isUploading.value = false
  }
}

// 提交任务
const submitTask = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  isSubmitting.value = true

  try {
    // 解析额外参数
    const additionalParams = {}
    if (taskConfig.value.additionalParams) {
      taskConfig.value.additionalParams.split('\n').forEach(line => {
        const [key, value] = line.split('=')
        if (key && value) {
          additionalParams[key.trim()] = value.trim()
        }
      })
    }

    const params = {
      description: taskConfig.value.description,
      inputFile: taskConfig.value.inputFile,
      additionalParams
    }

    if (taskConfig.value.scanMode === 'single') {
      params.module = taskConfig.value.module
      params.port = taskConfig.value.port || undefined
    } else {
      params.configFile = taskConfig.value.configFile
    }

    const response = await zgrab2Store.createTask(params)

    successMessage.value = `扫描任务已启动，任务ID: ${response.taskId}`

    // 重置表单
    taskConfig.value = {
      description: '',
      scanMode: 'single',
      module: '',
      port: '',
      inputFile: '',
      configFile: '',
      additionalParams: ''
    }

    // 通知父组件
    emit('task-created', response.taskId)

  } catch (error) {
    errorMessage.value = '启动扫描任务失败: ' + (error.message || '未知错误')
  } finally {
    isSubmitting.value = false
  }
}

// 加载数据
const loadSupportedModules = async () => {
  try {
    await zgrab2Store.fetchSupportedModules()
    supportedModules.value = zgrab2Store.supportedModules
  } catch (error) {
    console.error('获取支持的模块列表失败:', error)
  }
}

const loadConfigs = async () => {
  try {
    await zgrab2Store.fetchConfigs()
    configs.value = zgrab2Store.configs
  } catch (error) {
    console.error('获取配置文件列表失败:', error)
  }
}

const loadInputFiles = async () => {
  try {
    await zgrab2Store.fetchInputFiles()
    inputFiles.value = zgrab2Store.inputFiles
  } catch (error) {
    console.error('获取输入文件列表失败:', error)
  }
}

// 查看文件内容
const viewFileContent = async (file) => {
  try {
    console.log('查看文件内容:', file)
    const content = await zgrab2Store.getFileContent(file.id)
    console.log('获取到的文件内容:', content)
    currentFileContent.value = {
      fileName: file.file_name,
      content: content.content
    }
    showFileContent.value = true
  } catch (error) {
    console.error('查看文件内容失败:', error)
    errorMessage.value = '获取文件内容失败: ' + (error.message || '未知错误')
  }
}

// 删除文件确认
const deleteFileConfirm = async (file) => {
  if (confirm(`确定要删除文件 "${file.file_name}" 吗？此操作不可恢复。`)) {
    try {
      await zgrab2Store.deleteFile(file.id)
      successMessage.value = '文件删除成功'

      // 重新加载文件列表
      await Promise.all([loadConfigs(), loadInputFiles()])
    } catch (error) {
      errorMessage.value = '删除文件失败: ' + (error.message || '未知错误')
    }
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

// 组件挂载时加载数据
onMounted(async () => {
  await Promise.all([
    loadSupportedModules(),
    loadConfigs(),
    loadInputFiles()
  ])
})
</script>

<style scoped lang="scss">
.zgrab2-form-container {
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

.task-form {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.form-section {
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
}

.section-title {
  font-size: 1.2em;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 15px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #3b82f6;
  display: inline-block;
}

.file-select-group {
  display: flex;
  gap: 10px;
  align-items: center;

  .form-select {
    flex: 1;
  }
}

.config-preview {
  margin-top: 15px;
  padding: 15px;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;

  h4 {
    margin: 0 0 10px 0;
    font-size: 0.9em;
    color: #64748b;
  }
}

.config-example {
  background-color: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.85em;
  line-height: 1.4;
  margin: 0;
  overflow-x: auto;
}

.form-actions {
  padding: 20px;
  text-align: center;
  background-color: #f9fafb;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  padding: 20px 20px 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 1.3em;
    color: #1f2937;
  }
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: #6b7280;

  &:hover {
    color: #374151;
  }
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 0 20px 20px 20px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.upload-section {
  .upload-info {
    margin-top: 15px;
    padding: 12px;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;

    p {
      margin: 0 0 8px 0;
      font-weight: 500;
      color: #374151;
    }

    ul {
      margin: 0;
      padding-left: 20px;

      li {
        margin-bottom: 4px;
        color: #6b7280;
        font-size: 0.9em;
      }
    }
  }
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
.icon-upload:before { content: "📤"; }
.icon-loading:before { content: "⏳"; }
.icon-manage:before { content: "📁"; }
.icon-view:before { content: "👁️"; }
.icon-delete:before { content: "🗑️"; }

.btn-lg {
  padding: 12px 24px;
  font-size: 1.1rem;
}

.file-manager-modal {
  max-width: 800px;
  width: 95%;
}

.file-content-modal {
  max-width: 900px;
  width: 95%;
}

.file-list {
  max-height: 400px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  margin-bottom: 8px;

  &:hover {
    background-color: #f8fafc;
  }
}

.file-info {
  flex: 1;

  .file-name {
    font-weight: 500;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .file-meta {
    font-size: 0.85em;
    color: #6b7280;

    span {
      margin-right: 12px;
    }
  }
}

.file-actions {
  display: flex;
  gap: 8px;
}

.file-content {
  background-color: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
  line-height: 1.5;
  max-height: 500px;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;

  p {
    margin: 0;
    font-size: 1.1em;
  }
}

.upload-method-tabs {
  display: flex;
  margin-bottom: 20px;
  border-bottom: 1px solid #e2e8f0;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;

  &:hover {
    color: #374151;
  }

  &.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }
}

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

}
</style>