<template>
  <div class="protocol-management-form">
    <!-- 全局消息提示 -->
    <div v-if="globalError" class="error-message global-error">{{ globalError }}</div>
    <div v-if="globalSuccess" class="success-message global-success">{{ globalSuccess }}</div>

    <!-- 第一部分: 协议定义管理 -->
    <section class="protocol-definitions-section card">
      <h3 class="card-header">
        <i class="icon-list"></i> 协议定义管理
        <button @click="openProtocolModal('create')" class="btn btn-sm btn-success float-right">
          <i class="icon-plus"></i> 添加新协议
        </button>
      </h3>
      <div class="card-body">
        <div v-if="definitionsLoading" class="loading-message">加载协议定义列表中...</div>
    <div v-else>
          <table v-if="protocolDefinitions && protocolDefinitions.length > 0" class="table table-striped table-hover">
            <thead>
              <tr>
                <th>协议ID</th>
                <th>协议名称</th>
                <th>端口号</th>
                <th>协议描述</th>
                <th>风险等级</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="protocol in protocolDefinitions" :key="protocol.protocol_id">
                <td>{{ protocol.protocol_id }}</td>
                <td>{{ protocol.protocol_name }}</td>
                <td>{{ protocol.protocol_number || '-' }}</td>
                <td>{{ protocol.description || '-' }}</td>
                <td>
                  <span :class="'risk-level risk-' + (protocol.risk_level || 'low')">
                    {{ getRiskLevelText(protocol.risk_level) }}
                  </span>
                </td>
                <td>
                  <button @click="openProtocolModal('edit', protocol)" class="btn btn-sm btn-info mr-1">
                    <i class="icon-edit"></i> 编辑
                  </button>
                  <button @click="confirmDeleteProtocol(protocol)" class="btn btn-sm btn-danger">
                    <i class="icon-delete"></i> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!storeError">暂无协议定义数据。请添加新协议。</p>
          <p v-if="storeError && (!protocolDefinitions || protocolDefinitions.length === 0)" class="error-message">
            加载协议定义失败: {{ storeError }}
          </p>
      </div>
      </div>
    </section>
      
    <!-- 协议定义编辑/创建模态框 -->
    <div v-if="showProtocolModal" class="modal-overlay" @click.self="closeProtocolModal">
      <div class="modal-content">
        <h4>{{ modalMode === 'create' ? '添加新协议' : '编辑协议' }}</h4>
        <form @submit.prevent="handleSaveProtocolDefinition">
      <div class="form-group">
            <label for="protocol-name">协议名称 <span class="required">*</span></label>
            <input type="text" id="protocol-name" v-model="currentProtocol.protocol_name" required />
        </div>
      <div class="form-group">
            <label for="protocol-number">端口号</label>
            <input type="number" id="protocol-number" v-model.number="currentProtocol.protocol_number" min="1" max="65535" placeholder="1-65535" />
          </div>
      <div class="form-group">
            <label for="protocol-description">协议描述</label>
            <textarea id="protocol-description" v-model="currentProtocol.protocol_description"></textarea>
          </div>
      <div class="form-group">
            <label for="protocol-risk-level">风险等级</label>
            <select id="protocol-risk-level" v-model="currentProtocol.risk_level">
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
          </div>
      <div class="form-group">
            <label for="protocol-is-common">
              <input type="checkbox" id="protocol-is-common" v-model="currentProtocol.is_common" />
              是否为常见协议
            </label>
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="modalSubmitting">
              {{ modalSubmitting ? '保存中...' : '保存' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="closeProtocolModal" :disabled="modalSubmitting">取消</button>
        </div>
        </form>
      </div>
      </div>
      
    <!-- 第二部分: 批量更新ASN协议支持状态 -->
    <section class="batch-update-section card mt-4">
      <h3 class="card-header">
        <i class="icon-update"></i> 批量更新ASN协议支持状态
      </h3>
      <div class="card-body">
        <div class="batch-operations-table">
          <div class="batch-operations-header">
            <div>协议 <span class="required">*</span></div>
            <div>国家 <span class="required">*</span></div>
            <div>ASN <span class="required">*</span></div>
            <div>操作 <span class="required">*</span></div>
            <div>数值 <span class="required">*</span></div>
            <div></div> <!-- 用于删除按钮列 -->
            </div>
          <div v-for="(op, index) in batchUpdateOperations" :key="op.id" class="batch-operation-row">
            <!-- 协议选择 -->
            <div class="form-group">
              <select v-model="op.protocolId" required>
                <option disabled value="">选择协议</option>
                <option v-for="protocol in protocolDefinitions" :key="protocol.protocol_id" :value="protocol.protocol_id">
                  {{ protocol.protocol_name }}
            </option>
          </select>
        </div>
        
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
                placeholder="搜索或选择ASN"
                @input="debouncedSearchAsns(index)"
                @focus="op.showAsnResults = true"
                @blur="handleBlurAsnSearch(index)"
              />
              <ul v-if="op.showAsnResults && op.matchedAsns.length" class="search-results">
                <li v-for="asnItem in op.matchedAsns" :key="asnItem.asn" @mousedown.prevent="selectAsnForRow(index, asnItem)">
                  {{ asnItem.as_name_zh || asnItem.as_name }} (AS{{ asnItem.asn }})
            </li>
          </ul>
              <input type="hidden" v-model="op.asn" />
        </div>
            
            <!-- 操作类型选择 -->
            <div class="form-group">
              <select v-model="op.updateAction" required>
                <option value="set">直接设置</option>
                <option value="increment">增加</option>
                <option value="decrement">减少</option>
        </select>
          </div>

            <!-- 数值输入 -->
            <div class="form-group">
              <input type="number" v-model.number="op.value" placeholder="数量" required min="0" />
          </div>

            <!-- 删除按钮 -->
            <div>
              <button @click="removeBatchOperation(index)" class="btn btn-sm btn-danger" :disabled="batchUpdateOperations.length <= 1">
                <i class="icon-minus"></i>
              </button>
          </div>
        </div>
      </div>
      
        <div class="form-actions mt-3">
          <button @click="addBatchOperation" class="btn btn-secondary mr-2">
            <i class="icon-plus"></i> 添加更新项
          </button>
          <button @click="handleBatchUpdate" class="btn btn-primary" :disabled="isBatchSubmitting || !isBatchFormValid">
            <i class="icon-upload"></i> 
            {{ isBatchSubmitting ? '提交中...' : '提交批量更新' }}
        </button>
      </div>
        <p class="hint mt-2">提示: 如果更新的ASN和协议组合在统计表中不存在，系统将自动创建新记录。更新结果将在下方显示。</p>
        <div v-if="batchUpdateResults.length > 0" class="batch-results mt-3">
            <h4>批量更新结果:</h4>
            <ul>
                <li v-for="(result, idx) in batchUpdateResults" :key="idx" :class="result.success ? 'text-success' : 'text-danger'">
                    操作 {{ idx + 1 }}: {{ result.message }}
                    <span v-if="!result.success && result.originalOp"> (协议: {{ getProtocolNameById(result.originalOp.protocolId) }}, ASN: {{result.originalOp.asn}})</span>
                </li>
            </ul>
    </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import { storeToRefs } from 'pinia';
import { debounce } from 'lodash';

let operationIdCounter = 0;
const store = useDatabaseStore();
const { 
  protocolDefinitions, 
  isLoading: storeLoading,
  error: storeError 
} = storeToRefs(store);

// --- 全局消息 ---
const globalError = ref('');
const globalSuccess = ref('');

const getProtocolNameById = (protocolId) => {
  if (!protocolId || !protocolDefinitions.value) return '未知协议';
  const protocol = protocolDefinitions.value.find(p => p.protocol_id === protocolId);
  return protocol ? protocol.protocol_name : '未知协议';
};

// --- 协议定义管理 ---
const definitionsLoading = ref(false);
const showProtocolModal = ref(false);
const modalMode = ref('create'); // 'create' or 'edit'
const currentProtocol = ref({});
const modalSubmitting = ref(false);
const modalError = ref('');

const defaultProtocol = {
  protocol_name: '',
  protocol_number: null,
  protocol_description: '',
  is_common: false,
  risk_level: 'low'
};

const loadProtocolDefinitions = async () => {
  console.log('[ProtocolManagementForm] Attempting to load protocol definitions...');
  definitionsLoading.value = true;
  globalError.value = '';
  try {
    await store.fetchProtocolDefinitions();
    await nextTick();
    console.log('[ProtocolManagementForm] Protocol definitions loaded. Count:', protocolDefinitions.value?.length, 'Store error:', storeError.value);
    if (storeError.value && !protocolDefinitions.value?.length) {
      globalError.value = `加载协议定义失败: ${storeError.value}`;
    }
  } catch (error) {
    console.error('[ProtocolManagementForm] Error in loadProtocolDefinitions catch block:', error);
    globalError.value = `加载协议定义时发生意外错误: ${error.message}`;
  } finally {
    definitionsLoading.value = false;
    console.log('[ProtocolManagementForm] definitionsLoading set to false.');
  }
};

function openProtocolModal(mode, protocol = null) {
  modalMode.value = mode;
  modalError.value = '';
  if (mode === 'create') {
    currentProtocol.value = { ...defaultProtocol };
  } else {
    currentProtocol.value = { ...protocol };
  }
  showProtocolModal.value = true;
}

function closeProtocolModal() {
  showProtocolModal.value = false;
  currentProtocol.value = {};
}

async function handleSaveProtocolDefinition() {
  modalSubmitting.value = true;
  modalError.value = '';
  globalSuccess.value = '';
  try {
    const dataToSave = { ...currentProtocol.value };

    if (modalMode.value === 'create') {
      await store.createProtocolDefinition(dataToSave);
      globalSuccess.value = '协议定义创建成功!';
    } else {
      await store.updateProtocolDefinition(currentProtocol.value.protocol_id, dataToSave);
      globalSuccess.value = '协议定义更新成功!';
    }
    closeProtocolModal();
    setTimeout(() => globalSuccess.value = '', 3000);
  } catch (error) {
    modalError.value = error.response?.data?.message || error.message || '保存失败';
  } finally {
    modalSubmitting.value = false;
  }
}

async function confirmDeleteProtocol(protocol) {
  if (window.confirm(`确定要删除协议 "${protocol.protocol_name}" 吗?`)) {
    definitionsLoading.value = true;
    globalError.value = '';
    globalSuccess.value = '';
    try {
      await store.deleteProtocolDefinition(protocol.protocol_id);
      globalSuccess.value = '协议定义删除成功!';
      setTimeout(() => globalSuccess.value = '', 3000);
  } catch (error) {
      globalError.value = error.response?.data?.message || error.message || '删除失败';
      setTimeout(() => globalError.value = '', 5000);
    } finally {
      definitionsLoading.value = false;
    }
  }
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (e) {
    return dateString;
  }
}

// --- 批量更新ASN协议支持状态 ---
const batchUpdateOperations = ref([createBatchOperation()]);
const isBatchSubmitting = ref(false);
const batchUpdateResults = ref([]);
const allCountries = ref([]);
const allAsns = ref([]);

function createBatchOperation() {
  operationIdCounter++;
  return {
    id: operationIdCounter,
    protocolId: '',
    countryId: '',
    countrySearch: '',
    matchedCountries: [],
    showCountryResults: false,
    asn: '',
    asnSearch: '',
    matchedAsns: [],
    showAsnResults: false,
    updateAction: 'set',
    value: 0,
  };
}

const isBatchFormValid = computed(() => {
  return batchUpdateOperations.value.every(op => 
    op.protocolId && op.countryId && op.asn && op.updateAction && op.value >= 0
  );
});

function resetForm() {
  batchUpdateOperations.value = [createBatchOperation()];
  batchUpdateResults.value = [];
  globalError.value = '';
  globalSuccess.value = '';
}

async function handleBatchUpdate() {
  try {
    console.log('[Form] 开始批量更新，操作数量:', batchUpdateOperations.value.length);
    
    const validOperations = batchUpdateOperations.value.filter(op => {
      if (!op.protocolId || !op.asn || !op.updateAction || op.value === undefined) {
        console.warn('[Form] 跳过无效操作:', op);
        return false;
      }
      return true;
    });

    if (validOperations.length === 0) {
      globalError.value = '没有有效的更新操作';
      return;
    }
    
    const operations = validOperations.map(op => ({
      protocolId: op.protocolId,
      asn: op.asn,
      updateAction: op.updateAction,
      value: Number(op.value)
    }));

    console.log('[Form] 提交批量更新操作:', operations);
    
    const result = await store.batchUpdateAsnProtocolStats(operations);
    console.log('[Form] 批量更新结果:', result);

    if (result.success) {
      globalSuccess.value = result.message || '批量更新成功';
      batchUpdateResults.value = result.results.map(op => ({
        success: true,
        message: `操作成功: ${getProtocolNameById(op.protocolId)} (ASN: ${op.asn}) - ${op.message || '更新成功'}`,
        originalOp: op
      }));
      resetForm();
    } else {
      const failedOperations = result.results.filter(r => !r.success);
      if (failedOperations.length > 0) {
        const errorMessages = failedOperations.map(op => ({
          success: false,
          message: `操作失败: ${getProtocolNameById(op.protocolId)} (ASN: ${op.asn}) - ${op.message || '未知错误'}`,
          originalOp: op
        }));
        batchUpdateResults.value = [
          ...result.results.filter(r => r.success).map(op => ({
            success: true,
            message: `操作成功: ${getProtocolNameById(op.protocolId)} (ASN: ${op.asn}) - ${op.message || '更新成功'}`,
            originalOp: op
          })),
          ...errorMessages
        ];
        globalError.value = '部分操作失败，请查看详细结果';
      } else {
        globalError.value = result.message || '批量更新失败';
        batchUpdateResults.value = result.results.map(op => ({
          success: false,
          message: `操作失败: ${getProtocolNameById(op.protocolId)} (ASN: ${op.asn}) - ${result.message || '更新失败'}`,
          originalOp: op
        }));
      }
    }
  } catch (error) {
    console.error('[Form] 批量更新失败:', error);
    globalError.value = error.message || '批量更新操作失败';
    batchUpdateResults.value = [{
      success: false,
      message: `操作失败: ${error.message || '未知错误'}`,
      originalOp: null
    }];
  }
}

// --- 搜索和选择功能 ---
const debouncedSearchCountries = debounce((rowIndex) => {
  const op = batchUpdateOperations.value[rowIndex];
  if (!op) return;
  
  const searchTerm = op.countrySearch.toLowerCase();
  if (!searchTerm) {
    op.matchedCountries = [...allCountries.value];
    return;
  }
  
  op.matchedCountries = allCountries.value.filter(country => {
    const nameCN = (country.country_name_zh || '').toLowerCase();
    const nameEN = (country.country_name || '').toLowerCase();
    const id = (country.country_id || '').toLowerCase();
    return nameCN.includes(searchTerm) || nameEN.includes(searchTerm) || id.includes(searchTerm);
  });
}, 300);

const debouncedSearchAsns = debounce(async (index) => {
  const op = batchUpdateOperations.value[index];
  const query = op.asnSearch.trim();
  
  try {
    let asnsData = [];
    if (query && query.length >= 2) {
      asnsData = await store.searchAsns(query, op.countryId);
    } else if (op.countryId) {
      asnsData = await store.fetchAsnsByCountry(op.countryId);
  } else {
      const response = await store.getAllAsns(1, 1000);
      asnsData = response.data || [];
    }
    
    op.matchedAsns = asnsData;
  } catch (error) {
    console.error('[ASN Search] Error:', error);
    op.matchedAsns = [];
  }
}, 300);

function removeBatchOperation(index) {
  if (batchUpdateOperations.value.length > 1) {
    batchUpdateOperations.value.splice(index, 1);
  }
}

function addBatchOperation() {
  const newOp = createBatchOperation();
  batchUpdateOperations.value.push(newOp);
  
  // 初始化新行的国家和ASN列表
  nextTick(async () => {
    const index = batchUpdateOperations.value.length - 1;
    const op = batchUpdateOperations.value[index];
    
    // 设置国家列表
    if (allCountries.value.length > 0) {
      op.matchedCountries = allCountries.value.slice(0, 20);
    }
    
    // 初始化ASN列表
    await initializeRowAsns(index);
  });
}

function selectAsnForRow(index, asnItem) {
  const op = batchUpdateOperations.value[index];
  op.asn = asnItem.asn;
  op.asnSearch = `${asnItem.as_name_zh || asnItem.as_name} (AS${asnItem.asn})`;
  op.showAsnResults = false;
  
  if (asnItem.country_id) {
    const country = allCountries.value.find(c => c.country_id === asnItem.country_id);
        if (country) {
      op.countryId = country.country_id;
      op.countrySearch = country.country_name_zh || country.country_name;
    }
  }
}

function handleBlurCountrySearch(index) {
  setTimeout(() => {
    batchUpdateOperations.value[index].showCountryResults = false;
  }, 200);
}

function handleBlurAsnSearch(index) {
  setTimeout(() => {
    batchUpdateOperations.value[index].showAsnResults = false;
  }, 200);
}

async function loadInitialData() {
  try {
    console.log('[ProtocolManagementForm] Loading initial data...');
    
    // 并行加载所有必要数据
    const [protocolsResponse, countriesResponse, asnsResponse] = await Promise.all([
      loadProtocolDefinitions(),
      store.getCountries(1, 500, ''), // 使用大的limit获取所有国家
      store.getAllAsns(1, 20)
    ]);
    
    // 设置国家列表
    allCountries.value = store.countries || [];
    console.log('[ProtocolManagementForm] 加载国家列表完成，数量:', allCountries.value.length);
    
    // 设置ASN列表
    if (asnsResponse && asnsResponse.data) {
      allAsns.value = asnsResponse.data;
      console.log('[ProtocolManagementForm] 加载ASN列表完成，数量:', allAsns.value.length);
    } else {
      console.warn('[ProtocolManagementForm] ASN响应数据格式不正确:', asnsResponse);
      allAsns.value = [];
    }
    
    // 初始化第一个操作行的数据
    if (batchUpdateOperations.value.length > 0) {
      const firstOp = batchUpdateOperations.value[0];
      // 设置国家列表
      firstOp.matchedCountries = allCountries.value.slice(0, 20);
      // 设置ASN列表
      firstOp.matchedAsns = [...allAsns.value];
      
      console.log('[ProtocolManagementForm] 初始化第一个操作行完成:', {
        countriesCount: firstOp.matchedCountries.length,
        asnsCount: firstOp.matchedAsns.length
      });
    }
    
    console.log('[ProtocolManagementForm] Initial data loading complete.');
  } catch (error) {
    console.error('[ProtocolManagementForm] Error loading initial data:', error);
    globalError.value = '加载初始数据失败，请刷新页面重试';
  }
}

onMounted(() => {
  loadInitialData();
});

watch(storeError, (newError) => {
  if (newError && !definitionsLoading.value && !modalSubmitting.value && !isBatchSubmitting.value) {
    globalError.value = newError;
  }
});

const getRiskLevelText = (level) => {
  const levelMap = {
    'low': '低风险',
    'medium': '中风险',
    'high': '高风险'
  };
  return levelMap[level] || '未知';
};

const searchAsns = async (index) => {
  const op = batchUpdateOperations.value[index];
  console.log(`[Form] 搜索ASN: 行=${index}, 查询='${op.asnSearch}', 国家ID=${op.countryId || 'none'}`);
  
  try {
    let asns = [];
    
    if (op.asnSearch && op.asnSearch.length >= 2) {
      // 如果有搜索词，根据搜索词查询
      console.log(`[Form] 通过搜索词查询ASN: ${op.asnSearch}`);
      asns = await store.searchAsns(op.asnSearch, op.countryId);
    } else if (op.countryId) {
      // 如果有国家ID但没有搜索词，获取该国家的ASN
      console.log(`[Form] 获取国家的ASN: ${op.countryId}`);
      asns = await store.fetchAsnsByCountry(op.countryId);
    } else {
      // 如果既没有国家ID也没有搜索词，获取所有ASN
      console.log(`[Form] 获取所有ASN (无国家ID和搜索词)`);
      const response = await store.getAllAsns(1, 1000);
      asns = response.data || [];
    }
    
    console.log(`[Form] 获取到ASN数量: ${asns.length}`);
    op.matchedAsns = asns;
    
    if (op.matchedAsns.length === 0 && op.asnSearch) {
      console.warn(`[Form] 未找到匹配的ASN: ${op.asnSearch}`);
    }
  } catch (error) {
    console.error(`[Form] 搜索ASN失败:`, error);
    op.matchedAsns = [];
  }
};

function selectCountryForRow(index, country) {
  const op = batchUpdateOperations.value[index];
  op.countryId = country.country_id;
  op.countrySearch = country.country_name_zh || country.country_name;
  op.showCountryResults = false;
  
  // 当选择国家后，更新ASN列表
  console.log(`[Form] 选择国家后更新ASN列表: 国家=${country.country_id}`);
  nextTick(() => {
    searchAsns(index);
  });
}

async function initializeRowAsns(index) {
  const op = batchUpdateOperations.value[index];
  console.log(`[Form] 初始化行${index}的ASN列表`);
  
  try {
    let asns = [];
    
    if (op.countryId) {
      console.log(`[Form] 初始化: 加载国家${op.countryId}的ASN`);
      asns = await store.fetchAsnsByCountry(op.countryId);
    } else {
      console.log(`[Form] 初始化: 加载所有ASN (无国家ID)`);
      const response = await store.getAllAsns(1, 20);
      asns = response.data || [];
    }
    
    console.log(`[Form] 初始化: 获取到${asns.length}个ASN`);
    op.matchedAsns = asns;
  } catch (error) {
    console.error(`[Form] 初始化ASN列表失败:`, error);
    op.matchedAsns = [];
  }
}
</script>

<style scoped>
/* 复用 VulnerabilityManagementForm.vue 的样式 */
.protocol-management-form {
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

.error-message, .success-message {
  padding: 10px 15px;
  margin-bottom: 15px;
  border-radius: 4px;
  font-size: 0.9em;
}

.global-error, .global-success {
  margin: 0 0 20px 0;
}

.error-message {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.success-message {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.loading-message {
  color: #555;
  padding: 20px;
  text-align: center;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.table th, .table td {
  padding: 0.75rem;
  vertical-align: top;
  border-top: 1px solid #dee2e6;
  text-align: left;
}

.table thead th {
  vertical-align: bottom;
  border-bottom: 2px solid #dee2e6;
  background-color: #f8f9fa;
}

.table-striped tbody tr:nth-of-type(odd) {
  background-color: rgba(0,0,0,.03);
}

.table-hover tbody tr:hover {
  background-color: rgba(0,0,0,.06);
}

.btn {
  display: inline-block;
  font-weight: 400;
  text-align: center;
  vertical-align: middle;
  user-select: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: 0.375rem 0.75rem;
  font-size: 0.9rem;
  line-height: 1.5;
  border-radius: 0.25rem;
  transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
  cursor: pointer;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.7875rem;
  line-height: 1.5;
  border-radius: 0.2rem;
}

.btn-primary { color: #fff; background-color: #007bff; border-color: #007bff; }
.btn-primary:hover { background-color: #0056b3; border-color: #0056b3; }
.btn-secondary { color: #fff; background-color: #6c757d; border-color: #6c757d; }
.btn-secondary:hover { background-color: #545b62; border-color: #545b62; }
.btn-success { color: #fff; background-color: #28a745; border-color: #28a745; }
.btn-success:hover { background-color: #1e7e34; border-color: #1e7e34; }
.btn-info { color: #fff; background-color: #17a2b8; border-color: #17a2b8; }
.btn-info:hover { background-color: #117a8b; border-color: #117a8b; }
.btn-danger { color: #fff; background-color: #dc3545; border-color: #dc3545; }
.btn-danger:hover { background-color: #bd2130; border-color: #bd2130; }
.btn:disabled { opacity: 0.65; cursor: not-allowed; }

.float-right { float: right; }
.mr-1 { margin-right: 0.25rem !important; }
.mr-2 { margin-right: 0.5rem !important; }
.mt-2 { margin-top: 0.5rem !important; }
.mt-3 { margin-top: 1rem !important; }
.mt-4 { margin-top: 1.5rem !important; }

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input[type="text"],
.form-group input[type="date"],
.form-group select,
.form-group textarea {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #495057;
  background-color: #fff;
  background-clip: padding-box;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  transition: border-color .15s ease-in-out,box-shadow .15s ease-in-out;
  box-sizing: border-box;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
}

.required {
  color: #dc3545;
  margin-left: 2px;
}

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
  max-width: 500px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.modal-content h4 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.25em;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 1.5rem;
}

.batch-operations-table .form-group {
  width: 100%;
  margin-bottom: 0;
}

.batch-operations-table .form-group input,
.batch-operations-table .form-group select {
    width: 100%;
  height: 38px;
  padding: 6px 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid #ced4da;
  border-radius: 4px;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.batch-operations-header {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1.5fr 1fr 1fr 40px;
  gap: 10px;
  padding: 10px 0;
  font-weight: bold;
  border-bottom: 2px solid #eee;
}

.batch-operation-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1.5fr 1fr 1fr 40px;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  align-items: center;
}

.search-container {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border: 1px solid #ced4da;
  border-radius: 0 0 4px 4px;
  z-index: 1000;
  padding: 0;
  margin: 0;
  list-style: none;
}

.search-results li {
  padding: 8px 12px;
  cursor: pointer;
}

.search-results li:hover {
  background-color: #f8f9fa;
}

.batch-results {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

.batch-results h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.1em;
  color: #495057;
}

.batch-results ul {
  list-style-type: none;
  padding-left: 0;
      margin-bottom: 0;
    }
    
.batch-results li {
  padding: 8px 0;
  font-size: 0.95em;
  border-bottom: 1px solid #e9ecef;
}

.batch-results li:last-child {
  border-bottom: none;
}

.batch-results .text-success {
  color: #28a745;
}

.batch-results .text-danger {
  color: #dc3545;
}

.hint {
  font-size: 0.85em;
  color: #666;
  margin-top: 10px;
}

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
.icon-plus:before { content: "➕"; }
.icon-edit:before { content: "✏️"; }
.icon-delete:before { content: "🗑️"; }
.icon-update:before { content: "🔄"; }
.icon-minus:before { content: "➖"; }
.icon-upload:before { content: "📤"; }

.risk-level {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
}

.risk-low {
  background-color: #d4edda;
  color: #155724;
}

.risk-medium {
  background-color: #fff3cd;
  color: #856404;
}

.risk-high {
  background-color: #f8d7da;
  color: #721c24;
}

/* 修复数字输入框样式 */
input[type="number"] {
  -moz-appearance: textfield !important; /* Firefox */
  appearance: textfield !important; /* Chrome, Safari, Edge, Opera */
}

/* 移除 Webkit 浏览器的上下箭头 */
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none !important;
  margin: 0 !important;
}

/* 确保输入框样式一致 */
.form-group input[type="number"] {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #495057;
  background-color: #fff;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  transition: border-color .15s ease-in-out, box-shadow .15s ease-in-out;
  box-sizing: border-box;
}

.form-group input[type="number"]:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
}
</style>