<template>
  <div class="import-form">
    <!-- 全局消息提示 -->
    <div v-if="globalError" class="error-message global-error">{{ globalError }}</div>
    <div v-if="globalSuccess" class="success-message global-success">{{ globalSuccess }}</div>

    <!-- 第一部分: 地址导入任务列表 -->
    <section class="import-tasks-section card">
      <h3 class="card-header">
        <i class="icon-list"></i> 导入任务列表
        <button @click="refreshTaskList" class="btn btn-sm btn-secondary float-right">
          <i class="icon-refresh"></i> 刷新列表
        </button>
      </h3>
      <div class="card-body">
        <div v-if="tasksLoading" class="loading-message">加载任务列表中...</div>
        <div v-else>
          <table v-if="importTasks.length > 0" class="table table-striped table-hover">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>国家</th>
                <th>ASN</th>
                <th>前缀</th>
                <th>文件</th>
                <th>状态</th>
                <th>进度</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in importTasks" :key="task.task_id">
                <td>{{ task.task_id }}</td>
                <td>{{ getCountryName(task.country_id) }}</td>
                <td>AS{{ task.asn }}</td>
                <td>{{ task.prefix }}</td>
                <td>{{ getFileName(task.file_id) }}</td>
                <td>
                  <span class="status-badge" :class="'status-' + task.status.toLowerCase()">
                    {{ getStatusText(task.status) }}
                  </span>
                </td>
                <td>
                  <div class="progress-bar" v-if="task.status === 'processing'">
                    <div class="progress" :style="{ width: task.progress + '%' }"></div>
                    <span class="progress-text">{{ task.progress }}%</span>
                  </div>
                  <span v-else>-</span>
                </td>
                <td>{{ formatDate(task.created_at) }}</td>
                <td>
                  <button 
                    v-if="task.status === 'processing'" 
                    @click="cancelTask(task)" 
                    class="btn btn-sm btn-warning mr-1"
                  >
                    <i class="icon-cancel"></i> 取消
                  </button>
                  <button 
                    v-if="task.status === 'completed'" 
                    @click="downloadResult(task)" 
                    class="btn btn-sm btn-info mr-1"
                  >
                    <i class="icon-download"></i> 下载
                  </button>
                  <button 
                    v-if="task.status === 'failed'" 
                    @click="viewTaskError(task)" 
                    class="btn btn-sm btn-danger"
                  >
                    <i class="icon-error"></i> 查看错误
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-muted">暂无导入任务</p>
        </div>
      </div>
    </section>

    <!-- 第二部分: 批量导入表单 -->
    <section class="batch-import-section card mt-4">
      <h3 class="card-header">
        <i class="icon-import"></i> 批量导入地址
      </h3>
      <div class="card-body">
        <div class="batch-operations-table">
          <div class="batch-operations-header">
            <div>国家 <span class="required">*</span></div>
            <div>ASN <span class="required">*</span></div>
            <div>前缀 <span class="required">*</span></div>
            <div>文件 <span class="required">*</span></div>
            <div></div> <!-- 用于删除按钮列 -->
          </div>
          <div v-for="(op, index) in batchImportOperations" :key="op.id" class="batch-operation-row">
            <!-- 国家选择 -->
            <div class="form-group search-container">
              <input
                type="text"
                v-model="op.countrySearch"
                placeholder="搜索或选择国家"
                @input="debouncedSearchCountries(index)"
                @focus="op.showCountryResults = true"
                @blur="handleBlurCountrySearch(index)"
              />
              <ul v-if="op.showCountryResults && op.matchedCountries.length" class="search-results">
                <li v-for="country in op.matchedCountries" :key="country.country_id" @mousedown.prevent="selectCountryForRow(index, country)">
                  {{ country.country_name_zh || country.country_name }}
                </li>
              </ul>
              <input type="hidden" v-model="op.countryId" />
            </div>

            <!-- ASN选择 -->
            <div class="form-group search-container">
              <input
                type="text"
                v-model="op.asnSearch"
                placeholder="搜索或选择ASN"
                @input="debouncedSearchAsns(index)"
                @focus="op.showAsnResults = true"
                @blur="handleBlurAsnSearch(index)"
              />
              <ul v-if="op.showAsnResults && op.matchedAsns.length" class="search-results">
                <li v-for="asn in op.matchedAsns" :key="asn.asn" @mousedown.prevent="selectAsnForRow(index, asn)">
                  {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
                </li>
              </ul>
              <input type="hidden" v-model="op.asn" />
            </div>

            <!-- 前缀选择 -->
            <div class="form-group search-container">
              <input
                type="text"
                v-model="op.prefixSearch"
                placeholder="搜索或选择前缀"
                @input="debouncedSearchPrefixes(index)"
                @focus="op.showPrefixResults = true"
                @blur="handleBlurPrefixSearch(index)"
              />
              <ul v-if="op.showPrefixResults && op.matchedPrefixes.length" class="search-results">
                <li v-for="prefix in op.matchedPrefixes" :key="prefix.prefix_id" @mousedown.prevent="selectPrefixForRow(index, prefix)">
                  {{ prefix.prefix }}
                </li>
              </ul>
              <input type="hidden" v-model="op.prefix" />
            </div>

            <!-- 文件选择 -->
            <div class="form-group">
              <select v-model="op.fileId" required>
                <option value="">选择文件</option>
                <option v-for="file in addressFiles" :key="file.id" :value="file.id">
                  {{ file.file_name }}
                </option>
              </select>
            </div>

            <!-- 删除按钮 -->
            <div>
              <button @click="removeBatchOperation(index)" class="btn btn-sm btn-danger" :disabled="batchImportOperations.length <= 1">
                <i class="icon-minus"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="form-actions mt-3">
          <button @click="addBatchOperation" class="btn btn-secondary mr-2">
            <i class="icon-plus"></i> 添加导入项
          </button>
          <button @click="handleBatchImport" class="btn btn-primary" :disabled="isSubmitting || !isFormValid">
            <i class="icon-upload"></i> 
            {{ isSubmitting ? '提交中...' : '开始导入' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 第三部分: 文件上传 -->
    <section class="file-upload-section card mt-4">
      <h3 class="card-header">
        <i class="icon-upload"></i> 上传地址文件
      </h3>
      <div class="card-body">
        <div class="file-upload">
          <input 
            id="fileUpload" 
            type="file" 
            @change="handleFileUpload" 
            accept=".txt"
            ref="fileInput"
            :disabled="isUploading"
          />
          <div class="upload-info">
            <span v-if="!uploadFile">点击或拖拽文件到此处</span>
            <span v-else>{{ uploadFile.name }} ({{ formatFileSize(uploadFile.size) }})</span>
          </div>
          <div v-if="uploadProgress > 0 && uploadProgress < 100" class="progress-bar">
            <div class="progress" :style="{ width: uploadProgress + '%' }"></div>
            <span class="progress-text">{{ uploadProgress }}%</span>
          </div>
        </div>
        <p class="file-hint">支持TXT格式，每行一个IPv6地址</p>
        <div class="form-actions">
          <button 
            class="btn btn-primary" 
            @click="uploadFileToServer" 
            :disabled="!uploadFile || isUploading"
          >
            <i class="icon-upload"></i>
            {{ isUploading ? '上传中...' : '上传文件' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 错误详情模态框 -->
    <div v-if="showErrorModal" class="modal-overlay" @click.self="closeErrorModal">
      <div class="modal-content">
        <h4>任务错误详情</h4>
        <div class="error-details">
          <pre>{{ selectedTaskError }}</pre>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click="closeErrorModal">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import { storeToRefs } from 'pinia';
import { debounce } from 'lodash';

const store = useDatabaseStore();
const { countries, asns, prefixes } = storeToRefs(store);

// 全局状态
const globalError = ref('');
const globalSuccess = ref('');
const tasksLoading = ref(false);
const isSubmitting = ref(false);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadFile = ref(null);
const showErrorModal = ref(false);
const selectedTaskError = ref('');

// 导入任务列表
const importTasks = ref([]);
const addressFiles = ref([]);

// 批量导入操作
let operationIdCounter = 0;
const batchImportOperations = ref([createBatchOperation()]);

// 创建新的批量导入操作
function createBatchOperation() {
  operationIdCounter++;
  return {
    id: operationIdCounter,
    countryId: '',
    countrySearch: '',
    matchedCountries: [],
    showCountryResults: false,
    asn: '',
    asnSearch: '',
    matchedAsns: [],
    showAsnResults: false,
    prefix: '',
    prefixSearch: '',
    matchedPrefixes: [],
    showPrefixResults: false,
    fileId: ''
  };
}

// 表单验证
const isFormValid = computed(() => {
  return batchImportOperations.value.every(op => 
    op.countryId && op.asn && op.prefix && op.fileId
  );
});

// 加载导入任务列表
const loadImportTasks = async () => {
  try {
    tasksLoading.value = true;
    const response = await store.getImportTasks();
    importTasks.value = response.data || [];
    
    // 对于正在处理的任务，启动进度轮询
    importTasks.value.forEach(task => {
      if (task.status === 'processing') {
        startTaskProgressPolling(task.task_id);
      }
    });
  } catch (error) {
    console.error('加载导入任务失败:', error);
    globalError.value = error.response?.data?.message || '加载导入任务失败';
  } finally {
    tasksLoading.value = false;
  }
};

// 刷新任务列表
const refreshTaskList = () => {
  loadImportTasks();
};

// 任务进度轮询
const taskProgressPolling = {};
const startTaskProgressPolling = (taskId) => {
  if (taskProgressPolling[taskId]) return;
  
  taskProgressPolling[taskId] = setInterval(async () => {
    try {
      const response = await store.getImportTaskStatus(taskId);
      const task = importTasks.value.find(t => t.task_id === taskId);
      
      if (task) {
        task.status = response.data.status;
        task.progress = response.data.progress;
        
        // 如果任务完成或失败，停止轮询
        if (['completed', 'failed', 'cancelled'].includes(response.data.status)) {
          clearInterval(taskProgressPolling[taskId]);
          delete taskProgressPolling[taskId];
        }
      }
    } catch (error) {
      console.error(`轮询任务 ${taskId} 状态失败:`, error);
      clearInterval(taskProgressPolling[taskId]);
      delete taskProgressPolling[taskId];
    }
  }, 2000);
};

// 取消任务
const cancelTask = async (task) => {
  if (!window.confirm(`确定要取消任务 ${task.task_id} 吗？`)) return;
  
  try {
    await store.cancelImportTask(task.task_id);
    globalSuccess.value = '任务已取消';
    loadImportTasks();
  } catch (error) {
    console.error('取消任务失败:', error);
    globalError.value = error.response?.data?.message || '取消任务失败';
  }
};

// 下载结果
const downloadResult = async (task) => {
  try {
    await store.downloadImportResult(task.task_id);
  } catch (error) {
    console.error('下载结果失败:', error);
    globalError.value = error.response?.data?.message || '下载结果失败';
  }
};

// 查看任务错误
const viewTaskError = (task) => {
  selectedTaskError.value = task.error_message || '未知错误';
  showErrorModal.value = true;
};

// 关闭错误模态框
const closeErrorModal = () => {
  showErrorModal.value = false;
  selectedTaskError.value = '';
};

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'pending': '等待中',
    'processing': '处理中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
};

// 获取国家名称
const getCountryName = (countryId) => {
  const country = countries.value.find(c => c.country_id === countryId);
  return country ? (country.country_name_zh || country.country_name) : countryId;
};

// 获取文件名
const getFileName = (fileId) => {
  const file = addressFiles.value.find(f => f.id === fileId);
  return file ? file.file_name : fileId;
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 添加批量导入操作
const addBatchOperation = () => {
  batchImportOperations.value.push(createBatchOperation());
};

// 移除批量导入操作
const removeBatchOperation = (index) => {
  if (batchImportOperations.value.length > 1) {
    batchImportOperations.value.splice(index, 1);
  }
};

// 处理批量导入
const handleBatchImport = async () => {
  if (!isFormValid.value) return;
  
  try {
    isSubmitting.value = true;
    globalError.value = '';
    globalSuccess.value = '';
    
    const tasks = batchImportOperations.value.map(op => ({
      countryId: op.countryId,
      asn: op.asn,
      prefix: op.prefix,
      fileId: op.fileId
    }));
    
    await store.createImportTask(tasks);
    globalSuccess.value = '导入任务已创建';
    
    // 重置表单
    batchImportOperations.value = [createBatchOperation()];
    
    // 刷新任务列表
    await loadImportTasks();
  } catch (error) {
    console.error('创建导入任务失败:', error);
    globalError.value = error.response?.data?.message || '创建导入任务失败';
  } finally {
    isSubmitting.value = false;
  }
};

// 文件上传相关
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadFile.value = file;
    uploadProgress.value = 0;
  }
};

const uploadFileToServer = async () => {
  if (!uploadFile.value) return;
  
  try {
    isUploading.value = true;
    const formData = new FormData();
    formData.append('file', uploadFile.value);
    
    await store.uploadAddressFile(formData);
    globalSuccess.value = '文件上传成功';
    uploadFile.value = null;
    uploadProgress.value = 0;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
    
    // 刷新文件列表
    await loadAddressFiles();
  } catch (error) {
    console.error('上传文件失败:', error);
    globalError.value = error.response?.data?.message || '上传文件失败';
  } finally {
    isUploading.value = false;
  }
};

// 加载地址文件列表
const loadAddressFiles = async () => {
  try {
    const response = await store.getAddressFiles();
    addressFiles.value = response.data || [];
  } catch (error) {
    console.error('加载文件列表失败:', error);
    globalError.value = error.response?.data?.message || '加载文件列表失败';
  }
};

// 搜索相关函数
const debouncedSearchCountries = debounce((index) => {
  const op = batchImportOperations.value[index];
  if (!op) return;
  
  const searchTerm = op.countrySearch.toLowerCase();
  if (!searchTerm) {
    op.matchedCountries = countries.value.slice(0, 20);
    return;
  }
  
  op.matchedCountries = countries.value.filter(country => {
    const nameCN = (country.country_name_zh || '').toLowerCase();
    const nameEN = (country.country_name || '').toLowerCase();
    return nameCN.includes(searchTerm) || nameEN.includes(searchTerm);
  });
}, 300);

const debouncedSearchAsns = debounce(async (index) => {
  const op = batchImportOperations.value[index];
  if (!op) return;
  
  try {
    let asnsData = [];
    if (op.asnSearch && op.asnSearch.length >= 2) {
      asnsData = await store.searchAsns(op.asnSearch, op.countryId);
    } else if (op.countryId) {
      asnsData = await store.fetchAsnsByCountry(op.countryId);
    } else {
      const response = await store.getAllAsns(1, 20);
      asnsData = response.data || [];
    }
    op.matchedAsns = asnsData;
  } catch (error) {
    console.error('搜索ASN失败:', error);
    op.matchedAsns = [];
  }
}, 300);

const debouncedSearchPrefixes = debounce(async (index) => {
  const op = batchImportOperations.value[index];
  if (!op) return;
  
  try {
    const response = await store.searchPrefixes(op.prefixSearch, op.countryId);
    op.matchedPrefixes = response.data || [];
  } catch (error) {
    console.error('搜索前缀失败:', error);
    op.matchedPrefixes = [];
  }
}, 300);

// 选择处理函数
const selectCountryForRow = (index, country) => {
  const op = batchImportOperations.value[index];
  op.countryId = country.country_id;
  op.countrySearch = country.country_name_zh || country.country_name;
  op.showCountryResults = false;
  
  // 清空并更新ASN列表
  op.asn = '';
  op.asnSearch = '';
  debouncedSearchAsns(index);
};

const selectAsnForRow = (index, asn) => {
  const op = batchImportOperations.value[index];
  op.asn = asn.asn;
  op.asnSearch = `${asn.as_name_zh || asn.as_name} (AS${asn.asn})`;
  op.showAsnResults = false;
};

const selectPrefixForRow = (index, prefix) => {
  const op = batchImportOperations.value[index];
  op.prefix = prefix.prefix;
  op.prefixSearch = prefix.prefix;
  op.showPrefixResults = false;
};

// 失去焦点处理
const handleBlurCountrySearch = (index) => {
  setTimeout(() => {
    batchImportOperations.value[index].showCountryResults = false;
  }, 200);
};

const handleBlurAsnSearch = (index) => {
  setTimeout(() => {
    batchImportOperations.value[index].showAsnResults = false;
  }, 200);
};

const handleBlurPrefixSearch = (index) => {
  setTimeout(() => {
    batchImportOperations.value[index].showPrefixResults = false;
  }, 200);
};

// 组件挂载时加载数据
onMounted(async () => {
  await Promise.all([
    loadImportTasks(),
    loadAddressFiles(),
    store.getCountries(1, 500, ''),
    store.getAllAsns()
  ]);
});

// 组件卸载时清理轮询
onUnmounted(() => {
  Object.values(taskProgressPolling).forEach(interval => clearInterval(interval));
});
</script>

<style scoped lang="scss">
// 复用漏洞管理组件的样式
.import-form {
  font-family: 'Arial', sans-serif;
  color: #333;
}

.card {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 20px;
}

.card-header {
  background-color: #f8f9fa;
  padding: 12px 20px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 1.1em;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-body {
  padding: 20px;
}

// 状态徽章
.status-badge {
  padding: 0.25em 0.6em;
  font-size: 75%;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  vertical-align: baseline;
  border-radius: 0.25rem;
  color: #fff;
}

.status-pending { background-color: #6c757d; }
.status-processing { background-color: #17a2b8; }
.status-completed { background-color: #28a745; }
.status-failed { background-color: #dc3545; }
.status-cancelled { background-color: #ffc107; color: #212529; }

// 进度条
.progress-bar {
  background-color: #e9ecef;
  border-radius: 4px;
  height: 20px;
  position: relative;
  overflow: hidden;
  
  .progress {
    background-color: #17a2b8;
    height: 100%;
    transition: width 0.3s ease;
  }
  
  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 500;
  }
}

// 批量操作表格
.batch-operations-table {
  margin-bottom: 1rem;
}

.batch-operations-header {
  display: grid;
  grid-template-columns: 1.5fr 1.5fr 1.5fr 1.5fr 40px;
  gap: 10px;
  padding: 10px 0;
  font-weight: bold;
  border-bottom: 2px solid #eee;
}

.batch-operation-row {
  display: grid;
  grid-template-columns: 1.5fr 1.5fr 1.5fr 1.5fr 40px;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  align-items: center;
}

// 搜索容器
.search-container {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid #ced4da;
  border-radius: 0 0 4px 4px;
  z-index: 1000;
  padding: 0;
  margin: 0;
  list-style: none;
  
  li {
    padding: 8px 12px;
    cursor: pointer;
    
    &:hover {
      background-color: #f8f9fa;
    }
  }
}

// 文件上传区域
.file-upload {
  position: relative;
  border: 2px dashed #ced4da;
  border-radius: 4px;
  padding: 20px;
  text-align: center;
  background-color: #f8f9fa;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #17a2b8;
  }
  
  input[type="file"] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
}

// 错误模态框
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  padding: 25px;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  
  h4 {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }
  
  .error-details {
    background-color: #f8f9fa;
    padding: 15px;
    border-radius: 4px;
    margin-bottom: 1.5rem;
    max-height: 300px;
    overflow-y: auto;
    
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  }
}

// 图标
.icon-list:before { content: "📋"; }
.icon-refresh:before { content: "🔄"; }
.icon-import:before { content: "📥"; }
.icon-upload:before { content: "📤"; }
.icon-plus:before { content: "➕"; }
.icon-minus:before { content: "➖"; }
.icon-cancel:before { content: "❌"; }
.icon-download:before { content: "📥"; }
.icon-error:before { content: "⚠️"; }

// 工具类
.float-right { float: right; }
.mr-1 { margin-right: 0.25rem !important; }
.mr-2 { margin-right: 0.5rem !important; }
.mt-3 { margin-top: 1rem !important; }
.mt-4 { margin-top: 1.5rem !important; }
.text-muted { color: #6c757d; }
</style>