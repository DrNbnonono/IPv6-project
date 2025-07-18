<template>
  <div class="json-filter-extract-view">
    <div class="analysis-header">
      <h3><i class="icon-filter"></i> 数据过滤与字段提取</h3>
      <p class="description">先设置过滤条件筛选数据，然后选择要提取的字段</p>
    </div>

    <!-- 第一步：数据过滤 -->
    <div class="filter-section">
      <div class="filter-controls">
        <h4>第一步：设置过滤条件</h4>
        <div class="filter-grid">
          <div class="filter-item">
            <label>搜索关键词:</label>
            <input
              v-model="filterCriteria.searchQuery"
              type="text"
              class="form-input"
              placeholder="搜索键名或值..."
            >
          </div>

          <div class="filter-item">
            <label>数据类型:</label>
            <select v-model="filterCriteria.dataType" class="form-select">
              <option value="">所有类型</option>
              <option value="string">字符串</option>
              <option value="number">数字</option>
              <option value="boolean">布尔值</option>
              <option value="object">对象</option>
              <option value="array">数组</option>
              <option value="null">空值</option>
            </select>
          </div>

          <div class="filter-item" v-if="filterCriteria.dataType === 'number'">
            <label>数值范围:</label>
            <div class="range-inputs">
              <input
                type="number"
                v-model.number="filterCriteria.numberMin"
                placeholder="最小值"
              >
              <span>-</span>
              <input
                type="number"
                v-model.number="filterCriteria.numberMax"
                placeholder="最大值"
              >
            </div>
          </div>

          <div class="filter-item">
            <label>字段路径过滤:</label>
            <input
              v-model="filterCriteria.fieldPath"
              type="text"
              class="form-input"
              placeholder="例如: user.name 或 [0].id"
            >
          </div>

          <div class="filter-item">
            <label>字段值匹配:</label>
            <input
              v-model="filterCriteria.fieldValue"
              type="text"
              class="form-input"
              placeholder="字段值必须等于..."
            >
          </div>

          <div class="filter-item">
            <label>
              <input type="checkbox" v-model="filterCriteria.useRegex">
              使用正则表达式
            </label>
          </div>
        </div>

        <div class="filter-actions">
          <button
            class="btn btn-primary"
            @click="applyFilters"
            :disabled="isLoading"
          >
            <i class="icon-filter"></i>
            {{ isSearching ? '搜索中...' : '搜索' }}
          </button>
          <button class="btn btn-secondary" @click="clearSearch">
            <i class="icon-clear"></i> 清空
          </button>
        </div>
      </div>
      
      <div class="search-stats" v-if="searchResults.length > 0">
        <div class="stats-card">
          <h4>搜索统计</h4>
          <div class="stats-list">
            <div class="stat-item">
              <span class="stat-label">匹配结果:</span>
              <span class="stat-value">{{ searchResults.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">类型分布:</span>
              <div class="type-distribution">
                <span 
                  v-for="(count, type) in typeDistribution" 
                  :key="type"
                  class="type-count"
                  :class="`type-${type}`"
                >
                  {{ type }}: {{ count }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="search-results" v-if="searchResults.length > 0">
      <div class="results-header">
        <h3>搜索结果 ({{ searchResults.length }} 条)</h3>
        <div class="results-actions">
          <button class="btn btn-success" @click="showSaveDialog">
            <i class="icon-save"></i> 保存过滤结果
          </button>
          <button class="btn btn-secondary" @click="exportResults">
            <i class="icon-export"></i> 导出结果
          </button>
        </div>
      </div>

      <div class="results-table">
        <table>
          <thead>
            <tr>
              <th>路径</th>
              <th>键名</th>
              <th>值</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in paginatedResults" :key="index">
              <td>
                <code class="path-code">{{ item.path }}</code>
              </td>
              <td class="key-cell">{{ item.key }}</td>
              <td class="value-cell">
                <span class="value-content" :class="`value-${item.type}`">
                  {{ formatValue(item.value) }}
                </span>
              </td>
              <td>
                <span class="type-badge" :class="`type-${item.type}`">
                  {{ item.type }}
                </span>
              </td>
              <td class="actions-cell">
                <button 
                  class="btn btn-sm btn-info" 
                  @click="copyPath(item.path)"
                  title="复制路径"
                >
                  <i class="icon-copy"></i>
                </button>
                <button 
                  class="btn btn-sm btn-secondary" 
                  @click="copyValue(item.value)"
                  title="复制值"
                >
                  <i class="icon-copy-value"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination" v-if="totalPages > 1">
        <button 
          class="btn btn-pagination"
          @click="currentPage = Math.max(1, currentPage - 1)"
          :disabled="currentPage <= 1"
        >
          上一页
        </button>
        <span class="page-info">
          第 {{ currentPage }} 页 / 共 {{ totalPages }} 页
        </span>
        <button 
          class="btn btn-pagination"
          @click="currentPage = Math.min(totalPages, currentPage + 1)"
          :disabled="currentPage >= totalPages"
        >
          下一页
        </button>
      </div>
    </div>

    <div class="empty-state" v-else-if="hasSearched">
      <i class="icon-empty"></i>
      <h3>未找到匹配结果</h3>
      <p>请尝试调整搜索条件</p>
    </div>

    <!-- 保存对话框 -->
    <div v-if="showSaveModal" class="modal-overlay" @click="closeSaveDialog">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>保存过滤结果</h3>
          <button class="btn-close" @click="closeSaveDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>文件名:</label>
            <input 
              v-model="saveForm.fileName" 
              type="text" 
              class="form-input"
              placeholder="filtered_data"
            >
          </div>
          <div class="form-group">
            <label>描述:</label>
            <input 
              v-model="saveForm.description" 
              type="text" 
              class="form-input"
              placeholder="搜索过滤结果"
            >
          </div>
          <div class="form-group">
            <label>保存格式:</label>
            <select v-model="saveForm.format" class="form-select">
              <option value="results">搜索结果列表</option>
              <option value="values">仅保存值</option>
              <option value="structured">重构为新JSON</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="saveResults">
            <i class="icon-save"></i> 保存
          </button>
          <button class="btn btn-secondary" @click="closeSaveDialog">
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const props = defineProps({
  data: {
    type: [Object, Array],
    required: true
  }
})

const emit = defineEmits(['search', 'save'])

// 响应式数据
const searchForm = ref({
  query: '',
  filterType: '',
  filterValue: ''
})

const isSearching = ref(false)
const searchResults = ref([])
const hasSearched = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const showSaveModal = ref(false)

const saveForm = ref({
  fileName: '',
  description: '',
  format: 'results'
})

// 计算属性
const typeDistribution = computed(() => {
  const distribution = {}
  searchResults.value.forEach(item => {
    distribution[item.type] = (distribution[item.type] || 0) + 1
  })
  return distribution
})

const totalPages = computed(() => {
  return Math.ceil(searchResults.value.length / pageSize.value)
})

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return searchResults.value.slice(start, end)
})

// 方法
const performSearch = async () => {
  try {
    isSearching.value = true
    hasSearched.value = true
    
    const response = await api.jsonanalysis.searchFilter({
      jsonData: props.data,
      searchQuery: searchForm.value.query,
      filterType: searchForm.value.filterType,
      filterValue: searchForm.value.filterValue
    })
    
    if (response.data.success) {
      searchResults.value = response.data.data
      currentPage.value = 1
      emit('search', response.data.data)
      ElMessage.success(`找到 ${response.data.data.length} 个匹配结果`)
    }
  } catch (error) {
    ElMessage.error('搜索失败: ' + error.message)
  } finally {
    isSearching.value = false
  }
}

const clearSearch = () => {
  searchForm.value = {
    query: '',
    filterType: '',
    filterValue: ''
  }
  searchResults.value = []
  hasSearched.value = false
  currentPage.value = 1
}

const formatValue = (value) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const copyPath = async (path) => {
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success('路径已复制')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}

const copyValue = async (value) => {
  try {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    await navigator.clipboard.writeText(text)
    ElMessage.success('值已复制')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}

const showSaveDialog = () => {
  saveForm.value = {
    fileName: 'filtered_data',
    description: '搜索过滤结果',
    format: 'results'
  }
  showSaveModal.value = true
}

const closeSaveDialog = () => {
  showSaveModal.value = false
}

const saveResults = () => {
  if (!saveForm.value.fileName.trim()) {
    ElMessage.warning('请输入文件名')
    return
  }
  
  let dataToSave
  
  switch (saveForm.value.format) {
    case 'values':
      dataToSave = searchResults.value.map(item => item.value)
      break
    case 'structured':
      dataToSave = {}
      searchResults.value.forEach(item => {
        dataToSave[item.path] = item.value
      })
      break
    default:
      dataToSave = searchResults.value
  }
  
  emit('save', dataToSave, saveForm.value.fileName, saveForm.value.description)
  closeSaveDialog()
}

const exportResults = async () => {
  try {
    const jsonString = JSON.stringify(searchResults.value, null, 2)
    await navigator.clipboard.writeText(jsonString)
    ElMessage.success('结果已复制到剪贴板')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}
</script>

<style scoped lang="scss">
.json-search-view {
  .search-controls {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
    
    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }
  
  .search-form {
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    
    h3 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
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
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #4a5568;
      }
      
      .form-input,
      .form-select {
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
    
    .action-buttons {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }
  }
  
  .search-stats {
    .stats-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      
      h4 {
        margin: 0 0 1rem;
        color: #2c3e50;
      }
      
      .stats-list {
        .stat-item {
          margin-bottom: 1rem;
          
          &:last-child {
            margin-bottom: 0;
          }
          
          .stat-label {
            display: block;
            color: #64748b;
            font-size: 0.9rem;
            margin-bottom: 0.25rem;
          }
          
          .stat-value {
            font-weight: 600;
            color: #2c3e50;
            font-size: 1.2rem;
          }
          
          .type-distribution {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            
            .type-count {
              font-size: 0.8rem;
              padding: 0.2rem 0.4rem;
              border-radius: 3px;
              font-weight: 500;
              
              &.type-string { background: #dcfce7; color: #166534; }
              &.type-number { background: #fee2e2; color: #991b1b; }
              &.type-boolean { background: #f3e8ff; color: #6b21a8; }
              &.type-object { background: #dbeafe; color: #1e40af; }
              &.type-array { background: #fed7aa; color: #c2410c; }
              &.type-null { background: #f3f4f6; color: #6b7280; }
            }
          }
        }
      }
    }
  }
  
  .search-results {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    
    .results-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      
      h3 {
        margin: 0;
        color: #2c3e50;
      }
      
      .results-actions {
        display: flex;
        gap: 1rem;
      }
    }
    
    .results-table {
      overflow-x: auto;
      
      table {
        width: 100%;
        border-collapse: collapse;
        
        th,
        td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #f1f5f9;
        }
        
        th {
          background: #f8fafc;
          font-weight: 500;
          color: #4a5568;
        }
        
        tr:hover {
          background-color: #f8fafc;
        }
        
        .path-code {
          font-family: 'Courier New', monospace;
          font-size: 0.85rem;
          color: #2563eb;
          background: #f1f5f9;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
        }
        
        .key-cell {
          font-weight: 500;
          color: #2c3e50;
        }
        
        .value-cell {
          max-width: 200px;
          
          .value-content {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            
            &.value-string { color: #059669; }
            &.value-number { color: #dc2626; }
            &.value-boolean { color: #7c3aed; }
            &.value-object { color: #4338ca; font-family: monospace; }
          }
        }
        
        .type-badge {
          font-size: 0.8rem;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-weight: 500;
          
          &.type-string { background: #dcfce7; color: #166534; }
          &.type-number { background: #fee2e2; color: #991b1b; }
          &.type-boolean { background: #f3e8ff; color: #6b21a8; }
          &.type-object { background: #dbeafe; color: #1e40af; }
          &.type-array { background: #fed7aa; color: #c2410c; }
          &.type-null { background: #f3f4f6; color: #6b7280; }
        }
        
        .actions-cell {
          .btn {
            margin-right: 0.5rem;
            
            &:last-child {
              margin-right: 0;
            }
          }
        }
      }
    }
    
    .pagination {
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      border-top: 1px solid #e2e8f0;
      
      .page-info {
        color: #64748b;
        font-size: 0.9rem;
      }
      
      .btn-pagination {
        padding: 0.5rem 1rem;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        cursor: pointer;
        
        &:hover:not(:disabled) {
          background: #e2e8f0;
        }
        
        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
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
    
    h3 {
      margin: 0 0 0.5rem;
      color: #4a5568;
    }
    
    p {
      margin: 0;
    }
  }
}

// 模态框样式 (复用之前的样式)
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
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
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
  }
  
  .btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    
    &:hover {
      color: #374151;
    }
  }
}

.modal-body {
  padding: 1.5rem;
  
  .form-group {
    margin-bottom: 1rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #4a5568;
    }
    
    .form-input,
    .form-select {
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
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
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
}

// 图标
.icon-search:before { content: "🔍"; }
.icon-clear:before { content: "🧹"; }
.icon-save:before { content: "💾"; }
.icon-export:before { content: "📤"; }
.icon-copy:before { content: "📋"; }
.icon-copy-value:before { content: "📄"; }
.icon-empty:before { content: "📭"; }
</style>
