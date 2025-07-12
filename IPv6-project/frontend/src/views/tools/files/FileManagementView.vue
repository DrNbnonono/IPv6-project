<template>
  <div class="file-management-view">
    <div class="page-header">
      <div class="header-content">
        <h1><i class="icon-files"></i> 文件管理</h1>
        <p class="page-description">管理各种工具的配置文件和输入文件</p>
      </div>
    </div>

    <div class="management-container">
      <!-- 工具选择和过滤 -->
      <div class="filter-section">
        <div class="filter-group">
          <label>选择工具:</label>
          <select v-model="selectedTool" @change="handleToolChange" class="tool-select">
            <option value="">所有工具</option>
            <option v-for="tool in availableTools" :key="tool.value" :value="tool.value">
              {{ tool.label }}
            </option>
          </select>
        </div>
        
        <div class="filter-group" v-if="selectedTool === 'zgrab2'">
          <label>文件类型:</label>
          <select v-model="selectedFileType" @change="fetchFiles" class="file-type-select">
            <option value="">所有类型</option>
            <option value="config">配置文件</option>
            <option value="input">输入文件</option>
          </select>
        </div>

        <div class="action-buttons">
          <button class="btn btn-refresh" @click="fetchFiles">
            <i class="icon-refresh"></i> 刷新
          </button>
        </div>
      </div>

      <!-- 文件上传区域 -->
      <div class="upload-section">
        <div class="upload-tabs">
          <button
            class="tab-button"
            :class="{ active: uploadMode === 'file' }"
            @click="uploadMode = 'file'"
          >
            <i class="icon-upload"></i> 上传文件
          </button>
          <button
            class="tab-button"
            :class="{ active: uploadMode === 'create' }"
            @click="uploadMode = 'create'"
          >
            <i class="icon-create"></i> 创建文件
          </button>
        </div>

        <div class="upload-card">
          <h3 v-if="uploadMode === 'file'">
            <i class="icon-upload"></i> 上传文件
          </h3>
          <h3 v-else>
            <i class="icon-create"></i> 创建新文件
          </h3>

          <!-- 文件上传表单 -->
          <div v-if="uploadMode === 'file'" class="upload-form">
            <div class="form-row">
              <div class="form-group">
                <label>选择工具 <span class="required">*</span></label>
                <select v-model="uploadForm.toolType" class="form-select" required>
                  <option value="">请选择工具</option>
                  <option v-for="tool in availableTools" :key="tool.value" :value="tool.value">
                    {{ tool.label }}
                  </option>
                </select>
              </div>

              <div class="form-group" v-if="uploadForm.toolType === 'zgrab2'">
                <label>文件类型 <span class="required">*</span></label>
                <select v-model="uploadForm.fileType" class="form-select" required>
                  <option value="">请选择类型</option>
                  <option value="config">配置文件 (.ini)</option>
                  <option value="input">输入文件 (.txt)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>文件描述 <span class="required">*</span></label>
              <input
                v-model="uploadForm.description"
                type="text"
                class="form-input"
                placeholder="请输入文件描述"
                required
              >
            </div>

            <div class="form-group">
              <label>选择文件 <span class="required">*</span></label>
              <div class="file-upload-area">
                <input
                  type="file"
                  ref="fileInput"
                  @change="handleFileSelect"
                  :accept="getAcceptedFileTypes()"
                  class="file-input"
                >
                <div class="file-upload-display">
                  <span v-if="!uploadForm.file" class="upload-placeholder">
                    <i class="icon-upload"></i>
                    点击选择文件或拖拽文件到此处
                  </span>
                  <span v-else class="file-selected">
                    <i class="icon-file"></i>
                    {{ uploadForm.file.name }}
                    <button type="button" @click="clearFile" class="btn-clear">
                      <i class="icon-close"></i>
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <div class="upload-actions">
              <button
                class="btn btn-primary"
                @click="handleUpload"
                :disabled="!canUpload || isUploading"
              >
                <i class="icon-upload"></i>
                {{ isUploading ? '上传中...' : '上传文件' }}
              </button>
              <button class="btn btn-secondary" @click="resetForm">
                <i class="icon-reset"></i> 重置
              </button>
            </div>
          </div>

          <!-- 创建文件表单 -->
          <div v-else class="create-form">
            <div class="form-row">
              <div class="form-group">
                <label>选择工具 <span class="required">*</span></label>
                <select v-model="createForm.toolType" class="form-select" required>
                  <option value="">请选择工具</option>
                  <option v-for="tool in availableTools" :key="tool.value" :value="tool.value">
                    {{ tool.label }}
                  </option>
                </select>
              </div>

              <div class="form-group" v-if="createForm.toolType === 'zgrab2'">
                <label>文件类型 <span class="required">*</span></label>
                <select v-model="createForm.fileType" class="form-select" required>
                  <option value="">请选择类型</option>
                  <option value="config">配置文件 (.ini)</option>
                  <option value="input">输入文件 (.txt)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>文件名 <span class="required">*</span></label>
                <input
                  v-model="createForm.fileName"
                  type="text"
                  class="form-input"
                  :placeholder="getFileNamePlaceholder()"
                  required
                >
                <small class="form-hint">
                  {{ getFileExtensionHint() }}
                </small>
              </div>

              <div class="form-group">
                <label>文件描述 <span class="required">*</span></label>
                <input
                  v-model="createForm.description"
                  type="text"
                  class="form-input"
                  placeholder="请输入文件描述"
                  required
                >
              </div>
            </div>

            <div class="form-group">
              <label>文件内容 <span class="required">*</span></label>
              <div class="content-editor">
                <div class="editor-toolbar">
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    @click="insertTemplate"
                    v-if="createForm.toolType === 'zgrab2' && createForm.fileType === 'config'"
                  >
                    <i class="icon-template"></i> 插入模板
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    @click="clearContent"
                  >
                    <i class="icon-clear"></i> 清空
                  </button>
                  <span class="content-stats">
                    {{ getContentStats() }}
                  </span>
                </div>
                <textarea
                  v-model="createForm.content"
                  class="content-textarea"
                  :placeholder="getContentPlaceholder()"
                  rows="12"
                  required
                ></textarea>
              </div>
            </div>

            <div class="upload-actions">
              <button
                class="btn btn-primary"
                @click="handleCreateAndUpload"
                :disabled="!canCreateFile || isUploading"
              >
                <i class="icon-create"></i>
                {{ isUploading ? '创建中...' : '创建并上传' }}
              </button>
              <button class="btn btn-secondary" @click="resetCreateForm">
                <i class="icon-reset"></i> 重置
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="files-section">
        <div class="list-tabs">
          <button
            class="tab-button"
            :class="{ active: listType === 'upload' }"
            @click="switchListType('upload')"
          >
            <i class="icon-upload"></i> 上传文件列表
          </button>
          <button
            class="tab-button"
            :class="{ active: listType === 'task' }"
            @click="switchListType('task')"
          >
            <i class="icon-task"></i> 任务结果列表
          </button>
        </div>

        <div class="section-header">
          <h3>
            <i class="icon-list"></i>
            {{ listType === 'upload' ? '上传文件列表' : '任务结果列表' }}
          </h3>
          <div class="file-stats">
            <span class="stat-item">
              总计: {{ files.length }} 个文件
            </span>
          </div>
        </div>

        <div class="files-table-container">
          <table class="files-table" v-if="files.length > 0">
            <thead>
              <tr>
                <th>工具</th>
                <th v-if="listType === 'upload'">类型</th>
                <th v-if="listType === 'task'">状态</th>
                <th>文件名</th>
                <th>描述</th>
                <th>大小</th>
                <th v-if="listType === 'upload'">上传时间</th>
                <th v-if="listType === 'task'">创建时间</th>
                <th v-if="listType === 'task'">完成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in files" :key="file.id" class="file-row">
                <td>
                  <span class="tool-badge" :class="`tool-${file.tool_type}`">
                    {{ getToolLabel(file.tool_type) }}
                  </span>
                </td>
                <td v-if="listType === 'upload'">
                  <span class="file-type-badge" v-if="file.file_type">
                    {{ getFileTypeLabel(file.file_type) }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td v-if="listType === 'task'">
                  <span class="status-badge" :class="`status-${file.status}`">
                    {{ getStatusLabel(file.status) }}
                  </span>
                </td>
                <td class="file-name">
                  <i class="icon-file"></i>
                  {{ file.file_name }}
                </td>
                <td class="file-description">
                  {{ file.description || '无描述' }}
                </td>
                <td class="file-size">
                  <div v-if="listType === 'task'">
                    <div v-if="file.file_size">
                      结果: {{ formatFileSize(file.file_size) }}
                    </div>
                    <div v-if="file.log_file_size">
                      日志: {{ formatFileSize(file.log_file_size) }}
                    </div>
                    <div v-if="!file.file_size && !file.log_file_size">-</div>
                  </div>
                  <div v-else>
                    {{ formatFileSize(file.file_size) }}
                  </div>
                </td>
                <td v-if="listType === 'upload'" class="upload-time">
                  {{ formatDate(file.uploaded_at) }}
                </td>
                <td v-if="listType === 'task'" class="upload-time">
                  {{ formatDate(file.uploaded_at) }}
                </td>
                <td v-if="listType === 'task'" class="complete-time">
                  {{ formatDate(file.completed_at) }}
                </td>
                <td class="file-actions">
                  <template v-if="listType === 'upload'">
                    <button
                      class="btn btn-sm btn-info"
                      @click="viewFileContent(file)"
                      title="查看内容"
                    >
                      <i class="icon-view"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-success"
                      @click="downloadFile(file)"
                      title="下载文件"
                    >
                      <i class="icon-download"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="confirmDelete(file)"
                      title="删除文件"
                    >
                      <i class="icon-delete"></i>
                    </button>
                  </template>
                  <template v-else>
                    <button
                      class="btn btn-sm btn-info"
                      @click="viewFileContent(file, 'result')"
                      title="查看结果"
                      v-if="file.file_path"
                    >
                      <i class="icon-view"></i> 结果
                    </button>
                    <button
                      class="btn btn-sm btn-info"
                      @click="viewFileContent(file, 'log')"
                      title="查看日志"
                      v-if="file.log_path"
                    >
                      <i class="icon-view"></i> 日志
                    </button>
                    <button
                      class="btn btn-sm btn-success"
                      @click="downloadFile(file, 'result')"
                      title="下载结果"
                      v-if="file.file_path"
                    >
                      <i class="icon-download"></i> 结果
                    </button>
                    <button
                      class="btn btn-sm btn-success"
                      @click="downloadFile(file, 'log')"
                      title="下载日志"
                      v-if="file.log_path"
                    >
                      <i class="icon-download"></i> 日志
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-else class="empty-state">
            <i class="icon-empty"></i>
            <h4>暂无文件</h4>
            <p>{{ getEmptyMessage() }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 文件内容查看模态框 -->
    <div v-if="showContentModal" class="modal-overlay" @click="closeContentModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3><i class="icon-view"></i> 文件内容 - {{ currentFile?.file_name }}</h3>
          <button class="btn-close" @click="closeContentModal">
            <i class="icon-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <pre class="file-content">{{ fileContent }}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeContentModal">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useFileStore } from '@/stores/file'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const fileStore = useFileStore()

// 响应式数据
const selectedTool = ref('')
const selectedFileType = ref('')
const listType = ref('upload') // 'upload' 或 'task'
const files = ref([])
const isLoading = ref(false)
const isUploading = ref(false)
const showContentModal = ref(false)
const currentFile = ref(null)
const fileContent = ref('')
const uploadMode = ref('file') // 'file' 或 'create'

// 上传表单
const uploadForm = ref({
  toolType: '',
  fileType: '',
  description: '',
  file: null
})

// 创建文件表单
const createForm = ref({
  toolType: '',
  fileType: '',
  fileName: '',
  description: '',
  content: ''
})

const fileInput = ref(null)

// 可用工具列表
const availableTools = ref([
  { value: 'xmap', label: 'XMap探测工具' },
  { value: 'zgrab2', label: 'ZGrab2扫描工具' },
  { value: 'database', label: '数据库工具' }
])

// 计算属性
const canUpload = computed(() => {
  const hasRequiredFields = uploadForm.value.toolType &&
                           uploadForm.value.description &&
                           uploadForm.value.file

  if (uploadForm.value.toolType === 'zgrab2') {
    return hasRequiredFields && uploadForm.value.fileType
  }

  return hasRequiredFields
})

const canCreateFile = computed(() => {
  const hasRequiredFields = createForm.value.toolType &&
                           createForm.value.fileName &&
                           createForm.value.description &&
                           createForm.value.content.trim()

  if (createForm.value.toolType === 'zgrab2') {
    return hasRequiredFields && createForm.value.fileType
  }

  return hasRequiredFields
})

// 方法
const handleToolChange = () => {
  selectedFileType.value = ''
  fetchFiles()
}

const fetchFiles = async () => {
  try {
    isLoading.value = true
    const response = await fileStore.getFiles(selectedTool.value, selectedFileType.value, listType.value)
    if (response && response.success) {
      files.value = response.data || []
    }
  } catch (error) {
    ElMessage.error('获取文件列表失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const switchListType = (newListType) => {
  listType.value = newListType
  // 切换列表类型时重置筛选条件
  selectedTool.value = ''
  selectedFileType.value = ''
  fetchFiles()
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    uploadForm.value.file = file
  }
}

const clearFile = () => {
  uploadForm.value.file = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const getAcceptedFileTypes = () => {
  if (uploadForm.value.toolType === 'zgrab2') {
    if (uploadForm.value.fileType === 'config') {
      return '.ini'
    } else if (uploadForm.value.fileType === 'input') {
      return '.txt'
    }
  }
  return '.txt,.ini,.csv'
}

const handleUpload = async () => {
  if (!canUpload.value) return
  
  try {
    isUploading.value = true
    
    const formData = new FormData()
    formData.append('file', uploadForm.value.file)
    formData.append('toolType', uploadForm.value.toolType)
    formData.append('description', uploadForm.value.description)
    
    if (uploadForm.value.fileType) {
      formData.append('fileType', uploadForm.value.fileType)
    }
    
    const response = await fileStore.uploadFile(formData)
    
    if (response && response.success) {
      ElMessage.success('文件上传成功')
      resetForm()
      fetchFiles()
    }
  } catch (error) {
    ElMessage.error('文件上传失败: ' + error.message)
  } finally {
    isUploading.value = false
  }
}

const resetForm = () => {
  uploadForm.value = {
    toolType: '',
    fileType: '',
    description: '',
    file: null
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const resetCreateForm = () => {
  createForm.value = {
    toolType: '',
    fileType: '',
    fileName: '',
    description: '',
    content: ''
  }
}

const getFileNamePlaceholder = () => {
  if (createForm.value.toolType === 'zgrab2') {
    if (createForm.value.fileType === 'config') {
      return '例如: my-config.ini'
    } else if (createForm.value.fileType === 'input') {
      return '例如: targets.txt'
    }
  }
  return '例如: my-file.txt'
}

const getFileExtensionHint = () => {
  if (createForm.value.toolType === 'zgrab2') {
    if (createForm.value.fileType === 'config') {
      return '配置文件建议使用 .ini 扩展名'
    } else if (createForm.value.fileType === 'input') {
      return '输入文件建议使用 .txt 扩展名'
    }
  }
  return '请包含适当的文件扩展名'
}

const getContentPlaceholder = () => {
  if (createForm.value.toolType === 'zgrab2') {
    if (createForm.value.fileType === 'config') {
      return `请输入ZGrab2配置文件内容，例如：

[http]
name="http"
port=80
endpoint="/"

[https]
name="https"
port=443
endpoint="/"`
    } else if (createForm.value.fileType === 'input') {
      return `请输入目标地址，每行一个，例如：

google.com
github.com
stackoverflow.com`
    }
  } else if (createForm.value.toolType === 'xmap') {
    return `请输入XMap白名单内容，每行一个地址或网段，例如：

192.168.1.0/24
10.0.0.0/8
172.16.0.0/12`
  }
  return '请输入文件内容...'
}

const getContentStats = () => {
  const content = createForm.value.content
  const lines = content.split('\n').length
  const chars = content.length
  return `${lines} 行, ${chars} 字符`
}

const insertTemplate = () => {
  if (createForm.value.toolType === 'zgrab2' && createForm.value.fileType === 'config') {
    const template = `[http]
name="http"
port=80
endpoint="/"

[https]
name="https"
port=443
endpoint="/"

[ssh]
name="ssh"
port=22`
    createForm.value.content = template
  }
}

const clearContent = () => {
  createForm.value.content = ''
}

const handleCreateAndUpload = async () => {
  if (!canCreateFile.value) return

  try {
    isUploading.value = true

    // 确保文件名有正确的扩展名
    let fileName = createForm.value.fileName
    if (createForm.value.toolType === 'zgrab2') {
      if (createForm.value.fileType === 'config' && !fileName.endsWith('.ini')) {
        fileName += '.ini'
      } else if (createForm.value.fileType === 'input' && !fileName.endsWith('.txt')) {
        fileName += '.txt'
      }
    } else if (!fileName.includes('.')) {
      fileName += '.txt'
    }

    // 创建文件对象
    const blob = new Blob([createForm.value.content], { type: 'text/plain' })
    const file = new File([blob], fileName, { type: 'text/plain' })

    // 创建FormData
    const formData = new FormData()
    formData.append('file', file)
    formData.append('toolType', createForm.value.toolType)
    formData.append('description', createForm.value.description)

    if (createForm.value.fileType) {
      formData.append('fileType', createForm.value.fileType)
    }

    const response = await fileStore.uploadFile(formData)

    if (response && response.success) {
      ElMessage.success('文件创建并上传成功')
      resetCreateForm()
      fetchFiles()
    }
  } catch (error) {
    ElMessage.error('文件创建失败: ' + error.message)
  } finally {
    isUploading.value = false
  }
}

const getToolLabel = (toolType) => {
  const tool = availableTools.value.find(t => t.value === toolType)
  return tool ? tool.label : toolType
}

const getFileTypeLabel = (fileType) => {
  const types = {
    config: '配置文件',
    input: '输入文件'
  }
  return types[fileType] || fileType
}

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

const getEmptyMessage = () => {
  if (listType.value === 'task') {
    if (selectedTool.value) {
      return `暂无 ${getToolLabel(selectedTool.value)} 的任务结果`
    }
    return '暂无任务结果文件'
  } else {
    if (selectedTool.value) {
      return `暂无 ${getToolLabel(selectedTool.value)} 的上传文件`
    }
    return '请选择工具查看对应的文件，或上传新文件'
  }
}

const getStatusLabel = (status) => {
  const statusMap = {
    'pending': '等待中',
    'running': '运行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

const viewFileContent = async (file, fileType = 'result') => {
  try {
    currentFile.value = file
    const response = await api.files.getFileContent(file.id, fileType)
    if (response && response.success) {
      fileContent.value = response.data.content
      showContentModal.value = true
    }
  } catch (error) {
    ElMessage.error('获取文件内容失败: ' + error.message)
  }
}

const closeContentModal = () => {
  showContentModal.value = false
  currentFile.value = null
  fileContent.value = ''
}

const downloadFile = async (file, fileType = 'result') => {
  try {
    const response = await fileStore.downloadFile(file.id, fileType)

    // 检查响应是否为blob
    let blob
    if (response.data instanceof Blob) {
      blob = response.data
    } else {
      blob = new Blob([response.data])
    }

    // 生成下载文件名
    let fileName = file.file_name
    if (listType.value === 'task') {
      const extension = fileType === 'log' ? '.txt' :
                       file.tool_type === 'zgrab2' ? '.jsonl' : '.json'
      fileName = `${file.tool_type}_task_${file.id}_${fileType}${extension}`
    }

    // 创建下载链接
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()

    // 清理
    setTimeout(() => {
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    }, 100)

    ElMessage.success('文件下载成功')
  } catch (error) {
    ElMessage.error('文件下载失败: ' + error.message)
  }
}

const confirmDelete = async (file) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.file_name}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    await fileStore.deleteFile(file.id)
    ElMessage.success('文件删除成功')
    fetchFiles()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('文件删除失败: ' + error.message)
    }
  }
}

// 生命周期
onMounted(() => {
  fetchFiles()
})
</script>

<style scoped lang="scss">
.file-management-view {
  padding: 1.5rem;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 2rem;
  
  .header-content {
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.8rem;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .page-description {
      margin: 0;
      color: #7f8c8d;
      font-size: 1rem;
    }
  }
}

.management-container {
  max-width: 1200px;
  margin: 0 auto;
}

.filter-section {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  
  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    
    label {
      font-weight: 500;
      color: #4a5568;
      white-space: nowrap;
    }
    
    select {
      padding: 0.5rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.9rem;
      min-width: 150px;
      
      &:focus {
        outline: none;
        border-color: #4299e1;
        box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
      }
    }
  }
  
  .action-buttons {
    margin-left: auto;
  }
}

.upload-section {
  margin-bottom: 2rem;
}

.upload-tabs {
  display: flex;
  margin-bottom: 1rem;
  background: white;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;

  .tab-button {
    flex: 1;
    padding: 1rem 1.5rem;
    background: #f8fafc;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #64748b;
    border-bottom: 3px solid transparent;

    &:hover {
      background: #e2e8f0;
    }

    &.active {
      background: white;
      color: #4299e1;
      border-bottom-color: #4299e1;
    }
  }
}

.upload-card {
  background: white;
  padding: 2rem;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);

  h3 {
    margin: 0 0 1.5rem;
    color: #2c3e50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}

.upload-form,
.create-form {
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }

  .form-group {
    margin-bottom: 1rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #4a5568;

      .required {
        color: #e53e3e;
      }
    }

    .form-hint {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.8rem;
      color: #7f8c8d;
      font-style: italic;
    }
  }

  .form-select,
  .form-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: #4299e1;
      box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
    }
  }
}

.content-editor {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;

  .editor-toolbar {
    background: #f8fafc;
    padding: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .content-stats {
      margin-left: auto;
      font-size: 0.8rem;
      color: #7f8c8d;
    }
  }

  .content-textarea {
    width: 100%;
    border: none;
    padding: 1rem;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    resize: vertical;
    min-height: 200px;

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: #a0aec0;
      font-style: italic;
    }
  }
}

.file-upload-area {
  position: relative;
  
  .file-input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  
  .file-upload-display {
    padding: 2rem;
    border: 2px dashed #cbd5e0;
    border-radius: 8px;
    text-align: center;
    transition: all 0.2s ease;
    cursor: pointer;
    
    &:hover {
      border-color: #4299e1;
      background-color: #f7fafc;
    }
    
    .upload-placeholder {
      color: #a0aec0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      
      i {
        font-size: 2rem;
      }
    }
    
    .file-selected {
      color: #4299e1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      
      .btn-clear {
        background: none;
        border: none;
        color: #e53e3e;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        
        &:hover {
          background-color: #fed7d7;
        }
      }
    }
  }
}

.upload-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.files-section {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.list-tabs {
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;

  .tab-button {
    flex: 1;
    padding: 1rem 1.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #64748b;
    border-bottom: 3px solid transparent;

    &:hover {
      background: #e2e8f0;
    }

    &.active {
      background: white;
      color: #4299e1;
      border-bottom-color: #4299e1;
    }
  }
}

.section-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h3 {
    margin: 0;
    color: #2c3e50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .file-stats {
    .stat-item {
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }
}

.files-table-container {
  overflow-x: auto;
}

.files-table {
  width: 100%;
  border-collapse: collapse;
  
  th,
  td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  
  th {
    background-color: #f8fafc;
    font-weight: 500;
    color: #4a5568;
    font-size: 0.9rem;
  }
  
  .file-row {
    &:hover {
      background-color: #f8fafc;
    }
  }
  
  .tool-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    
    &.tool-xmap {
      background-color: #e6fffa;
      color: #00695c;
    }
    
    &.tool-zgrab2 {
      background-color: #e3f2fd;
      color: #1565c0;
    }
    
    &.tool-database {
      background-color: #f3e5f5;
      color: #7b1fa2;
    }
  }
  
  .file-type-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    background-color: #f0f4f8;
    color: #4a5568;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;

    &.status-pending {
      background-color: #fef3c7;
      color: #92400e;
    }

    &.status-running {
      background-color: #dbeafe;
      color: #1e40af;
    }

    &.status-completed {
      background-color: #d1fae5;
      color: #065f46;
    }

    &.status-failed {
      background-color: #fee2e2;
      color: #991b1b;
    }

    &.status-cancelled {
      background-color: #f3f4f6;
      color: #6b7280;
    }
  }
  
  .file-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: monospace;
  }
  
  .file-description {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .file-actions {
    display: flex;
    gap: 0.5rem;
  }
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #a0aec0;
  
  i {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }
  
  h4 {
    margin: 0 0 0.5rem;
    color: #4a5568;
  }
  
  p {
    margin: 0;
  }
}

// 按钮样式
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  
  &.btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }
  
  &.btn-primary {
    background-color: #4299e1;
    color: white;
    
    &:hover:not(:disabled) {
      background-color: #3182ce;
    }
    
    &:disabled {
      background-color: #a0aec0;
      cursor: not-allowed;
    }
  }
  
  &.btn-secondary {
    background-color: #e2e8f0;
    color: #4a5568;
    
    &:hover {
      background-color: #cbd5e0;
    }
  }
  
  &.btn-success {
    background-color: #48bb78;
    color: white;
    
    &:hover {
      background-color: #38a169;
    }
  }
  
  &.btn-info {
    background-color: #4299e1;
    color: white;
    
    &:hover {
      background-color: #3182ce;
    }
  }
  
  &.btn-danger {
    background-color: #f56565;
    color: white;
    
    &:hover {
      background-color: #e53e3e;
    }
  }
  
  &.btn-refresh {
    background-color: #48bb78;
    color: white;
    
    &:hover {
      background-color: #38a169;
    }
  }
}

// 模态框样式
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
  background: white;
  border-radius: 8px;
  max-width: 800px;
  max-height: 80vh;
  width: 90%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h3 {
    margin: 0;
    color: #2c3e50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .btn-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    
    &:hover {
      background-color: #f7fafc;
    }
  }
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  
  .file-content {
    background-color: #f8fafc;
    padding: 1rem;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  }
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
}

// 图标
.icon-files:before { content: "📁"; }
.icon-upload:before { content: "📤"; }
.icon-create:before { content: "✏️"; }
.icon-template:before { content: "📋"; }
.icon-clear:before { content: "🧹"; }
.icon-refresh:before { content: "🔄"; }
.icon-list:before { content: "📋"; }
.icon-file:before { content: "📄"; }
.icon-view:before { content: "👁️"; }
.icon-download:before { content: "⬇️"; }
.icon-delete:before { content: "🗑️"; }
.icon-close:before { content: "✖️"; }
.icon-reset:before { content: "🔄"; }
.icon-empty:before { content: "📭"; }
.icon-task:before { content: "⚙️"; }
</style>
