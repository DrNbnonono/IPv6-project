<template>
  <div class="prefix-management-form">
    <!-- 全局消息提示 -->
    <div v-if="globalError" class="error-message global-error">{{ globalError }}</div>
    <div v-if="globalSuccess" class="success-message global-success">{{ globalSuccess }}</div>

    <!-- 前缀管理部分 -->
    <section class="prefix-definitions-section card">
      <h3 class="card-header">
        <i class="icon-network"></i> 前缀管理
        <button @click="openPrefixModal('create')" class="btn btn-sm btn-success float-right">
          <i class="icon-plus"></i> 添加新前缀
        </button>
      </h3>

      <!-- 添加搜索框 -->
      <div class="card-search">
        <div class="search-container">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索前缀、ASN或国家..." 
            @input="debouncedSearchPrefixes"
            class="search-input"
          />
          <button class="btn btn-sm btn-primary" @click="searchPrefixes">
            <i class="icon-search"></i> 搜索
          </button>
          <button class="btn btn-sm btn-secondary" @click="resetSearch" v-if="searchQuery">
            <i class="icon-close"></i> 重置
          </button>
        </div>
      </div>

      <div class="card-body">
        <div v-if="definitionsLoading" class="loading-message">加载前缀列表中...</div>
        <div v-else>
          <table v-if="prefixes && prefixes.length > 0" class="table table-striped table-hover">
            <thead>
              <tr>
                <th>前缀</th>
                <th>ASN</th>
                <th>AS名称</th>
                <th>所属国家</th>
                <th>注册机构</th>
                <th>活跃IPv6地址数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prefix in prefixes" :key="prefix.prefix">
                <td>{{ prefix.prefix }}</td>
                <td>AS{{ prefix.asn }}</td>
                <td>{{ getAsnName(prefix.asn) }}</td>
                <td>
                  <span v-if="prefix.country_name_zh || prefix.country_name">
                    {{ prefix.country_name_zh || prefix.country_name }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>{{ prefix.registry || '-' }}</td>
                <td>{{ prefix.active_ipv6_count ?? 0 }}</td>
                <td>
                  <button @click="openPrefixModal('edit', prefix)" class="btn btn-sm btn-info mr-1">
                    <i class="icon-edit"></i> 编辑
                  </button>
                  <button @click="confirmDeletePrefix(prefix)" class="btn btn-sm btn-danger">
                    <i class="icon-delete"></i> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!storeError">暂无前缀数据。请添加新前缀。</p>
          <p v-if="storeError && (!prefixes || prefixes.length === 0)" class="error-message">
            加载前缀列表失败: {{ storeError }}
          </p>
        </div>
      </div>
    </section>

    <!-- 前缀编辑/创建模态框 -->
    <div v-if="showPrefixModal" class="modal-overlay" @click.self="closePrefixModal">
      <div class="modal-content">
        <h4>{{ modalMode === 'create' ? '添加新前缀' : '编辑前缀' }}</h4>
        <form @submit.prevent="handleSavePrefix">
          <div class="form-group">
            <label for="prefix">前缀 <span class="required">*</span></label>
            <input type="text" id="prefix" v-model="currentPrefix.prefix" required :="modalMode === 'edit'" />
            <small class="form-text text-muted">例如：2001:db8::/32</small>
          </div>
          <div class="form-group">
            <label for="prefix-length">前缀长度 <span class="required">*</span></label>
            <input type="number" id="prefix-length" v-model="currentPrefix.prefix_length" required min="1" max="128" />
            <small class="form-text text-muted">IPv6前缀长度范围：1-128</small>
          </div>
          <div class="form-group">
            <label for="prefix-asn">所属ASN <span class="required">*</span></label>
            <select id="prefix-asn" v-model="currentPrefix.asn" required>
              <option value="">选择ASN</option>
              <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
                AS{{ asn.asn }} - {{ asn.as_name_zh || asn.as_name }}
                ({{ getCountryName(asn.country_id) }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="prefix-registry">注册机构</label>
            <select id="prefix-registry" v-model="currentPrefix.registry">
              <option value="">选择注册机构</option>
              <option value="APNIC">APNIC</option>
              <option value="ARIN">ARIN</option>
              <option value="RIPE">RIPE</option>
              <option value="LACNIC">LACNIC</option>
              <option value="AFRINIC">AFRINIC</option>
            </select>
            <small class="form-text text-muted">如APNIC, ARIN等区域互联网注册机构</small>
          </div>
          <div class="form-group">
            <label for="active-ipv6-count">活跃IPv6地址数</label>
            <input type="number" id="active-ipv6-count" v-model="currentPrefix.active_ipv6_count" min="0" placeholder="0" />
            <small class="form-text text-muted">可选，表示该前缀下的活跃IPv6地址数量</small>
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="modalSubmitting">
              {{ modalSubmitting ? '保存中...' : '保存' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="closePrefixModal" :disabled="modalSubmitting">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import { storeToRefs } from 'pinia';

const store = useDatabaseStore();
const { asns, error: storeError } = storeToRefs(store);

// 全局消息
const globalError = ref('');
const globalSuccess = ref('');

// 前缀管理
const definitionsLoading = ref(false);
const showPrefixModal = ref(false);
const modalMode = ref('create'); // 'create' or 'edit'
const currentPrefix = ref({});
const modalSubmitting = ref(false);
const modalError = ref('');
const prefixes = ref([]);

const searchQuery = ref('');
const searchTimeout = ref(null);


const defaultPrefix = {
  prefix: '',
  prefix_length: '',
  asn: '',
  registry: ''
};

const getAsnName = (asn) => {
  if (!asn || !asns.value) return null;
  const asnObj = asns.value.find(a => a.asn === parseInt(asn)); // 确保类型匹配
  return asnObj ? (asnObj.as_name_zh || asnObj.as_name || '未知') : null;
};

const getCountryName = (countryId) => {
  if (!countryId) return null;
  // 从前缀对象中直接获取国家名称
  return countryId ? (store.countries.find(c => c.country_id === countryId)?.country_name_zh || 
                      store.countries.find(c => c.country_id === countryId)?.country_name || 
                      countryId) : null;
};


const debouncedSearchPrefixes = () => {
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    searchPrefixes();
  }, 300);
};

const searchPrefixes = async () => {
  if (searchQuery.value && searchQuery.value.length >= 2) {
    definitionsLoading.value = true;
    try {
      const results = await store.searchPrefixes(searchQuery.value);
      prefixes.value = results;
    } catch (error) {
      console.error('搜索前缀失败:', error);
      globalError.value = `搜索前缀失败: ${error.message}`;
    } finally {
      definitionsLoading.value = false;
    }
  } else {
    loadPrefixes();
  }
};

const resetSearch = () => {
  searchQuery.value = '';
  loadPrefixes();
};

const loadPrefixes = async () => {
  console.log('[PrefixManagementForm] 开始加载前缀列表...');
  definitionsLoading.value = true;
  globalError.value = '';
  try {
    const response = await store.getAllPrefixes(1, 1000);
    prefixes.value = response;
    if (storeError.value && !prefixes.value?.length) {
      globalError.value = `加载前缀列表失败: ${storeError.value}`;
    }
  } catch (error) {
    console.error('[PrefixManagementForm] 加载前缀列表失败:', error);
    globalError.value = `加载前缀列表时发生意外错误: ${error.message}`;
  } finally {
    definitionsLoading.value = false;
  }
};

// 修改loadAsns函数
const loadAsns = async () => {
  try {
    const asnData = await store.getAllAsns(1, 1000);
    // 确保asns.value被正确赋值
    if (Array.isArray(asnData)) {
      asns.value = asnData;
      console.log(`[PrefixManagementForm] 成功加载${asns.value.length}个ASN`);
    } else {
      console.warn('[PrefixManagementForm] ASN数据格式异常:', asnData);
      asns.value = [];
    }
  } catch (error) {
    console.error('[PrefixManagementForm] 加载ASN列表失败:', error);
    globalError.value = `加载ASN列表失败: ${error.message}`;
  }
};


function openPrefixModal(mode, prefix = null) {
  modalMode.value = mode;
  modalError.value = '';
  if (mode === 'create') {
    currentPrefix.value = { ...defaultPrefix };
  } else {
    currentPrefix.value = { ...prefix };
    // 确保前缀长度字段存在
    if (!currentPrefix.value.prefix_length && currentPrefix.value.prefix.includes('/')) {
      currentPrefix.value.prefix_length = currentPrefix.value.prefix.split('/')[1];
    }
  }
  showPrefixModal.value = true;
}

function closePrefixModal() {
  showPrefixModal.value = false;
  currentPrefix.value = {};
}

async function handleSavePrefix() {
  modalSubmitting.value = true;
  modalError.value = '';
  globalSuccess.value = '';
  try {
    // 从前缀中提取前缀长度（如果未手动输入）
    if (!currentPrefix.value.prefix_length && currentPrefix.value.prefix.includes('/')) {
      currentPrefix.value.prefix_length = currentPrefix.value.prefix.split('/')[1];
    }
    
    // 确保前缀长度是有效的整数
    if (!currentPrefix.value.prefix_length || isNaN(parseInt(currentPrefix.value.prefix_length))) {
      throw new Error('请输入有效的前缀长度');
    }
    
    // 确保包含所有必填字段
    const dataToSave = { 
      ...currentPrefix.value,
      prefix_length: parseInt(currentPrefix.value.prefix_length), // 确保是整数
      version: currentPrefix.value.prefix.includes(':') ? '6' : '4',
      country_id: currentPrefix.value.country_id || (currentPrefix.value.asn ? 
        asns.value.find(a => a.asn === parseInt(currentPrefix.value.asn))?.country_id : null)
    };
    
    if (modalMode.value === 'create') {
      await store.createPrefix(dataToSave);
      globalSuccess.value = '前缀创建成功!';
    } else {
      // 使用prefix_id作为标识，如果没有则使用prefix
      const idToUse = currentPrefix.value.prefix_id || currentPrefix.value.prefix;
      await store.updatePrefix(idToUse, dataToSave);
      globalSuccess.value = '前缀信息更新成功!';
    }
    
    await loadPrefixes(); // 重新加载前缀列表
    closePrefixModal();
    setTimeout(() => globalSuccess.value = '', 3000);
  } catch (error) {
    modalError.value = error.response?.data?.message || error.message || '保存失败';
  } finally {
    modalSubmitting.value = false;
  }
}

async function confirmDeletePrefix(prefix) {
  if (window.confirm(`确定要删除前缀 "${prefix.prefix}" 吗?`)) {
    definitionsLoading.value = true;
    globalError.value = '';
    globalSuccess.value = '';
    try {
      // 使用prefix_id作为标识，如果没有则使用prefix
      const idToUse = prefix.prefix_id || prefix.prefix;
      await store.deletePrefix(idToUse);
      globalSuccess.value = '前缀删除成功!';
      await loadPrefixes(); // 重新加载前缀列表
      setTimeout(() => globalSuccess.value = '', 3000);
    } catch (error) {
      globalError.value = error.response?.data?.message || error.message || '删除失败';
      setTimeout(() => globalError.value = '', 5000);
    } finally {
      definitionsLoading.value = false;
    }
  }
}

onMounted(async () => {
  console.log('[PrefixManagementForm] 组件挂载，开始加载数据...');
  try {
    // 先加载ASN数据，再加载前缀数据
    await loadAsns();
    console.log('[PrefixManagementForm] 数据加载完成，ASN数量:', asns.value.length);
    await loadPrefixes();
  } catch (error) {
    console.error('[PrefixManagementForm] 初始化数据加载失败:', error);
    globalError.value = `初始化数据加载失败: ${error.message}`;
  }
});
</script>

<style scoped>

/* 添加搜索框样式 */
.card-search {
  padding: 15px;
  border-bottom: 1px solid #eee;
  background-color: #f9f9f9;
}

.search-container {
  display: flex;
  gap: 10px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input:focus {
  border-color: #007bff;
  outline: none;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

/* 复用 CountryManagementForm 的样式 */
.prefix-management-form {
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

/* 消息提示 */
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

/* 表格样式 */
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

/* 按钮样式 */
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

/* 表单元素 */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input[type="text"],
.form-group select {
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
}

.form-group input:focus,
.form-group select:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
}

.required {
  color: #dc3545;
  margin-left: 2px;
}

.form-text {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.875em;
  color: #6c757d;
}

.text-muted {
  color: #6c757d;
  font-size: 0.875em;
}

/* 模态框样式 */
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

/* 图标 */
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

.icon-network:before { content: "🌐"; }
.icon-plus:before { content: "➕"; }
.icon-edit:before { content: "✏️"; }
.icon-delete:before { content: "🗑️"; }
</style> 