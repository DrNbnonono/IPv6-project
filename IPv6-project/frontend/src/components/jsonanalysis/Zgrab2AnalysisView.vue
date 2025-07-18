<template>
  <div class="zgrab2-analysis">
    <div class="analysis-header">
      <h3><i class="icon-zgrab2"></i> Zgrab2扫描结果分析</h3>
      <p class="description">专门针对Zgrab2扫描结果的分析工具，可以快速提取成功响应的IPv6地址和详细信息</p>
    </div>

    <div class="filter-section">
      <div class="filter-controls">
        <h4>过滤条件</h4>
        <div class="filter-grid">
          <div class="filter-item">
            <label>
              <input type="checkbox" v-model="filterCriteria.onlySuccessful">
              只显示成功响应
            </label>
          </div>
          <div class="filter-item">
            <label>协议类型:</label>
            <select v-model="filterCriteria.protocol">
              <option value="">全部协议</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="ssh">SSH</option>
              <option value="ftp">FTP</option>
              <option value="smtp">SMTP</option>
            </select>
          </div>
          <div class="filter-item">
            <label>HTTP状态码:</label>
            <select v-model="filterCriteria.statusCode">
              <option value="">全部状态码</option>
              <option :value="200">200 OK</option>
              <option :value="301">301 Moved Permanently</option>
              <option :value="302">302 Found</option>
              <option :value="403">403 Forbidden</option>
              <option :value="404">404 Not Found</option>
              <option :value="500">500 Internal Server Error</option>
            </select>
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
            <h4>协议类型</h4>
            <span class="card-value">{{ Object.keys(analysisResults.summary.protocols).length }}</span>
          </div>
        </div>
      </div>

      <div class="protocol-distribution">
        <h4>协议分布</h4>
        <div class="protocol-list">
          <div 
            v-for="(count, protocol) in analysisResults.summary.protocols" 
            :key="protocol"
            class="protocol-item"
          >
            <span class="protocol-name">{{ protocol.toUpperCase() }}</span>
            <span class="protocol-count">{{ count }}</span>
            <div class="protocol-bar">
              <div 
                class="protocol-fill" 
                :style="{ width: (count / analysisResults.summary.total * 100) + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="ip-lists">
        <div class="ip-section">
          <h4>成功响应的IPv6地址 ({{ analysisResults.successfulIPs.length }})</h4>
          <div class="ip-list-container">
            <textarea 
              class="ip-textarea" 
              :value="analysisResults.successfulIPs.join('\n')"
              readonly
              rows="10"
            ></textarea>
            <div class="ip-actions">
              <button class="btn btn-sm btn-success" @click="copyToClipboard(analysisResults.successfulIPs)">
                <i class="icon-copy"></i> 复制地址
              </button>
              <button class="btn btn-sm btn-primary" @click="saveResults('successful_ips')">
                <i class="icon-save"></i> 保存为文件
              </button>
            </div>
          </div>
        </div>

        <div class="ip-section" v-if="analysisResults.failedIPs.length > 0">
          <h4>失败响应的IPv6地址 ({{ analysisResults.failedIPs.length }})</h4>
          <div class="ip-list-container">
            <textarea 
              class="ip-textarea" 
              :value="analysisResults.failedIPs.join('\n')"
              readonly
              rows="6"
            ></textarea>
            <div class="ip-actions">
              <button class="btn btn-sm btn-secondary" @click="copyToClipboard(analysisResults.failedIPs)">
                <i class="icon-copy"></i> 复制地址
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="detailed-results">
        <h4>详细结果 ({{ analysisResults.detailedResults.length }}条)</h4>
        <div class="results-table-container">
          <table class="results-table">
            <thead>
              <tr>
                <th>IPv6地址</th>
                <th>协议</th>
                <th>状态</th>
                <th>详细信息</th>
                <th>时间戳</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="(result, index) in paginatedResults" 
                :key="index"
                :class="{ 'success-row': result.hasSuccess, 'failed-row': !result.hasSuccess }"
              >
                <td class="ip-cell">{{ result.ip }}</td>
                <td class="protocol-cell">
                  <span 
                    v-for="protocol in result.protocols" 
                    :key="protocol"
                    class="protocol-tag"
                  >
                    {{ protocol.toUpperCase() }}
                  </span>
                </td>
                <td class="status-cell">
                  <span :class="['status-badge', result.hasSuccess ? 'success' : 'failed']">
                    {{ result.hasSuccess ? '成功' : '失败' }}
                  </span>
                </td>
                <td class="details-cell">
                  <div v-for="(detail, protocol) in result.details" :key="protocol" class="detail-item">
                    <strong>{{ protocol }}:</strong>
                    <span v-if="detail.statusCode">{{ detail.statusCode }} {{ detail.statusLine }}</span>
                    <span v-else-if="detail.error">{{ detail.error }}</span>
                    <span v-else>{{ detail.status }}</span>
                  </div>
                </td>
                <td class="timestamp-cell">{{ formatTimestamp(result.timestamp) }}</td>
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

      <div class="save-section">
        <h4>保存分析结果</h4>
        <div class="save-options">
          <button class="btn btn-primary" @click="saveResults('complete_analysis')">
            <i class="icon-save"></i> 保存完整分析结果
          </button>
          <button class="btn btn-success" @click="saveResults('successful_details')">
            <i class="icon-save"></i> 保存成功响应详情
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
const currentPage = ref(1)
const pageSize = ref(20)

const filterCriteria = ref({
  onlySuccessful: true,
  protocol: '',
  statusCode: ''
})

// 计算属性
const paginatedResults = computed(() => {
  if (!analysisResults.value?.detailedResults) return []
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return analysisResults.value.detailedResults.slice(start, end)
})

const totalPages = computed(() => {
  if (!analysisResults.value?.detailedResults) return 0
  return Math.ceil(analysisResults.value.detailedResults.length / pageSize.value)
})

// 方法
const extractResults = async () => {
  try {
    isLoading.value = true
    
    const response = await api.jsonanalysis.extractZgrab2Results({
      sessionId: props.sessionId,
      filterCriteria: filterCriteria.value
    })

    if (response.success) {
      analysisResults.value = response.data
      currentPage.value = 1
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
    protocol: '',
    statusCode: ''
  }
}

const copyToClipboard = async (ipList) => {
  try {
    await navigator.clipboard.writeText(ipList.join('\n'))
    ElMessage.success('已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}

const saveResults = (type) => {
  if (!analysisResults.value) return

  let data, fileName, description

  switch (type) {
    case 'successful_ips':
      data = analysisResults.value.successfulIPs
      fileName = 'zgrab2_successful_ips'
      description = 'Zgrab2扫描成功响应的IPv6地址列表'
      break
    case 'successful_details':
      data = analysisResults.value.detailedResults.filter(r => r.hasSuccess)
      fileName = 'zgrab2_successful_details'
      description = 'Zgrab2扫描成功响应的详细信息'
      break
    case 'complete_analysis':
      data = analysisResults.value
      fileName = 'zgrab2_complete_analysis'
      description = 'Zgrab2扫描结果完整分析'
      break
  }

  emit('save', data, fileName, description)
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped lang="scss">
.zgrab2-analysis {
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
          border-color: #4299e1;
          box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
        }
      }
      
      input[type="checkbox"] {
        width: auto;
        margin-right: 0.5rem;
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
      border-left: 4px solid #48bb78;
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
  
  .protocol-distribution {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
    .protocol-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
      
      .protocol-name {
        min-width: 60px;
        font-weight: 500;
      }
      
      .protocol-count {
        min-width: 40px;
        text-align: right;
        color: #7f8c8d;
      }
      
      .protocol-bar {
        flex: 1;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
        
        .protocol-fill {
          height: 100%;
          background: #4299e1;
          transition: width 0.3s ease;
        }
      }
    }
  }
  
  .ip-lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
  }
  
  .ip-section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
    .ip-textarea {
      width: 100%;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.85rem;
      resize: vertical;
      
      &:focus {
        outline: none;
        border-color: #4299e1;
      }
    }
    
    .ip-actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
    }
  }
  
  .detailed-results {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
    .results-table-container {
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    
    .results-table {
      width: 100%;
      border-collapse: collapse;
      
      th, td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
      }
      
      th {
        background: #f8fafc;
        font-weight: 600;
        color: #4a5568;
      }
      
      .success-row {
        background: #f0fff4;
      }
      
      .failed-row {
        background: #fffaf0;
      }
      
      .ip-cell {
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
      }
      
      .protocol-tag {
        display: inline-block;
        background: #4299e1;
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        margin-right: 0.25rem;
      }
      
      .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        
        &.success {
          background: #c6f6d5;
          color: #22543d;
        }
        
        &.failed {
          background: #fed7d7;
          color: #742a2a;
        }
      }
      
      .detail-item {
        margin-bottom: 0.25rem;
        font-size: 0.85rem;
        
        strong {
          color: #4a5568;
        }
      }
      
      .timestamp-cell {
        font-size: 0.8rem;
        color: #7f8c8d;
      }
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      
      .page-info {
        color: #7f8c8d;
        font-size: 0.9rem;
      }
    }
  }
  
  .save-section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    h4 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }
    
    .save-options {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
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

  &.btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }
}

// 图标
.icon-zgrab2:before { content: "🔍"; }
.icon-extract:before { content: "📤"; }
.icon-reset:before { content: "🔄"; }
.icon-copy:before { content: "📋"; }
.icon-save:before { content: "💾"; }
</style>
