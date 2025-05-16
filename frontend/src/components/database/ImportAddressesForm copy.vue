<template>
  <div class="import-form">
    <!-- 国家选择 -->
    <div class="form-group">
      <label for="country">国家</label>
      <div class="country-select-container">
        <!-- 国家搜索输入框 -->
        <div class="search-container">
          <input
            id="countrySearch"
            v-model="countrySearch"
            type="text"
            placeholder="输入国家名称搜索"
            @input="searchCountries"
          />
          <ul v-if="matchedCountries.length" class="search-results">
            <li
              v-for="country in matchedCountries"
              :key="country.country_id"
              @click="selectCountry(country)"
            >
              {{ country.country_name_zh || country.country_name }}
            </li>
          </ul>
          <div v-if="countryError" class="error-message">
            {{ countryError }}
          </div>
        </div>
        <!-- 国家下拉选择 -->
        <select 
          id="country" 
          v-model="formData.countryId" 
          required 
          @change="handleCountryChange"
          class="country-dropdown"
        >
          <option value="">从列表选择国家</option>
          <option v-for="country in sortedCountries" :key="country.country_id" :value="country.country_id">
            {{ country.country_name_zh || country.country_name }}
          </option>
        </select>
      </div>
    </div>
    
    <!-- ASN 选择 -->
    <div class="form-group">
      <label for="asn">ASN</label>
      <div class="input-select-container">
        <!-- 输入搜索部分 -->
        <div class="search-container">
          <input
            id="asn"
            v-model="formData.asn"
            type="text"
            placeholder="输入ASN编号或名称"
            @input="searchAsns"
            required
          />
          <ul v-if="matchedAsns.length" class="search-results">
            <li
              v-for="asn in matchedAsns"
              :key="asn.asn"
              @click="selectAsn(asn)"
            >
              {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
            </li>
          </ul>
        </div>
        <!-- 下拉选择部分 -->
        <select 
          v-model="formData.asn" 
          class="dropdown-select"
          @change="handleAsnSelect"
        >
          <option value="">从列表选择</option>
          <option 
            v-for="asn in filteredAsns" 
            :key="asn.asn" 
            :value="asn.asn"
          >
            {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
          </option>
        </select>
      </div>
    </div>
    
    <!-- 前缀选择 -->
    <div class="form-group">
      <label for="prefix">IPv6前缀</label>
      <div class="search-container">
        <input
          id="prefix"
          v-model="formData.prefix"
          type="text"
          placeholder="例如: 2001:db8::/32"
          @input="searchPrefixes"
          required
        />
        <ul v-if="matchedPrefixes.length" class="search-results">
          <li
            v-for="prefix in matchedPrefixes"
            :key="prefix.prefix_id"
            @click="selectPrefix(prefix)"
          >
            {{ prefix.prefix }} ({{ prefix.country_name_zh || prefix.country_name }})
          </li>
        </ul>
      </div>
    </div>
    
    <!-- 文件来源选择 -->
    <div class="form-group">
      <label>文件来源</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" v-model="fileSource" value="upload" />
          <span>上传新文件</span>
        </label>
        <label class="radio-label">
          <input type="radio" v-model="fileSource" value="whitelist" />
          <span>从白名单导入</span>
        </label>
      </div>
    </div>
    
    <!-- 上传新文件 -->
    <div v-if="fileSource === 'upload'" class="form-group">
      <label for="file">IPv6地址文件</label>
      <div class="file-upload">
        <input 
          id="file" 
          type="file" 
          @change="handleFileChange" 
          accept=".txt"
          ref="fileInput"
        />
        <div class="file-info">
          <span v-if="!selectedFile">点击或拖拽文件到此处</span>
          <span v-else>{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</span>
        </div>
      </div>
      <p class="file-hint">支持TXT格式，每行一个IPv6地址</p>
    </div>
    
    <!-- 从白名单选择 -->
    <div v-if="fileSource === 'whitelist'" class="form-group">
      <label for="whitelist">选择白名单文件</label>
      <select id="whitelist" v-model="selectedWhitelist" @change="handleWhitelistSelect" class="full-width">
        <option value="">请选择白名单文件</option>
        <option 
          v-for="whitelist in whitelists" 
          :key="whitelist.id" 
          :value="whitelist.id"
        >
          {{ whitelist.file_name }} ({{ formatDate(whitelist.uploaded_at) }})
        </option>
      </select>
      <div v-if="selectedWhitelistInfo" class="whitelist-info">
        <p><strong>描述:</strong> {{ selectedWhitelistInfo.description || '无描述' }}</p>
        <p><strong>上传时间:</strong> {{ formatDate(selectedWhitelistInfo.uploaded_at) }}</p>
        <p><strong>上传用户:</strong> {{ selectedWhitelistInfo.username }}</p>
      </div>
    </div>
    
    <div class="form-actions">
      <button 
        class="btn btn-primary" 
        @click="handleImport" 
        :disabled="isLoading || !isFormValid"
      >
        <i class="icon-import"></i>
        {{ isLoading ? '导入中...' : '开始导入' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useDetectionStore } from '@/stores/detection';
import axios from 'axios';
import api from '@/api';

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['import-addresses']);

const detectionStore = useDetectionStore();
const countries = ref([]);
const asns = ref([]);
const filteredAsns = ref([]);
const selectedFile = ref(null);
const matchedAsns = ref([]);
const matchedPrefixes = ref([]);
const matchedCountries = ref([]);
const countrySearch = ref('');
const countryError = ref('');
const fileSource = ref('upload');
const whitelists = ref([]);
const selectedWhitelist = ref('');
const selectedWhitelistInfo = ref(null);
const loading = ref(true);

// 表单数据
const formData = ref({
  countryId: '',
  asn: '',
  prefix: '',
  format: 'txt'
});

// 按中文名称排序国家列表
const sortedCountries = computed(() => {
  return [...countries.value].sort((a, b) => {
    const nameA = a.country_name_zh || a.country_name;
    const nameB = b.country_name_zh || b.country_name;
    return nameA.localeCompare(nameB, 'zh-CN');
  });
});

// 表单验证
const isFormValid = computed(() => {
  if (fileSource.value === 'upload') {
    return formData.value.countryId && 
           formData.value.asn && 
           formData.value.prefix && 
           selectedFile.value;
  } else {
    return formData.value.countryId && 
           formData.value.asn && 
           formData.value.prefix && 
           selectedWhitelist.value;
  }
});

// 加载国家和ASN数据
const loadData = async () => {
  try {
    loading.value = true;
    console.log('开始加载基础数据...');
    
    // 并行加载数据
    await Promise.all([
      loadCountries(),
      loadAsns(),
      fetchWhitelists()
    ]);
    
    console.log('所有基础数据加载完成');
    loading.value = false;
  } catch (error) {
    console.error('加载数据失败:', error);
    loading.value = false;
  }
};

// 加载国家数据
const loadCountries = async () => {
  try {
    console.log('开始加载国家数据...');
    const response = await axios.get('/api/addresses/countries/ranking', {
      params: { limit: 250 }
    });
    
    if (!response.data || !response.data.data) {
      console.error('国家数据响应格式错误:', response);
      throw new Error('国家数据响应格式错误');
    }
    
    countries.value = response.data.data;
    console.log(`成功加载${countries.value.length}个国家`);
  } catch (error) {
    console.error('加载国家数据失败:', error);
    throw error;
  }
};

// 加载ASN数据
const loadAsns = async () => {
  try {
    console.log('开始加载ASN数据...');
    const response = await axios.get('/api/addresses/asns/ranking', {
      params: { limit: 250 }
    });
    
    if (!response.data || !response.data.data) {
      console.error('ASN数据响应格式错误:', response);
      throw new Error('ASN数据响应格式错误');
    }
    
    asns.value = response.data.data;
    filteredAsns.value = asns.value;
    console.log(`成功加载${asns.value.length}个ASN`);
  } catch (error) {
    console.error('加载ASN数据失败:', error);
    throw error;
  }
};

// 加载特定国家的ASN
const loadAsnsByCountry = async (countryId) => {
  try {
    console.log(`加载国家ID ${countryId} 的ASN...`);
    const response = await axios.get(`/api/database/countries/${countryId}/asns`);
    
    if (!response.data || !response.data.data) {
      console.error('国家ASN响应格式错误:', response);
      return;
    }
    
    filteredAsns.value = response.data.data;
    console.log(`成功加载${filteredAsns.value.length}个国家ASN`);
  } catch (error) {
    console.error(`加载国家ID ${countryId} 的ASN失败:`, error);
    // 如果API失败，尝试从本地过滤
    filteredAsns.value = asns.value.filter(asn => asn.country_id === countryId);
  }
};

// 获取白名单列表
const fetchWhitelists = async () => {
  try {
    console.log('开始加载白名单列表...');
    const response = await axios.get('/api/xmap/whitelists', {
      params: {
        tool: 'database',
        page: 1,
        pageSize: 100
      }
    });
    
    if (response.data.success) {
      whitelists.value = response.data.data;
      console.log(`成功加载${whitelists.value.length}个白名单`);
    }
  } catch (error) {
    console.error('获取白名单列表失败:', error);
  }
};

// 搜索国家
const searchCountries = () => {
  countryError.value = '';
  
  if (!countrySearch.value || countrySearch.value.length < 2) {
    matchedCountries.value = [];
    return;
  }
  
  const query = countrySearch.value.toLowerCase();
  matchedCountries.value = countries.value.filter(country => {
    const nameCN = (country.country_name_zh || '').toLowerCase();
    const nameEN = (country.country_name || '').toLowerCase();
    return nameCN.includes(query) || nameEN.includes(query);
  }).slice(0, 5);
  
  if (matchedCountries.value.length === 0) {
    countryError.value = '未找到匹配的国家';
  }
};

// 选择国家
const selectCountry = (country) => {
  formData.value.countryId = country.country_id;
  countrySearch.value = country.country_name_zh || country.country_name;
  matchedCountries.value = [];
  
  // 清空ASN和前缀
  formData.value.asn = '';
  formData.value.prefix = '';
  
  // 加载该国家的ASN
  loadAsnsByCountry(country.country_id);
};

// 处理国家变更
const handleCountryChange = () => {
  // 清空ASN和前缀
  formData.value.asn = '';
  formData.value.prefix = '';
  
  // 如果通过下拉框选择了国家，更新搜索框
  if (formData.value.countryId) {
    const country = countries.value.find(c => c.country_id === formData.value.countryId);
    if (country) {
      countrySearch.value = country.country_name_zh || country.country_name;
    }
    
    // 加载该国家的ASN
    loadAsnsByCountry(formData.value.countryId);
  } else {
    filteredAsns.value = asns.value;
  }
};

// 处理文件选择
const handleFileChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
  }
};

// 处理白名单选择
const handleWhitelistSelect = async () => {
  if (!selectedWhitelist.value) {
    selectedWhitelistInfo.value = null;
    return;
  }
  
  try {
    // 获取白名单详情
    const response = await axios.get(`/api/xmap/whitelist/${selectedWhitelist.value}`);
    if (response.data.success) {
      selectedWhitelistInfo.value = response.data.data;
    }
  } catch (error) {
    console.error('获取白名单详情失败:', error);
    selectedWhitelistInfo.value = null;
  }
};

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 搜索ASN
const searchAsns = async () => {
  if (!formData.value.asn || formData.value.asn.length < 2) {
    matchedAsns.value = [];
    return;
  }

  try {
    const response = await axios.get('/api/database/asns/search', {
      params: {
        query: formData.value.asn,
        limit: 5,
        country_id: formData.value.countryId || undefined
      }
    });
    matchedAsns.value = response.data.data || [];
  } catch (error) {
    console.error('搜索ASN失败:', error);
    matchedAsns.value = [];
  }
};

// 选择ASN
const selectAsn = (asn) => {
  formData.value.asn = asn.asn;
  matchedAsns.value = [];
  
  // 如果 ASN 有关联的国家，自动设置国家
  if (asn.country_id) {
    formData.value.countryId = asn.country_id;
    // 更新国家搜索框
    const country = countries.value.find(c => c.country_id === asn.country_id);
    if (country) {
      countrySearch.value = country.country_name_zh || country.country_name;
    }
  }
};

// 添加 ASN 下拉选择处理函数
const handleAsnSelect = () => {
  // 清空搜索结果
  matchedAsns.value = [];
  
  // 如果选择了 ASN，查找对应的国家并设置
  if (formData.value.asn) {
    const selectedAsn = asns.value.find(a => a.asn == formData.value.asn);
    if (selectedAsn && selectedAsn.country_id) {
      formData.value.countryId = selectedAsn.country_id;
      // 更新国家搜索框
      const country = countries.value.find(c => c.country_id === selectedAsn.country_id);
      if (country) {
        countrySearch.value = country.country_name_zh || country.country_name;
      }
    }
  }
};

// 搜索前缀
const searchPrefixes = async () => {
  if (!formData.value.prefix || formData.value.prefix.length < 2) {
    matchedPrefixes.value = [];
    return;
  }

  try {
    const response = await axios.get('/api/database/prefixes/search', {
      params: {
        query: formData.value.prefix,
        limit: 5,
        country_id: formData.value.countryId || undefined
      }
    });
    matchedPrefixes.value = response.data.data || [];
  } catch (error) {
    console.error('搜索前缀失败:', error);
    matchedPrefixes.value = [];
  }
};

// 选择前缀
const selectPrefix = (prefix) => {
  formData.value.prefix = prefix.prefix;
  matchedPrefixes.value = [];
  
  // 如果前缀有关联的国家，自动设置国家
  if (prefix.country_id) {
    formData.value.countryId = prefix.country_id;
    // 更新国家搜索框
    const country = countries.value.find(c => c.country_id === prefix.country_id);
    if (country) {
      countrySearch.value = country.country_name_zh || country.country_name;
    }
    
    // 加载该国家的ASN
    loadAsnsByCountry(prefix.country_id);
  }
  
  // 如果前缀有关联的 ASN，自动设置 ASN
  if (prefix.asn) {
    formData.value.asn = prefix.asn;
  }
};

// 处理导入
const handleImport = async () => {
  if (!isFormValid.value) return;

  try {
    let addresses = [];
    
    if (fileSource.value === 'upload') {
      const fileContent = await readFile(selectedFile.value);
      addresses = fileContent.split(/\r?\n/)
        .filter(line => line.trim())
        .map(addr => addr.trim());
    } else {
      const response = await axios.get(`/api/xmap/whitelist/${selectedWhitelist.value}/content`);
      if (response.data.success) {
        addresses = response.data.data.split(/\r?\n/)
          .filter(line => line.trim())
          .map(addr => addr.trim());
      }
    }

    if (addresses.length === 0) {
      throw new Error('未找到有效的IPv6地址');
    }

    // 添加调试日志
    console.log('准备导入的地址:', {
      countryId: formData.value.countryId,
      asn: formData.value.asn,
      prefix: formData.value.prefix,
      addressCount: addresses.length,
      sampleAddresses: addresses.slice(0, 5)
    });

    const importData = {
      countryId: formData.value.countryId,
      asn: formData.value.asn,
      prefix: formData.value.prefix,
      addresses: addresses
    };
    
    emit('import-addresses', importData);
  } catch (error) {
    console.error('导入失败详情:', {
      error: error,
      response: error.response?.data
    });
    alert(`导入失败: ${error.response?.data?.message || error.message}`);
  }
};

// 读取文件内容
const readFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    
    reader.onerror = (e) => {
      reject(new Error('文件读取失败'));
    };
    
    reader.readAsText(file);
  });
};

// 监听国家ID变化，更新国家搜索框
watch(() => formData.value.countryId, (newVal) => {
  if (newVal) {
    const country = countries.value.find(c => c.country_id === newVal);
    if (country && !countrySearch.value) {
      countrySearch.value = country.country_name_zh || country.country_name;
    }
  } else {
    countrySearch.value = '';
  }
});

onMounted(() => {
  loadData();
});
</script>

<style scoped lang="scss">
.import-form {
  max-width: 800px;
}

.form-group {
  margin-bottom: 1.5rem;
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #4a5568;
  }
  
  input, select {
    width: 100%;
    padding: 0.8rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.95rem;
    
    &:focus {
      outline: none;
      border-color: #42b983;
    }
  }
}

.full-width {
  width: 100%;
}

.country-select-container,
.input-select-container {
  display: flex;
  gap: 10px;
  
  .search-container {
    flex: 2;
  }
  
  .country-dropdown,
  .dropdown-select {
    flex: 1;
    min-width: 150px;
  }
}

.search-container {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0 0 6px 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 10;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    padding: 0.5rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid #f1f1f1;

    &:hover {
      background-color: #f8fafc;
    }

    &:last-child {
      border-bottom: none;
    }
  }
}

.error-message {
  color: #e53e3e;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.radio-group {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.5rem;
  
  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    
    input[type="radio"] {
      width: auto;
    }
  }
}

.file-upload {
  position: relative;
  border: 1px dashed #e2e8f0;
  border-radius: 6px;
  padding: 1.5rem;
  text-align: center;
  background-color: #f8fafc;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #42b983;
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
  
  .file-info {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #718096;
  }
}

.file-hint {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: #a0aec0;
}

.whitelist-info {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  font-size: 0.9rem;
  
  p {
    margin: 0.25rem 0;
    color: #4a5568;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 2rem;
}

.btn {
  padding: 0.8rem 1.5rem;
  border-radius: 6px;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  
  &-primary {
    background-color: #42b983;
    color: white;
    
    &:hover {
      background-color: #3aa876;
    }
    
    &:disabled {
      background-color: #a0aec0;
      cursor: not-allowed;
    }
  }
}

.icon-import:before { content: "📥"; }
</style>