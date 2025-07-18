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
            {{ isLoading ? '过滤中...' : '应用过滤' }}
          </button>
          
          <button 
            class="btn btn-secondary" 
            @click="resetFilters"
          >
            <i class="icon-reset"></i>
            重置条件
          </button>
        </div>
      </div>
    </div>

    <!-- 过滤结果统计 -->
    <div class="results-section" v-if="filterResults">
      <div class="summary-cards">
        <div class="summary-card">
          <div class="card-icon">📊</div>
          <div class="card-content">
            <h4>原始记录</h4>
            <span class="card-value">{{ filterResults.summary.total }}</span>
          </div>
        </div>
        <div class="summary-card success">
          <div class="card-icon">✅</div>
          <div class="card-content">
            <h4>匹配记录</h4>
            <span class="card-value">{{ filterResults.summary.matched }}</span>
          </div>
        </div>
        <div class="summary-card">
          <div class="card-icon">🔍</div>
          <div class="card-content">
            <h4>匹配率</h4>
            <span class="card-value">{{ filterResults.summary.matchRate }}%</span>
          </div>
        </div>
      </div>

      <!-- 第二步：字段提取 -->
      <div class="extraction-section" v-if="filterResults.filteredData.length > 0">
        <h4>第二步：选择要提取的字段</h4>
        <div class="extraction-controls">
          <div class="field-selection">
            <label>可用字段路径:</label>
            <div class="field-checkboxes">
              <label v-for="field in availableFields" :key="field">
                <input type="checkbox" v-model="selectedFields" :value="field">
                {{ field }}
              </label>
            </div>
            <div class="custom-field">
              <label>自定义字段路径:</label>
              <div class="custom-field-input">
                <input 
                  type="text" 
                  v-model="customFieldPath" 
                  placeholder="例如: user.email 或 [0].name"
                >
                <button class="btn btn-sm btn-secondary" @click="addCustomField">
                  <i class="icon-add"></i> 添加
                </button>
              </div>
            </div>
          </div>
          <button 
            class="btn btn-success" 
            @click="extractFields" 
            :disabled="selectedFields.length === 0"
          >
            <i class="icon-extract"></i> 提取选中字段
          </button>
        </div>
      </div>

      <!-- 提取结果展示 -->
      <div class="extracted-data-section" v-if="extractedData">
        <h4>提取的数据 ({{ extractedData.length }}条)</h4>
        <div class="data-preview">
          <div class="preview-table">
            <table>
              <thead>
                <tr>
                  <th v-for="field in selectedFields" :key="field">{{ field }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in paginatedExtractedData" :key="index">
                  <td v-for="field in selectedFields" :key="field">
                    <span class="field-value">{{ getFieldValue(item, field) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pagination" v-if="extractedTotalPages > 1">
            <button 
              class="btn btn-sm" 
              @click="extractedCurrentPage--" 
              :disabled="extractedCurrentPage <= 1"
            >
              上一页
            </button>
            <span class="page-info">
              第 {{ extractedCurrentPage }} 页，共 {{ extractedTotalPages }} 页
            </span>
            <button 
              class="btn btn-sm" 
              @click="extractedCurrentPage++" 
              :disabled="extractedCurrentPage >= extractedTotalPages"
            >
              下一页
            </button>
          </div>
        </div>
        <div class="data-actions">
          <button class="btn btn-success" @click="copyExtractedData">
            <i class="icon-copy"></i> 复制数据
          </button>
          <button class="btn btn-primary" @click="saveExtractedData">
            <i class="icon-save"></i> 保存为文件
          </button>
        </div>
      </div>

      <!-- 保存完整过滤结果 -->
      <div class="save-section">
        <h4>保存过滤结果</h4>
        <div class="save-options">
          <button class="btn btn-primary" @click="saveFilterResults">
            <i class="icon-save"></i> 保存过滤后的完整数据
          </button>
        </div>
      </div>
    </div>

    <!-- 无结果提示 -->
    <div class="no-results" v-if="filterResults && filterResults.filteredData.length === 0">
      <div class="no-results-content">
        <i class="icon-empty"></i>
        <h4>未找到匹配的数据</h4>
        <p>请尝试调整过滤条件</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const props = defineProps({
  sessionId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['filter', 'save'])

// 响应式数据
const isLoading = ref(false)
const filterResults = ref(null)
const extractedData = ref(null)
const extractedCurrentPage = ref(1)
const pageSize = ref(20)
const selectedFields = ref([])
const customFieldPath = ref('')
const availableFields = ref([])

const filterCriteria = ref({
  searchQuery: '',
  dataType: '',
  numberMin: null,
  numberMax: null,
  fieldPath: '',
  fieldValue: '',
  useRegex: false
})

// 计算属性
const paginatedExtractedData = computed(() => {
  if (!extractedData.value) return []
  const start = (extractedCurrentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return extractedData.value.slice(start, end)
})

const extractedTotalPages = computed(() => {
  if (!extractedData.value) return 0
  return Math.ceil(extractedData.value.length / pageSize.value)
})

// 方法
const applyFilters = async () => {
  try {
    isLoading.value = true
    
    const response = await api.jsonanalysis.filterFromSession({
      sessionId: props.sessionId,
      filterCriteria: filterCriteria.value
    })

    if (response.success) {
      filterResults.value = response.data
      extractedData.value = null // 重置提取数据
      selectedFields.value = [] // 重置选中字段
      
      // 自动分析可用字段
      analyzeAvailableFields()
      
      ElMessage.success(`过滤完成，匹配 ${response.data.summary.matched} 条记录`)
      emit('filter', response.data)
    }
  } catch (error) {
    ElMessage.error('过滤失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const resetFilters = () => {
  filterCriteria.value = {
    searchQuery: '',
    dataType: '',
    numberMin: null,
    numberMax: null,
    fieldPath: '',
    fieldValue: '',
    useRegex: false
  }
  filterResults.value = null
  extractedData.value = null
  selectedFields.value = []
}

const analyzeAvailableFields = () => {
  if (!filterResults.value?.filteredData?.length) return
  
  const fields = new Set()
  
  // 分析前几条记录的字段结构
  const sampleData = filterResults.value.filteredData.slice(0, 10)
  
  sampleData.forEach(item => {
    extractFieldPaths(item, '', fields)
  })
  
  availableFields.value = Array.from(fields).sort()
}

const extractFieldPaths = (obj, prefix, fields) => {
  if (obj === null || obj === undefined) return
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const path = prefix ? `${prefix}[${index}]` : `[${index}]`
      fields.add(path)
      if (typeof item === 'object' && item !== null) {
        extractFieldPaths(item, path, fields)
      }
    })
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const path = prefix ? `${prefix}.${key}` : key
      fields.add(path)
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        extractFieldPaths(obj[key], path, fields)
      }
    })
  }
}

const addCustomField = () => {
  if (customFieldPath.value && !selectedFields.value.includes(customFieldPath.value)) {
    selectedFields.value.push(customFieldPath.value)
    customFieldPath.value = ''
  }
}

const extractFields = () => {
  if (!filterResults.value || selectedFields.value.length === 0) return
  
  extractedData.value = filterResults.value.filteredData.map(item => {
    const extracted = {}
    selectedFields.value.forEach(field => {
      extracted[field] = getFieldValue(item, field)
    })
    return extracted
  })
  
  extractedCurrentPage.value = 1
  ElMessage.success(`已提取 ${extractedData.value.length} 条记录的 ${selectedFields.value.length} 个字段`)
}

const getFieldValue = (obj, path) => {
  try {
    return path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
      return current?.[key]
    }, obj)
  } catch {
    return '-'
  }
}

const copyExtractedData = async () => {
  if (!extractedData.value) return
  
  try {
    // 转换为CSV格式
    const headers = selectedFields.value.join(',')
    const rows = extractedData.value.map(item => 
      selectedFields.value.map(field => {
        const value = item[field]
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value || ''
      }).join(',')
    )
    const csvContent = [headers, ...rows].join('\n')
    
    await navigator.clipboard.writeText(csvContent)
    ElMessage.success('已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}

const saveExtractedData = () => {
  if (!extractedData.value) return
  
  const fileName = `filtered_extracted_${selectedFields.value.join('_')}`
  const description = `过滤后提取字段: ${selectedFields.value.join(', ')}`
  
  emit('save', extractedData.value, fileName, description)
}

const saveFilterResults = () => {
  if (!filterResults.value) return
  
  const fileName = 'filtered_complete_data'
  const description = '过滤后的完整数据'
  
  emit('save', filterResults.value.filteredData, fileName, description)
}
</script>

<style scoped lang="scss">
// 复用XMap分析组件的样式，调整颜色主题
.json-filter-extract-view {
  .analysis-header {
    margin-bottom: 2rem;
    
    h3 {
      margin: 0 0 0.5rem;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .description {
      margin: 0;
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }
  
  .filter-section {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
    .filter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .filter-item {
      label {
        display: block;
        margin-bottom: 0.25rem;
        font-weight: 500;
        color: #4a5568;
      }
      
      .form-input, .form-select {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        
        &:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }
      }
      
      input[type="checkbox"] {
        width: auto;
        margin-right: 0.5rem;
      }
      
      .range-inputs {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        
        input {
          flex: 1;
        }
        
        span {
          color: #7f8c8d;
        }
      }
    }
    
    .filter-actions {
      display: flex;
      gap: 1rem;
    }
  }
  
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .summary-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 1rem;
    
    &.success {
      border-left: 4px solid #667eea;
    }
    
    .card-icon {
      font-size: 2rem;
    }
    
    .card-content {
      h4 {
        margin: 0 0 0.25rem;
        font-size: 0.9rem;
        color: #7f8c8d;
      }
      
      .card-value {
        font-size: 1.5rem;
        font-weight: bold;
        color: #2c3e50;
      }
    }
  }
  
  .extraction-section, .extracted-data-section, .save-section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
  }
  
  .extraction-controls {
    .field-selection {
      margin-bottom: 1rem;
      
      > label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #4a5568;
      }
      
      .field-checkboxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.5rem;
        margin-bottom: 1rem;
        
        label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: normal;
          margin-bottom: 0;
          
          input {
            margin: 0;
          }
        }
      }
      
      .custom-field {
        margin-top: 1rem;
        
        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #4a5568;
        }
        
        .custom-field-input {
          display: flex;
          gap: 0.5rem;
          
          input {
            flex: 1;
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
          }
        }
      }
    }
  }
  
  .data-preview {
    margin-bottom: 1rem;
    
    .preview-table {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      
      table {
        width: 100%;
        border-collapse: collapse;
        
        th, td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.85rem;
        }
        
        th {
          background: #f8fafc;
          font-weight: 600;
          color: #4a5568;
        }
        
        .field-value {
          font-family: 'Courier New', monospace;
          font-size: 0.8rem;
        }
      }
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
      
      .page-info {
        color: #7f8c8d;
        font-size: 0.9rem;
      }
    }
  }
  
  .data-actions, .save-options {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  
  .no-results {
    text-align: center;
    padding: 3rem;
    color: #7f8c8d;
    
    .no-results-content {
      i {
        font-size: 3rem;
        margin-bottom: 1rem;
        display: block;
      }
      
      h4 {
        margin: 0 0 0.5rem;
        color: #4a5568;
      }
      
      p {
        margin: 0;
      }
    }
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
    background-color: #667eea;
    color: white;

    &:hover:not(:disabled) {
      background-color: #5a67d8;
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

  &.btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }
}

// 图标
.icon-filter:before { content: "🔍"; }
.icon-reset:before { content: "🔄"; }
.icon-extract:before { content: "📤"; }
.icon-copy:before { content: "📋"; }
.icon-save:before { content: "💾"; }
.icon-add:before { content: "➕"; }
.icon-empty:before { content: "📭"; }
</style>
