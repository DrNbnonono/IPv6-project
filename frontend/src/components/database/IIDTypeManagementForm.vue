<template>
    <div class="iid-form">
      <div v-if="loading" class="loading-message">
        加载中，请稍候...
      </div>
      <div v-else>
        <div class="form-group">
          <label for="iidType">IID类型</label>
          <select id="iidType" v-model="formData.iidTypeId" required>
            <option value="">选择IID类型</option>
            <option v-for="type in iidTypes" :key="type.type_id" :value="type.type_id">
              {{ type.type_name }} {{ type.is_risky ? '(风险)' : '' }}
            </option>
          </select>
          <div class="form-hint" v-if="selectedIIDType">
            {{ selectedIIDType.description }}
          </div>
        </div>
        
        <div class="form-group">
          <label>检测状态</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" v-model="formData.isDetected" :value="true" />
              <span>已检测到</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="formData.isDetected" :value="false" />
              <span>未检测到</span>
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <label for="addressFile">IPv6地址文件 <span class="required">*</span></label>
          <div class="file-upload">
            <input 
              id="addressFile" 
              type="file" 
              @change="handleAddressFileChange" 
              accept=".txt,.csv,.json"
            />
            <div class="file-info">
              <span v-if="!selectedAddressFile">未选择文件</span>
              <span v-else>{{ selectedAddressFile.name }} ({{ formatFileSize(selectedAddressFile.size) }})</span>
            </div>
          </div>
          <p class="file-hint">支持TXT（每行一个地址）、CSV或JSON格式</p>
        </div>
        
        <!-- 筛选条件部分 - 保留但设为必填 -->
        <div class="filter-form">
          <div class="form-group">
            <label for="country">国家 <span class="required">*</span></label>
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
            <select id="country" v-model="formData.countryId" @change="handleCountryChange" required>
              <option value="">请选择国家</option>
              <option v-for="country in sortedCountries" :key="country.country_id" :value="country.country_id">
                {{ country.country_name_zh || country.country_name }}
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="asn">ASN <span class="required">*</span></label>
            <div class="search-container">
              <input
                id="asnSearch"
                v-model="asnSearch"
                type="text"
                placeholder="输入ASN编号或名称"
                @input="searchAsns"
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
            <select id="asn" v-model="formData.asn" @change="handleAsnChange" required>
              <option value="">请选择ASN</option>
              <option v-for="asn in filteredAsns" :key="asn.asn" :value="asn.asn">
                {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
              </option>
            </select>
          </div>
        </div>
        
        <!-- 添加前缀选择功能 -->
        <div class="form-group">
          <label for="prefix">IPv6前缀 <span class="optional">(可选)</span></label>
          <div class="search-container">
            <input
              id="prefixSearch"
              v-model="prefixSearch"
              type="text"
              placeholder="输入IPv6前缀搜索"
              @input="searchPrefixes"
            />
            <ul v-if="matchedPrefixes.length" class="search-results">
              <li
                v-for="prefix in matchedPrefixes"
                :key="prefix.prefix_id || prefix.prefix"
                @click="selectPrefix(prefix)"
              >
                {{ prefix.prefix }} ({{ prefix.address_count || '未知' }}个地址)
              </li>
            </ul>
          </div>
          <select id="prefix" v-model="selectedPrefix" @change="handlePrefixChange">
            <option value="">全部前缀</option>
            <option v-for="prefix in prefixes" :key="prefix.prefix_id || prefix.prefix" :value="prefix.prefix_id || prefix.prefix">
              {{ prefix.prefix }} ({{ prefix.address_count || '未知' }}个地址)
            </option>
          </select>
          <div v-if="selectedPrefixInfo" class="prefix-info">
            <div class="info-item">
              <span class="label">前缀:</span>
              <span class="value">{{ selectedPrefixInfo.prefix }}</span>
            </div>
            <div class="info-item">
              <span class="label">地址数量:</span>
              <span class="value">{{ selectedPrefixInfo.address_count || '未知' }}</span>
            </div>
            <div class="info-item" v-if="selectedPrefixInfo.allocation_date">
              <span class="label">分配日期:</span>
              <span class="value">{{ formatDate(selectedPrefixInfo.allocation_date) }}</span>
            </div>
          </div>
        </div>
        
        <div class="form-actions">
          <button 
            class="btn btn-primary" 
            @click="handleUpdateIIDTypes" 
            :disabled="isLoading || !isFormValid"
          >
            <i class="icon-update"></i>
            {{ isLoading ? '更新中...' : '更新IID类型' }}
          </button>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import api from '@/api';
import { useDatabaseStore } from '@/stores/database';  // 添加这行导入
  const props = defineProps({
    isLoading: {
      type: Boolean,
      default: false
    }
  });
  
  const emit = defineEmits(['update-iid-types']);
  
  const countries = ref([]);
  const asns = ref([]);
  const filteredAsns = ref([]);
  const iidTypes = ref([]);
  const prefixes = ref([]);
  const selectedAddressFile = ref(null);
  const loading = ref(true);
  const countrySearch = ref('');
  const asnSearch = ref('');
  const prefixSearch = ref('');
  const matchedCountries = ref([]);
  const matchedAsns = ref([]);
  const matchedPrefixes = ref([]);
  const countryError = ref('');
  const selectedPrefix = ref('');
  const selectedPrefixInfo = ref(null);
  const isSearchingPrefixes = ref(false);
  
  const formData = ref({
    iidTypeId: '',
    isDetected: true,
    countryId: '',
    asn: '',
    addresses: []
  });
  
  // 按中文名称排序国家列表
  const sortedCountries = computed(() => {
    return [...countries.value].sort((a, b) => {
      const nameA = a.country_name_zh || a.country_name;
      const nameB = b.country_name_zh || b.country_name;
      return nameA.localeCompare(nameB, 'zh-CN');
    });
  });
  
  // 选中的IID类型
  const selectedIIDType = computed(() => {
    if (!formData.value.iidTypeId) return null;
    return iidTypes.value.find(type => type.type_id === formData.value.iidTypeId);
  });
  
  // 修改表单验证逻辑，要求必须有文件、国家和ASN
  const isFormValid = computed(() => {
    return (
      !!formData.value.iidTypeId && 
      !!selectedAddressFile.value && 
      !!formData.value.countryId && 
      !!formData.value.asn
    );
  });
  
  // 加载基础数据
  const loadData = async () => {
    try {
      loading.value = true;
      console.log('开始加载IID类型组件基础数据...');
      
      // 并行加载数据
      await Promise.all([
        loadCountries(),
        loadAsns(),
        loadIIDTypes()
      ]);
      
      console.log('所有IID类型组件基础数据加载完成');
      loading.value = false;
    } catch (error) {
      console.error('加载IID类型组件数据失败:', error);
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
  
  // 加载IID类型
  const loadIIDTypes = async () => {
    try {
      console.log('开始加载IID类型...');
      const response = await axios.get('/api/database/address-types');
      
      if (!response.data || !response.data.data) {
        console.error('IID类型响应格式错误:', response);
        throw new Error('IID类型响应格式错误');
      }
      
      iidTypes.value = response.data.data;
      console.log(`成功加载${iidTypes.value.length}个IID类型`);
    } catch (error) {
      console.error('加载IID类型失败:', error);
      throw error;
    }
  };
  
  // 加载特定国家和ASN的前缀
  const loadPrefixes = async () => {
    if (!formData.value.countryId || !formData.value.asn) {
      prefixes.value = [];
      selectedPrefix.value = '';
      selectedPrefixInfo.value = null;
      return;
    }
    
    try {
      console.log(`加载ASN ${formData.value.asn} 的前缀...`);
      // 修改API路径为正确的路径
      const response = await axios.get(`/api/database/asns/${formData.value.asn}/prefixes`);
      
      if (!response.data || !response.data.data) {
        console.error('前缀数据响应格式错误:', response);
        prefixes.value = [];
        return;
      }
      
      prefixes.value = response.data.data;
      console.log(`成功加载${prefixes.value.length}个前缀`);
    } catch (error) {
      console.error('加载前缀数据失败:', error);
      prefixes.value = [];
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
    
    // 加载该国家的ASN
    loadAsnsByCountry(country.country_id);
    
    // 重置前缀选择
    prefixes.value = [];
    selectedPrefix.value = '';
    selectedPrefixInfo.value = null;
  };
  
  // 处理国家变更
  const handleCountryChange = () => {
    // 如果通过下拉框选择了国家，更新搜索框
    if (formData.value.countryId) {
      const country = countries.value.find(c => c.country_id === formData.value.countryId);
      if (country) {
        countrySearch.value = country.country_name_zh || country.country_name;
      }
      
      // 加载该国家的ASN
      loadAsnsByCountry(formData.value.countryId);
      
      // 重置前缀选择
      prefixes.value = [];
      selectedPrefix.value = '';
      selectedPrefixInfo.value = null;
    } else {
      countrySearch.value = '';
      filteredAsns.value = asns.value;
      
      // 重置前缀选择
      prefixes.value = [];
      selectedPrefix.value = '';
      selectedPrefixInfo.value = null;
    }
  };
  
  // 搜索ASN
  const searchAsns = async () => {
    if (!asnSearch.value || asnSearch.value.length < 2) {
      matchedAsns.value = [];
      return;
    }
  
    try {
      const response = await axios.get('/api/database/asns/search', {
        params: {
          query: asnSearch.value,
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
    asnSearch.value = `${asn.as_name_zh || asn.as_name} (AS${asn.asn})`;
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
    
    // 加载前缀
    loadPrefixes();
  };
  
  // 处理ASN变更
  const handleAsnChange = () => {
    if (formData.value.asn) {
      const selectedAsn = asns.value.find(a => a.asn == formData.value.asn);
      if (selectedAsn) {
        asnSearch.value = `${selectedAsn.as_name_zh || selectedAsn.as_name} (AS${selectedAsn.asn})`;
        
        // 如果ASN有关联的国家，自动设置国家
        if (selectedAsn.country_id) {
          formData.value.countryId = selectedAsn.country_id;
          // 更新国家搜索框
          const country = countries.value.find(c => c.country_id === selectedAsn.country_id);
          if (country) {
            countrySearch.value = country.country_name_zh || country.country_name;
          }
        }
        
        // 加载前缀
        loadPrefixes();
      }
    } else {
      asnSearch.value = '';
      
      // 重置前缀选择
      prefixes.value = [];
      selectedPrefix.value = '';
      selectedPrefixInfo.value = null;
    }
  };
  
  // 搜索前缀 - 修改后的实现
  const searchPrefixes = async () => {
    // 如果搜索词为空或太短，清空结果
    if (!prefixSearch.value || prefixSearch.value.length < 2) {
      matchedPrefixes.value = [];
      return;
    }
    
    // 防止重复请求
    if (isSearchingPrefixes.value) return;
    isSearchingPrefixes.value = true;
    
    try {
      // 如果已经加载了前缀列表，先从本地过滤
      if (prefixes.value.length > 0) {
        const localMatches = prefixes.value.filter(prefix => 
          prefix.prefix.toLowerCase().includes(prefixSearch.value.toLowerCase())
        ).slice(0, 5);
        
        if (localMatches.length > 0) {
          matchedPrefixes.value = localMatches;
          isSearchingPrefixes.value = false;
          return;
        }
      }
      
      // 如果本地没有匹配或前缀列表为空，从服务器搜索
      console.log(`搜索前缀: ${prefixSearch.value}`);
      const params = {
        query: prefixSearch.value,
        limit: 5
      };
      
      // 如果已选择国家和ASN，添加到搜索参数中
      if (formData.value.countryId) params.country_id = formData.value.countryId;
      if (formData.value.asn) params.asn = formData.value.asn;
      
      const response = await axios.get('/api/addresses/prefixes/search', { params });
      
      if (response.data && response.data.data) {
        matchedPrefixes.value = response.data.data;
        console.log(`找到 ${matchedPrefixes.value.length} 个匹配前缀`);
      } else {
        matchedPrefixes.value = [];
      }
    } catch (error) {
      console.error('搜索前缀失败:', error);
      matchedPrefixes.value = [];
    } finally {
      isSearchingPrefixes.value = false;
    }
  };
  
  // 选择前缀 - 修改后的实现
  const selectPrefix = async (prefix) => {
    prefixSearch.value = prefix.prefix;
    selectedPrefix.value = prefix.prefix_id || prefix.prefix;
    selectedPrefixInfo.value = prefix;
    matchedPrefixes.value = [];
    
    // 如果前缀有关联的国家和ASN，自动设置它们
    try {
      if (prefix.country_id && prefix.country_id !== formData.value.countryId) {
        formData.value.countryId = prefix.country_id;
        
        // 更新国家搜索框
        const country = countries.value.find(c => c.country_id === prefix.country_id);
        if (country) {
          countrySearch.value = country.country_name_zh || country.country_name;
        }
        
        // 加载该国家的ASN
        await loadAsnsByCountry(prefix.country_id);
      }
      
      if (prefix.asn && prefix.asn !== formData.value.asn) {
        formData.value.asn = prefix.asn;
        
        // 更新ASN搜索框
        const asn = asns.value.find(a => a.asn == prefix.asn);
        if (asn) {
          asnSearch.value = `${asn.as_name_zh || asn.as_name} (AS${asn.asn})`;
        } else {
          asnSearch.value = `AS${prefix.asn}`;
        }
        
        // 加载该ASN的前缀
        await loadPrefixes();
      }
    } catch (error) {
      console.error('设置前缀相关信息失败:', error);
    }
  };
  
  // 处理前缀变更
  const handlePrefixChange = () => {
    if (selectedPrefix.value) {
      // 查找选中的前缀信息
      const prefix = prefixes.value.find(p => (p.prefix_id === selectedPrefix.value) || (p.prefix === selectedPrefix.value));
      if (prefix) {
        prefixSearch.value = prefix.prefix;
        selectedPrefixInfo.value = prefix;
      }
    } else {
      prefixSearch.value = '';
      selectedPrefixInfo.value = null;
    }
  };
  
  // 处理地址文件选择
  const handleAddressFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      selectedAddressFile.value = file;
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
    if (!dateString) return '未知';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
  
   // 处理更新IID类型
  const handleUpdateIIDTypes = async () => {
    if (!isFormValid.value) {
      // 显示验证错误信息
      if (!formData.value.iidTypeId) {
        alert('请选择IID类型');
        return;
      }
      if (!formData.value.countryId) {
        alert('请选择国家');
        return;
      }
      if (!formData.value.asn) {
        alert('请选择ASN');
        return;
      }
      if (!selectedAddressFile.value) {
        alert('请选择IPv6地址文件');
        return;
      }
      return;
    }
    
    try {
      // 读取文件内容
      const fileContent = await readFile(selectedAddressFile.value);
      
      // 解析地址
      const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
      const addresses = lines.map(line => {
        // 如果是CSV，取第一列
        if (line.includes(',')) {
          return line.split(',')[0].trim();
        }
        return line.trim();
      }).filter(Boolean);
      
      if (addresses.length === 0) {
        throw new Error('未找到有效的IPv6地址');
      }
      
      // 构建请求数据
      const requestData = {
        iidTypeId: formData.value.iidTypeId,
        isDetected: formData.value.isDetected,
        countryId: formData.value.countryId,
        asn: formData.value.asn,
        addresses: addresses
      };
      
      console.log('发送IID类型更新请求:', requestData);
      
      // 使用 store 调用 API
      const databaseStore = useDatabaseStore();
      const result = await databaseStore.updateIIDTypes(requestData);
      
      // 修改这里的提示方式，因为 store 方法返回的是 response.data
      alert(`更新成功: 已处理${result.total}个地址 (更新${result.updated}个, 新增${result.inserted}个)`);
    } catch (error) {
      console.error('更新IID类型失败:', error);
      alert(`更新失败: ${error.message}`);
    }
  };
  
  // 监听国家ID和ASN变化，自动加载前缀
  watch([() => formData.value.countryId, () => formData.value.asn], ([newCountryId, newAsn], [oldCountryId, oldAsn]) => {
    if (newCountryId && newAsn && (newCountryId !== oldCountryId || newAsn !== oldAsn)) {
      loadPrefixes();
    }
  });
  
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
  .iid-form {
    max-width: 800px;
  }
  
  .loading-message {
    padding: 2rem;
    text-align: center;
    color: #718096;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #4a5568;
      
      .required {
        color: #e53e3e;
        margin-left: 0.25rem;
      }
      
      .optional {
        color: #718096;
        font-size: 0.85rem;
        margin-left: 0.25rem;
      }
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
  
  .form-hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #718096;
  }
  
  .search-container {
    position: relative;
    margin-bottom: 0.5rem;
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
    
    
    li {
      padding: 0.5rem 1rem;
      cursor: pointer;
      transition: background-color 0.15s ease;
      
      &:hover {
        background-color: #f8fafc;
      }
    }
  }

  .error-message {
    margin-top: 0.5rem;
    color: #e53e3e;
    font-size: 0.875rem;
  }

  .file-upload {
    position: relative;
    margin-bottom: 0.5rem;
  }

  .file-info {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background-color: #f8fafc;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .file-hint {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #718096;
  }

  .prefix-info {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f8fafc;
    border-radius: 6px;
  }

  .info-item {
    display: flex;
    margin-bottom: 0.5rem;
    
    .label {
      font-weight: 500;
      min-width: 80px;
      color: #4a5568;
    }
    
    .value {
      flex: 1;
    }
  }

  .radio-group {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .radio-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    
    input {
      margin-right: 0.5rem;
      width: auto;
      padding: 0;
    }
  }

  .form-actions {
    margin-top: 2rem;
    text-align: right;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .btn-primary {
    background-color: #42b983;
    color: white;
    
    &:hover:not(:disabled) {
      background-color: #3aa876;
    }
  }

  .icon-update {
    margin-right: 0.5rem;
  }
</style>