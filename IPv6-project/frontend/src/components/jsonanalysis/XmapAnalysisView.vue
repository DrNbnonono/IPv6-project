<template>
  <div class="xmap-analysis">
    <div class="analysis-header">
      <h3><i class="icon-xmap"></i> XMap扫描结果分析</h3>
      <p class="description">专门针对XMap扫描结果的分析工具，可以快速过滤和提取IPv6地址及相关信息</p>
    </div>

    <div class="filter-section">
      <div class="filter-controls">
        <h4>过滤条件</h4>
        <div class="filter-grid">
          <div class="filter-item">
            <label>
              <input type="checkbox" v-model="filterCriteria.onlySuccessful">
              只显示成功响应 (success=1)
            </label>
          </div>
          <div class="filter-item">
            <label>响应类型:</label>
            <select v-model="filterCriteria.responseClass">
              <option value="">全部类型</option>
              <option value="echoreply">Echo Reply</option>
              <option value="unreach">Unreachable</option>
              <option value="timxceed">Time Exceeded</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="filter-item">
            <label>TTL范围:</label>
            <div class="range-inputs">
              <input type="number" v-model.number="filterCriteria.hlimMin" placeholder="最小" min="1" max="255">
              <span>-</span>
              <input type="number" v-model.number="filterCriteria.hlimMax" placeholder="最大" min="1" max="255">
            </div>
          </div>
          <div class="filter-item">
            <label>
              <input type="checkbox" v-model="filterCriteria.excludeRepeats">
              排除重复响应
            </label>
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" @click="extractResults" :disabled="isLoading">
            <i class="icon-extract"></i>
            {{ isLoading ? '分析中...' : '开始分析' }}
          </button>
          <button class="btn btn-secondary" @click="resetFilters">
            <i class="icon-reset"></i> 重置条件
          </button>
        </div>
      </div>
    </div>

    <div class="results-section" v-if="analysisResults">
      <div class="summary-cards">
        <div class="summary-card">
          <div class="card-icon">📊</div>
          <div class="card-content">
            <h4>总记录数</h4>
            <span class="card-value">{{ analysisResults.summary.total }}</span>
          </div>
        </div>
        <div class="summary-card success">
          <div class="card-icon">✅</div>
          <div class="card-content">
            <h4>成功响应</h4>
            <span class="card-value">{{ analysisResults.summary.successful }}</span>
          </div>
        </div>
        <div class="summary-card failed">
          <div class="card-icon">❌</div>
          <div class="card-content">
            <h4>失败响应</h4>
            <span class="card-value">{{ analysisResults.summary.failed }}</span>
          </div>
        </div>
        <div class="summary-card">
          <div class="card-icon">🌐</div>
          <div class="card-content">
            <h4>唯一地址</h4>
            <span class="card-value">{{ analysisResults.summary.uniqueAddresses }}</span>
          </div>
        </div>
      </div>

      <div class="response-distribution">
        <h4>响应类型分布</h4>
        <div class="response-list">
          <div 
            v-for="(count, type) in analysisResults.summary.responseTypes" 
            :key="type"
            class="response-item"
          >
            <span class="response-name">{{ type.toUpperCase() }}</span>
            <span class="response-count">{{ count }}</span>
            <div class="response-bar">
              <div 
                class="response-fill" 
                :style="{ width: (count / analysisResults.summary.total * 100) + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="extraction-section">
        <h4>字段提取</h4>
        <div class="extraction-controls">
          <div class="field-selection">
            <label>选择要提取的字段:</label>
            <div class="field-checkboxes">
              <label v-for="field in availableFields" :key="field">
                <input type="checkbox" v-model="selectedFields" :value="field">
                {{ field }}
              </label>
            </div>
          </div>
          <button class="btn btn-success" @click="extractFields" :disabled="selectedFields.length === 0">
            <i class="icon-extract"></i> 提取选中字段
          </button>
        </div>
      </div>

      <div class="address-lists" v-if="extractedData">
        <div class="address-section">
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
                    <td v-for="field in selectedFields" :key="field">{{ item[field] || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="pagination" v-if="totalPages > 1">
              <button 
                class="btn btn-sm" 
                @click="currentPage--" 
                :disabled="currentPage <= 1"
              >
                上一页
              </button>
              <span class="page-info">
                第 {{ currentPage }} 页，共 {{ totalPages }} 页
              </span>
              <button 
                class="btn btn-sm" 
                @click="currentPage++" 
                :disabled="currentPage >= totalPages"
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
      </div>

      <div class="save-section">
        <h4>保存分析结果</h4>
        <div class="save-options">
          <button class="btn btn-primary" @click="saveResults('complete_analysis')">
            <i class="icon-save"></i> 保存完整分析结果
          </button>
          <button class="btn btn-success" @click="saveResults('successful_only')" v-if="analysisResults.successfulResults.length > 0">
            <i class="icon-save"></i> 保存成功响应
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
  sessionId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['extract', 'save'])

// 响应式数据
const isLoading = ref(false)
const analysisResults = ref(null)
const extractedData = ref(null)
const currentPage = ref(1)
const pageSize = ref(20)
const selectedFields = ref(['outersaddr', 'saddr', 'success', 'clas'])

const filterCriteria = ref({
  onlySuccessful: true,
  responseClass: '',
  hlimMin: null,
  hlimMax: null,
  excludeRepeats: false
})

const availableFields = ref([
  'saddr', 'daddr', 'outersaddr', 'hlim', 'success', 'clas', 'desc', 
  'type', 'code', 'icmp_id', 'seq', 'data', 'repeat', 'cooldown', 
  'timestamp_str', 'timestamp_ts', 'timestamp_us'
])

// 计算属性
const paginatedExtractedData = computed(() => {
  if (!extractedData.value) return []
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return extractedData.value.slice(start, end)
})

const totalPages = computed(() => {
  if (!extractedData.value) return 0
  return Math.ceil(extractedData.value.length / pageSize.value)
})

// 方法
const extractResults = async () => {
  try {
    isLoading.value = true
    
    const response = await api.jsonanalysis.extractXmapResults({
      sessionId: props.sessionId,
      filterCriteria: filterCriteria.value
    })

    if (response.success) {
      analysisResults.value = response.data
      currentPage.value = 1
      extractedData.value = null // 重置提取数据
      ElMessage.success('分析完成')
      emit('extract', response.data)
    }
  } catch (error) {
    ElMessage.error('分析失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const resetFilters = () => {
  filterCriteria.value = {
    onlySuccessful: true,
    responseClass: '',
    hlimMin: null,
    hlimMax: null,
    excludeRepeats: false
  }
}

const extractFields = () => {
  if (!analysisResults.value || selectedFields.value.length === 0) return
  
  const filtered = analysisResults.value.filteredResults || []
  extractedData.value = filtered.map(item => {
    const extracted = {}
    selectedFields.value.forEach(field => {
      extracted[field] = item[field]
    })
    return extracted
  })
  
  currentPage.value = 1
  ElMessage.success(`已提取 ${extractedData.value.length} 条记录的 ${selectedFields.value.length} 个字段`)
}

const copyExtractedData = async () => {
  if (!extractedData.value) return
  
  try {
    // 转换为CSV格式
    const headers = selectedFields.value.join(',')
    const rows = extractedData.value.map(item => 
      selectedFields.value.map(field => item[field] || '').join(',')
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
  
  const fileName = `xmap_extracted_${selectedFields.value.join('_')}`
  const description = `XMap扫描结果提取字段: ${selectedFields.value.join(', ')}`
  
  emit('save', extractedData.value, fileName, description)
}

const saveResults = (type) => {
  if (!analysisResults.value) return

  let data, fileName, description

  switch (type) {
    case 'successful_only':
      data = analysisResults.value.successfulResults
      fileName = 'xmap_successful_results'
      description = 'XMap扫描成功响应结果'
      break
    case 'complete_analysis':
      data = analysisResults.value
      fileName = 'xmap_complete_analysis'
      description = 'XMap扫描结果完整分析'
      break
  }

  emit('save', data, fileName, description)
}
</script>

<style scoped lang="scss">
// 复用Zgrab2AnalysisView的样式，只修改颜色主题
.xmap-analysis {
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
      
      input, select {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        
        &:focus {
          outline: none;
          border-color: #42b983;
          box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.2);
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
      border-left: 4px solid #42b983;
    }
    
    &.failed {
      border-left: 4px solid #f56565;
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
  
  .response-distribution, .extraction-section, .address-lists, .save-section {
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
  
  .response-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
    
    .response-name {
      min-width: 100px;
      font-weight: 500;
    }
    
    .response-count {
      min-width: 40px;
      text-align: right;
      color: #7f8c8d;
    }
    
    .response-bar {
      flex: 1;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      
      .response-fill {
        height: 100%;
        background: #42b983;
        transition: width 0.3s ease;
      }
    }
  }
  
  .extraction-controls {
    .field-selection {
      margin-bottom: 1rem;
      
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #4a5568;
      }
      
      .field-checkboxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.5rem;
        
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
        
        td {
          font-family: 'Courier New', monospace;
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
    background-color: #42b983;
    color: white;

    &:hover:not(:disabled) {
      background-color: #369870;
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
.icon-xmap:before { content: "📡"; }
.icon-extract:before { content: "📤"; }
.icon-reset:before { content: "🔄"; }
.icon-copy:before { content: "📋"; }
.icon-save:before { content: "💾"; }
</style>
