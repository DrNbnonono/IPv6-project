<template>
  <div class="workflow-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button @click="saveWorkflow" class="btn btn-primary" :disabled="!hasChanges">
          <i class="icon-save"></i> 保存
        </button>
        <button @click="executeWorkflow" class="btn btn-success" :disabled="!canExecute">
          <i class="icon-play"></i> 执行
        </button>
        <button @click="validateWorkflow" class="btn btn-secondary">
          <i class="icon-check"></i> 验证
        </button>
        <div class="toolbar-divider"></div>
        <button @click="centerAllNodes" class="btn btn-secondary" title="居中显示所有节点">
          <i class="icon-center">⌖</i> 居中
        </button>
        <button @click="resetCanvasView" class="btn btn-secondary" title="重置视图 (Ctrl+0)">
          <i class="icon-reset">↻</i> 重置
        </button>
        <div class="canvas-help" title="画布操作提示">
          <i class="icon-help">?</i>
          <div class="help-tooltip">
            <div><strong>画布操作:</strong></div>
            <div>• 拖拽空白区域: 平移画布</div>
            <div>• 鼠标滚轮: 缩放画布</div>
            <div>• Ctrl+0: 重置视图</div>
            <div>• Ctrl+1: 居中所有节点</div>
          </div>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="canvas-info">
          <small>缩放: {{ Math.round(canvasScale * 100) }}%</small>
        </div>
        <span class="workflow-status" :class="workflowStatus">
          {{ getStatusText(workflowStatus) }}
        </span>
      </div>
    </div>

    <!-- 主编辑区域 -->
    <div class="editor-main">
      <!-- 节点面板 -->
      <div class="node-panel">
        <div class="panel-header">
          <h3>节点库</h3>
          <small>{{ Object.keys(workflowStore.nodeTypes).length }} 个节点类型</small>
        </div>
        <div class="panel-content">
          <!-- 调试信息 -->
          <div v-if="Object.keys(workflowStore.nodeTypes).length === 0" class="debug-info">
            <p>正在加载节点类型...</p>
            <p v-if="workflowStore.error">错误: {{ workflowStore.error }}</p>
          </div>

          <div v-for="(category, categoryName) in nodeCategories" :key="categoryName" class="node-category">
            <h4>{{ getCategoryName(categoryName) }} ({{ category.length }})</h4>
            <div class="node-list">
              <div
                v-for="nodeType in category"
                :key="nodeType.type"
                class="node-item"
                draggable="true"
                @dragstart="handleNodeDragStart($event, nodeType)"
              >
                <div class="node-icon">
                  <i :class="getNodeIcon(nodeType.type)"></i>
                </div>
                <div class="node-info">
                  <div class="node-name">{{ nodeType.name }}</div>
                  <div class="node-desc">{{ nodeType.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 画布区域 -->
      <div class="canvas-container">
        <div
          ref="canvas"
          class="workflow-canvas"
          @drop="handleCanvasDrop"
          @dragover="handleCanvasDragOver"
          @click="handleCanvasClick"
          @wheel="handleCanvasWheel"
          @mousedown="handleCanvasMouseDown"
          :style="{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
            transformOrigin: '0 0'
          }"
        >
          <!-- 网格背景 -->
          <div class="canvas-grid"></div>
          
          <!-- 连接线 -->
          <svg class="connections-layer">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                      refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
              </marker>
            </defs>
            <path
              v-for="connection in connections"
              :key="`${connection.from}-${connection.to}`"
              :d="getConnectionPath(connection)"
              class="connection-line"
              marker-end="url(#arrowhead)"
              @click="deleteConnection(connection)"
            />
          </svg>

          <!-- 节点 -->
          <div
            v-for="node in nodes"
            :key="node.id"
            class="workflow-node"
            :class="{ 
              'selected': selectedNode?.id === node.id,
              'error': node.hasError 
            }"
            :style="{ 
              left: node.position.x + 'px', 
              top: node.position.y + 'px' 
            }"
            @click="selectNode(node)"
            @mousedown="startNodeDrag($event, node)"
            draggable="false"
          >
            <div class="node-header">
              <i :class="getNodeIcon(node.type)"></i>
              <span class="node-title">{{ getNodeTypeInfo(node.type)?.name || node.type }}</span>
              <button @click.stop="deleteNode(node)" class="node-delete" title="删除节点">
                <i class="icon-close">×</i>
              </button>
            </div>
            <div class="node-body">
              <div class="node-inputs">
                <div
                  v-for="input in getNodeInputs(node.type)"
                  :key="input"
                  class="node-port input-port"
                  :data-port="input"
                  :data-node-id="node.id"
                  @mousedown.stop="startConnection($event, node.id, input, 'input')"
                >
                  <div class="port-dot"></div>
                  <span class="port-label">{{ input }}</span>
                </div>
              </div>
              <div class="node-outputs">
                <div
                  v-for="output in getNodeOutputs(node.type)"
                  :key="output"
                  class="node-port output-port"
                  :data-port="output"
                  :data-node-id="node.id"
                  @mousedown.stop="startConnection($event, node.id, output, 'output')"
                >
                  <span class="port-label">{{ output }}</span>
                  <div class="port-dot"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 临时连接线 -->
          <svg v-if="tempConnection" class="temp-connection">
            <path
              :d="getTempConnectionPath()"
              class="temp-connection-line"
            />
          </svg>
        </div>
      </div>

      <!-- 属性面板 -->
      <div class="properties-panel">
        <div class="panel-header">
          <h3>属性配置</h3>
        </div>
        <div class="panel-content">
          <div v-if="!selectedNode" class="no-selection">
            <p>请选择一个节点来配置属性</p>
          </div>
          <div v-else class="node-properties">
            <h4>{{ getNodeTypeInfo(selectedNode.type)?.name }}</h4>

            <!-- 显示输入连接信息 -->
            <div v-if="getNodeInputConnections(selectedNode.id).length > 0" class="input-connections-info">
              <h5>输入连接</h5>
              <div
                v-for="connection in getNodeInputConnections(selectedNode.id)"
                :key="`${connection.from}-${connection.to}`"
                class="input-connection-item"
              >
                <div class="connection-info">
                  <span class="source-node">{{ getNodeName(connection.from) }}</span>
                  <i class="arrow">→</i>
                  <span class="target-port">{{ connection.toPort || 'default' }}</span>
                </div>
                <div v-if="getConnectedFileInfo(connection)" class="connected-file-info">
                  <small>
                    <i class="icon-file"></i>
                    {{ getConnectedFileInfo(connection) }}
                  </small>
                </div>
              </div>
            </div>

            <form @submit.prevent="updateNodeConfig">
              <div
                v-for="(config, key) in getNodeConfig(selectedNode.type)"
                :key="key"
                v-show="shouldShowConfig(key, selectedNode)"
                class="form-group"
              >
                <label :for="`config-${key}`">
                  {{ getConfigLabel(key) }}
                  <span v-if="config.required" class="required-mark">*</span>
                </label>
                <p v-if="config.description" class="config-description">{{ config.description }}</p>

                <!-- 文本输入 -->
                <input
                  v-if="config.type === 'string' || config.type === 'number'"
                  :id="`config-${key}`"
                  v-model="selectedNode.config[key]"
                  :type="config.type === 'number' ? 'number' : 'text'"
                  :required="config.required"
                  :placeholder="config.placeholder || ''"
                  :min="config.min"
                  :max="config.max"
                  :step="config.step"
                  class="form-input"
                />

                <!-- 多行文本输入 -->
                <textarea
                  v-else-if="config.type === 'textarea'"
                  :id="`config-${key}`"
                  v-model="selectedNode.config[key]"
                  :required="config.required"
                  :placeholder="config.placeholder || ''"
                  class="form-textarea"
                  rows="3"
                ></textarea>

                <!-- 布尔值 -->
                <div v-else-if="config.type === 'boolean'" class="checkbox-wrapper">
                  <input
                    :id="`config-${key}`"
                    v-model="selectedNode.config[key]"
                    type="checkbox"
                    class="form-checkbox"
                  />
                  <label :for="`config-${key}`" class="checkbox-label">
                    {{ config.label || getConfigLabel(key) }}
                  </label>
                </div>

                <!-- 选择器 -->
                <select
                  v-else-if="config.type === 'select'"
                  :id="`config-${key}`"
                  v-model="selectedNode.config[key]"
                  class="form-select"
                >
                  <option v-for="option in config.options" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>

                <!-- 文件选择器 -->
                <div v-else-if="config.type === 'file_selector'" class="file-selector">
                  <div class="file-selector-header">
                    <select
                      v-model="fileSourceType"
                      @change="handleFileSourceChange"
                      class="form-select file-source-select"
                    >
                      <option value="upload">上传的文件</option>
                      <option value="task">任务结果文件</option>
                    </select>
                    <button
                      @click="refreshFileList"
                      class="btn btn-sm btn-secondary"
                      :disabled="isLoadingFiles"
                    >
                      <i class="icon-refresh"></i> 刷新
                    </button>
                  </div>

                  <div class="file-selector-filters" v-if="fileSourceType === 'upload'">
                    <select
                      v-model="fileToolFilter"
                      @change="handleFileFilterChange"
                      class="form-select file-tool-select"
                    >
                      <option value="">所有工具</option>
                      <option value="xmap">XMap</option>
                      <option value="zgrab2">ZGrab2</option>
                      <option value="general">通用</option>
                    </select>

                    <select
                      v-if="fileToolFilter === 'zgrab2'"
                      v-model="fileTypeFilter"
                      @change="handleFileFilterChange"
                      class="form-select file-type-select"
                    >
                      <option value="">所有类型</option>
                      <option value="config">配置文件</option>
                      <option value="input">输入文件</option>
                    </select>
                  </div>

                  <select
                    :id="`config-${key}`"
                    v-model="selectedNode.config[key]"
                    :required="config.required"
                    class="form-select file-list-select"
                    :disabled="isLoadingFiles"
                  >
                    <option value="">{{ isLoadingFiles ? '加载中...' : '请选择文件' }}</option>
                    <option
                      v-for="file in filteredFiles"
                      :key="file.id"
                      :value="file.id"
                    >
                      {{ file.file_name }}
                      <span v-if="file.source_type === 'task'">(任务结果)</span>
                      <span v-else>({{ file.tool_name }})</span>
                    </option>
                  </select>

                  <!-- 文件选择状态 -->
                  <div v-if="config.type === 'file_selector'" class="file-selection-status">
                    <small :class="selectedNode.config[key] ? 'text-success' : 'text-muted'">
                      {{ selectedNode.config[key] ? '✓ 已选择文件' : '○ 未选择文件' }}
                      (可用: {{ filteredFiles.length }} 个文件)
                    </small>
                  </div>

                  <div v-if="selectedFileInfo" class="selected-file-info">
                    <small>
                      <strong>{{ selectedFileInfo.file_name }}</strong><br>
                      类型: {{ selectedFileInfo.tool_name || selectedFileInfo.source_type }}<br>
                      <span v-if="selectedFileInfo.description">描述: {{ selectedFileInfo.description }}</span>
                    </small>
                  </div>
                </div>

                <!-- 数组输入 -->
                <div v-else-if="config.type === 'array'" class="array-input">
                  <div v-for="(item, index) in selectedNode.config[key]" :key="index" class="array-item">
                    <input
                      v-model="selectedNode.config[key][index]"
                      type="text"
                      class="form-input"
                      placeholder="输入字段路径，如: data.result.ip"
                    />
                    <button
                      @click="removeArrayItem(key, index)"
                      type="button"
                      class="btn-remove"
                    >
                      <i class="icon-close"></i>
                    </button>
                  </div>
                  <button
                    @click="addArrayItem(key)"
                    type="button"
                    class="btn-add"
                  >
                    <i class="icon-plus"></i> 添加字段
                  </button>
                </div>

                <!-- 对象输入 -->
                <textarea
                  v-else-if="config.type === 'object'"
                  :id="`config-${key}`"
                  v-model="selectedNode.config[key + '_json']"
                  @blur="updateObjectConfig(key)"
                  class="form-textarea"
                  placeholder="输入JSON格式的配置，如: {&quot;key&quot;: &quot;value&quot;}"
                  rows="3"
                ></textarea>
              </div>
              <button type="submit" class="btn btn-primary">更新配置</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行对话框 -->
    <div v-if="showExecuteDialog" class="modal-overlay" @click="showExecuteDialog = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>执行工作流</h3>
          <button @click="showExecuteDialog = false" class="modal-close">
            <i class="icon-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="confirmExecute">
            <div class="form-group">
              <label for="execution-name">执行名称</label>
              <input 
                id="execution-name"
                v-model="executionForm.name"
                type="text"
                required
                class="form-input"
                placeholder="输入执行实例名称"
              />
            </div>
            <div class="form-group">
              <label for="execution-description">描述</label>
              <textarea 
                id="execution-description"
                v-model="executionForm.description"
                class="form-textarea"
                placeholder="可选的执行描述"
              ></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button @click="showExecuteDialog = false" class="btn btn-secondary">取消</button>
          <button @click="confirmExecute" class="btn btn-primary">开始执行</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 执行详情模态框 -->
  <div v-if="showExecutionDetails" class="modal-overlay" @click="showExecutionDetails = false">
    <div class="modal-content execution-details-modal" @click.stop>
      <div class="modal-header">
        <h3>工作流执行详情</h3>
        <button @click="showExecutionDetails = false" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div v-if="currentExecution" class="execution-info">
          <div class="execution-summary">
            <h4>执行信息</h4>
            <div class="info-grid">
              <div class="info-item">
                <label>执行ID:</label>
                <span>{{ currentExecution.executionId }}</span>
              </div>
              <div class="info-item">
                <label>状态:</label>
                <span class="status" :class="currentExecution.status">{{ currentExecution.status }}</span>
              </div>
              <div class="info-item">
                <label>开始时间:</label>
                <span>{{ formatTime(currentExecution.startTime) }}</span>
              </div>
            </div>
          </div>

          <div v-if="executionTasks.length > 0" class="execution-tasks">
            <h4>任务列表</h4>
            <div class="task-list">
              <div
                v-for="task in executionTasks"
                :key="task.id"
                class="task-item"
                @click="showTaskDetail(task)"
              >
                <div class="task-info">
                  <span class="task-name">{{ getNodeName(task.node_id) }}</span>
                  <span class="task-type">{{ task.node_type }}</span>
                  <span class="task-status" :class="task.status">{{ task.status }}</span>
                </div>
                <div class="task-actions">
                  <button class="btn btn-sm btn-primary">查看详情</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 任务详情模态框 -->
  <div v-if="showTaskDetails" class="modal-overlay" @click="closeTaskDetails">
    <div class="modal-content task-details-modal" @click.stop>
      <div class="modal-header">
        <h3>任务详情</h3>
        <button @click="closeTaskDetails" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <!-- XMap任务详情 -->
        <XmapTaskDetails
          v-if="selectedTaskType === 'xmap_scan' && selectedTask"
          :task-id="selectedTask.task_id"
          :show-modal="false"
        />

        <!-- ZGrab2任务详情 -->
        <Zgrab2TaskDetails
          v-else-if="selectedTaskType === 'zgrab2_scan' && selectedTask"
          :task-id="selectedTask.task_id"
          :show-modal="false"
        />

        <!-- 其他类型任务的通用显示 -->
        <div v-else class="generic-task-details">
          <h4>{{ selectedTask?.node_type }} 任务</h4>
          <div class="task-info-grid">
            <div class="info-item">
              <label>任务ID:</label>
              <span>{{ selectedTask?.task_id }}</span>
            </div>
            <div class="info-item">
              <label>状态:</label>
              <span>{{ selectedTask?.status }}</span>
            </div>
            <div class="info-item">
              <label>开始时间:</label>
              <span>{{ formatTime(selectedTask?.started_at) }}</span>
            </div>
            <div class="info-item">
              <label>完成时间:</label>
              <span>{{ formatTime(selectedTask?.completed_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useFileStore } from '@/stores/file'
import api from '@/api'
import XmapTaskDetails from '@/components/xmap/XmapTaskDetails.vue'
import Zgrab2TaskDetails from '@/components/zgrab2/Zgrab2TaskDetails.vue'

const props = defineProps({
  workflowId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['workflow-saved', 'workflow-executed'])

const workflowStore = useWorkflowStore()
const fileStore = useFileStore()

// 响应式数据
const canvas = ref(null)
const nodes = ref([])
const connections = ref([])
const selectedNode = ref(null)
const hasChanges = ref(false)
const workflowStatus = ref('draft')
const showExecuteDialog = ref(false)
const tempConnection = ref(null)
const draggedNode = ref(null)
const availableFiles = ref([])
const isConnecting = ref(false)
const connectionStart = ref(null)
const mousePosition = ref({ x: 0, y: 0 })

// 画布平移和缩放
const canvasOffset = ref({ x: 0, y: 0 })
const canvasScale = ref(1)
const isPanning = ref(false)
const lastPanPoint = ref({ x: 0, y: 0 })

// 文件选择器相关状态
const fileSourceType = ref('upload')
const fileToolFilter = ref('')
const fileTypeFilter = ref('')
const isLoadingFiles = ref(false)
const allFiles = ref([])

const executionForm = ref({
  name: '',
  description: ''
})

// 执行详情相关
const currentExecution = ref(null)
const showExecutionDetails = ref(false)
const executionTasks = ref([])
const showTaskDetails = ref(false)
const selectedTask = ref(null)
const selectedTaskType = ref('')

// 计算属性
const nodeCategories = computed(() => {
  const categories = {}
  Object.entries(workflowStore.nodeTypes).forEach(([type, info]) => {
    const category = info.category || 'other'
    if (!categories[category]) {
      categories[category] = []
    }
    categories[category].push({ type, ...info })
  })
  return categories
})

const canExecute = computed(() => {
  // 可以执行的条件：有节点、工作流已保存（有ID）或者没有未保存的更改
  return nodes.value.length > 0 &&
         (props.workflowId || !hasChanges.value) &&
         workflowStatus.value !== 'running'
})

// 文件选择器计算属性
const filteredFiles = computed(() => {
  let files = allFiles.value

  if (fileSourceType.value === 'upload') {
    files = files.filter(file => file.source_type !== 'task')

    if (fileToolFilter.value) {
      files = files.filter(file => file.tool_name === fileToolFilter.value)
    }

    if (fileTypeFilter.value && fileToolFilter.value === 'zgrab2') {
      files = files.filter(file => file.file_type === fileTypeFilter.value)
    }
  } else if (fileSourceType.value === 'task') {
    files = files.filter(file => file.source_type === 'task')
  }

  return files
})

const selectedFileInfo = computed(() => {
  if (!selectedNode.value) return null

  // 查找文件选择器类型的配置项
  const nodeConfig = getNodeConfig(selectedNode.value.type)
  const fileConfigKey = Object.keys(nodeConfig).find(key => nodeConfig[key].type === 'file_selector')

  if (!fileConfigKey || !selectedNode.value.config[fileConfigKey]) return null

  return allFiles.value.find(file => file.id === selectedNode.value.config[fileConfigKey])
})

// 方法
const getCategoryName = (category) => {
  const names = {
    input: '输入',
    scan: '扫描',
    process: '处理',
    output: '输出',
    other: '其他'
  }
  return names[category] || category
}

const getNodeIcon = (nodeType) => {
  const icons = {
    file_input: 'icon-file',
    xmap_scan: 'icon-radar',
    zgrab2_scan: 'icon-scan',
    xmap_json_extract: 'icon-filter',
    zgrab2_json_extract: 'icon-filter',
    json_custom_extract: 'icon-filter',
    file_output: 'icon-download'
  }
  return icons[nodeType] || 'icon-node'
}

const getStatusText = (status) => {
  const texts = {
    draft: '草稿',
    active: '活跃',
    running: '运行中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

const getNodeTypeInfo = (nodeType) => {
  return workflowStore.nodeTypes[nodeType]
}

const getNodeInputs = (nodeType) => {
  return getNodeTypeInfo(nodeType)?.inputs || []
}

const getNodeOutputs = (nodeType) => {
  return getNodeTypeInfo(nodeType)?.outputs || []
}

const getNodeConfig = (nodeType) => {
  return getNodeTypeInfo(nodeType)?.config || {}
}

const getConfigLabel = (key) => {
  const labels = {
    fileType: '文件类型',
    fileId: '选择文件',
    protocol: '协议类型',
    ipv6: 'IPv6',
    ipv4: 'IPv4',
    targetPort: '目标端口',
    targetaddress: '目标地址/范围',
    rate: '扫描速率',
    maxResults: '最大结果数',
    maxlen: '扫描长度',
    probeModule: '探测模块',
    scanMode: '扫描模式',
    module: '扫描模块',
    port: '端口',
    configFile: '配置文件',
    timeout: '超时时间',
    senders: '发送协程数',
    connectionsPerHost: '每主机连接数',
    readLimitPerHost: '读取限制',
    extractType: '提取类型',
    fieldPaths: '字段路径',
    filterCriteria: '过滤条件',
    fileName: '文件名',
    description: '描述',
    successOnly: '仅成功响应',
    outputFormat: '输出格式',
    includeMetadata: '包含元数据',
    useRegex: '使用正则表达式',
    additionalParams: '额外参数'
  }
  return labels[key] || key
}

// 节点拖拽
const handleNodeDragStart = (event, nodeType) => {
  event.dataTransfer.setData('application/json', JSON.stringify(nodeType))
}

const handleCanvasDragOver = (event) => {
  event.preventDefault()
}

const handleCanvasDrop = (event) => {
  event.preventDefault()
  const nodeTypeData = JSON.parse(event.dataTransfer.getData('application/json'))
  
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  addNode(nodeTypeData, { x, y })
}

const addNode = (nodeType, position) => {
  const newNode = {
    id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type: nodeType.type,
    position: position,
    config: { ...nodeType.config }
  }
  
  // 设置默认配置值
  Object.entries(getNodeConfig(nodeType.type)).forEach(([key, config]) => {
    if (config.default !== undefined) {
      newNode.config[key] = config.default
    }
  })
  
  nodes.value.push(newNode)
  hasChanges.value = true
}

// 节点选择和删除
const selectNode = (node) => {
  selectedNode.value = node

  // 初始化对象类型配置的JSON字符串表示
  const nodeConfig = getNodeConfig(node.type)
  Object.entries(nodeConfig).forEach(([key, config]) => {
    if (config.type === 'object') {
      if (!node.config[key + '_json']) {
        node.config[key + '_json'] = JSON.stringify(node.config[key] || {}, null, 2)
      }
    }
    if (config.type === 'array') {
      if (!node.config[key]) {
        node.config[key] = config.default || []
      }
    }
  })
}

const deleteNode = (node) => {
  const index = nodes.value.findIndex(n => n.id === node.id)
  if (index > -1) {
    nodes.value.splice(index, 1)
    
    // 删除相关连接
    connections.value = connections.value.filter(
      conn => conn.from !== node.id && conn.to !== node.id
    )
    
    if (selectedNode.value?.id === node.id) {
      selectedNode.value = null
    }
    
    hasChanges.value = true
  }
}

const handleCanvasClick = (event) => {
  if (event.target === canvas.value || event.target.classList.contains('canvas-grid')) {
    selectedNode.value = null
  }
}

// 节点拖拽功能
let isDragging = false
let dragOffset = { x: 0, y: 0 }

const startNodeDrag = (event, node) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging = true

  const rect = canvas.value.getBoundingClientRect()
  // 考虑画布的变换（平移和缩放）
  const canvasX = (event.clientX - rect.left - canvasOffset.value.x) / canvasScale.value
  const canvasY = (event.clientY - rect.top - canvasOffset.value.y) / canvasScale.value

  dragOffset.x = canvasX - node.position.x
  dragOffset.y = canvasY - node.position.y

  const handleMouseMove = (e) => {
    if (!isDragging) return

    const rect = canvas.value.getBoundingClientRect()
    // 考虑画布的变换
    const canvasX = (e.clientX - rect.left - canvasOffset.value.x) / canvasScale.value
    const canvasY = (e.clientY - rect.top - canvasOffset.value.y) / canvasScale.value

    node.position.x = canvasX - dragOffset.x
    node.position.y = canvasY - dragOffset.y

    // 移除画布范围限制，允许节点在任意位置
    // 但可以设置一个合理的最小值防止节点完全消失
    node.position.x = Math.max(-1000, Math.min(node.position.x, 5000))
    node.position.y = Math.max(-1000, Math.min(node.position.y, 5000))

    hasChanges.value = true
  }

  const handleMouseUp = () => {
    isDragging = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 画布平移功能
const handleCanvasMouseDown = (event) => {
  // 只有在空白区域点击且不是拖拽节点时才开始平移
  if (event.target === canvas.value && !isDragging) {
    isPanning.value = true
    lastPanPoint.value = { x: event.clientX, y: event.clientY }

    const handlePanMove = (e) => {
      if (!isPanning.value) return

      const deltaX = e.clientX - lastPanPoint.value.x
      const deltaY = e.clientY - lastPanPoint.value.y

      canvasOffset.value.x += deltaX
      canvasOffset.value.y += deltaY

      lastPanPoint.value = { x: e.clientX, y: e.clientY }
    }

    const handlePanEnd = () => {
      isPanning.value = false
      document.removeEventListener('mousemove', handlePanMove)
      document.removeEventListener('mouseup', handlePanEnd)
    }

    document.addEventListener('mousemove', handlePanMove)
    document.addEventListener('mouseup', handlePanEnd)
  }
}

// 画布缩放功能
const handleCanvasWheel = (event) => {
  event.preventDefault()

  const rect = canvas.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top

  const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.1, Math.min(canvasScale.value * scaleFactor, 3))

  // 计算缩放后的偏移，使缩放以鼠标位置为中心
  const scaleRatio = newScale / canvasScale.value
  canvasOffset.value.x = mouseX - (mouseX - canvasOffset.value.x) * scaleRatio
  canvasOffset.value.y = mouseY - (mouseY - canvasOffset.value.y) * scaleRatio

  canvasScale.value = newScale
}

// 重置画布视图
const resetCanvasView = () => {
  canvasOffset.value = { x: 0, y: 0 }
  canvasScale.value = 1
}

// 居中显示所有节点
const centerAllNodes = () => {
  if (nodes.value.length === 0) return

  // 计算所有节点的边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  nodes.value.forEach(node => {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + 200) // 节点宽度
    maxY = Math.max(maxY, node.position.y + 100) // 节点高度
  })

  // 计算画布中心
  const rect = canvas.value.getBoundingClientRect()
  const canvasCenterX = rect.width / 2
  const canvasCenterY = rect.height / 2

  // 计算节点群的中心
  const nodesCenterX = (minX + maxX) / 2
  const nodesCenterY = (minY + maxY) / 2

  // 设置偏移使节点群居中
  canvasOffset.value.x = canvasCenterX - nodesCenterX * canvasScale.value
  canvasOffset.value.y = canvasCenterY - nodesCenterY * canvasScale.value
}

// 连接相关方法
const getConnectionPath = (connection) => {
  const fromNode = nodes.value.find(n => n.id === connection.from)
  const toNode = nodes.value.find(n => n.id === connection.to)

  if (!fromNode || !toNode) return ''

  const fromX = fromNode.position.x + 200 // 节点宽度
  const fromY = fromNode.position.y + 50  // 节点高度的一半
  const toX = toNode.position.x
  const toY = toNode.position.y + 50

  const midX = (fromX + toX) / 2

  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`
}

const getTempConnectionPath = () => {
  if (!tempConnection.value) return ''

  const { startX, startY } = tempConnection.value
  const { x: endX, y: endY } = mousePosition.value

  const midX = (startX + endX) / 2

  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
}

// 开始连接
const startConnection = (event, nodeId, port, portType) => {
  event.preventDefault()
  event.stopPropagation()

  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return

  let startX, startY
  if (portType === 'output') {
    startX = node.position.x + 200 // 输出端口在节点右侧
    startY = node.position.y + 50
  } else {
    startX = node.position.x // 输入端口在节点左侧
    startY = node.position.y + 50
  }

  connectionStart.value = {
    nodeId,
    port,
    portType,
    startX,
    startY
  }

  tempConnection.value = {
    startX,
    startY
  }

  isConnecting.value = true

  const handleMouseMove = (e) => {
    if (!isConnecting.value) return

    const rect = canvas.value.getBoundingClientRect()
    mousePosition.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const handleMouseUp = (e) => {
    if (!isConnecting.value) return

    // 检查是否在端口上释放
    const target = e.target.closest('.node-port')
    if (target && connectionStart.value) {
      const targetNodeId = target.dataset.nodeId
      const targetPort = target.dataset.port
      const targetPortType = target.classList.contains('input-port') ? 'input' : 'output'

      // 验证连接
      if (canConnect(connectionStart.value, { nodeId: targetNodeId, port: targetPort, portType: targetPortType })) {
        createConnection(connectionStart.value, { nodeId: targetNodeId, port: targetPort, portType: targetPortType })
      }
    }

    // 清理临时状态
    isConnecting.value = false
    connectionStart.value = null
    tempConnection.value = null

    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 验证是否可以连接
const canConnect = (source, target) => {
  // 不能连接到自己
  if (source.nodeId === target.nodeId) return false

  // 输出端口只能连接到输入端口
  if (source.portType === target.portType) return false

  // 确保是从输出到输入的连接
  if (source.portType !== 'output' || target.portType !== 'input') return false

  // 检查是否已经存在连接
  const existingConnection = connections.value.find(
    conn => conn.from === source.nodeId && conn.to === target.nodeId
  )
  if (existingConnection) return false

  // 检查输入输出类型是否匹配
  const sourceNode = nodes.value.find(n => n.id === source.nodeId)
  const targetNode = nodes.value.find(n => n.id === target.nodeId)

  if (!sourceNode || !targetNode) return false

  const sourceOutputs = getNodeOutputs(sourceNode.type)
  const targetInputs = getNodeInputs(targetNode.type)

  return sourceOutputs.includes(source.port) && targetInputs.includes(target.port)
}

// 创建连接
const createConnection = (source, target) => {
  const newConnection = {
    from: source.nodeId,
    to: target.nodeId,
    fromPort: source.port,
    toPort: target.port
  }

  connections.value.push(newConnection)
  hasChanges.value = true
}

// 删除连接
const deleteConnection = (connection) => {
  const index = connections.value.findIndex(
    conn => conn.from === connection.from && conn.to === connection.to
  )
  if (index > -1) {
    connections.value.splice(index, 1)
    hasChanges.value = true
  }
}

// 文件选择器方法
const refreshFileList = async () => {
  isLoadingFiles.value = true
  try {
    // 获取所有文件（包括上传的文件和任务结果文件）
    const response = await api.files.getFiles()
    const files = response.data || []

    // 为文件添加source_type标识
    allFiles.value = files.map(file => ({
      ...file,
      source_type: file.task_id ? 'task' : 'upload'
    }))

    // 更新旧的availableFiles以保持兼容性
    availableFiles.value = allFiles.value
    console.log('文件列表加载完成:', allFiles.value.length, '个文件')
  } catch (error) {
    console.error('获取文件列表失败:', error)
    allFiles.value = []
    availableFiles.value = []
  } finally {
    isLoadingFiles.value = false
  }
}

const handleFileSourceChange = () => {
  // 重置过滤器
  fileToolFilter.value = ''
  fileTypeFilter.value = ''
}

const handleFileFilterChange = () => {
  // 过滤器变化时的处理逻辑
  console.log('文件过滤器变化:', {
    source: fileSourceType.value,
    tool: fileToolFilter.value,
    type: fileTypeFilter.value
  })
}

// 获取节点的输入连接
const getNodeInputConnections = (nodeId) => {
  return connections.value.filter(conn => conn.to === nodeId)
}

// 获取节点名称
const getNodeName = (nodeId) => {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return nodeId

  const nodeTypeInfo = getNodeTypeInfo(node.type)
  return nodeTypeInfo ? nodeTypeInfo.name : node.type
}

// 获取连接的文件信息
const getConnectedFileInfo = (connection) => {
  const sourceNode = nodes.value.find(n => n.id === connection.from)
  if (!sourceNode) return null

  // 如果源节点是文件输入节点
  if (sourceNode.type === 'file_input' && sourceNode.config.fileId) {
    const file = allFiles.value.find(f => f.id === sourceNode.config.fileId)
    if (file) {
      return `${file.file_name} (${file.tool_name || file.source_type})`
    }
  }

  // 如果源节点是其他类型，显示节点信息
  return `来自 ${getNodeName(sourceNode.id)}`
}

// 获取执行详情
const fetchExecutionDetails = async (executionId) => {
  try {
    const details = await workflowStore.fetchExecutionDetails(executionId)
    console.log('获取到的执行详情:', details)

    if (details && details.nodeExecutions) {
      // 将节点执行记录转换为任务列表
      executionTasks.value = details.nodeExecutions.map(nodeExec => ({
        id: nodeExec.id,
        node_id: nodeExec.node_id,
        node_type: nodeExec.node_type,
        task_id: nodeExec.task_id,
        status: nodeExec.status,
        started_at: nodeExec.started_at,
        completed_at: nodeExec.completed_at,
        error_message: nodeExec.error_message
      }))
      console.log('转换后的任务列表:', executionTasks.value)
    }
  } catch (error) {
    console.error('获取执行详情失败:', error)
  }
}

// 显示任务详情
const showTaskDetail = (task) => {
  selectedTask.value = task
  selectedTaskType.value = task.node_type
  showTaskDetails.value = true
}

// 关闭任务详情
const closeTaskDetails = () => {
  showTaskDetails.value = false
  selectedTask.value = null
  selectedTaskType.value = ''
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 工作流操作
const saveWorkflow = async () => {
  try {
    const workflowData = {
      name: `工作流_${Date.now()}`,
      description: '通过编辑器创建的工作流',
      definition: {
        nodes: nodes.value,
        connections: connections.value
      }
    }

    if (props.workflowId) {
      await workflowStore.updateWorkflow(props.workflowId, workflowData)
    } else {
      await workflowStore.createWorkflow(workflowData)
    }

    hasChanges.value = false
    emit('workflow-saved')
    alert('工作流保存成功！')
  } catch (error) {
    console.error('保存工作流失败:', error)
    alert(`保存工作流失败: ${error.message || error}`)
  }
}

const executeWorkflow = () => {
  showExecuteDialog.value = true
  executionForm.value.name = `执行_${Date.now()}`
}

const confirmExecute = async () => {
  try {
    if (!props.workflowId) {
      await saveWorkflow()
    }

    const executionData = {
      name: executionForm.value.name,
      description: executionForm.value.description
    }

    const result = await workflowStore.executeWorkflow(props.workflowId, executionData)
    showExecuteDialog.value = false

    // 保存执行信息并显示详情
    currentExecution.value = result
    showExecutionDetails.value = true

    // 获取执行详情
    await fetchExecutionDetails(result.executionId)

    emit('workflow-executed', result)
  } catch (error) {
    console.error('执行工作流失败:', error)
    alert(`执行工作流失败: ${error.message || error}`)
  }
}

const validateWorkflow = () => {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    expectedFiles: []
  }

  // 1. 检查是否有节点
  if (nodes.value.length === 0) {
    validation.isValid = false
    validation.errors.push('工作流中没有任何节点')
    return showValidationResult(validation)
  }

  // 2. 检查是否有起始节点（文件输入节点或可以独立运行的节点）
  const inputNodes = nodes.value.filter(node => node.type === 'file_input')
  const independentNodes = nodes.value.filter(node =>
    node.type === 'xmap_scan' || node.type === 'zgrab2_scan'
  )

  // 检查是否有没有输入连接的节点（起始节点）
  const nodesWithoutInput = nodes.value.filter(node => {
    return !connections.value.some(conn => conn.to === node.id)
  })

  if (nodesWithoutInput.length === 0) {
    validation.isValid = false
    validation.errors.push('工作流中没有起始节点（所有节点都有输入连接）')
  }

  // 对于没有输入连接的扫描节点，检查是否有必要的配置
  nodesWithoutInput.forEach(node => {
    if (node.type === 'xmap_scan') {
      // XMap作为起始节点时，需要配置目标地址或白名单文件
      if (!node.config.targetaddress && !node.config.whitelistFile) {
        validation.warnings.push(`XMap节点 ${node.id} 作为起始节点时，建议配置目标地址或上传白名单文件`)
      }
    }
  })

  // 3. 检查节点连接
  const nodeIds = new Set(nodes.value.map(n => n.id))
  for (const connection of connections.value) {
    if (!nodeIds.has(connection.from) || !nodeIds.has(connection.to)) {
      validation.isValid = false
      validation.errors.push(`连接引用了不存在的节点: ${connection.from} -> ${connection.to}`)
    }
  }

  // 4. 检查节点配置
  for (const node of nodes.value) {
    const nodeConfig = getNodeConfig(node.type)
    for (const [key, config] of Object.entries(nodeConfig)) {
      if (config.required) {
        const value = node.config[key]
        const isEmpty = !value || value === '' || (Array.isArray(value) && value.length === 0)

        if (isEmpty) {
          // 特殊处理：文件输入节点只有在有输出连接时才需要选择文件
          if (node.type === 'file_input' && config.type === 'file_selector') {
            const hasOutputConnections = connections.value.some(conn => conn.from === node.id)
            if (hasOutputConnections) {
              validation.isValid = false
              validation.errors.push(`文件输入节点 ${node.id} 需要选择一个输入文件`)
            } else {
              validation.warnings.push(`文件输入节点 ${node.id} 没有连接到其他节点`)
            }
          } else if (config.type === 'file_selector') {
            validation.warnings.push(`节点 ${node.id} 建议选择一个文件: ${getConfigLabel(key)}`)
          } else {
            validation.isValid = false
            validation.errors.push(`节点 ${node.id} 缺少必需配置: ${getConfigLabel(key)}`)
          }
        }
      }
    }
  }

  // 5. 检查工作流连通性
  const connectedNodes = new Set()
  const visitNode = (nodeId) => {
    if (connectedNodes.has(nodeId)) return
    connectedNodes.add(nodeId)

    connections.value
      .filter(conn => conn.from === nodeId)
      .forEach(conn => visitNode(conn.to))
  }

  // 从输入节点开始遍历
  inputNodes.forEach(node => visitNode(node.id))

  const unconnectedNodes = nodes.value.filter(node => !connectedNodes.has(node.id))
  if (unconnectedNodes.length > 0) {
    validation.warnings.push(`发现 ${unconnectedNodes.length} 个未连接的节点`)
  }

  // 6. 生成预期文件列表
  validation.expectedFiles = generateExpectedFiles()

  showValidationResult(validation)
}

const generateExpectedFiles = () => {
  const files = []
  const timestamp = Date.now()

  for (const node of nodes.value) {
    switch (node.type) {
      case 'xmap_scan':
        files.push({
          type: 'XMap扫描结果',
          path: `/xmap_result/xmap_result_${timestamp}.json`,
          description: 'XMap网络扫描的原始JSON结果文件'
        })
        break
      case 'zgrab2_scan':
        files.push({
          type: 'ZGrab2扫描结果',
          path: `/zgrab2_results/zgrab2_result_${timestamp}.jsonl`,
          description: 'ZGrab2应用层扫描的JSONL结果文件'
        })
        break
      case 'xmap_json_extract':
        const xmapFileName = node.config.fileName || 'xmap_extracted_addresses'
        const xmapFormat = node.config.outputFormat || 'txt'
        files.push({
          type: 'XMap提取结果',
          path: `/jsonanalysis/${xmapFileName}_${timestamp}.${xmapFormat}`,
          description: `从XMap结果中提取的${node.config.extractType || 'outersaddr'}数据`
        })
        break
      case 'zgrab2_json_extract':
        const zgrab2FileName = node.config.fileName || 'zgrab2_extracted_results'
        const zgrab2Format = node.config.outputFormat || 'txt'
        files.push({
          type: 'ZGrab2提取结果',
          path: `/jsonanalysis/${zgrab2FileName}_${timestamp}.${zgrab2Format}`,
          description: `从ZGrab2结果中提取的${node.config.extractType || 'successful_ips'}数据`
        })
        break
      case 'file_output':
        const outputFileName = node.config.fileName || 'workflow_output'
        const outputFormat = node.config.fileType === 'auto' ? 'json' : node.config.fileType
        files.push({
          type: '最终输出文件',
          path: `/jsonanalysis/${outputFileName}_${timestamp}.${outputFormat}`,
          description: node.config.description || '工作流最终输出文件'
        })
        break
    }
  }

  return files
}

const showValidationResult = (validation) => {
  // 这里可以显示一个模态框或者在界面上显示验证结果
  console.log('工作流验证结果:', validation)

  if (validation.isValid) {
    alert(`工作流验证通过！\n\n预期生成文件：\n${validation.expectedFiles.map(f => `- ${f.type}: ${f.path}`).join('\n')}`)
  } else {
    alert(`工作流验证失败：\n\n错误：\n${validation.errors.join('\n')}\n\n警告：\n${validation.warnings.join('\n')}`)
  }
}

const updateNodeConfig = () => {
  hasChanges.value = true
}

// 条件显示配置字段
const shouldShowConfig = (key, node) => {
  if (!node || !node.type) return true

  // ZGrab2节点的条件显示逻辑
  if (node.type === 'zgrab2_scan') {
    const scanMode = node.config.scanMode

    // 单模块模式下显示的字段
    if (scanMode === 'single') {
      return !['configFile'].includes(key)
    }
    // 多模块模式下显示的字段
    else if (scanMode === 'multiple') {
      return !['module', 'port'].includes(key)
    }
  }

  return true
}

// 数组配置处理
const addArrayItem = (key) => {
  if (!selectedNode.value.config[key]) {
    selectedNode.value.config[key] = []
  }
  selectedNode.value.config[key].push('')
  hasChanges.value = true
}

const removeArrayItem = (key, index) => {
  selectedNode.value.config[key].splice(index, 1)
  hasChanges.value = true
}

// 对象配置处理
const updateObjectConfig = (key) => {
  try {
    const jsonStr = selectedNode.value.config[key + '_json']
    if (jsonStr) {
      selectedNode.value.config[key] = JSON.parse(jsonStr)
    } else {
      selectedNode.value.config[key] = {}
    }
    hasChanges.value = true
  } catch (error) {
    console.error('JSON格式错误:', error)
    // 可以添加错误提示
  }
}

// 生命周期
onMounted(async () => {
  try {
    console.log('开始获取节点类型...')
    await workflowStore.fetchNodeTypes()
    console.log('节点类型获取完成:', workflowStore.nodeTypes)

    // 使用新的文件加载方法
    await refreshFileList()
    console.log('可用文件:', availableFiles.value)

    if (props.workflowId) {
      console.log('正在加载工作流ID:', props.workflowId)
      const workflow = await workflowStore.fetchWorkflowById(props.workflowId)
      console.log('获取到的工作流数据:', workflow)

      if (workflow && workflow.definition) {
        console.log('工作流定义:', workflow.definition)
        nodes.value = workflow.definition.nodes || []
        connections.value = workflow.definition.connections || []
        workflowStatus.value = workflow.status
        console.log('加载的节点数量:', nodes.value.length)
        console.log('加载的连接数量:', connections.value.length)
      } else {
        console.warn('工作流定义为空或不存在')
      }
    }

    // 防止双击选择文本时的页面跳转
    const handleSelectStart = (e) => {
      // 如果是在属性面板中，防止页面滚动
      if (e.target.closest('.properties-panel')) {
        // 允许在输入框中选择文本
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
          return true
        }
        // 其他情况防止选择
        e.preventDefault()
        return false
      }
    }

    document.addEventListener('selectstart', handleSelectStart)

    // 键盘快捷键处理
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + 0: 重置视图
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault()
        resetCanvasView()
      }
      // Ctrl/Cmd + 1: 居中所有节点
      if ((event.ctrlKey || event.metaKey) && event.key === '1') {
        event.preventDefault()
        centerAllNodes()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // 如果有节点，自动居中显示
    setTimeout(() => {
      if (nodes.value.length > 0) {
        centerAllNodes()
      }
    }, 100)

    // 清理事件监听器
    onUnmounted(() => {
      document.removeEventListener('selectstart', handleSelectStart)
      document.removeEventListener('keydown', handleKeyDown)
    })

  } catch (error) {
    console.error('初始化工作流编辑器失败:', error)
  }
})

// 监听变化
watch(() => props.workflowId, async (newId) => {
  console.log('工作流ID变化:', newId)
  if (newId) {
    try {
      const workflow = await workflowStore.fetchWorkflowById(newId)
      console.log('监听器获取到的工作流数据:', workflow)

      if (workflow && workflow.definition) {
        nodes.value = workflow.definition.nodes || []
        connections.value = workflow.definition.connections || []
        workflowStatus.value = workflow.status
        console.log('监听器加载的节点数量:', nodes.value.length)
        console.log('监听器加载的连接数量:', connections.value.length)
      } else {
        console.warn('监听器：工作流定义为空或不存在')
        nodes.value = []
        connections.value = []
        workflowStatus.value = 'draft'
      }
    } catch (error) {
      console.error('监听器加载工作流失败:', error)
      nodes.value = []
      connections.value = []
      workflowStatus.value = 'draft'
    }
  } else {
    nodes.value = []
    connections.value = []
    workflowStatus.value = 'draft'
  }
  hasChanges.value = false
})
</script>

<style scoped>
.workflow-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden; /* 防止整体页面滚动 */
  /* 防止文本选择导致的页面滚动 */
  scroll-behavior: auto;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  /* 确保工具栏始终在顶部可见 */
  position: sticky;
  top: 0;
  z-index: 100;
  /* 防止工具栏被挤压 */
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e0e0e0;
  margin: 0 8px;
}

.canvas-info {
  margin-right: 12px;
  padding: 4px 8px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.canvas-info small {
  color: #6c757d;
  font-size: 12px;
}

.canvas-help {
  position: relative;
  display: inline-block;
  margin-left: 8px;
  cursor: help;
}

.canvas-help .icon-help {
  display: inline-block;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 50%;
  font-size: 12px;
  color: #6c757d;
}

.help-tooltip {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  padding: 12px;
  background: #333;
  color: white;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.help-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  right: 12px;
  border: 6px solid transparent;
  border-bottom-color: #333;
}

.canvas-help:hover .help-tooltip {
  opacity: 1;
  visibility: visible;
}

.help-tooltip div {
  margin-bottom: 4px;
}

.help-tooltip div:last-child {
  margin-bottom: 0;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #337ecc;
}

.btn-success {
  background: #67c23a;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #529b2e;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #73767a;
}

.workflow-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.workflow-status.draft {
  background: #f4f4f5;
  color: #909399;
}

.workflow-status.active {
  background: #e1f3d8;
  color: #67c23a;
}

.workflow-status.running {
  background: #ecf5ff;
  color: #409eff;
}

.editor-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.node-panel {
  width: 280px;
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.node-category {
  margin-bottom: 24px;
}

.node-category h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s;
}

.node-item:hover {
  background: #e9ecef;
  border-color: #409eff;
}

.node-item:active {
  cursor: grabbing;
}

.node-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #409eff;
  color: white;
  border-radius: 4px;
  margin-right: 12px;
}

.node-info {
  flex: 1;
}

.node-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.node-desc {
  font-size: 12px;
  color: #909399;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #fafafa;
  /* 确保画布容器不会被属性面板挤压 */
  min-width: 400px;
}

.workflow-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible; /* 改为visible以支持变换 */
  background: #fafafa;
  cursor: grab;
  /* 确保画布可以超出容器范围 */
  min-width: 2000px;
  min-height: 2000px;
  /* 添加变换的过渡效果 */
  transition: transform 0.1s ease-out;
}

.workflow-canvas:active {
  cursor: grabbing;
}

.canvas-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(to right, #e0e0e0 1px, transparent 1px),
    linear-gradient(to bottom, #e0e0e0 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}

.connections-layer,
.temp-connection {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.connection-line {
  fill: none;
  stroke: #666;
  stroke-width: 2;
  pointer-events: stroke;
  cursor: pointer;
}

.connection-line:hover {
  stroke: #f56c6c;
  stroke-width: 3;
}

.temp-connection-line {
  fill: none;
  stroke: #409eff;
  stroke-width: 2;
  stroke-dasharray: 5,5;
}

.workflow-node {
  position: absolute;
  width: 200px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  cursor: move;
  z-index: 2;
  transition: all 0.2s;
}

.workflow-node:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.workflow-node.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.workflow-node.error {
  border-color: #f56c6c;
}

.node-header {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  border-radius: 6px 6px 0 0;
}

.node-header i {
  margin-right: 8px;
  color: #409eff;
}

.node-title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.node-delete {
  background: none;
  border: none;
  color: #909399;
  cursor: pointer;
  padding: 4px;
  border-radius: 2px;
}

.node-delete:hover {
  color: #f56c6c;
  background: #fef0f0;
}

.node-body {
  padding: 12px;
}

.node-inputs,
.node-outputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-port {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #606266;
}

.input-port {
  justify-content: flex-start;
}

.output-port {
  justify-content: flex-end;
}

.port-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #909399;
  cursor: crosshair;
}

.input-port .port-dot {
  margin-right: 6px;
}

.output-port .port-dot {
  margin-left: 6px;
}

.port-label {
  font-size: 11px;
}

.properties-panel {
  width: 380px; /* 增加宽度以容纳更多内容 */
  background: white;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden; /* 防止面板本身滚动 */
  position: relative; /* 确保定位正确 */
}

.properties-panel .panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  /* 确保滚动容器有正确的高度 */
  min-height: 0; /* 重要：允许flex子项收缩 */
  /* 添加平滑滚动 */
  scroll-behavior: smooth;
}

.properties-panel .panel-header {
  flex-shrink: 0;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #f8f9fa;
}

.no-selection {
  padding: 32px 16px;
  text-align: center;
  color: #909399;
}

.node-properties {
  padding: 16px;
  /* 确保内容可以完整显示 */
  padding-bottom: 80px; /* 增加底部间距，确保提交按钮可见 */
  max-height: none; /* 移除高度限制 */
}

.node-properties form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 确保提交按钮始终可见 */
.node-properties form button[type="submit"] {
  margin-top: 20px;
  position: sticky;
  bottom: 16px;
  background: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0,123,255,0.3);
}

.node-properties form button[type="submit"]:hover {
  background: #0056b3;
  box-shadow: 0 4px 12px rgba(0,123,255,0.4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.form-group small {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}

/* 表单控件样式 */
.form-control, .form-select, .form-textarea, .form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
  /* 确保在小容器中也能正常显示 */
  min-width: 0;
}

.form-control:focus, .form-select:focus, .form-textarea:focus, .form-input:focus {
  outline: none;
  border-color: #409eff;
  /* 防止焦点时页面跳转 */
  scroll-margin: 0;
  /* 添加焦点时的阴影效果 */
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* 文件选择器样式改进 */
.file-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-selector-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-source-select {
  flex: 1;
}

.file-selector-filters {
  display: flex;
  gap: 8px;
}

.file-tool-select,
.file-type-select {
  flex: 1;
}

.file-list-select {
  min-height: 40px; /* 确保选择框有足够高度 */
}

/* 文件选择状态样式 */
.file-selection-status {
  margin-top: 4px;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
  font-size: 12px;
}

.selected-file-info {
  margin-top: 8px;
  padding: 8px 12px;
  background: #e8f4fd;
  border: 1px solid #b3d8f2;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.text-success {
  color: #28a745 !important;
}

.text-muted {
  color: #6c757d !important;
}

.node-properties h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #303133;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #409eff;
}

.form-checkbox {
  width: auto;
  margin-right: 8px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-label {
  margin: 0;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
}

.required-mark {
  color: #f56c6c;
  margin-left: 4px;
}

.config-description {
  margin: 4px 0 8px 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.array-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.array-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.array-item .form-input {
  flex: 1;
}

.btn-remove {
  padding: 4px 8px;
  background: #f56c6c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove:hover {
  background: #f78989;
}

.btn-add {
  padding: 6px 12px;
  background: #67c23a;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
}

.btn-add:hover {
  background: #85ce61;
}

.form-textarea {
  min-height: 80px;
  resize: vertical;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 500px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #909399;
  cursor: pointer;
  padding: 4px;
}

.modal-close:hover {
  color: #606266;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
}

/* 文件选择器样式 */
.file-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-selector-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-source-select {
  flex: 1;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #ddd;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
}

.btn-sm:hover {
  background: #e9e9e9;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.file-selector-filters {
  display: flex;
  gap: 8px;
}

.file-tool-select,
.file-type-select {
  flex: 1;
}

.file-list-select {
  min-height: 36px;
}

.selected-file-info {
  padding: 8px;
  background: #f9f9f9;
  border: 1px solid #e1e1e1;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

.selected-file-info strong {
  color: #333;
}

/* 输入连接信息样式 */
.input-connections-info {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
}

.input-connections-info h5 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.input-connection-item {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

.input-connection-item:last-child {
  margin-bottom: 0;
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.source-node {
  color: #007bff;
}

.arrow {
  color: #6c757d;
  font-style: normal;
}

.target-port {
  color: #28a745;
}

.connected-file-info {
  margin-top: 4px;
  padding-left: 16px;
}

.connected-file-info small {
  color: #6c757d;
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-file::before {
  content: "📄";
}

/* 执行详情模态框样式 */
.execution-details-modal {
  width: 800px;
  max-height: 80vh;
}

.execution-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.execution-summary {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item label {
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
}

.info-item span {
  font-size: 14px;
  color: #333;
}

.status {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status.pending {
  background: #fff3cd;
  color: #856404;
}

.status.running {
  background: #d1ecf1;
  color: #0c5460;
}

.status.completed {
  background: #d4edda;
  color: #155724;
}

.status.failed {
  background: #f8d7da;
  color: #721c24;
}

.execution-tasks h4 {
  margin-bottom: 12px;
  color: #495057;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: #007bff;
  box-shadow: 0 2px 4px rgba(0,123,255,0.1);
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-name {
  font-weight: 500;
  color: #333;
}

.task-type {
  font-size: 12px;
  color: #6c757d;
}

.task-status {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 8px;
}

.task-actions {
  display: flex;
  gap: 8px;
}

/* 任务详情模态框样式 */
.task-details-modal {
  width: 900px;
  max-height: 85vh;
}

.generic-task-details {
  padding: 16px;
}

.task-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
</style>
