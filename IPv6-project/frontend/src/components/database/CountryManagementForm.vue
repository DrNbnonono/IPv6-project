<template>
  <div class="country-management-form">
    <!-- 全局消息提示 -->
    <div v-if="globalError" class="error-message global-error">{{ globalError }}</div>
    <div v-if="globalSuccess" class="success-message global-success">{{ globalSuccess }}</div>

    

    <!-- 国家管理部分 -->
    <section class="country-definitions-section card">
      <h3 class="card-header">
        <i class="icon-globe"></i> 国家管理
        <button @click="openCountryModal('create')" class="btn btn-sm btn-success float-right">
          <i class="icon-plus"></i> 添加新国家
        </button>
      </h3>

      <!-- 搜索和分页控制 -->
      <div class="card-search">
        <div class="search-container">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索国家..." 
            @input="handleSearch"
            class="search-input"
          />
          <button class="btn btn-sm btn-primary" @click="loadCountries">
            <i class="icon-search"></i> 搜索
          </button>
          <button class="btn btn-sm btn-secondary" @click="resetSearch" v-if="searchQuery">
            <i class="icon-close"></i> 重置
          </button>
        </div>
      </div>
      
      <div class="card-body">
        <div v-if="store.countriesLoading" class="loading-message">加载国家列表中...</div>
        <div v-else>
          <table v-if="store.countries && store.countries.length > 0" class="table table-striped table-hover">
            <thead>
              <tr>
                <th>国家ID</th>
                <th>国家名称(英文)</th>
                <th>国家名称(中文)</th>
                <th>地区</th>
                <th>子地区</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="country in store.countries" :key="country.country_id">
                <td>{{ country.country_id }}</td>
                <td>{{ country.country_name }}</td>
                <td>{{ country.country_name_zh }}</td>
                <td>{{ country.region || '-' }}</td>
                <td>{{ country.subregion || '-' }}</td>
                <td>
                  <button @click="openCountryModal('edit', country)" class="btn btn-sm btn-info mr-1">
                    <i class="icon-edit"></i> 编辑
                  </button>
                  <button @click="confirmDeleteCountry(country)" class="btn btn-sm btn-danger">
                    <i class="icon-delete"></i> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!store.countriesError">暂无国家数据。请添加新国家。</p>
          <p v-if="store.countriesError" class="error-message">
            加载国家列表失败: {{ store.countriesError }}
          </p>
        </div>

        <!-- 分页控件 -->
        <div class="pagination-controls" v-if="store.countriesPagination.pages > 1">
          <button 
            class="btn btn-sm btn-outline-primary" 
            :disabled="currentPage === 1"
            @click="changePage(1)"
          >
            首页
          </button>
          <button 
            class="btn btn-sm btn-outline-primary" 
            :disabled="currentPage === 1"
            @click="changePage(currentPage - 1)"
          >
            上一页
          </button>
          
          <!-- 页码选择器 -->
          <div class="page-selector">
            <span>跳转到:</span>
            <select v-model="currentPage" @change="changePage(currentPage)">
              <option v-for="page in store.countriesPagination.pages" :key="page" :value="page">
                {{ page }}
              </option>
            </select>
            <span class="total-pages">/ {{ store.countriesPagination.pages }} 页</span>
          </div>
          
          <button 
            class="btn btn-sm btn-outline-primary"
            :disabled="currentPage === store.countriesPagination.pages"
            @click="changePage(currentPage + 1)"
          >
            下一页
          </button>
          <button 
            class="btn btn-sm btn-outline-primary"
            :disabled="currentPage === store.countriesPagination.pages"
            @click="changePage(store.countriesPagination.pages)"
          >
            末页
          </button>
        </div>
      </div>
    </section>

    <!-- 国家编辑/创建模态框 -->
    <div v-if="showCountryModal" class="modal-overlay" @click.self="closeCountryModal">
      <div class="modal-content">
        <h4>{{ modalMode === 'create' ? '添加新国家' : '编辑国家' }}</h4>
        <form @submit.prevent="handleSaveCountry">
          <div class="form-group">
            <label for="country-id">国家ID <span class="required">*</span></label>
            <input type="text" id="country-id" v-model="currentCountry.country_id" required maxlength="2" :disabled="modalMode === 'edit'" />
            <small class="form-text text-muted">国家ID为2位字母代码，例如：CN, US</small>
          </div>
          <div class="form-group">
            <label for="country-name">国家名称(英文) <span class="required">*</span></label>
            <input type="text" id="country-name" v-model="currentCountry.country_name" required />
          </div>
          <div class="form-group">
            <label for="country-name-zh">国家名称(中文) <span class="required">*</span></label>
            <input type="text" id="country-name-zh" v-model="currentCountry.country_name_zh" required />
          </div>
          <div class="form-group">
            <label for="country-region">地区</label>
            <input type="text" id="country-region" v-model="currentCountry.region" />
          </div>
          <div class="form-group">
            <label for="country-subregion">子地区</label>
            <input type="text" id="country-subregion" v-model="currentCountry.subregion" />
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="modalSubmitting">
              {{ modalSubmitting ? '保存中...' : '保存' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="closeCountryModal" :disabled="modalSubmitting">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import { storeToRefs } from 'pinia';
import { debounce } from 'lodash';

const store = useDatabaseStore();
const { countries, error: storeError } = storeToRefs(store);

// 全局消息
const globalError = ref('');
const globalSuccess = ref('');

// 国家管理
const definitionsLoading = ref(false);
const showCountryModal = ref(false);
const modalMode = ref('create'); // 'create' or 'edit'
const currentCountry = ref({});
const modalSubmitting = ref(false);
const modalError = ref('');

const currentPage = ref(1);
const searchQuery = ref('');

// 搜索处理
const handleSearch = debounce(() => {
  currentPage.value = 1;
  loadCountries();
}, 300);

const defaultCountry = {
  country_id: '',
  country_name: '',
  country_name_zh: '',
  region: '',
  subregion: ''
};
const resetSearch = () => {
  searchQuery.value = '';
  currentPage.value = 1;
  loadCountries();
};
const loadCountries = async () => {
  console.log('[CountryManagementForm] 开始加载国家列表...');
  definitionsLoading.value = true;
  globalError.value = '';
  try {
    // 确保传递正确的参数格式
    await store.getCountries(currentPage.value, 50, searchQuery.value);
    console.log('[CountryManagementForm] 国家列表加载结果:', {
      count: store.countries.length,
      error: store.countriesError,
      pagination: store.countriesPagination
    });
    if (store.countriesError) {
      globalError.value = `加载国家列表失败: ${store.countriesError}`;
    }
  } catch (error) {
    console.error('[CountryManagementForm] 加载国家列表失败:', error);
    globalError.value = `加载国家列表时发生意外错误: ${error.message}`;
  } finally {
    definitionsLoading.value = false;
  }
};

function openCountryModal(mode, country = null) {
  modalMode.value = mode;
  modalError.value = '';
  if (mode === 'create') {
    currentCountry.value = { ...defaultCountry };
  } else {
    currentCountry.value = { ...country };
  }
  showCountryModal.value = true;
}

function closeCountryModal() {
  showCountryModal.value = false;
  currentCountry.value = {};
}

async function handleSaveCountry() {
  modalSubmitting.value = true;
  modalError.value = '';
  globalSuccess.value = '';
  try {
    const dataToSave = { ...currentCountry.value };
    
    if (modalMode.value === 'create') {
      await store.createCountry(dataToSave);
      globalSuccess.value = '国家创建成功!';
    } else {
      await store.updateCountry(currentCountry.value.country_id, dataToSave);
      globalSuccess.value = '国家信息更新成功!';
    }
    closeCountryModal();
    setTimeout(() => globalSuccess.value = '', 3000);
  } catch (error) {
    modalError.value = error.response?.data?.message || error.message || '保存失败';
  } finally {
    modalSubmitting.value = false;
  }
}

async function confirmDeleteCountry(country) {
  if (window.confirm(`确定要删除国家 "${country.country_name_zh}" (${country.country_id})吗?`)) {
    definitionsLoading.value = true;
    globalError.value = '';
    globalSuccess.value = '';
    try {
      await store.deleteCountry(country.country_id);
      globalSuccess.value = '国家删除成功!';
      setTimeout(() => globalSuccess.value = '', 3000);
    } catch (error) {
      globalError.value = error.response?.data?.message || error.message || '删除失败';
      setTimeout(() => globalError.value = '', 5000);
    } finally {
      definitionsLoading.value = false;
    }
  }
}

// 切换页面
const changePage = (page) => {
  console.log(`[CountryManagementForm] 切换到第 ${page} 页`);
  currentPage.value = page;
  loadCountries();
};

// 监听搜索查询变化
watch(searchQuery, () => {
  handleSearch();
});

watch(() => store.countries, (val) => {
  console.log('[组件] store.countries 变化:', {
    length: val?.length || 0,
    first: val && val.length > 0 ? val[0] : null,
    error: store.countriesError
  });
});

onMounted(() => {
  console.log('[CountryManagementForm] 组件挂载，加载初始数据...');
  loadCountries();
});
</script>

<style scoped>
/* 复用 VulnerabilityManagementForm 的样式 */
.country-management-form {
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

.form-group input[type="text"] {
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

.form-group input:focus {
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

.icon-globe:before { content: "🌍"; }
.icon-plus:before { content: "➕"; }
.icon-edit:before { content: "✏️"; }
.icon-delete:before { content: "🗑️"; }

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

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #dee2e6;
}

.pagination-controls select {
  padding: 0.25rem;
  border: 1px solid #ced4da;
  border-radius: 0.2rem;
  font-size: 0.9rem;
  width: 60px;
  text-align: center;
}

.btn-outline-primary {
  color: #007bff;
  background-color: transparent;
  border-color: #007bff;
}

.btn-outline-primary:hover:not(:disabled) {
  color: #fff;
  background-color: #007bff;
  border-color: #007bff;
}

.btn-outline-primary:disabled {
  color: #6c757d;
  border-color: #6c757d;
}

.page-info {
  color: #6c757d;
  font-size: 0.9rem;
}

.page-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-selector span {
  color: #6c757d;
  font-size: 0.9rem;
}

.total-pages {
  color: #6c757d;
  font-size: 0.9rem;
}
</style>