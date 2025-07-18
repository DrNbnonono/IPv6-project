<template>
  <div class="json-extract-view">
    <div class="extract-controls">
      <div class="field-input-section">
        <h3>字段提取配置</h3>
        <div class="input-group">
          <label>提取字段路径 (每行一个):</label>
          <textarea 
            v-model="fieldPathsText"
            class="field-paths-input"
            placeholder="例如:&#10;name&#10;user.email&#10;items[0].id"
            rows="6"
          ></textarea>
        </div>
        
        <div class="options-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="useRegex">
            使用正则表达式匹配
          </label>
          <div class="regex-help" v-if="useRegex">
            <small>支持正则表达式，例如: user\..*email 匹配所有包含email的用户字段</small>
          </div>
        </div>
        
        <div class="action-buttons">
          <button 
            class="btn btn-primary" 
            @click="extractFields"
            :disabled="!fieldPathsText.trim() || isExtracting"
          >
            <i class="icon-extract"></i>
            {{ isExtracting ? '提取中...' : '提取字段' }}
          </button>
          <button class="btn btn-secondary" @click="clearResults">
            <i class="icon-clear"></i> 清空结果
          </button>
        </div>
      </div>

      <div class="quick-select-section">
        <h3>快速选择</h3>
        <div class="available-paths">
          <div class="paths-filter">
            <input 
              v-model="pathFilter" 
              type="text" 
              placeholder="搜索可用字段..."
              class="filter-input"
            >
          </div>
          <div class="paths-list">
            <div 
              v-for="path in filteredAvailablePaths" 
              :key="path"
              class="path-item"
              @click="addPath(path)"
            >
              <code class="path-code">{{ path }}</code>
              <button class="btn-add" title="添加到提取列表">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="extract-results" v-if="extractedData.length > 0">
      <div class="results-header">
        <h3>提取结果 ({{ extractedData.length }} 条)</h3>
        <div class="results-actions">
          <button class="btn btn-success" @click="showSaveDialog">
            <i class="icon-save"></i> 保存结果
          </button>
          <button class="btn btn-secondary" @click="exportToClipboard">
            <i class="icon-copy"></i> 复制到剪贴板
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in extractedData" :key="index">
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
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 保存对话框 -->
    <div v-if="showSaveModal" class="modal-overlay" @click="closeSaveDialog">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>保存提取结果</h3>
          <button class="btn-close" @click="closeSaveDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>文件名:</label>
            <input 
              v-model="saveForm.fileName" 
              type="text" 
              class="form-input"
              placeholder="extracted_fields"
            >
          </div>
          <div class="form-group">
            <label>描述:</label>
            <input 
              v-model="saveForm.description" 
              type="text" 
              class="form-input"
              placeholder="字段提取结果"
            >
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
  },
  fieldPaths: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['extract', 'save'])

// 响应式数据
const fieldPathsText = ref('')
const useRegex = ref(false)
const isExtracting = ref(false)
const extractedData = ref([])
const pathFilter = ref('')
const showSaveModal = ref(false)

const saveForm = ref({
  fileName: '',
  description: ''
})

// 计算属性
const fieldPathsArray = computed(() => {
  return fieldPathsText.value
    .split('\n')
    .map(path => path.trim())
    .filter(path => path.length > 0)
})

const filteredAvailablePaths = computed(() => {
  if (!pathFilter.value) return props.fieldPaths.slice(0, 50) // 限制显示数量
  
  const filter = pathFilter.value.toLowerCase()
  return props.fieldPaths
    .filter(path => path.toLowerCase().includes(filter))
    .slice(0, 50)
})

// 方法
const addPath = (path) => {
  const currentPaths = fieldPathsText.value.split('\n').map(p => p.trim()).filter(p => p)
  if (!currentPaths.includes(path)) {
    if (fieldPathsText.value) {
      fieldPathsText.value += '\n' + path
    } else {
      fieldPathsText.value = path
    }
  }
}

const extractFields = async () => {
  if (fieldPathsArray.value.length === 0) {
    ElMessage.warning('请输入要提取的字段路径')
    return
  }

  try {
    isExtracting.value = true
    
    const response = await api.jsonanalysis.extractFields({
      jsonData: props.data,
      fieldPaths: fieldPathsArray.value,
      useRegex: useRegex.value
    })
    
    if (response.data.success) {
      extractedData.value = response.data.data
      emit('extract', response.data.data)
      ElMessage.success(`成功提取 ${response.data.data.length} 个字段`)
    }
  } catch (error) {
    ElMessage.error('字段提取失败: ' + error.message)
  } finally {
    isExtracting.value = false
  }
}

const clearResults = () => {
  extractedData.value = []
  fieldPathsText.value = ''
}

const formatValue = (value) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const showSaveDialog = () => {
  saveForm.value = {
    fileName: 'extracted_fields',
    description: '字段提取结果'
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
  
  emit('save', extractedData.value, saveForm.value.fileName, saveForm.value.description)
  closeSaveDialog()
}

const exportToClipboard = async () => {
  try {
    const jsonString = JSON.stringify(extractedData.value, null, 2)
    await navigator.clipboard.writeText(jsonString)
    ElMessage.success('结果已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped lang="scss">
.json-extract-view {
  .extract-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
    
    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }
  
  .field-input-section,
  .quick-select-section {
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    
    h3 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
  }
  
  .input-group {
    margin-bottom: 1rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #4a5568;
    }
    
    .field-paths-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      resize: vertical;
      
      &:focus {
        outline: none;
        border-color: #4299e1;
        box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
      }
    }
  }
  
  .options-group {
    margin-bottom: 1rem;
    
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      
      input[type="checkbox"] {
        margin: 0;
      }
    }
    
    .regex-help {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #e0f2fe;
      border-radius: 4px;
      
      small {
        color: #0369a1;
      }
    }
  }
  
  .action-buttons {
    display: flex;
    gap: 1rem;
  }
  
  .available-paths {
    .paths-filter {
      margin-bottom: 1rem;
      
      .filter-input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.9rem;
        
        &:focus {
          outline: none;
          border-color: #4299e1;
        }
      }
    }
    
    .paths-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: white;
      
      .path-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #f1f5f9;
        cursor: pointer;
        transition: background-color 0.2s ease;
        
        &:hover {
          background-color: #f8fafc;
        }
        
        &:last-child {
          border-bottom: none;
        }
        
        .path-code {
          font-family: 'Courier New', monospace;
          font-size: 0.85rem;
          color: #2563eb;
          background: #f1f5f9;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
        }
        
        .btn-add {
          background: #4299e1;
          color: white;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-weight: bold;
          
          &:hover {
            background: #3182ce;
          }
        }
      }
    }
  }
  
  .extract-results {
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
          max-width: 300px;
          
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
        }
      }
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
}

// 图标
.icon-extract:before { content: "📤"; }
.icon-clear:before { content: "🧹"; }
.icon-save:before { content: "💾"; }
.icon-copy:before { content: "📋"; }
</style>
