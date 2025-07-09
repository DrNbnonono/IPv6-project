<template>
  <div class="workflow-dashboard">
    <!-- 页面头部 -->
    <div class="dashboard-header">
      <div class="header-left">
        <h1>工作流管理</h1>
        <p>创建和管理扫描工作流，实现自动化任务编排</p>
      </div>
      <div class="header-right">
        <button @click="createNewWorkflow" class="btn btn-primary">
          <i class="icon-plus"></i> 新建工作流
        </button>
        <button @click="showTemplateDialog = true" class="btn btn-secondary">
          <i class="icon-template"></i> 使用模板
        </button>
      </div>
    </div>

    <!-- 标签页导航 -->
    <div class="dashboard-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="activeTab = tab.id"
        class="tab-button"
        :class="{ active: activeTab === tab.id }"
      >
        <i :class="tab.icon"></i>
        {{ tab.label }}
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
      </button>
    </div>

    <!-- 标签页内容 -->
    <div class="dashboard-content">
      <!-- 工作流列表 -->
      <div v-if="activeTab === 'list'" class="workflow-list-section">
        <div class="section-header">
          <div class="filters">
            <select v-model="filterStatus" @change="handleFilterChange" class="filter-select">
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="active">活跃</option>
              <option value="archived">已归档</option>
            </select>
            <input 
              v-model="searchQuery" 
              @input="handleSearch"
              type="text" 
              placeholder="搜索工作流..." 
              class="search-input"
            />
          </div>
          <button @click="refreshWorkflows" class="btn btn-refresh">
            <i class="icon-refresh"></i> 刷新
          </button>
        </div>

        <div v-if="workflowStore.isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载工作流...</p>
        </div>

        <div v-else-if="workflowStore.workflows.length === 0" class="empty-state">
          <div class="empty-icon">
            <i class="icon-workflow"></i>
          </div>
          <h3>暂无工作流</h3>
          <p>创建您的第一个工作流来开始自动化扫描任务</p>
          <button @click="createNewWorkflow" class="btn btn-primary">
            <i class="icon-plus"></i> 创建工作流
          </button>
        </div>

        <div v-else class="workflow-grid">
          <div 
            v-for="workflow in filteredWorkflows" 
            :key="workflow.id"
            class="workflow-card"
            @click="openWorkflow(workflow)"
          >
            <div class="card-header">
              <div class="workflow-info">
                <h3>{{ workflow.name }}</h3>
                <p>{{ workflow.description || '无描述' }}</p>
              </div>
              <div class="workflow-status" :class="workflow.status">
                {{ getStatusText(workflow.status) }}
              </div>
            </div>
            <div class="card-body">
              <div class="workflow-stats">
                <div class="stat-item">
                  <span class="stat-label">节点数</span>
                  <span class="stat-value">{{ getNodeCount(workflow) }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">最后修改</span>
                  <span class="stat-value">{{ formatDate(workflow.updated_at) }}</span>
                </div>
              </div>
            </div>
            <div class="card-actions">
              <button @click.stop="editWorkflow(workflow)" class="action-btn">
                <i class="icon-edit"></i> 编辑
              </button>
              <button @click.stop="executeWorkflow(workflow)" class="action-btn" :disabled="workflow.status !== 'active'">
                <i class="icon-play"></i> 执行
              </button>
              <button @click.stop="viewExecutions(workflow)" class="action-btn">
                <i class="icon-history"></i> 历史
              </button>
              <button @click.stop="deleteWorkflow(workflow)" class="action-btn danger">
                <i class="icon-delete"></i> 删除
              </button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="workflowStore.pagination.pages > 1" class="pagination">
          <button 
            @click="changePage(workflowStore.pagination.page - 1)"
            :disabled="workflowStore.pagination.page <= 1"
            class="page-btn"
          >
            上一页
          </button>
          <span class="page-info">
            第 {{ workflowStore.pagination.page }} 页，共 {{ workflowStore.pagination.pages }} 页
          </span>
          <button 
            @click="changePage(workflowStore.pagination.page + 1)"
            :disabled="workflowStore.pagination.page >= workflowStore.pagination.pages"
            class="page-btn"
          >
            下一页
          </button>
        </div>
      </div>

      <!-- 工作流编辑器 -->
      <div v-if="activeTab === 'editor'" class="editor-section">
        <WorkflowEditor 
          :workflow-id="currentWorkflowId"
          @workflow-saved="handleWorkflowSaved"
          @workflow-executed="handleWorkflowExecuted"
        />
      </div>

      <!-- 执行历史 -->
      <div v-if="activeTab === 'executions'" class="executions-section">
        <WorkflowExecutions 
          :workflow-id="currentWorkflowId"
          @back-to-list="activeTab = 'list'"
        />
      </div>

      <!-- 模板库 -->
      <div v-if="activeTab === 'templates'" class="templates-section">
        <WorkflowTemplates 
          @template-selected="handleTemplateSelected"
        />
      </div>
    </div>

    <!-- 模板选择对话框 -->
    <div v-if="showTemplateDialog" class="modal-overlay" @click="showTemplateDialog = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>选择工作流模板</h3>
          <button @click="showTemplateDialog = false" class="modal-close">
            <i class="icon-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="template-grid">
            <div 
              v-for="template in workflowStore.templates" 
              :key="template.id"
              class="template-card"
              @click="selectTemplate(template)"
            >
              <div class="template-icon">
                <i class="icon-template"></i>
              </div>
              <h4>{{ template.name }}</h4>
              <p>{{ template.description }}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showTemplateDialog = false" class="btn btn-secondary">取消</button>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useRouter } from 'vue-router'
import WorkflowEditor from '@/components/workflows/WorkflowEditor.vue'
import WorkflowExecutions from '@/components/workflows/WorkflowExecutions.vue'
import WorkflowTemplates from '@/components/workflows/WorkflowTemplates.vue'

const workflowStore = useWorkflowStore()
const router = useRouter()

// 响应式数据
const activeTab = ref('list')
const filterStatus = ref('')
const searchQuery = ref('')
const currentWorkflowId = ref(null)
const showTemplateDialog = ref(false)
const showExecuteDialog = ref(false)
const selectedWorkflowForExecution = ref(null)

const executionForm = ref({
  name: '',
  description: ''
})

const tabs = [
  { id: 'list', label: '工作流列表', icon: 'icon-list' },
  { id: 'editor', label: '编辑器', icon: 'icon-edit' },
  { id: 'executions', label: '执行历史', icon: 'icon-history' },
  { id: 'templates', label: '模板库', icon: 'icon-template' }
]

// 计算属性
const filteredWorkflows = computed(() => {
  let workflows = workflowStore.workflows
  
  if (filterStatus.value) {
    workflows = workflows.filter(w => w.status === filterStatus.value)
  }
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    workflows = workflows.filter(w => 
      w.name.toLowerCase().includes(query) || 
      (w.description && w.description.toLowerCase().includes(query))
    )
  }
  
  return workflows
})

// 方法
const refreshWorkflows = async () => {
  await workflowStore.fetchWorkflows({ 
    status: filterStatus.value,
    page: 1 
  })
}

const handleFilterChange = () => {
  refreshWorkflows()
}

const handleSearch = () => {
  // 搜索是客户端过滤，不需要重新请求
}

const createNewWorkflow = () => {
  currentWorkflowId.value = null
  activeTab.value = 'editor'
}

const openWorkflow = (workflow) => {
  currentWorkflowId.value = workflow.id
  activeTab.value = 'editor'
}

const editWorkflow = (workflow) => {
  currentWorkflowId.value = workflow.id
  activeTab.value = 'editor'
}

const executeWorkflow = (workflow) => {
  selectedWorkflowForExecution.value = workflow
  executionForm.value.name = `${workflow.name}_${Date.now()}`
  executionForm.value.description = ''
  showExecuteDialog.value = true
}

const confirmExecute = async () => {
  try {
    const result = await workflowStore.executeWorkflow(
      selectedWorkflowForExecution.value.id,
      executionForm.value
    )
    
    showExecuteDialog.value = false
    
    // 跳转到执行历史页面
    currentWorkflowId.value = selectedWorkflowForExecution.value.id
    activeTab.value = 'executions'
    
    console.log('工作流执行已启动:', result)
  } catch (error) {
    console.error('执行工作流失败:', error)
  }
}

const viewExecutions = (workflow) => {
  currentWorkflowId.value = workflow.id
  activeTab.value = 'executions'
}

const deleteWorkflow = async (workflow) => {
  if (confirm(`确定要删除工作流 "${workflow.name}" 吗？此操作不可恢复。`)) {
    try {
      await workflowStore.deleteWorkflow(workflow.id)
      console.log('工作流删除成功')
    } catch (error) {
      console.error('删除工作流失败:', error)
    }
  }
}

const changePage = (page) => {
  workflowStore.fetchWorkflows({ 
    status: filterStatus.value,
    page: page 
  })
}

const handleWorkflowSaved = () => {
  console.log('工作流保存成功')
  refreshWorkflows()
}

const handleWorkflowExecuted = (result) => {
  console.log('工作流执行已启动:', result)
  activeTab.value = 'executions'
}

const handleTemplateSelected = async (template) => {
  try {
    // 使用模板创建新工作流
    const workflowData = {
      name: `${template.name}_副本_${Date.now()}`,
      description: template.description,
      definition: template.definition
    }

    const result = await workflowStore.createWorkflow(workflowData)
    currentWorkflowId.value = result.id
    activeTab.value = 'editor'
    showTemplateDialog.value = false
  } catch (error) {
    console.error('使用模板创建工作流失败:', error)
    // 显示错误信息给用户
    alert(`创建工作流失败: ${error.message || error}`)
  }
}

const selectTemplate = async (template) => {
  try {
    const workflowData = {
      name: `${template.name}_副本_${Date.now()}`,
      description: template.description,
      definition: template.definition
    }
    
    const result = await workflowStore.createWorkflow(workflowData)
    currentWorkflowId.value = result.id
    activeTab.value = 'editor'
    showTemplateDialog.value = false
  } catch (error) {
    console.error('创建工作流失败:', error)
  }
}

const getStatusText = (status) => {
  const texts = {
    draft: '草稿',
    active: '活跃',
    archived: '已归档'
  }
  return texts[status] || status
}

const getNodeCount = (workflow) => {
  try {
    const definition = typeof workflow.definition === 'string' 
      ? JSON.parse(workflow.definition) 
      : workflow.definition
    return definition?.nodes?.length || 0
  } catch {
    return 0
  }
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 生命周期
onMounted(async () => {
  await workflowStore.fetchWorkflows()
  await workflowStore.fetchTemplates()
})
</script>

<style scoped>
.workflow-dashboard {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.header-left h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  color: #303133;
  font-weight: 600;
}

.header-left p {
  margin: 0;
  color: #909399;
  font-size: 16px;
}

.header-right {
  display: flex;
  gap: 12px;
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

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover {
  background: #337ecc;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover {
  background: #73767a;
}

.btn-refresh {
  background: #f4f4f5;
  color: #606266;
  border: 1px solid #dcdfe6;
}

.btn-refresh:hover {
  background: #ecf5ff;
  color: #409eff;
  border-color: #409eff;
}

.dashboard-tabs {
  display: flex;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  padding: 0 32px;
}

.tab-button {
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
  position: relative;
}

.tab-button:hover {
  color: #409eff;
}

.tab-button.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.tab-badge {
  background: #f56c6c;
  color: white;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.dashboard-content {
  flex: 1;
  overflow: hidden;
}

.workflow-list-section {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.filters {
  display: flex;
  gap: 16px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: white;
  font-size: 14px;
  min-width: 120px;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  width: 300px;
}

.search-input:focus {
  outline: none;
  border-color: #409eff;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
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
  flex: 1;
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
  margin: 0 0 24px 0;
  color: #909399;
  font-size: 16px;
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
  flex: 1;
  overflow-y: auto;
}

.workflow-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  height: fit-content;
}

.workflow-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.card-header {
  padding: 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.workflow-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #303133;
  font-weight: 600;
}

.workflow-info p {
  margin: 0;
  color: #909399;
  font-size: 14px;
  line-height: 1.4;
}

.workflow-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.workflow-status.draft {
  background: #f4f4f5;
  color: #909399;
}

.workflow-status.active {
  background: #e1f3d8;
  color: #67c23a;
}

.workflow-status.archived {
  background: #fdf6ec;
  color: #e6a23c;
}

.card-body {
  padding: 20px;
}

.workflow-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.stat-value {
  font-size: 16px;
  color: #303133;
  font-weight: 500;
}

.card-actions {
  padding: 16px 20px;
  background: #fafafa;
  display: flex;
  gap: 8px;
  border-top: 1px solid #f0f0f0;
}

.action-btn {
  padding: 6px 12px;
  background: none;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.action-btn:hover {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.danger:hover {
  color: #f56c6c;
  border-color: #f56c6c;
  background: #fef0f0;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  padding: 20px 0;
}

.page-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #606266;
}

.page-btn:hover:not(:disabled) {
  color: #409eff;
  border-color: #409eff;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #909399;
  font-size: 14px;
}

.editor-section,
.executions-section,
.templates-section {
  height: 100%;
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
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
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
  max-height: 60vh;
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

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.template-card {
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.template-icon {
  width: 48px;
  height: 48px;
  background: #409eff;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 20px;
}

.template-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
}

.template-card p {
  margin: 0;
  font-size: 14px;
  color: #909399;
  line-height: 1.4;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #409eff;
}

.form-textarea {
  min-height: 80px;
  resize: vertical;
}
</style>
