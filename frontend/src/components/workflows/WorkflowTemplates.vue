<template>
  <div class="workflow-templates">
    <!-- 头部 -->
    <div class="templates-header">
      <div class="header-left">
        <h2>工作流模板</h2>
        <p>选择预定义的工作流模板快速开始</p>
      </div>
      <div class="header-right">
        <button @click="refreshTemplates" class="btn btn-refresh">
          <i class="icon-refresh"></i> 刷新
        </button>
      </div>
    </div>

    <!-- 模板分类 -->
    <div class="template-categories">
      <button 
        v-for="category in categories" 
        :key="category.id"
        @click="activeCategory = category.id"
        class="category-btn"
        :class="{ active: activeCategory === category.id }"
      >
        <i :class="category.icon"></i>
        {{ category.name }}
      </button>
    </div>

    <!-- 模板内容 -->
    <div class="templates-content">
      <div v-if="workflowStore.isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>正在加载模板...</p>
      </div>

      <div v-else-if="filteredTemplates.length === 0" class="empty-state">
        <div class="empty-icon">
          <i class="icon-template"></i>
        </div>
        <h3>暂无模板</h3>
        <p>该分类下暂无可用模板</p>
      </div>

      <div v-else class="templates-grid">
        <div 
          v-for="template in filteredTemplates" 
          :key="template.id"
          class="template-card"
          @click="selectTemplate(template)"
        >
          <div class="template-preview">
            <div class="preview-canvas">
              <!-- 简化的工作流预览 -->
              <div class="preview-nodes">
                <div 
                  v-for="(node, index) in getPreviewNodes(template)" 
                  :key="index"
                  class="preview-node"
                  :class="node.type"
                >
                  <i :class="getNodeIcon(node.type)"></i>
                </div>
              </div>
              <div class="preview-connections">
                <div 
                  v-for="(connection, index) in getPreviewConnections(template)" 
                  :key="index"
                  class="preview-connection"
                ></div>
              </div>
            </div>
          </div>

          <div class="template-info">
            <div class="template-header">
              <h3>{{ template.name }}</h3>
              <div class="template-category">
                {{ getCategoryName(template.category) }}
              </div>
            </div>
            <p class="template-description">{{ template.description }}</p>
            
            <div class="template-stats">
              <div class="stat-item">
                <i class="icon-node"></i>
                <span>{{ getNodeCount(template) }} 个节点</span>
              </div>
              <div class="stat-item">
                <i class="icon-time"></i>
                <span>预计 {{ getEstimatedTime(template) }}</span>
              </div>
            </div>

            <div class="template-tags">
              <span 
                v-for="tag in template.tags" 
                :key="tag"
                class="template-tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <div class="template-actions">
            <button @click.stop="previewTemplate(template)" class="action-btn secondary">
              <i class="icon-eye"></i> 预览
            </button>
            <button @click.stop="useTemplate(template)" class="action-btn primary">
              <i class="icon-plus"></i> 使用模板
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板预览对话框 -->
    <div v-if="showPreviewDialog" class="modal-overlay" @click="showPreviewDialog = false">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>模板预览 - {{ selectedTemplate?.name }}</h3>
          <button @click="showPreviewDialog = false" class="modal-close">
            <i class="icon-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <div v-if="selectedTemplate" class="template-preview-detail">
            <!-- 模板信息 -->
            <div class="preview-info">
              <div class="info-section">
                <h4>模板描述</h4>
                <p>{{ selectedTemplate.description }}</p>
              </div>
              
              <div class="info-section">
                <h4>工作流步骤</h4>
                <div class="workflow-steps">
                  <div 
                    v-for="(step, index) in getWorkflowSteps(selectedTemplate)" 
                    :key="index"
                    class="workflow-step"
                  >
                    <div class="step-number">{{ index + 1 }}</div>
                    <div class="step-content">
                      <div class="step-title">{{ step.title }}</div>
                      <div class="step-description">{{ step.description }}</div>
                    </div>
                    <div v-if="index < getWorkflowSteps(selectedTemplate).length - 1" class="step-arrow">
                      <i class="icon-arrow-right"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div class="info-section">
                <h4>所需输入</h4>
                <div class="required-inputs">
                  <div 
                    v-for="input in getRequiredInputs(selectedTemplate)" 
                    :key="input.name"
                    class="input-item"
                  >
                    <div class="input-name">{{ input.name }}</div>
                    <div class="input-type">{{ input.type }}</div>
                    <div class="input-description">{{ input.description }}</div>
                  </div>
                </div>
              </div>

              <div class="info-section">
                <h4>预期输出</h4>
                <div class="expected-outputs">
                  <div 
                    v-for="output in getExpectedOutputs(selectedTemplate)" 
                    :key="output.name"
                    class="output-item"
                  >
                    <div class="output-name">{{ output.name }}</div>
                    <div class="output-type">{{ output.type }}</div>
                    <div class="output-description">{{ output.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showPreviewDialog = false" class="btn btn-secondary">关闭</button>
          <button @click="useSelectedTemplate" class="btn btn-primary">
            <i class="icon-plus"></i> 使用此模板
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'

const emit = defineEmits(['template-selected'])

const workflowStore = useWorkflowStore()

// 响应式数据
const activeCategory = ref('all')
const showPreviewDialog = ref(false)
const selectedTemplate = ref(null)

const categories = [
  { id: 'all', name: '全部', icon: 'icon-all' },
  { id: 'scan', name: '扫描类', icon: 'icon-radar' },
  { id: 'analysis', name: '分析类', icon: 'icon-chart' },
  { id: 'automation', name: '自动化', icon: 'icon-robot' },
  { id: 'security', name: '安全类', icon: 'icon-shield' }
]

// 计算属性
const filteredTemplates = computed(() => {
  if (activeCategory.value === 'all') {
    return workflowStore.templates
  }
  return workflowStore.templates.filter(template => 
    template.category === activeCategory.value
  )
})

// 方法
const refreshTemplates = async () => {
  await workflowStore.fetchTemplates()
}

const selectTemplate = (template) => {
  emit('template-selected', template)
}

const previewTemplate = (template) => {
  selectedTemplate.value = template
  showPreviewDialog.value = true
}

const useTemplate = (template) => {
  emit('template-selected', template)
}

const useSelectedTemplate = () => {
  if (selectedTemplate.value) {
    emit('template-selected', selectedTemplate.value)
    showPreviewDialog.value = false
  }
}

const getCategoryName = (categoryId) => {
  const category = categories.find(c => c.id === categoryId)
  return category ? category.name : categoryId
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

const getPreviewNodes = (template) => {
  if (!template.definition || !template.definition.nodes) return []
  return template.definition.nodes.slice(0, 5) // 只显示前5个节点
}

const getPreviewConnections = (template) => {
  if (!template.definition || !template.definition.connections) return []
  return template.definition.connections.slice(0, 4) // 只显示前4个连接
}

const getNodeCount = (template) => {
  return template.definition?.nodes?.length || 0
}

const getEstimatedTime = (template) => {
  // 根据节点数量估算时间
  const nodeCount = getNodeCount(template)
  if (nodeCount <= 3) return '5-10分钟'
  if (nodeCount <= 5) return '10-20分钟'
  return '20-30分钟'
}

const getWorkflowSteps = (template) => {
  if (!template.definition || !template.definition.nodes) return []
  
  return template.definition.nodes.map(node => {
    const stepTitles = {
      file_input: '文件输入',
      xmap_scan: 'XMap网络扫描',
      zgrab2_scan: 'ZGrab2应用扫描',
      json_extract: 'JSON数据提取',
      file_output: '结果输出'
    }
    
    const stepDescriptions = {
      file_input: '选择输入文件，支持多种格式',
      xmap_scan: '执行IPv6网络扫描，发现活跃主机',
      zgrab2_scan: '进行应用层协议扫描，获取服务信息',
      json_extract: '从扫描结果中提取有用数据',
      file_output: '保存处理后的结果文件'
    }
    
    return {
      title: stepTitles[node.type] || node.type,
      description: stepDescriptions[node.type] || '执行相关操作'
    }
  })
}

const getRequiredInputs = (template) => {
  // 分析模板需要的输入
  const inputs = []
  
  if (template.definition?.nodes) {
    template.definition.nodes.forEach(node => {
      if (node.type === 'file_input') {
        inputs.push({
          name: '输入文件',
          type: 'file',
          description: '扫描目标文件，包含IP地址或域名列表'
        })
      }
    })
  }
  
  return inputs
}

const getExpectedOutputs = (template) => {
  // 分析模板的预期输出
  const outputs = []
  
  if (template.definition?.nodes) {
    template.definition.nodes.forEach(node => {
      if (node.type === 'file_output') {
        outputs.push({
          name: '扫描结果',
          type: 'json/txt',
          description: '包含扫描结果和分析数据的文件'
        })
      }
    })
  }
  
  return outputs
}

// 生命周期
onMounted(async () => {
  try {
    await workflowStore.fetchTemplates()
    console.log('模板加载完成:', workflowStore.templates)
  } catch (error) {
    console.error('加载模板失败:', error)
  }
})
</script>

<style scoped>
.workflow-templates {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.templates-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.header-left h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #303133;
  font-weight: 600;
}

.header-left p {
  margin: 0;
  color: #909399;
  font-size: 16px;
}

.btn-refresh {
  padding: 10px 20px;
  background: #f4f4f5;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  transition: all 0.2s;
}

.btn-refresh:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.template-categories {
  display: flex;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  padding: 0 32px;
}

.category-btn {
  padding: 16px 24px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.category-btn:hover {
  color: #409eff;
}

.category-btn.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.templates-content {
  flex: 1;
  overflow: hidden;
  padding: 24px 32px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  background: #f4f4f5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.empty-icon i {
  font-size: 32px;
  color: #c0c4cc;
}

.empty-state h3 {
  margin: 0 0 12px 0;
  font-size: 20px;
  color: #303133;
}

.empty-state p {
  margin: 0;
  color: #909399;
  font-size: 16px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 24px;
  height: 100%;
  overflow-y: auto;
}

.template-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
  height: fit-content;
  display: flex;
  flex-direction: column;
}

.template-card:hover {
  border-color: #409eff;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}

.template-preview {
  height: 120px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;
  overflow: hidden;
}

.preview-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 16px;
}

.preview-nodes {
  display: flex;
  gap: 12px;
}

.preview-node {
  width: 32px;
  height: 32px;
  background: rgba(255,255,255,0.9);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #409eff;
  font-size: 14px;
}

.preview-connections {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-connection {
  width: 8px;
  height: 2px;
  background: rgba(255,255,255,0.7);
  border-radius: 1px;
}

.template-info {
  padding: 20px;
  flex: 1;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.template-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
  font-weight: 600;
}

.template-category {
  padding: 4px 8px;
  background: #f0f9ff;
  color: #409eff;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.template-description {
  margin: 0 0 16px 0;
  color: #606266;
  font-size: 14px;
  line-height: 1.5;
}

.template-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-tag {
  padding: 2px 8px;
  background: #f4f4f5;
  color: #909399;
  border-radius: 10px;
  font-size: 11px;
}

.template-actions {
  padding: 16px 20px;
  background: #fafafa;
  display: flex;
  gap: 12px;
  border-top: 1px solid #f0f0f0;
}

.action-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
  font-weight: 500;
}

.action-btn.secondary {
  background: #f4f4f5;
  color: #606266;
  border: 1px solid #dcdfe6;
}

.action-btn.secondary:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.action-btn.primary {
  background: #409eff;
  color: white;
}

.action-btn.primary:hover {
  background: #337ecc;
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
  width: 800px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
}

.modal-content.large {
  width: 1000px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
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
  padding: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  font-weight: 500;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover {
  background: #73767a;
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover {
  background: #337ecc;
}

.template-preview-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.info-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #303133;
  font-weight: 600;
}

.info-section p {
  margin: 0;
  color: #606266;
  line-height: 1.6;
}

.workflow-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 16px;
}

.step-number {
  width: 32px;
  height: 32px;
  background: #409eff;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.step-description {
  color: #909399;
  font-size: 14px;
}

.step-arrow {
  color: #c0c4cc;
  font-size: 16px;
}

.required-inputs,
.expected-outputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-item,
.output-item {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #409eff;
}

.input-name,
.output-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.input-type,
.output-type {
  font-size: 12px;
  color: #409eff;
  background: #ecf5ff;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-bottom: 8px;
}

.input-description,
.output-description {
  color: #606266;
  font-size: 14px;
  line-height: 1.4;
}
</style>
