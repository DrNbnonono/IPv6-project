<template>
  <div class="json-analysis-dashboard">
    <div class="page-header">
      <div class="header-content">
        <h1><i class="icon-json"></i> JSON文件分析</h1>
        <p class="page-description">分析JSON/JSONL文件结构，提取字段，搜索过滤数据。支持标准JSON和JSONL格式</p>
      </div>
    </div>

    <div class="dashboard-container">
      <!-- 文件选择区域 -->
      <div class="file-selection-section" v-if="!currentJsonData">
        <div class="selection-tabs">
          <button
            class="tab-button"
            :class="{ active: inputMode === 'file' }"
            @click="inputMode = 'file'"
          >
            <i class="icon-file"></i> 选择文件
          </button>
          <button
            class="tab-button"
            :class="{ active: inputMode === 'text' }"
            @click="inputMode = 'text'"
          >
            <i class="icon-text"></i> 粘贴文本
          </button>
          <button
            class="tab-button"
            :class="{ active: inputMode === 'result' }"
            @click="inputMode = 'result'"
          >
            <i class="icon-result"></i> 扫描结果
          </button>
        </div>

        <div class="input-content">
          <!-- 文件选择 -->
          <div v-if="inputMode === 'file'" class="file-input-section">
            <div class="file-upload-area" @drop="handleFileDrop" @dragover.prevent @dragenter.prevent>
              <input
                type="file"
                ref="fileInput"
                @change="handleFileSelect"
                accept=".json,.jsonl,.txt"
                class="file-input"
              >
              <div class="upload-display">
                <i class="icon-upload"></i>
                <h3>拖拽JSON文件到此处或点击选择</h3>
                <p>支持 .json, .jsonl, .txt 格式（包括zgrab2结果文件）</p>
                <button class="btn btn-primary" @click="$refs.fileInput.click()">
                  选择文件
                </button>
              </div>
            </div>
          </div>

          <!-- 文本输入 -->
          <div v-if="inputMode === 'text'" class="text-input-section">
            <div class="text-input-area">
              <h3>粘贴JSON/JSONL文本</h3>
              <textarea
                v-model="jsonTextInput"
                class="json-textarea"
                placeholder="请粘贴JSON或JSONL文本内容（每行一个JSON对象）..."
                rows="15"
              ></textarea>
              <div class="text-actions">
                <button
                  class="btn btn-primary"
                  @click="parseJsonText"
                  :disabled="!jsonTextInput.trim() || isLoading"
                >
                  <i class="icon-parse"></i>
                  {{ isLoading ? '解析中...' : '解析JSON' }}
                </button>
                <button class="btn btn-secondary" @click="jsonTextInput = ''">
                  <i class="icon-clear"></i> 清空
                </button>
              </div>
            </div>
          </div>

          <!-- 扫描结果文件 -->
          <div v-if="inputMode === 'result'" class="result-files-section">
            <div class="result-files-list">
              <h3>选择扫描结果文件</h3>
              <div class="files-grid">
                <div
                  v-for="file in resultFiles"
                  :key="file.id"
                  class="file-card"
                  @click="selectResultFile(file)"
                >
                  <div class="file-icon">
                    <i class="icon-file-json"></i>
                  </div>
                  <div class="file-info">
                    <h4>{{ file.file_name }}</h4>
                    <p>{{ file.tool_type }} - {{ formatFileSize(file.file_size) }}</p>
                    <span class="file-date">{{ formatDate(file.uploaded_at) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="resultFiles.length === 0" class="empty-state">
                <i class="icon-empty"></i>
                <p>暂无扫描结果文件</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- JSON分析主界面 -->
      <div class="analysis-main" v-if="currentJsonData">
        <div class="analysis-header">
          <div class="file-info">
            <h2>
              <i class="icon-file-json"></i>
              {{ currentFileName || '未命名文件' }}
            </h2>
            <div class="file-stats">
              <span class="stat-item">大小: {{ formatFileSize(currentFileSize) }}</span>
              <span class="stat-item">记录数: {{ totalRecords }}</span>
              <span class="stat-item">字段: {{ analysis.totalFields }}</span>
              <span class="stat-item">最大深度: {{ analysis.maxDepth }}</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="btn btn-secondary" @click="resetAnalysis">
              <i class="icon-back"></i> 重新选择
            </button>
          </div>
        </div>

        <!-- 视图切换 -->
        <div class="view-tabs">
          <button
            class="tab-button"
            :class="{ active: currentView === 'tree' }"
            @click="currentView = 'tree'"
          >
            <i class="icon-tree"></i> 树状视图
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'table' }"
            @click="currentView = 'table'"
          >
            <i class="icon-table"></i> 表格视图
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'raw' }"
            @click="currentView = 'raw'"
          >
            <i class="icon-code"></i> 原始文本
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'analysis' }"
            @click="currentView = 'analysis'"
          >
            <i class="icon-analysis"></i> 结构分析
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'extract' }"
            @click="currentView = 'extract'"
          >
            <i class="icon-extract"></i> 字段提取
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'filter' }"
            @click="currentView = 'filter'"
          >
            <i class="icon-filter"></i> 过滤提取
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'zgrab2' }"
            @click="currentView = 'zgrab2'"
            v-if="isZgrab2Data"
          >
            <i class="icon-zgrab2"></i> Zgrab2分析
          </button>
          <button
            class="tab-button"
            :class="{ active: currentView === 'xmap' }"
            @click="currentView = 'xmap'"
            v-if="isXmapData"
          >
            <i class="icon-xmap"></i> XMap分析
          </button>
        </div>

        <!-- 视图内容 -->
        <div class="view-content">
          <!-- 树状视图 -->
          <div v-if="currentView === 'tree'" class="tree-view">
            <JsonTreeView :data="currentJsonData" />
          </div>

          <!-- 表格视图 -->
          <div v-if="currentView === 'table'" class="table-view">
            <JsonTableView :data="currentJsonData" />
          </div>

          <!-- 原始文本视图 -->
          <div v-if="currentView === 'raw'" class="raw-view">
            <JsonRawView :data="currentJsonData" />
          </div>

          <!-- 结构分析视图 -->
          <div v-if="currentView === 'analysis'" class="analysis-view">
            <JsonAnalysisView :analysis="analysis" :data="currentJsonData" />
          </div>

          <!-- 字段提取视图 -->
          <div v-if="currentView === 'extract'" class="extract-view">
            <JsonExtractView
              :data="currentJsonData"
              :fieldPaths="analysis.fieldPaths"
              @extract="handleExtract"
              @save="handleSaveExtracted"
            />
          </div>

          <!-- 过滤提取视图 -->
          <div v-if="currentView === 'filter'" class="filter-view">
            <JsonFilterExtractView
              :sessionId="currentSessionId"
              @filter="handleFilter"
              @save="handleSaveExtracted"
            />
          </div>

          <!-- Zgrab2分析视图 -->
          <div v-if="currentView === 'zgrab2'" class="zgrab2-view">
            <Zgrab2AnalysisView
              :sessionId="currentSessionId"
              @extract="handleZgrab2Extract"
              @save="handleSaveExtracted"
            />
          </div>

          <!-- XMap分析视图 -->
          <div v-if="currentView === 'xmap'" class="xmap-view">
            <XmapAnalysisView
              :sessionId="currentSessionId"
              @extract="handleXmapExtract"
              @save="handleSaveExtracted"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useFileStore } from '@/stores/file'

// 导入子组件
import JsonTreeView from '@/components/jsonanalysis/JsonTreeView.vue'
import JsonTableView from '@/components/jsonanalysis/JsonTableView.vue'
import JsonRawView from '@/components/jsonanalysis/JsonRawView.vue'
import JsonAnalysisView from '@/components/jsonanalysis/JsonAnalysisView.vue'
import JsonExtractView from '@/components/jsonanalysis/JsonExtractView.vue'
import JsonFilterExtractView from '@/components/jsonanalysis/JsonFilterExtractView.vue'
import Zgrab2AnalysisView from '@/components/jsonanalysis/Zgrab2AnalysisView.vue'
import XmapAnalysisView from '@/components/jsonanalysis/XmapAnalysisView.vue'

const fileStore = useFileStore()

// 响应式数据
const inputMode = ref('file') // 'file', 'text', 'result'
const currentView = ref('tree') // 'tree', 'table', 'raw', 'analysis', 'extract', 'search'
const isLoading = ref(false)

// JSON数据
const currentJsonData = ref(null)
const currentFileName = ref('')
const currentFileSize = ref(0)
const analysis = ref({})
const currentSessionId = ref(null)
const totalRecords = ref(0)

// 输入相关
const jsonTextInput = ref('')
const resultFiles = ref([])

// 文件输入引用
const fileInput = ref(null)

// 计算属性
const hasJsonData = computed(() => !!currentJsonData.value)

const isZgrab2Data = computed(() => {
  if (!currentJsonData.value || !Array.isArray(currentJsonData.value)) {
    return false
  }
  // 检查是否包含zgrab2典型的数据结构
  return currentJsonData.value.some(item =>
    item && item.ip && item.data &&
    (item.data.http || item.data.https || item.data.ssh)
  )
})

const isXmapData = computed(() => {
  if (!currentJsonData.value || !Array.isArray(currentJsonData.value)) {
    return false
  }
  // 检查是否包含xmap典型的数据结构
  return currentJsonData.value.some(item =>
    item && (item.saddr || item.daddr || item.outersaddr) &&
    (item.success !== undefined || item.clas !== undefined)
  )
})

// 方法
const resetAnalysis = () => {
  currentJsonData.value = null
  currentFileName.value = ''
  currentFileSize.value = 0
  analysis.value = {}
  currentSessionId.value = null
  totalRecords.value = 0
  jsonTextInput.value = ''
  currentView.value = 'tree'
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    processLocalFile(file)
  }
}

const handleFileDrop = (event) => {
  event.preventDefault()
  const file = event.dataTransfer.files[0]
  if (file) {
    processLocalFile(file)
  }
}

const processLocalFile = async (file) => {
  try {
    isLoading.value = true

    // 检查文件类型
    const validTypes = ['application/json', 'text/plain', 'text/json']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(json|jsonl|txt)$/i)) {
      ElMessage.error('请选择JSON格式的文件')
      return
    }

    // 读取文件内容
    const text = await file.text()

    // 解析JSON
    const response = await api.jsonanalysis.parseText({ jsonText: text })

    if (response.success) {
      currentSessionId.value = response.data.sessionId
      currentJsonData.value = response.data.dataPreview
      currentFileName.value = file.name
      currentFileSize.value = response.data.size
      analysis.value = response.data.analysis
      totalRecords.value = response.data.totalRecords
      ElMessage.success(`文件解析成功，共${response.data.totalRecords}条记录`)
    }
  } catch (error) {
    ElMessage.error('文件解析失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const parseJsonText = async () => {
  try {
    isLoading.value = true

    const response = await api.jsonanalysis.parseText({ jsonText: jsonTextInput.value })

    if (response.success) {
      currentSessionId.value = response.data.sessionId
      currentJsonData.value = response.data.dataPreview
      currentFileName.value = '粘贴的JSON文本'
      currentFileSize.value = response.data.size
      analysis.value = response.data.analysis
      totalRecords.value = response.data.totalRecords
      ElMessage.success(`JSON解析成功，共${response.data.totalRecords}条记录`)
    }
  } catch (error) {
    ElMessage.error('JSON解析失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const selectResultFile = async (file) => {
  try {
    isLoading.value = true

    const response = await api.jsonanalysis.parseFile(file.id)

    if (response.success) {
      currentSessionId.value = response.data.sessionId
      currentJsonData.value = response.data.dataPreview
      currentFileName.value = response.data.fileName
      currentFileSize.value = response.data.size
      analysis.value = response.data.analysis
      totalRecords.value = response.data.totalRecords
      ElMessage.success(`文件解析成功，共${response.data.totalRecords}条记录`)
    }
  } catch (error) {
    ElMessage.error('文件解析失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const fetchResultFiles = async () => {
  try {
    // 获取任务结果文件
    const response = await fileStore.getFiles('', '', 'task')
    if (response && response.success) {
      // 过滤JSON格式的文件
      resultFiles.value = response.data.filter(file =>
        file.file_path && (
          file.file_path.endsWith('.json') ||
          file.file_path.endsWith('.jsonl') ||
          file.tool_type === 'zgrab2'
        )
      )
    }
  } catch (error) {
    console.error('获取结果文件失败:', error)
  }
}

const handleExtract = (extractedData) => {
  // 处理字段提取结果
  console.log('提取的字段:', extractedData)
}

const handleZgrab2Extract = (extractedData) => {
  // 处理Zgrab2提取结果
  console.log('Zgrab2提取结果:', extractedData)
}

const handleXmapExtract = (extractedData) => {
  // 处理XMap提取结果
  console.log('XMap提取结果:', extractedData)
}

const handleFilter = (filterResults) => {
  // 处理过滤结果
  console.log('过滤结果:', filterResults)
}

const handleSaveExtracted = async (data, fileName, description) => {
  try {
    const response = await api.jsonanalysis.save({
      jsonData: data,
      fileName: fileName,
      description: description
    })

    if (response.success) {
      ElMessage.success('提取结果保存成功')
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
  }
}

const handleSearch = (searchResults) => {
  // 处理搜索结果
  console.log('搜索结果:', searchResults)
}

const handleSaveFiltered = async (data, fileName, description) => {
  try {
    const response = await api.jsonanalysis.save({
      jsonData: data,
      fileName: fileName,
      description: description
    })

    if (response.success) {
      ElMessage.success('过滤结果保存成功')
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
  }
}

// 工具函数
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

// 生命周期
onMounted(() => {
  fetchResultFiles()
})
</script>

<style scoped lang="scss">
.json-analysis-dashboard {
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

.dashboard-container {
  max-width: 1400px;
  margin: 0 auto;
}

.file-selection-section {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.selection-tabs {
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

.input-content {
  padding: 2rem;
}

.file-upload-area {
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  padding: 3rem;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;

  &:hover {
    border-color: #4299e1;
    background-color: #f7fafc;
  }

  .file-input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    top: 0;
    left: 0;
  }

  .upload-display {
    i {
      font-size: 3rem;
      color: #a0aec0;
      margin-bottom: 1rem;
    }

    h3 {
      margin: 0 0 0.5rem;
      color: #4a5568;
    }

    p {
      margin: 0 0 1.5rem;
      color: #7f8c8d;
    }
  }
}

.text-input-area {
  h3 {
    margin: 0 0 1rem;
    color: #2c3e50;
  }

  .json-textarea {
    width: 100%;
    padding: 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    resize: vertical;

    &:focus {
      outline: none;
      border-color: #4299e1;
      box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
    }
  }

  .text-actions {
    margin-top: 1rem;
    display: flex;
    gap: 1rem;
  }
}

.result-files-list {
  h3 {
    margin: 0 0 1.5rem;
    color: #2c3e50;
  }
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.file-card {
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 1rem;

  &:hover {
    border-color: #4299e1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .file-icon {
    font-size: 2rem;
    color: #4299e1;
  }

  .file-info {
    flex: 1;

    h4 {
      margin: 0 0 0.25rem;
      color: #2c3e50;
      font-size: 1rem;
    }

    p {
      margin: 0 0 0.25rem;
      color: #7f8c8d;
      font-size: 0.9rem;
    }

    .file-date {
      font-size: 0.8rem;
      color: #a0aec0;
    }
  }
}

.analysis-main {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.analysis-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .file-info {
    h2 {
      margin: 0 0 0.5rem;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .file-stats {
      display: flex;
      gap: 1rem;

      .stat-item {
        color: #7f8c8d;
        font-size: 0.9rem;
      }
    }
  }
}

.view-tabs {
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;

  .tab-button {
    padding: 1rem 1.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #64748b;
    border-bottom: 3px solid transparent;
    white-space: nowrap;

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

.view-content {
  padding: 1.5rem;
  min-height: 500px;
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
}

// 图标
.icon-json:before { content: "📊"; }
.icon-file:before { content: "📁"; }
.icon-text:before { content: "📝"; }
.icon-result:before { content: "📋"; }
.icon-upload:before { content: "📤"; }
.icon-parse:before { content: "⚡"; }
.icon-clear:before { content: "🧹"; }
.icon-file-json:before { content: "📄"; }
.icon-back:before { content: "⬅️"; }
.icon-tree:before { content: "🌳"; }
.icon-table:before { content: "📊"; }
.icon-code:before { content: "💻"; }
.icon-analysis:before { content: "🔍"; }
.icon-extract:before { content: "📤"; }
.icon-search:before { content: "🔎"; }
.icon-zgrab2:before { content: "🔍"; }
.icon-xmap:before { content: "📡"; }
.icon-filter:before { content: "🔍"; }
.icon-empty:before { content: "📭"; }
</style>