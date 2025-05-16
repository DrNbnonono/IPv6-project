<template>
  <div class="asn-management-form">
    <!-- 全局消息提示 -->
    <div v-if="globalError" class="error-message global-error">{{ globalError }}</div>
    <div v-if="globalSuccess" class="success-message global-success">{{ globalSuccess }}</div>

    <!-- ASN管理部分 -->
    <section class="asn-definitions-section card">
      <h3 class="card-header">
        <i class="icon-network"></i> ASN管理
        <button @click="openAsnModal('create')" class="btn btn-sm btn-success float-right">
          <i class="icon-plus"></i> 添加新ASN
        </button>
      </h3>
      <div class="card-body">
        <div v-if="definitionsLoading" class="loading-message">加载ASN列表中...</div>
        <div v-else>
          <table v-if="asns && asns.length > 0" class="table table-striped table-hover">
            <thead>
              <tr>
                <th>ASN</th>
                <th>AS名称(英文)</th>
                <th>AS名称(中文)</th>
                <th>所属国家</th>
                <th>组织</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asn in asns" :key="asn.asn">
                <td>AS{{ asn.asn }}</td>
                <td>{{ asn.as_name }}</td>
                <td>{{ asn.as_name_zh }}</td>
                <td>
                  <span v-if="getCountryName(asn.country_id)">
                    {{ getCountryName(asn.country_id) }}
                    <small class="text-muted">({{ asn.country_id }})</small>
                  </span>
                  <span v-else>-</span>
                </td>
                <td>{{ asn.organization || '-' }}</td>
                <td>
                  <button @click="openAsnModal('edit', asn)" class="btn btn-sm btn-info mr-1">
                    <i class="icon-edit"></i> 编辑
                  </button>
                  <button @click="confirmDeleteAsn(asn)" class="btn btn-sm btn-danger">
                    <i class="icon-delete"></i> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!storeError">暂无ASN数据。请添加新ASN。</p>
          <p v-if="storeError && (!asns || asns.length === 0)" class="error-message">
            加载ASN列表失败: {{ storeError }}
          </p>
        </div>
      </div>
    </section>

    <!-- ASN编辑/创建模态框 -->
    <div v-if="showAsnModal" class="modal-overlay" @click.self="closeAsnModal">
      <div class="modal-content">
        <h4>{{ modalMode === 'create' ? '添加新ASN' : '编辑ASN' }}</h4>
        <form @submit.prevent="handleSaveAsn">
          <div class="form-group">
            <label for="asn-number">ASN <span class="required">*</span></label>
            <input type="number" id="asn-number" v-model.number="currentAsn.asn" required :disabled="modalMode === 'edit'" />
            <small class="form-text text-muted">ASN为数字，例如：15169</small>
          </div>
          <div class="form-group">
            <label for="asn-name">AS名称(英文) <span class="required">*</span></label>
            <input type="text" id="asn-name" v-model="currentAsn.as_name" required />
          </div>
          <div class="form-group">
            <label for="asn-name-zh">AS名称(中文)</label>
            <input type="text" id="asn-name-zh" v-model="currentAsn.as_name_zh" />
          </div>
          <div class="form-group">
            <label for="asn-country">所属国家 <span class="required">*</span></label>
            <select id="asn-country" v-model="currentAsn.country_id" required>
              <option value="">选择国家</option>
              <option v-for="country in store.countries" :key="country.country_id" :value="country.country_id">
                {{ country.country_name_zh || country.country_name }} ({{ country.country_id }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="asn-organization">组织</label>
            <input type="text" id="asn-organization" v-model="currentAsn.organization" />
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="modalSubmitting">
              {{ modalSubmitting ? '保存中...' : '保存' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="closeAsnModal" :disabled="modalSubmitting">取消</button>
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
const { error: storeError } = storeToRefs(store);

// 全局消息
const globalError = ref('');
const globalSuccess = ref('');

// ASN管理
const definitionsLoading = ref(false);
const showAsnModal = ref(false);
const modalMode = ref('create'); // 'create' or 'edit'
const currentAsn = ref({});
const modalSubmitting = ref(false);
const modalError = ref('');
const asns = ref([]);

const defaultAsn = {
  asn: '',
  as_name: '',
  as_name_zh: '',
  country_id: '',
  organization: ''
};

// 获取国家名称的辅助函数
const getCountryName = (countryId) => {
  if (!countryId || !store.countries) return null;
  const country = store.countries.find(c => c.country_id === countryId);
  return country ? (country.country_name_zh || country.country_name) : null;
};

const loadAsns = async () => {
  console.log('[AsnManagementForm] 开始加载ASN列表...');
  definitionsLoading.value = true;
  globalError.value = '';
  try {
    const response = await store.getAllAsns(1, 1000);
    asns.value = response;
    if (storeError.value && !asns.value?.length) {
      globalError.value = `加载ASN列表失败: ${storeError.value}`;
    }
  } catch (error) {
    console.error('[AsnManagementForm] 加载ASN列表失败:', error);
    globalError.value = `加载ASN列表时发生意外错误: ${error.message}`;
  } finally {
    definitionsLoading.value = false;
  }
};

const loadCountries = async () => {
  try {
    await store.getCountries(1, 500, '');
    console.log('[AsnManagementForm] 加载国家列表完成，获取到', store.countries?.length, '个国家');
  } catch (error) {
    console.error('[AsnManagementForm] 加载国家列表失败:', error);
    globalError.value = `加载国家列表失败: ${error.message}`;
  }
};

function openAsnModal(mode, asn = null) {
  modalMode.value = mode;
  modalError.value = '';
  if (mode === 'create') {
    currentAsn.value = { ...defaultAsn };
  } else {
    currentAsn.value = { ...asn };
  }
  showAsnModal.value = true;
}

function closeAsnModal() {
  showAsnModal.value = false;
  currentAsn.value = {};
}

async function handleSaveAsn() {
  modalSubmitting.value = true;
  modalError.value = '';
  globalSuccess.value = '';
  try {
    const dataToSave = { ...currentAsn.value };
    
    if (modalMode.value === 'create') {
      await store.createAsn(dataToSave);
      globalSuccess.value = 'ASN创建成功!';
    } else {
      await store.updateAsn(currentAsn.value.asn, dataToSave);
      globalSuccess.value = 'ASN信息更新成功!';
    }
    await loadAsns(); // 重新加载ASN列表
    closeAsnModal();
    setTimeout(() => globalSuccess.value = '', 3000);
  } catch (error) {
    modalError.value = error.response?.data?.message || error.message || '保存失败';
  } finally {
    modalSubmitting.value = false;
  }
}

async function confirmDeleteAsn(asn) {
  if (window.confirm(`确定要删除ASN "${asn.as_name_zh || asn.as_name}" (AS${asn.asn})吗?`)) {
    definitionsLoading.value = true;
    globalError.value = '';
    globalSuccess.value = '';
    try {
      await store.deleteAsn(asn.asn);
      globalSuccess.value = 'ASN删除成功!';
      await loadAsns(); // 重新加载ASN列表
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
  console.log('[AsnManagementForm] 组件挂载，加载初始数据...');
  await Promise.all([loadCountries(), loadAsns()]);
});
</script>

<style scoped>
/* 复用 CountryManagementForm 的样式 */
.asn-management-form {
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
.form-group input[type="number"],
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