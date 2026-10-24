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
                <th style="width: 8%">任务ID</th>
                <th style="width: 12%">国家</th>
                <th style="width: 12%">ASN</th>
                <th style="width: 20%">前缀</th>
                <th style="width: 15%">文件</th>
                <th style="width: 10%">状态</th>
                <th style="width: 15%">创建时间</th>
                <th style="width: 8%">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in importTasks" :key="task.id">
                <td>{{ task.id }}</td>
                <td>{{ getCountryName(task.country_id) }}</td>
                <td>AS{{ task.asn }}</td>
                <td>{{ task.prefix }}</td>
                <td>{{ task.file_name || getFileName(task.file_id) }}</td>
                <td>
                  <span class="status-badge" :class="'status-' + task.status.toLowerCase()">
                    {{ getStatusText(task.status) }}
                  </span>
                </td>
                <td>{{ formatDate(task.created_at) }}</td>
                <td class="operation-cell">
                  <div class="operation-buttons">
                    <button 
                      v-if="['pending', 'running'].includes(task.status)" 
                      @click="cancelTask(task)" 
                      class="btn btn-sm btn-warning"
                      title="取消任务"
                    >
                      <i class="icon-cancel"></i>
                    </button>
                    <button 
                      v-if="true" 
                      @click="deleteTask(task)" 
                      class="btn btn-sm btn-danger"
                      title="删除任务"
                    >
                      <i class="icon-delete"></i>
                    </button>
                  </div>
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
            <div style="width: 20%">国家 <span class="required">*</span></div>
            <div style="width: 20%">ASN <span class="required">*</span></div>
            <div style="width: 25%">前缀 <span class="required">*</span></div>
            <div style="width: 25%">文件 <span class="required">*</span></div>
            <div style="width: 10%">操作</div>
          </div>
          <div v-for="(op, index) in batchImportOperations" :key="op.id" class="batch-operation-row">
            <!-- 国家选择 -->
            <div class="form-group search-container">
              <input
                type="text"
                v-model="op.countrySearch"
                :disabled="!!op.prefix"
                placeholder="搜索或选择国家"
                @input="debouncedSearchCountries(index)"
                @focus="op.showCountryResults = true"
                @blur="handleBlurCountrySearch(index)"
                class="form-control"
                :class="{ locked: !!op.prefix }"
              />
              <ul v-if="op.showCountryResults && op.matchedCountries.length && !op.prefix" class="search-results">
                <li v-for="country in op.matchedCountries" :key="country.country_id" @mousedown.prevent="selectCountryForRow(index, country)">
                  {{ country.country_name_zh || country.country_name }} ({{country.country_id}})
                </li>
              </ul>
              <input type="hidden" v-model="op.countryId" />
            </div>

            <!-- ASN选择 -->
            <div class="form-group search-container">
              <input
                type="text"
                v-model="op.asnSearch"
                :disabled="!!op.prefix"
                placeholder="搜索或选择ASN"
                @input="debouncedSearchAsns(index)"
                @focus="op.showAsnResults = true"
                @blur="handleBlurAsnSearch(index)"
                class="form-control"
                :class="{ locked: !!op.prefix }"
              />
              <ul v-if="op.showAsnResults && op.matchedAsns.length && !op.prefix" class="search-results">
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
                class="form-control"
              />
              <ul v-if="op.showPrefixResults && op.matchedPrefixes.length" class="search-results">
                <li v-for="prefix in op.matchedPrefixes" :key="prefix.prefix_id" @mousedown.prevent="selectPrefixForRow(index, prefix)">
                  {{ prefix.prefix }}
                  <span class="prefix-info">
                    ({{ prefix.country_name_zh || prefix.country_name }} - AS{{ prefix.asn }})
                  </span>
                </li>
              </ul>
              <input type="hidden" v-model="op.prefix" />
            </div>

            <!-- 文件选择 -->
            <div class="form-group">
              <select v-model="op.fileId" required class="form-control">
                <option value="">选择文件</option>
                <option v-for="file in addressFiles" :key="file.id" :value="file.id">
                  {{ file.file_name }}
                </option>
              </select>
            </div>

            <!-- 操作按钮 -->
            <div class="form-group action-buttons">
              <button @click="resetOperation(index)" class="btn btn-sm btn-secondary mr-1" title="重置当前行">
                <i class="icon-reset"></i>
              </button>
              <button @click="removeBatchOperation(index)" class="btn btn-sm btn-danger" :disabled="batchImportOperations.length <= 1" title="删除当前行">
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import { useFileStore } from '@/stores/file';
import { storeToRefs } from 'pinia';
import { debounce } from 'lodash';

const store = useDatabaseStore();
const fileStore = useFileStore();
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
const fileInput = ref(null);

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

// 加载初始数据
const loadInitialData = async () => {
  try {
    console.log('[ImportAddressesForm] 开始加载初始数据...');
    
    // 加载国家列表
    const countriesResponse = await store.getCountries(1, 500, '');
    if (countriesResponse && countriesResponse.data) {
      console.log('[ImportAddressesForm] 加载国家列表成功，数量:', countriesResponse.data.length);
      if (Array.isArray(countriesResponse.data)) {
        countries.value = countriesResponse.data;
      } else if (countriesResponse.data.data) {
        countries.value = countriesResponse.data.data;
      }
    }
    
    // 加载ASN列表
    const asnsResponse = await store.getAllAsns(1, 20);
    if (asnsResponse && Array.isArray(asnsResponse)) {
      console.log('[ImportAddressesForm] 加载ASN列表成功，数量:', asnsResponse.length);
      asns.value = asnsResponse;
    }
    
    // 加载前缀列表
    try {
      console.log('[ImportAddressesForm] 开始加载前缀列表...');
      const prefixesResponse = await store.getAllPrefixes(1, 1000);
      if (prefixesResponse && Array.isArray(prefixesResponse)) {
        console.log('[ImportAddressesForm] 加载前缀列表成功，数量:', prefixesResponse.length);
        prefixes.value = prefixesResponse;
      }
    } catch (error) {
      console.error('[ImportAddressesForm] 加载前缀列表失败:', error);
    }
    
    // 初始化第一个操作行的匹配数据
    if (batchImportOperations.value.length > 0) {
      const firstOp = batchImportOperations.value[0];
      if (countries.value && countries.value.length > 0) {
        firstOp.matchedCountries = countries.value.slice(0, 20);
      }
      if (asns.value && asns.value.length > 0) {
        firstOp.matchedAsns = asns.value.slice(0, 20);
      }
      if (prefixes.value && prefixes.value.length > 0) {
        firstOp.matchedPrefixes = prefixes.value.slice(0, 20);
      }
    }
    
    // 加载其他必要数据
    await Promise.all([
      loadImportTasks(),
      loadAddressFiles()
    ]);
    
    console.log('[ImportAddressesForm] 初始数据加载完成');
  } catch (error) {
    console.error('[ImportAddressesForm] 加载初始数据失败:', error);
    globalError.value = '加载初始数据失败，请刷新页面重试';
  }
};

// 加载导入任务列表
const loadImportTasks = async () => {
  try {
    tasksLoading.value = true;
    console.log('[ImportAddressesForm] 开始加载导入任务列表...');
    const response = await store.getImportTasks();
    console.log('[ImportAddressesForm] 获取到导入任务响应:', response);
    
    // 确保response包含tasks数组
    if (!response || !response.tasks) {
      console.error('[ImportAddressesForm] 响应数据格式不正确:', response);
      throw new Error('响应数据格式不正确');
    }
    
    // 更新任务列表
    importTasks.value = response.tasks;
    console.log('[ImportAddressesForm] 更新后的任务列表:', importTasks.value);
    
    // 对于正在处理的任务，启动进度轮询
    importTasks.value.forEach(task => {
      if (task.status === 'running') {
        console.log(`[ImportAddressesForm] 启动任务 ${task.id} 的进度轮询`);
        startTaskProgressPolling(task.id);
      }
    });
  } catch (error) {
    console.error('[ImportAddressesForm] 加载导入任务失败:', error);
    console.error('[ImportAddressesForm] 错误详情:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
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
      const task = importTasks.value.find(t => t.id === taskId);  // 使用正确的ID字段
      
      if (task) {
        task.status = response.data.status;
        task.progress = response.data.progress;
        
        // 如果任务完成或失败，停止轮询
        if (['completed', 'failed', 'canceled'].includes(response.data.status)) {  // 修正状态名称
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
  if (!window.confirm(`确定要取消任务 ${task.id} 吗？`)) return;  // 使用正确的ID字段
  
  try {
    await store.cancelImportTask(task.id);  // 使用正确的ID字段
    globalSuccess.value = '任务已取消';
    loadImportTasks();
  } catch (error) {
    console.error('取消任务失败:', error);
    globalError.value = error.response?.data?.message || '取消任务失败';
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
    'canceled': '已取消',
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
  const newOp = createBatchOperation();
  // 初始化下拉列表
  if (countries.value && countries.value.length > 0) {
    newOp.matchedCountries = countries.value.slice(0, 20);
  }
  if (asns.value && asns.value.length > 0) {
    newOp.matchedAsns = asns.value.slice(0, 20);
  }
  if (prefixes.value && prefixes.value.length > 0) {
    newOp.matchedPrefixes = prefixes.value.slice(0, 20);
  }
  batchImportOperations.value.push(newOp);
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
  if (!uploadFile.value) {
    console.error('没有选择文件');
    globalError.value = '请先选择文件';
    return;
  }
  
  try {
    isUploading.value = true;
    globalError.value = '';
    
    const formData = new FormData();
    formData.append('file', uploadFile.value);
    formData.append('toolType', 'database');
    formData.append('description', '地址导入文件');
    
    // 使用fileStore而不是databaseStore上传文件
    const response = await fileStore.uploadFile(formData, (progress) => {
      uploadProgress.value = progress;
    });
    
    globalSuccess.value = '文件上传成功';
    uploadFile.value = null;
    
    // 重置文件输入
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

//加载地址列表
const loadAddressFiles = async () => {
  try {
    const response = await fileStore.getFiles('database');
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
    const id = (country.country_id || '').toLowerCase();
    return nameCN.includes(searchTerm) || nameEN.includes(searchTerm) || id.includes(searchTerm);
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
    console.log('[ImportAddressesForm] 搜索前缀:', op.prefixSearch);
    let prefixes = [];
    
    if (op.asn) {
      // 如果已选择ASN，优先获取该ASN的前缀列表
      prefixes = await store.getPrefixesByAsn(op.asn);
      if (op.prefixSearch) {
        // 如果有搜索词，在前缀列表中过滤
        const searchTerm = op.prefixSearch.toLowerCase();
        prefixes = prefixes.filter(prefix => 
          prefix.prefix.toLowerCase().includes(searchTerm)
        );
      }
    } else if (op.prefixSearch) {
      // 如果没有选择ASN但有搜索词，使用通用搜索
      prefixes = await store.searchPrefixes(op.prefixSearch);
    } else {
      // 如果既没有ASN也没有搜索词，显示所有前缀
      prefixes = await store.getAllPrefixes(1, 1000);
    }
    
    console.log('[ImportAddressesForm] 前缀搜索结果数量:', prefixes.length);
    op.matchedPrefixes = prefixes;
  } catch (error) {
    console.error('[ImportAddressesForm] 搜索前缀失败:', error);
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

const selectAsnForRow = async (index, asn) => {
  const op = batchImportOperations.value[index];
  op.asn = asn.asn;
  op.asnSearch = `${asn.as_name_zh || asn.as_name} (AS${asn.asn})`;
  op.showAsnResults = false;
  
  // 加载该ASN的前缀列表
  try {
    console.log(`[ImportAddressesForm] 加载ASN ${asn.asn} 的前缀列表...`);
    const prefixes = await store.getPrefixesByAsn(asn.asn);
    if (prefixes && prefixes.length > 0) {
      op.matchedPrefixes = prefixes;
      console.log(`[ImportAddressesForm] 加载到 ${prefixes.length} 个前缀`);
    } else {
      console.log(`[ImportAddressesForm] ASN ${asn.asn} 没有前缀`);
      op.matchedPrefixes = [];
    }
  } catch (error) {
    console.error(`[ImportAddressesForm] 加载ASN前缀列表失败:`, error);
    op.matchedPrefixes = [];
  }
  
  // 如果ASN有国家信息，自动设置国家
  if (asn.country_id) {
    const country = countries.value.find(c => c.country_id === asn.country_id);
    if (country) {
      op.countryId = country.country_id;
      op.countrySearch = country.country_name_zh || country.country_name;
      console.log(`[ImportAddressesForm] 自动设置国家: ${op.countrySearch} (${op.countryId})`);
    }
  }
};

const selectPrefixForRow = (index, prefix) => {
  const op = batchImportOperations.value[index];
  op.prefix = prefix.prefix;
  op.prefixSearch = prefix.prefix;
  op.showPrefixResults = false;

  // 自动填充并锁定ASN和国家
  if (prefix.asn) {
    op.asn = prefix.asn;
    op.asnSearch = `AS${prefix.asn}`;
  }
  if (prefix.country_id) {
    const country = countries.value.find(c => c.country_id === prefix.country_id);
    op.countryId = prefix.country_id;
    op.countrySearch = country ? (country.country_name_zh || country.country_name) : prefix.country_id;
  }
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

// 添加重置操作函数
const resetOperation = (index) => {
  const op = batchImportOperations.value[index];
  op.countryId = '';
  op.countrySearch = '';
  op.asn = '';
  op.asnSearch = '';
  op.prefix = '';
  op.prefixSearch = '';
  op.fileId = '';
  op.matchedCountries = [];
  op.matchedAsns = [];
  op.matchedPrefixes = [];
};

// 添加删除任务函数
const deleteTask = async (task) => {
  if (!window.confirm(`确定要删除任务 ${task.id} 吗？`)) return;
  
  try {
    await store.deleteImportTask(task.id);
    globalSuccess.value = '任务已删除';
    loadImportTasks();
  } catch (error) {
    console.error('删除任务失败:', error);
    globalError.value = error.response?.data?.message || '删除任务失败';
  }
};

// 组件挂载时加载数据
onMounted(async () => {
  console.log('[ImportAddressesForm] 组件挂载，开始加载数据...');
  await loadInitialData();
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
  display: inline-block;
  padding: 0.2em 0.4em;
  font-size: 0.75rem;
  font-weight: 600;
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
.status-canceled, .status-cancelled { background-color: #ffc107; color: #212529; }

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
  width: 100%;
  
  .form-group {
    margin-bottom: 0;
    padding: 0;
    width: 100%;
  }
}

.batch-operations-header {
  display: flex;
  padding: 1rem 0;
  font-weight: bold;
  border-bottom: 2px solid #eee;
  margin-bottom: 1rem;
  
  > div {
    padding: 0 0.5rem;
    box-sizing: border-box;
  }
}

.batch-operation-row {
  display: flex;
  padding: 1rem 0;
  border-bottom: 1px solid #eee;
  align-items: center;
  
  > div {
    padding: 0 0.5rem;
    box-sizing: border-box;
    flex: 1;
    
    &:last-child {
      flex: 0 0 auto;
      width: 100px;
    }
  }
}

.form-control {
  width: 100%;
  box-sizing: border-box;
}

// 锁定时样式
.form-control.locked {
  background: #f5f5f5;
  color: #888;
  cursor: not-allowed;
}

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
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  
  li {
    padding: 8px 12px;
    cursor: pointer;
    
    &:hover {
      background-color: #f8f9fa;
    }
  }
}

.action-buttons {
  display: flex;
  gap: 5px;
  justify-content: flex-start;
  align-items: center;
  
  .btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    line-height: 1.5;
    border-radius: 0.2rem;
    
    &.btn-secondary {
      background-color: #6c757d;
      border-color: #6c757d;
      color: #fff;
      
      &:hover {
        background-color: #5a6268;
        border-color: #545b62;
      }
    }
  }
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
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  
  li {
    padding: 8px 12px;
    cursor: pointer;
    
    &:hover {
      background-color: #f8f9fa;
    }
  }
}

// 表单元素
.form-group {
  margin-bottom: 1rem;
  
  input[type="text"],
  input[type="number"],
  select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #495057;
    background-color: #fff;
    border: 1px solid #ced4da;
    border-radius: 0.25rem;
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    
    &:focus {
      border-color: #80bdff;
      outline: 0;
      box-shadow: 0 0 0 0.2rem rgba(0,123,255,0.25);
    }
  }
}

// 按钮样式
.btn {
  display: inline-block;
  font-weight: 400;
  text-align: center;
  vertical-align: middle;
  user-select: none;
  padding: 0.375rem 0.75rem;
  font-size: 0.9rem;
  line-height: 1.5;
  border-radius: 0.25rem;
  transition: all 0.15s ease-in-out;
  cursor: pointer;
  border: 1px solid transparent;
  
  &.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.7875rem;
  }
  
  &.btn-primary {
    color: #fff;
    background-color: #007bff;
    border-color: #007bff;
    
    &:hover {
      background-color: #0056b3;
      border-color: #0056b3;
    }
  }
  
  &.btn-secondary {
    color: #fff;
    background-color: #6c757d;
    border-color: #6c757d;
    
    &:hover {
      background-color: #545b62;
      border-color: #545b62;
    }
  }
  
  &.btn-danger {
    color: #fff;
    background-color: #dc3545;
    border-color: #dc3545;
    
    &:hover {
      background-color: #bd2130;
      border-color: #bd2130;
    }
  }
  
  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
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
[class^="icon-"], [class*=" icon-"] {
  display: inline-block;
  font-family: 'your-icon-font';
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.icon-list:before { content: "📋"; }
.icon-refresh:before { content: "🔄"; }
.icon-import:before { content: "📥"; }
.icon-upload:before { content: "📤"; }
.icon-plus:before { content: "➕"; }
.icon-minus:before { content: "➖"; }
.icon-cancel:before { content: "❌"; }
.icon-download:before { content: "📥"; }
.icon-error:before { content: "⚠️"; }
.icon-reset:before { content: "🔄"; }
.icon-delete:before { content: "🗑️"; }

// 工具类
.float-right { float: right; }
.mr-1 { margin-right: 0.25rem !important; }
.mr-2 { margin-right: 0.5rem !important; }
.mt-3 { margin-top: 1rem !important; }
.mt-4 { margin-top: 1.5rem !important; }
.text-muted { color: #6c757d; }

// 更新表格样式
.table {
  width: 100%;
  margin-bottom: 1rem;
  border-collapse: separate;
  border-spacing: 0;
  
  th, td {
    padding: 0.5rem;
    vertical-align: middle;
    border-top: 1px solid #dee2e6;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  th {
    background-color: #f8f9fa;
    font-weight: 600;
    border-bottom: 2px solid #dee2e6;
  }
  
  tbody tr:hover {
    background-color: rgba(0,0,0,.075);
  }
}

// 操作列样式
.operation-cell {
  padding: 0.25rem !important;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
}

.operation-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
  
  .btn {
    padding: 0.2rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 0.2rem;
    
    i {
      font-size: 0.875rem;
    }
  }
}
</style>