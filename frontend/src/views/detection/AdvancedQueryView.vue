<template>
  <div class="advanced-query-view">
    <div class="header">
      <h1>查询</h1>
      <div class="actions">
        <button @click="downloadResults" class="download-btn" v-if="!loading && !error && filteredData.length > 0">
          <i class="icon-download"></i> 下载查询结果
        </button>
        <button @click="goToDetectionPlatform" class="back-btn">返回探测平台</button>
      </div>
    </div>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载数据中...</p>
    </div>
    
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchData" class="retry-btn">重试</button>
    </div>
    
    <div v-else class="content">
      <!-- 查询条件区域 -->
      <div class="query-filters">
        <div class="filter-row">
          <div class="filter-group" v-if="queryType !== 'global'">
            <label>当前查询:</label>
            <div class="current-query">
              <span v-if="queryType === 'country'" class="query-tag country-tag">
                国家: {{ queryParams.countryName }}
              </span>
              <span v-else-if="queryType === 'asn'" class="query-tag asn-tag">
                ASN: {{ queryParams.asnName }}
              </span>
              <span v-else-if="queryType === 'prefix'" class="query-tag prefix-tag">
                前缀: {{ queryParams.prefix }}
              </span>
              <button @click="resetQuery" class="reset-query-btn">返回全局视图</button>
            </div>
          </div>
          
          <div class="filter-group">
            <label for="sortField">排序:</label>
            <select id="sortField" v-model="sortField" @change="updateSort">
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button @click="toggleSortOrder" class="sort-order-btn">
              {{ sortOrder === 'asc' ? '升序' : '降序' }}
            </button>
          </div>
        </div>
        
        <div class="filter-row">
          <div class="search-filter">
            <input 
              type="text" 
              v-model="searchQuery" 
              :placeholder="getSearchPlaceholder()" 
              @input="filterData"
            />
            <button @click="clearFilters" class="clear-btn" v-if="searchQuery || hasActiveFilters">
              清除筛选
            </button>
            <button @click="showFilterModal = true" class="filter-btn">高级筛选</button>
          </div>
        </div>
      </div>
      
      <!-- 统计图表区域 -->
      <div class="charts-container">
        <div class="chart-card">
          <div ref="mainChart" class="chart"></div>
        </div>
        <div class="chart-card">
          <div ref="iidChart" class="chart"></div>
        </div>
      </div>

      
      <!-- 数据表格区域 -->
      <div class="data-table-container">
        <h3>{{ getTableTitle() }}</h3>
        <div class="table-info">
          <span>共 {{ filteredData.length }} 条记录</span>
        </div>
        
        <!-- 国家数据表格 -->
        <table v-if="queryType === 'global'" class="data-table">
          <thead>
            <tr>
              <th @click="sortBy('country_name')">
                国家/地区
                <span v-if="sortField === 'country_name'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>区域</th>
              <th @click="sortBy('asn_count')">
                ASN数量
                <span v-if="sortField === 'asn_count'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('total_ipv6_prefixes')">
                IPv6前缀数
                <span v-if="sortField === 'total_ipv6_prefixes'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('total_active_ipv6')">
                活跃IPv6地址数
                <span v-if="sortField === 'total_active_ipv6'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="country in filteredData" :key="country.country_id">
              <td>
                <div class="country-name">
                  <span class="country-flag">{{ country.country_id }}</span>
                  {{ country.country_name_zh || country.country_name }}
                </div>
              </td>
              <td>{{ country.region }} - {{ country.subregion }}</td>
              <td>{{ formatNumber(country.asn_count) }}</td>
              <td>{{ formatNumber(country.total_ipv6_prefixes) }}</td>
              <td>{{ formatNumber(country.total_active_ipv6) }}</td>
              <td>
                <button @click="viewCountryDetail(country.country_id)" class="view-btn">
                  查看详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- ASN数据表格 -->
        <table v-else-if="queryType === 'country'" class="data-table">
          <thead>
            <tr>
              <th @click="sortBy('asn')">
                ASN
                <span v-if="sortField === 'asn'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('as_name')">
                名称
                <span v-if="sortField === 'as_name'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>组织</th>
              <th @click="sortBy('total_ipv6_prefixes')">
                IPv6前缀数
                <span v-if="sortField === 'total_ipv6_prefixes'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('total_active_ipv6')">
                活跃IPv6地址数
                <span v-if="sortField === 'total_active_ipv6'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="asn in filteredData" :key="asn.asn">
              <td>AS{{ asn.asn }}</td>
              <td>{{ asn.as_name_zh || asn.as_name }}</td>
              <td>{{ asn.organization }}</td>
              <td>{{ formatNumber(asn.total_ipv6_prefixes) }}</td>
              <td>{{ formatNumber(asn.total_active_ipv6) }}</td>
              <td>
                <button @click="viewAsnDetail(asn.asn)" class="view-btn">
                  查看详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- 前缀数据表格 -->
        <table v-else-if="queryType === 'asn'" class="data-table">
          <thead>
            <tr>
              <th @click="sortBy('prefix')">
                前缀
                <span v-if="sortField === 'prefix'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('prefix_length')">
                前缀长度
                <span v-if="sortField === 'prefix_length'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>注册机构</th>
              <th @click="sortBy('allocation_date')">
                分配日期
                <span v-if="sortField === 'allocation_date'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th @click="sortBy('active_addresses')">
                活跃地址数
                <span v-if="sortField === 'active_addresses'" class="sort-icon">
                  {{ sortOrder === 'asc' ? '↑' : '↓' }}
                </span>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="prefix in filteredData" :key="prefix.prefix_id">
              <td>{{ prefix.prefix }}</td>
              <td>/{{ prefix.prefix_length }}</td>
              <td>{{ prefix.registry }}</td>
              <td>{{ formatDate(prefix.allocation_date) }}</td>
              <td>{{ formatNumber(prefix.active_addresses) }}</td>
              <td>
                <button @click="viewPrefixDetail(prefix.prefix_id)" class="view-btn">
                  查看详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- 地址数据表格 -->
        <table v-else-if="queryType === 'prefix'" class="data-table">
          <thead>
            <tr>
              <th>IPv6地址</th>
              <th>IID类型</th>
              <th>支持的协议</th>
              <th>漏洞信息</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="address in filteredData" :key="address.address_id">
              <td>{{ address.address }}</td>
              <td>{{ address.iid_type }}</td>
              <td>
                <div class="protocol-tags">
                  <span v-for="(protocol, index) in getProtocols(address)" :key="index" class="protocol-tag">
                    {{ protocol }}
                  </span>
                  <span v-if="!getProtocols(address).length" class="no-data">无</span>
                </div>
              </td>
              <td>
                <div class="vulnerability-tags">
                  <span v-for="(vuln, index) in getVulnerabilities(address)" :key="index" 
                    :class="['vuln-tag', vuln.is_fixed ? 'fixed' : 'unfixed']">
                    {{ vuln.name }}
                    <span class="vuln-status">({{ vuln.is_fixed ? '已修复' : '未修复' }})</span>
                  </span>
                  <span v-if="!getVulnerabilities(address).length" class="no-data">无</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 筛选弹窗 -->
      <div class="filter-modal" v-if="showFilterModal">
        <div class="filter-modal-content">
          <div class="filter-modal-header">
            <h3>高级筛选</h3>
            <button @click="showFilterModal = false" class="close-modal-btn">&times;</button>
          </div>
          <div class="filter-modal-body">
            <div v-if="queryType === 'global'" class="filter-section">
              <div class="filter-group">
                <label for="regionFilter">区域:</label>
                <select id="regionFilter" v-model="filters.region">
                  <option value="">所有区域</option>
                  <option v-for="region in availableRegions" :key="region" :value="region">
                    {{ region }}
                  </option>
                </select>
              </div>
            </div>
            
            <div v-if="queryType === 'country' || queryType === 'global'" class="filter-section">
              <div class="filter-group">
                <label for="minAsns">最少ASN数量:</label>
                <input type="number" id="minAsns" v-model="filters.minAsns" min="0" />
              </div>
            </div>
            
            <div class="filter-section">
              <div class="filter-group">
                <label for="minAddresses">最少IPv6地址数:</label>
                <input type="number" id="minAddresses" v-model="filters.minAddresses" min="0" />
              </div>
            </div>
          </div>
          <div class="filter-modal-footer">
            <button @click="resetFilters" class="reset-btn">重置</button>
            <button @click="applyFilters" class="apply-btn">应用筛选</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useDetectionStore } from '@/stores/detection';
import * as echarts from 'echarts';

const router = useRouter();
const route = useRoute();
const detectionStore = useDetectionStore();

// 状态变量
const loading = ref(true);
const error = ref(null);
const queryType = ref('global'); // global, country, asn, prefix
const queryParams = ref({
  countryId: '',
  countryName: '',
  asnId: '',
  asnName: '',
  prefixId: '',
  prefix: ''
});
const rawData = ref([]);
const filteredData = ref([]);
const searchQuery = ref('');
const sortField = ref('');
const sortOrder = ref('desc');
const showFilterModal = ref(false);
const availableRegions = ref([]);
const filters = ref({
  region: '',
  minAsns: '',
  minAddresses: '',
  minPrefixes: ''
});

// 图表引用
const mainChart = ref(null);
const iidChart = ref(null);
let mainChartInstance = null;
let iidChartInstance = null;

// 计算属性
const hasActiveFilters = computed(() => {
  return filters.value.region || 
         filters.value.minAsns || 
         filters.value.minAddresses || 
         filters.value.minPrefixes;
});

const sortOptions = computed(() => {
  if (queryType.value === 'global') {
    return [
      { value: 'total_active_ipv6', label: '活跃IPv6地址数' },
      { value: 'total_ipv6_prefixes', label: 'IPv6前缀数' },
      { value: 'asn_count', label: 'ASN数量' },
      { value: 'country_name', label: '国家名称' }
    ];
  } else if (queryType.value === 'country') {
    return [
      { value: 'total_active_ipv6', label: '活跃IPv6地址数' },
      { value: 'total_ipv6_prefixes', label: 'IPv6前缀数' },
      { value: 'asn', label: 'ASN' },
      { value: 'as_name', label: 'ASN名称' }
    ];
  } else if (queryType.value === 'asn') {
    return [
      { value: 'active_addresses', label: '活跃地址数' },
      { value: 'prefix', label: '前缀' },
      { value: 'prefix_length', label: '前缀长度' },
      { value: 'allocation_date', label: '分配日期' }
    ];
  } else if (queryType.value === 'prefix') {
    return [
      { value: 'iid_type', label: 'IID类型' }
    ];
  }
  return [];
});

// 方法
const fetchData = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    console.log('开始获取数据');
    // 根据URL参数确定查询类型和参数
    parseRouteParams();
    
    if (queryType.value === 'global') {
      console.log('获取全球数据');
      await fetchGlobalData();
    } else if (queryType.value === 'country') {
      console.log('获取国家数据:', queryParams.value.countryId);
      await fetchCountryData(queryParams.value.countryId);
    } else if (queryType.value === 'asn') {
      console.log('获取ASN数据:', queryParams.value.asnId);
      await fetchAsnData(queryParams.value.asnId);
    } else if (queryType.value === 'prefix') {
      console.log('获取前缀数据:', queryParams.value.prefixId);
      await fetchPrefixData(queryParams.value.prefixId);
    }
    
    // 设置默认排序
    setDefaultSort();
    
    // 应用筛选
    applyFilters();
    
    // 使用 setTimeout 确保 DOM 完全渲染后再初始化图表
    setTimeout(() => {
      console.log('延迟初始化图表');
      initCharts();
    }, 300);
  } catch (err) {
    console.error('获取数据失败:', err);
    error.value = err.message || '获取数据失败';
  } finally {
    loading.value = false;
  }
};

const parseRouteParams = () => {
  // 同时从 params 和 query 中获取可能的 ID 和 type
  const params = route.params;
  const query = route.query;
  
  console.log('路由参数:', params, query);
  
  // 优先使用 query 中的 type 来确定模式
  const typeFromQuery = query.type;
  
  if (typeFromQuery === 'country' && query.countryId) {
    queryType.value = 'country';
    queryParams.value.countryId = query.countryId;
    console.log('解析模式: country (来自 query)');
  } else if (typeFromQuery === 'asn' && query.asn) {
    queryType.value = 'asn';
    queryParams.value.asnId = query.asn;
    console.log('解析模式: asn (来自 query)');
  } else if (typeFromQuery === 'prefix' && query.prefixId) {
    queryType.value = 'prefix';
    queryParams.value.prefixId = query.prefixId;
    console.log('解析模式: prefix (来自 query)');
  } 
  // 如果 query 中没有明确的 type，再尝试从 params 中推断
  else if (params.countryId) {
    queryType.value = 'country';
    queryParams.value.countryId = params.countryId;
    console.log('解析模式: country (来自 params)');
  } else if (params.asn) {
    queryType.value = 'asn';
    queryParams.value.asnId = params.asn;
    console.log('解析模式: asn (来自 params)');
  } else if (params.prefixId) {
    queryType.value = 'prefix';
    queryParams.value.prefixId = params.prefixId;
    console.log('解析模式: prefix (来自 params)');
  } else {
    queryType.value = 'global';
    // 清空可能残留的 ID
    queryParams.value.countryId = '';
    queryParams.value.asnId = '';
    queryParams.value.prefixId = '';
    console.log('设置为全局查询模式');
  }

  console.log('当前查询类型:', queryType.value);
  console.log('解析后的queryParams:', JSON.stringify(queryParams.value)); // 打印确保 ID 被设置
};

// 获取全球数据
const fetchGlobalData = async () => {
  try {
    console.log('开始获取全球数据');
    const response = await detectionStore.fetchGlobalStats();
    console.log('获取到的全球数据:', response);
    
    // 修改这里，直接访问 response.countries
    if (response && response.countries) { // 检查 response.countries 是否存在
      rawData.value = response.countries || []; // 直接使用 response.countries
      
      // 提取可用区域
      const regions = new Set();
      rawData.value.forEach(country => {
        if (country.region) {
          regions.add(country.region);
        }
      });
      availableRegions.value = Array.from(regions).sort();
      
      // 设置默认排序字段
      sortField.value = 'total_active_ipv6';
      
      // 应用排序和筛选
      sortData();
    } else {
      console.error('全球数据格式不正确:', response);
      throw new Error('获取全球数据失败: 数据格式不正确');
    }
  } catch (err) {
    console.error('获取全球数据失败:', err);
    error.value = err.message || '获取全球数据失败';
    throw err; // 继续向上抛出错误，以便 fetchData 捕获
  }
};

const fetchCountryData = async (countryId) => {
  try {
    const response = await detectionStore.fetchCountryDetail(countryId);
    if (response) {
      rawData.value = response.asns || [];
      queryParams.value.countryName = response.country.country_name_zh || response.country.country_name;
      
      // 设置默认排序字段
      sortField.value = 'total_active_ipv6';
    } else {
      throw new Error(`获取国家 ${countryId} 数据失败`);
    }
  } catch (err) {
    console.error(`获取国家 ${countryId} 数据失败:`, err);
    throw err;
  }
};

const fetchAsnData = async (asn) => {
  try {
    const response = await detectionStore.fetchAsnDetail(asn);
    if (response) {
      rawData.value = response.prefixes || [];
      queryParams.value.asnName = response.asn.as_name_zh || response.asn.as_name;
      
      // 设置默认排序字段
      sortField.value = 'active_addresses';
    } else {
      throw new Error(`获取ASN ${asn} 数据失败`);
    }
  } catch (err) {
    console.error(`获取ASN ${asn} 数据失败:`, err);
    throw err;
  }
};

const fetchPrefixData = async (prefixId) => {
  try {
    const response = await detectionStore.fetchPrefixDetail(prefixId);
    if (response) {
      rawData.value = response.addresses || [];
      queryParams.value.prefix = response.prefix.prefix + '/' + response.prefix.prefix_length;
      
      // 设置默认排序字段
      sortField.value = 'iid_type';
    } else {
      throw new Error(`获取前缀 ${prefixId} 数据失败`);
    }
  } catch (err) {
    console.error(`获取前缀 ${prefixId} 数据失败:`, err);
    throw err;
  }
};

const setDefaultSort = () => {
  // 根据查询类型设置默认排序字段
  if (queryType.value === 'global') {
    sortField.value = 'total_active_ipv6';
  } else if (queryType.value === 'country') {
    sortField.value = 'total_active_ipv6';
  } else if (queryType.value === 'asn') {
    sortField.value = 'active_addresses';
  } else if (queryType.value === 'prefix') {
    sortField.value = 'iid_type';
  }
  
  // 默认降序排列
  sortOrder.value = 'desc';
  
  // 应用排序
  sortData();
};

const sortData = () => {
  if (!sortField.value) return;
  
  const sorted = [...rawData.value].sort((a, b) => {
    let valueA = a[sortField.value];
    let valueB = b[sortField.value];
    
    // 处理空值
    if (valueA === undefined || valueA === null) valueA = '';
    if (valueB === undefined || valueB === null) valueB = '';
    
    // 字符串比较
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      return sortOrder.value === 'asc' 
        ? valueA.localeCompare(valueB) 
        : valueB.localeCompare(valueA);
    }
    
    // 数值比较
    return sortOrder.value === 'asc' ? valueA - valueB : valueB - valueA;
  });
  
  rawData.value = sorted;
  applyFilters();
};

const sortBy = (field) => {
  if (sortField.value === field) {
    // 切换排序方向
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    // 设置新的排序字段
    sortField.value = field;
    sortOrder.value = 'desc';
  }
  
  // 应用排序
  sortData();
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  sortData();
};

const updateSort = () => {
  sortData();
};

const filterData = () => {
  if (!searchQuery.value.trim()) {
    // 如果搜索框为空，只应用筛选条件
    applyFilters();
    return;
  }
  
  const query = searchQuery.value.toLowerCase().trim();
  
  // 根据查询类型筛选数据
  if (queryType.value === 'global') {
    filteredData.value = rawData.value.filter(country => {
      return (
        (country.country_name && country.country_name.toLowerCase().includes(query)) ||
        (country.country_name_zh && country.country_name_zh.toLowerCase().includes(query)) ||
        (country.country_id && country.country_id.toLowerCase().includes(query))
      );
    });
  } else if (queryType.value === 'country') {
    filteredData.value = rawData.value.filter(asn => {
      return (
        (asn.as_name && asn.as_name.toLowerCase().includes(query)) ||
        (asn.as_name_zh && asn.as_name_zh.toLowerCase().includes(query)) ||
        (asn.asn && asn.asn.toString().includes(query)) ||
        (asn.organization && asn.organization.toLowerCase().includes(query))
      );
    });
  } else if (queryType.value === 'asn') {
    filteredData.value = rawData.value.filter(prefix => {
      return (
        (prefix.prefix && prefix.prefix.toLowerCase().includes(query)) ||
        (prefix.registry && prefix.registry.toLowerCase().includes(query))
      );
    });
  } else if (queryType.value === 'prefix') {
    filteredData.value = rawData.value.filter(address => {
      return (
        (address.address && address.address.toLowerCase().includes(query)) ||
        (address.iid_type && address.iid_type.toLowerCase().includes(query))
      );
    });
  }
};

const applyFilters = () => {
  // 应用筛选条件
  if (queryType.value === 'global') {
    filteredData.value = rawData.value.filter(country => {
      return (
        (!filters.value.region || country.region === filters.value.region) &&
        (!filters.value.minAsns || (country.asn_count >= parseInt(filters.value.minAsns))) &&
        (!filters.value.minAddresses || (country.total_active_ipv6 >= parseInt(filters.value.minAddresses)))
      );
    });
  } else if (queryType.value === 'country') {
    filteredData.value = rawData.value.filter(asn => {
      return (
        (!filters.value.minPrefixes || (asn.total_ipv6_prefixes >= parseInt(filters.value.minPrefixes))) &&
        (!filters.value.minAddresses || (asn.total_active_ipv6 >= parseInt(filters.value.minAddresses)))
      );
    });
  } else if (queryType.value === 'asn') {
    filteredData.value = rawData.value.filter(prefix => {
      return (
        (!filters.value.minAddresses || (prefix.active_addresses >= parseInt(filters.value.minAddresses)))
      );
    });
  } else if (queryType.value === 'prefix') {
    filteredData.value = rawData.value;
  }
  
    // 如果有搜索查询，再应用搜索筛选
    if (searchQuery.value.trim()) {
    filterData();
  }
};

const clearFilters = () => {
  searchQuery.value = '';
  filters.value = {
    region: '',
    minAsns: '',
    minAddresses: '',
    minPrefixes: ''
  };
  applyFilters();
};

const resetFilters = () => {
  filters.value = {
    region: '',
    minAsns: '',
    minAddresses: '',
    minPrefixes: ''
  };
};

const resetQuery = () => {
  router.push({ name: 'advancedQuery' });
};

// 导航方法
const viewCountryDetail = (countryId) => {
  router.push({ 
    name: 'advancedQuery', 
    query: { 
      type: 'country',
      countryId 
    }
  });
};

const viewAsnDetail = (asn) => {
  router.push({ 
    name: 'advancedQuery', 
    query: { 
      type: 'asn',
      asn 
    }
  });
};

const viewPrefixDetail = (prefixId) => {
  // 修改为使用query参数而不是params
  router.push({ 
    name: 'advancedQuery', 
    query: { 
      type: 'prefix',
      prefixId 
    }
  });
};

const goToDetectionPlatform = () => {
  // 直接导航到探测平台页面，而不是使用返回
  router.push({ name: 'detection-platform' });
};

// 格式化方法
const formatNumber = (num) => {
  if (num === undefined || num === null) return '-';
  return new Intl.NumberFormat().format(num);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString();
};

// 获取协议和漏洞信息
const getProtocols = (address) => {
  if (!address.protocols) return [];
  return address.protocols.map(p => p.protocol_name);
};

const getVulnerabilities = (address) => {
  if (!address.vulnerabilities) return [];
  return address.vulnerabilities.map(v => ({
    name: v.vulnerability_name,
    is_fixed: v.is_fixed
  }));
};

// 获取搜索占位符
const getSearchPlaceholder = () => {
  if (queryType.value === 'global') {
    return '搜索国家/地区...';
  } else if (queryType.value === 'country') {
    return '搜索ASN...';
  } else if (queryType.value === 'asn') {
    return '搜索前缀...';
  } else if (queryType.value === 'prefix') {
    return '搜索IPv6地址...';
  }
  return '搜索...';
};

// 获取表格标题
const getTableTitle = () => {
  if (queryType.value === 'global') {
    return '全球IPv6分布';
  } else if (queryType.value === 'country') {
    return `${queryParams.value.countryName} 的ASN列表`;
  } else if (queryType.value === 'asn') {
    return `AS${queryParams.value.asnId} (${queryParams.value.asnName}) 的前缀列表`;
  } else if (queryType.value === 'prefix') {
    return `前缀 ${queryParams.value.prefix} 的活跃IPv6地址`;
  }
  return '查询结果';
};

// 获取图表标题
const getChartTitle = () => {
  if (queryType.value === 'global') {
    return '全球IPv6分布';
  } else if (queryType.value === 'country') {
    return `${queryParams.value.countryName} 的ASN分布`;
  } else if (queryType.value === 'asn') {
    return `AS${queryParams.value.asnId} 的前缀分布`;
  } else if (queryType.value === 'prefix') {
    return `前缀 ${queryParams.value.prefix} 的地址分布`;
  }
  return '数据分布';
};

// 初始化图表
const initCharts = () => {
  console.log('初始化图表', mainChart.value, iidChart.value);
  
  // 销毁旧的图表实例
  if (mainChartInstance) {
    mainChartInstance.dispose();
    mainChartInstance = null;
  }
  if (iidChartInstance) {
    iidChartInstance.dispose();
    iidChartInstance = null;
  }
  
  // 创建新的图表实例
  if (mainChart.value) {
    console.log('初始化主图表');
    mainChartInstance = echarts.init(mainChart.value);
    renderMainChart();
  } else {
    console.error('主图表容器不存在');
  }
  
  if (iidChart.value) {
    console.log('初始化IID图表');
    iidChartInstance = echarts.init(iidChart.value);
    renderIIDChart();
  } else {
    console.error('IID图表容器不存在');
  }
};

// 渲染主图表
const renderMainChart = () => {
  console.log('渲染主图表', mainChartInstance, filteredData.value.length);
  if (!mainChartInstance || filteredData.value.length === 0) {
    console.warn('无法渲染主图表：图表实例不存在或数据为空');
    return;
  }
  let option = {};
  
  if (queryType.value === 'global') {
    // 全球数据 - 按地区分组显示ASN数量、IPv6地址数量和前缀数目
    // 首先按地区分组数据
    const regionData = {};
    filteredData.value.forEach(country => {
      const region = country.region || '未知地区';
      if (!regionData[region]) {
        regionData[region] = {
          asnCount: 0,
          ipv6Prefixes: 0,
          activeIpv6: 0
        };
      }
      regionData[region].asnCount += country.asn_count || 0;
      regionData[region].ipv6Prefixes += country.total_ipv6_prefixes || 0;
      regionData[region].activeIpv6 += country.total_active_ipv6 || 0;
    });
    
    // 转换为图表数据
    const regions = Object.keys(regionData).sort();
    const asnData = regions.map(region => regionData[region].asnCount);
    const prefixData = regions.map(region => regionData[region].ipv6Prefixes);
    const addressData = regions.map(region => regionData[region].activeIpv6);
    
    option = {
      title: {
        text: '全球IPv6分布（按地区）',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          let result = params[0].name + '<br/>';
          params.forEach(param => {
            let value = param.value;
            if (param.seriesName === '活跃IPv6地址数' || param.seriesName === 'IPv6前缀数') {
              value = formatNumber(value);
            }
            result += param.marker + ' ' + param.seriesName + ': ' + value + '<br/>';
          });
          return result;
        }
      },
      legend: {
        data: ['ASN数量', 'IPv6前缀数', '活跃IPv6地址数'],
        top: 'bottom'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: regions,
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: [
        {
          type: 'value',
          name: 'ASN数量',
          position: 'left',
          axisLine: {
            show: true,
            lineStyle: {
              color: '#5470C6'
            }
          },
          axisLabel: {
            formatter: '{value}'
          }
        },
        {
          type: 'value',
          name: '数量',
          position: 'right',
          axisLine: {
            show: true,
            lineStyle: {
              color: '#91CC75'
            }
          },
          axisLabel: {
            formatter: '{value}'
          }
        }
      ],
      series: [
        {
          name: 'ASN数量',
          type: 'bar',
          data: asnData,
          itemStyle: {
            color: '#5470C6'
          }
        },
        {
          name: 'IPv6前缀数',
          type: 'bar',
          yAxisIndex: 1,
          data: prefixData,
          itemStyle: {
            color: '#91CC75'
          }
        },
        {
          name: '活跃IPv6地址数',
          type: 'line',
          yAxisIndex: 1,
          data: addressData,
          itemStyle: {
            color: '#EE6666'
          },
          symbolSize: 8,
          lineStyle: {
            width: 3
          }
        }
      ]
    };
  } else if (queryType.value === 'country') {
    // 国家数据 - 显示前10个ASN的活跃IPv6地址数
    const topASNs = [...filteredData.value]
      .sort((a, b) => b.total_active_ipv6 - a.total_active_ipv6)
      .slice(0, 10);
    
    option = {
      title: {
        text: `${queryParams.value.countryName} 活跃IPv6地址数量前10 ASN`,
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          const data = params[0].data;
          return `${params[0].name}: ${formatNumber(data)} 个活跃地址`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: topASNs.map(a => `AS${a.asn}`),
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: '活跃IPv6地址数'
      },
      series: [
        {
          name: '活跃IPv6地址数',
          type: 'bar',
          data: topASNs.map(a => a.total_active_ipv6),
          itemStyle: {
            color: '#f28e2c'
          }
        }
      ]
    };
  } else if (queryType.value === 'asn') {
    // ASN数据 - 显示前10个前缀的活跃IPv6地址数
    const topPrefixes = [...filteredData.value]
      .sort((a, b) => b.active_addresses - a.active_addresses)
      .slice(0, 10);
    
    option = {
      title: {
        text: `AS${queryParams.value.asnId} 活跃IPv6地址数量前10前缀`,
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          const data = params[0].data;
          return `${params[0].name}: ${formatNumber(data)} 个活跃地址`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: topPrefixes.map(p => `${p.prefix}/${p.prefix_length}`),
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: '活跃IPv6地址数'
      },
      series: [
        {
          name: '活跃IPv6地址数',
          type: 'bar',
          data: topPrefixes.map(p => p.active_addresses),
          itemStyle: {
            color: '#e15759'
          }
        }
      ]
    };
  } else if (queryType.value === 'prefix') {
    // 前缀数据 - 显示IID类型分布
    const iidTypes = {};
    filteredData.value.forEach(addr => {
      const type = addr.iid_type || '未知';
      iidTypes[type] = (iidTypes[type] || 0) + 1;
    });
    
    const iidData = Object.entries(iidTypes).map(([name, value]) => ({ name, value }));
    
    option = {
      title: {
        text: `前缀 ${queryParams.value.prefix} 的地址分布`,
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          name: '地址分布',
          type: 'pie',
          radius: '60%',
          center: ['50%', '50%'],
          data: iidData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
  }
  
  mainChartInstance.setOption(option);
};

// 渲染IID类型图表
const renderIIDChart = () => {
  console.log('渲染IID图表', iidChartInstance);
  if (!iidChartInstance) {
    console.warn('无法渲染IID图表：图表实例不存在');
    return;
  }
  let option = {};
  
  if (queryType.value === 'global') {
    // 全球数据 - 显示总体的ASN数目、前缀数目和IPv6地址数目
    // 计算总数
    let totalAsns = 0;
    let totalPrefixes = 0;
    let totalAddresses = 0;
    
    // 按国家分组数据，用于找出前4名
    const countryData = {};
    
    filteredData.value.forEach(country => {
      const countryName = country.country_name_zh || country.country_name || '未知';
      totalAsns += country.asn_count || 0;
      totalPrefixes += country.total_ipv6_prefixes || 0;
      totalAddresses += country.total_active_ipv6 || 0;
      
      // 收集各国数据
      if (!countryData[countryName]) {
        countryData[countryName] = {
          asnCount: 0,
          prefixCount: 0,
          addressCount: 0
        };
      }
      
      countryData[countryName].asnCount += country.asn_count || 0;
      countryData[countryName].prefixCount += country.total_ipv6_prefixes || 0;
      countryData[countryName].addressCount += country.total_active_ipv6 || 0;
    });
    
    // 找出各项数据的前4名国家
    const topAsnCountries = Object.entries(countryData)
      .sort((a, b) => b[1].asnCount - a[1].asnCount)
      .slice(0, 4);
    
    const topPrefixCountries = Object.entries(countryData)
      .sort((a, b) => b[1].prefixCount - a[1].prefixCount)
      .slice(0, 4);
    
    const topAddressCountries = Object.entries(countryData)
      .sort((a, b) => b[1].addressCount - a[1].addressCount)
      .slice(0, 4);
    
    // 准备图表数据，添加百分比信息
    const asnData = topAsnCountries.map(([name, data]) => ({
      name: name,
      value: data.asnCount,
      percentage: ((data.asnCount / totalAsns) * 100).toFixed(2)
    }));
    
    // 添加"其他"类别，汇总剩余国家
    const otherAsns = totalAsns - asnData.reduce((sum, item) => sum + item.value, 0);
    if (otherAsns > 0) {
      asnData.push({
        name: '其他',
        value: otherAsns,
        percentage: ((otherAsns / totalAsns) * 100).toFixed(2)
      });
    }
    
    const prefixData = topPrefixCountries.map(([name, data]) => ({
      name: name,
      value: data.prefixCount,
      percentage: ((data.prefixCount / totalPrefixes) * 100).toFixed(2)
    }));
    
    // 添加"其他"类别，汇总剩余国家
    const otherPrefixes = totalPrefixes - prefixData.reduce((sum, item) => sum + item.value, 0);
    if (otherPrefixes > 0) {
      prefixData.push({
        name: '其他',
        value: otherPrefixes,
        percentage: ((otherPrefixes / totalPrefixes) * 100).toFixed(2)
      });
    }
    
    const addressData = topAddressCountries.map(([name, data]) => ({
      name: name,
      value: data.addressCount,
      percentage: ((data.addressCount / totalAddresses) * 100).toFixed(2)
    }));
    
    // 添加"其他"类别，汇总剩余国家
    const otherAddresses = totalAddresses - addressData.reduce((sum, item) => sum + item.value, 0);
    if (otherAddresses > 0) {
      addressData.push({
        name: '其他',
        value: otherAddresses,
        percentage: ((otherAddresses / totalAddresses) * 100).toFixed(2)
      });
    }
    
    // 全球数据统计 - 使用三个独立柱状图显示
    option = {
      title: [{
        text: '全球IPv6资源统计',
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          return `${params[0].name}: ${formatNumber(params[0].value)}`;
        }
      },
      grid: [
        { left: '5%', right: '68%', top: '15%', bottom: '55%' },
        { left: '37%', right: '37%', top: '15%', bottom: '55%' },
        { left: '68%', right: '5%', top: '15%', bottom: '55%' }
      ],
      xAxis: [
        { 
          gridIndex: 0, 
          type: 'category', 
          data: ['ASN总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#5470C6' } }
        },
        { 
          gridIndex: 1, 
          type: 'category', 
          data: ['前缀总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#91CC75' } }
        },
        { 
          gridIndex: 2, 
          type: 'category', 
          data: ['IPv6地址总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#EE6666' } }
        }
      ],
      yAxis: [
        { 
          gridIndex: 0, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#5470C6' } }
        },
        { 
          gridIndex: 1, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#91CC75' } }
        },
        { 
          gridIndex: 2, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#EE6666' } }
        }
      ],
      series: [
        {
          name: 'ASN总数',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: [totalAsns],
          itemStyle: { color: '#5470C6' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        },
        {
          name: '前缀总数',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: [totalPrefixes],
          itemStyle: { color: '#91CC75' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        },
        {
          name: 'IPv6地址总数',
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: [totalAddresses],
          itemStyle: { color: '#EE6666' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        }
      ]
    };
    
    // 添加饼图标题，放在饼图下方
    option.title.push(
      {
        text: 'ASN数量分布',
        left: '18%',
        top: '95%',
        textStyle: { fontSize: 14, fontWeight: 'normal' }
      },
      {
        text: '前缀数量分布',
        left: '50%',
        top: '95%',
        textStyle: { fontSize: 14, fontWeight: 'normal' }
      },
      {
        text: 'IPv6地址数量分布',
        left: '82%',
        top: '95%',
        textStyle: { fontSize: 14, fontWeight: 'normal' }
      }
    );
    
    // 添加饼图，显示百分比
    option.series.push(
    {
      name: 'ASN数量分布',
      type: 'pie',
      radius: ['0', '25%'],
      center: ['18%', '75%'],
      data: asnData,
      label: {
        formatter: '{b}\n{c} ({d}%)',
        fontSize: 10,
        lineHeight: 12
      },
      tooltip: {
        formatter: function(params) {
          return `${params.name}: ${formatNumber(params.value)} (${params.percent.toFixed(2)}%)`;
        }
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    },
      {
        name: '前缀数量分布',
        type: 'pie',
        radius: ['0', '25%'],
        center: ['50%', '75%'],
        data: prefixData,
        label: {
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        tooltip: {
          formatter: function(params) {
            return `${params.name}: ${formatNumber(params.value)} (${params.percent.toFixed(2)}%)`;
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      },
      {
        name: 'IPv6地址数量分布',
        type: 'pie',
        radius: ['0', '25%'],
        center: ['82%', '75%'],
        data: addressData,
        label: {
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        tooltip: {
          formatter: function(params) {
            return `${params.name}: ${formatNumber(params.value)} (${params.percent.toFixed(2)}%)`;
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    );
  } else if (queryType.value === 'country') {
    // 国家数据 - 显示ASN数量、前缀数量和IPv6地址数量
    // 计算总数
    let totalAsns = filteredData.value.length;
    let totalPrefixes = 0;
    let totalAddresses = 0;
    
    filteredData.value.forEach(asn => {
      totalPrefixes += asn.total_ipv6_prefixes || 0;
      totalAddresses += asn.total_active_ipv6 || 0;
    });
    
    // 国家数据统计 - 使用三个独立柱状图显示
    option = {
      title: [{
        text: `${queryParams.value.countryName} IPv6资源统计`,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          return `${params[0].name}: ${formatNumber(params[0].value)}`;
        }
      },
      grid: [
        { left: '5%', right: '68%', top: '15%', bottom: '55%' },
        { left: '37%', right: '37%', top: '15%', bottom: '55%' },
        { left: '68%', right: '5%', top: '15%', bottom: '55%' }
      ],
      xAxis: [
        { 
          gridIndex: 0, 
          type: 'category', 
          data: ['ASN总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#5470C6' } }
        },
        { 
          gridIndex: 1, 
          type: 'category', 
          data: ['前缀总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#91CC75' } }
        },
        { 
          gridIndex: 2, 
          type: 'category', 
          data: ['IPv6地址总数'], 
          axisLabel: { interval: 0 },
          axisLine: { lineStyle: { color: '#EE6666' } }
        }
      ],
      yAxis: [
        { 
          gridIndex: 0, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#5470C6' } }
        },
        { 
          gridIndex: 1, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#91CC75' } }
        },
        { 
          gridIndex: 2, 
          type: 'value',
          axisLabel: { formatter: value => formatNumber(value) },
          axisLine: { lineStyle: { color: '#EE6666' } }
        }
      ],
      series: [
        {
          name: 'ASN总数',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: [totalAsns],
          itemStyle: { color: '#5470C6' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        },
        {
          name: '前缀总数',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: [totalPrefixes],
          itemStyle: { color: '#91CC75' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        },
        {
          name: 'IPv6地址总数',
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: [totalAddresses],
          itemStyle: { color: '#EE6666' },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return formatNumber(params.value);
            }
          }
        }
      ]
    };
    
    // 找出前缀数量前4的ASN
    const topPrefixAsns = [...filteredData.value]
      .sort((a, b) => (b.total_ipv6_prefixes || 0) - (a.total_ipv6_prefixes || 0))
      .slice(0, 4)
      .map(asn => ({
        name: `AS${asn.asn}`,
        value: asn.total_ipv6_prefixes || 0,
        percentage: ((asn.total_ipv6_prefixes || 0) / totalPrefixes * 100).toFixed(2)
      }));
    
    // 添加"其他"类别
    const otherPrefixes = totalPrefixes - topPrefixAsns.reduce((sum, item) => sum + item.value, 0);
    if (otherPrefixes > 0) {
      topPrefixAsns.push({
        name: '其他',
        value: otherPrefixes,
        percentage: ((otherPrefixes / totalPrefixes) * 100).toFixed(2)
      });
    }
    
    // 找出地址数量前4的ASN
    const topAddressAsns = [...filteredData.value]
      .sort((a, b) => (b.total_active_ipv6 || 0) - (a.total_active_ipv6 || 0))
      .slice(0, 4)
      .map(asn => ({
        name: `AS${asn.asn}`,
        value: asn.total_active_ipv6 || 0,
        percentage: ((asn.total_active_ipv6 || 0) / totalAddresses * 100).toFixed(2)
      }));
    
    // 添加"其他"类别
    const otherAddresses = totalAddresses - topAddressAsns.reduce((sum, item) => sum + item.value, 0);
    if (otherAddresses > 0) {
      topAddressAsns.push({
        name: '其他',
        value: otherAddresses,
        percentage: ((otherAddresses / totalAddresses) * 100).toFixed(2)
      });
    }
    
    // 添加饼图标题，放在饼图下方
    option.title.push(
      {
        text: '前缀数量分布',
        left: '50%',
        top: '95%',
        textStyle: { fontSize: 14, fontWeight: 'normal' }
      },
      {
        text: 'IPv6地址数量分布',
        left: '82%',
        top: '95%',
        textStyle: { fontSize: 14, fontWeight: 'normal' }
      }
    );
    
    // 添加前4名ASN的饼图，显示百分比
    option.series.push(
      {
        name: '前缀数量分布',
        type: 'pie',
        radius: ['0', '25%'],
        center: ['50%', '75%'],
        data: topPrefixAsns,
        label: {
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        tooltip: {
          formatter: function(params) {
            return `${params.name}: ${formatNumber(params.value)} (${params.percent.toFixed(2)}%)`;
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      },
      {
        name: 'IPv6地址数量分布',
        type: 'pie',
        radius: ['0', '25%'],
        center: ['82%', '75%'],
        data: topAddressAsns,
        label: {
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        tooltip: {
          formatter: function(params) {
            return `${params.name}: ${formatNumber(params.value)} (${params.percent.toFixed(2)}%)`;
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    );
  } else if (queryType.value === 'prefix') {
    // 前缀数据 - 显示支持最多的前6个协议类型
    const protocolCounts = {};
    let totalAddresses = filteredData.value.length;
    
    // 统计协议类型
    filteredData.value.forEach(addr => {
      if (addr.protocols && addr.protocols.length > 0) {
        addr.protocols.forEach(protocol => {
          const protocolName = protocol.protocol_name || '未知协议';
          protocolCounts[protocolName] = (protocolCounts[protocolName] || 0) + 1;
        });
      }
    });
    
    // 转换为图表数据并排序
    const protocolData = Object.entries(protocolCounts)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);  // 取前6个协议
    
    // 如果没有协议数据，添加一个默认项
    if (protocolData.length === 0) {
      protocolData.push({ name: '无协议数据', value: 0 });
    }
    
    option = {
      title: {
        text: `前缀 ${queryParams.value.prefix} 支持的协议统计`,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        },
        subtext: `共 ${totalAddresses} 个活跃IPv6地址`
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          const percent = ((params[0].value / totalAddresses) * 100).toFixed(2);
          return `${params[0].name}: ${params[0].value} (${percent}%)`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '20%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: protocolData.map(item => item.name),
        axisLabel: {
          rotate: 30,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: '地址数量',
        axisLabel: {
          formatter: value => formatNumber(value)
        }
      },
      series: [
        {
          name: '协议支持数量',
          type: 'bar',
          data: protocolData.map(item => item.value),
          itemStyle: {
            color: function(params) {
              // 使用不同颜色区分不同协议
              const colorList = ['#5470C6', '#91CC75', '#EE6666', '#FAC858', '#73C0DE', '#3BA272'];
              return colorList[params.dataIndex % colorList.length];
            }
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              const percent = ((params.value / totalAddresses) * 100).toFixed(2);
              return `${formatNumber(params.value)} (${percent}%)`;
            }
          }
        }
      ]
    };
  } else if (queryType.value === 'asn') {
    // ASN数据 - 显示前缀分配时间分布
    const yearDistribution = {};
    let totalPrefixes = filteredData.value.length;
    let totalAddresses = 0;
    
    filteredData.value.forEach(prefix => {
      totalAddresses += prefix.active_addresses || 0;
      
      if (prefix.allocation_date) {
        const year = new Date(prefix.allocation_date).getFullYear();
        yearDistribution[year] = (yearDistribution[year] || 0) + 1;
      }
    });
    
    const years = Object.keys(yearDistribution).sort();
    const counts = years.map(year => yearDistribution[year]);
    
    option = {
      title: {
        text: `AS${queryParams.value.asnId} 前缀分配时间分布`,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        },
        subtext: `共 ${totalPrefixes} 个前缀，${formatNumber(totalAddresses)} 个活跃IPv6地址`
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params) {
          const percent = ((params[0].value / totalPrefixes) * 100).toFixed(2);
          return `${params[0].name}年: ${params[0].value} 个前缀 (${percent}%)`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '20%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: '前缀数量'
      },
      series: [
        {
          name: '前缀数量',
          type: 'bar',
          data: counts,
          itemStyle: {
            color: function(params) {
              // 根据年份渐变颜色
              const startYear = Math.min(...years.map(y => parseInt(y)));
              const endYear = Math.max(...years.map(y => parseInt(y)));
              const yearRange = endYear - startYear;
              if (yearRange === 0) return '#5470C6';
              
              const year = parseInt(params.name);
              const ratio = (year - startYear) / yearRange;
              return echarts.color.lerp(ratio, ['#5470C6', '#91CC75']);
            }
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return params.value;
            }
          }
        }
      ]
    };
  } else {
    // 其他查询类型 - 显示空图表或默认信息
    option = {
      title: {
        text: '数据统计',
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item'
      },
      series: [
        {
          type: 'pie',
          radius: '60%',
          center: ['50%', '50%'],
          data: [{ name: '无数据', value: 1 }],
          label: {
            position: 'center',
            formatter: '无相关数据'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '16',
              fontWeight: 'bold'
            }
          }
        }
      ]
    };
  }
  
  iidChartInstance.setOption(option);
};

// 下载查询结果
const downloadResults = () => {
  // 根据查询类型准备下载数据
  let csvContent = '';
  let filename = '';
  
  if (queryType.value === 'global') {
    // 全球数据
    filename = '全球IPv6分布.csv';
    csvContent = 'Country,Region,Subregion,ASN Count,IPv6 Prefixes,Active IPv6 Addresses\n';
    
    filteredData.value.forEach(country => {
      csvContent += `"${country.country_name_zh || country.country_name}",`;
      csvContent += `"${country.region || ''}",`;
      csvContent += `"${country.subregion || ''}",`;
      csvContent += `${country.asn_count || 0},`;
      csvContent += `${country.total_ipv6_prefixes || 0},`;
      csvContent += `${country.total_active_ipv6 || 0}\n`;
    });
  } else if (queryType.value === 'country') {
    // 国家数据
    filename = `${queryParams.value.countryName}_ASN列表.csv`;
    csvContent = 'ASN,Name,Organization,IPv6 Prefixes,Active IPv6 Addresses\n';
    
    filteredData.value.forEach(asn => {
      csvContent += `AS${asn.asn},`;
      csvContent += `"${asn.as_name_zh || asn.as_name || ''}",`;
      csvContent += `"${asn.organization || ''}",`;
      csvContent += `${asn.total_ipv6_prefixes || 0},`;
      csvContent += `${asn.total_active_ipv6 || 0}\n`;
    });
  } else if (queryType.value === 'asn') {
    // ASN数据
    filename = `AS${queryParams.value.asnId}_前缀列表.csv`;
    csvContent = 'Prefix,Prefix Length,Registry,Allocation Date,Active Addresses\n';
    
    filteredData.value.forEach(prefix => {
      csvContent += `${prefix.prefix},`;
      csvContent += `${prefix.prefix_length},`;
      csvContent += `"${prefix.registry || ''}",`;
      csvContent += `"${prefix.allocation_date || ''}",`;
      csvContent += `${prefix.active_addresses || 0}\n`;
    });
  } else if (queryType.value === 'prefix') {
    // 前缀数据
    filename = `${queryParams.value.prefix}_IPv6地址列表.csv`;
    csvContent = 'IPv6 Address,IID Type,Protocols,Vulnerabilities\n';
    
    filteredData.value.forEach(address => {
      const protocols = getProtocols(address).join('; ');
      const vulnerabilities = getVulnerabilities(address)
        .map(v => `${v.name}(${v.is_fixed ? '已修复' : '未修复'})`)
        .join('; ');
      
      csvContent += `${address.address},`;
      csvContent += `"${address.iid_type || ''}",`;
      csvContent += `"${protocols}",`;
      csvContent += `"${vulnerabilities}"\n`;
    });
  }
  
  // 创建下载链接
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// 生命周期钩子
onMounted(() => {
  fetchData();
  
  // 监听窗口大小变化，重新渲染图表
  window.addEventListener('resize', handleResize);
  
  // 添加延迟初始化图表的逻辑
  setTimeout(() => {
    console.log('组件挂载后延迟初始化图表');
    if (mainChart.value && iidChart.value) {
      initCharts();
    }
  }, 500);

  // {{ edit_1 }}
  // 应用页面背景
  document.body.style.backgroundImage = "url('/src/assets/images/background.jpg')"; // 注意路径可能需要调整，相对于public目录或者使用绝对URL
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
  document.body.style.minHeight = '100vh';
});

onBeforeUnmount(() => {
  // 移除事件监听器
  window.removeEventListener('resize', handleResize);
  
  // 销毁图表实例
  if (mainChartInstance) {
    mainChartInstance.dispose();
  }
  if (iidChartInstance) {
    iidChartInstance.dispose();
  }
  // {{ edit_2 }}
  // 移除页面背景
  document.body.style.backgroundImage = '';
  document.body.style.backgroundSize = '';
  document.body.style.backgroundPosition = '';
  document.body.style.backgroundAttachment = '';
  document.body.style.minHeight = '';
});

// 窗口大小变化处理
const handleResize = () => {
  console.log('窗口大小变化');
  if (mainChartInstance) {
    console.log('重新调整主图表大小');
    mainChartInstance.resize();
  }
  if (iidChartInstance) {
    console.log('重新调整IID图表大小');
    iidChartInstance.resize();
  }
};

// 监听路由变化，重新获取数据
watch(
  () => route.fullPath,
  () => {
    fetchData();
  }
);
</script>

<style scoped>
.advanced-query-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}


.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  /* {{ edit_1 }} */
  /* 添加一个背景色以确保 header 部分在内容背景之上，并增加可读性 */
  background-color: rgba(252, 254, 253, 0.3); /* 半透明黑色背景 */
  padding: 10px 20px; /* 增加一些内边距 */
  border-radius: 8px; /* 轻微圆角 */
}

.header h1 {
  margin: 0;
  font-size: 24px;
  /* {{ edit_2 }} */
  color: #ffffff; /* 将标题颜色改为白色 */
}

.actions {
  display: flex;
  gap: 10px;
}

.download-btn, .back-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
}

.download-btn {
  background-color: #4caf50;
  color: white;
}

.back-btn {
  background-color: #f0f0f0;
  color: #333;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid #3498db;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 30px;
  color: #e74c3c;
}

.retry-btn {
  margin-top: 15px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background-color: rgba(255, 255, 255, 0.9); /* 添加半透明白色背景 */
  border-radius: 10px;
  padding: 20px;
}

.query-filters {
  background-color: #f9f9f9;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 10px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-query {
  display: flex;
  align-items: center;
  gap: 10px;
}

.query-tag {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.country-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.asn-tag {
  background-color: #e8f5e9;
  color: #388e3c;
}

.prefix-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

.reset-query-btn {
  padding: 4px 8px;
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.search-filter {
  flex: 1;
  display: flex;
  gap: 10px;
}

.search-filter input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.clear-btn, .filter-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.clear-btn {
  background-color: #f0f0f0;
  color: #666;
}

.filter-btn {
  background-color: #3498db;
  color: white;
}

.sort-order-btn {
  padding: 6px 10px;
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.charts-container {
  display: flex;
  flex-direction: column; /* 改为列布局，实现上下排布 */
  gap: 20px;
  margin-bottom: 20px;
}

.chart-card {
  width: 100%; /* 设置宽度为100%，占满整行 */
  min-width: unset; /* 移除最小宽度限制 */
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chart-card h3 {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 16px;
  color: #333;
  text-align: center;
}

.chart {
  width: 100%;
  height: 500px; /* 增加图表高度 */
  margin-bottom: 20px;
}

.charts-container {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
}

.chart-card {
  flex: 1;
  min-width: 450px; /* 增加最小宽度 */
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.data-table-container {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 15px;
}

.data-table-container h3 {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 18px;
  color: #333;
}

.table-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #666;
  font-size: 14px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background-color: #f5f5f5;
  padding: 12px 15px;
  text-align: left;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  position: relative;
}

.data-table th:hover {
  background-color: #eee;
}

.sort-icon {
  margin-left: 5px;
  font-weight: bold;
}

.data-table td {
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tr:hover {
  background-color: #f9f9f9;
}

.country-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.country-flag {
  font-weight: bold;
  color: #666;
}

.view-btn {
  padding: 6px 10px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.protocol-tags, .vulnerability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.protocol-tag {
  background-color: #e3f2fd;
  color: #1976d2;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.vuln-tag {
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.vuln-tag.unfixed {
  background-color: #ffebee;
  color: #c62828;
}

.vuln-tag.fixed {
  background-color: #e8f5e9;
  color: #388e3c;
}

.vuln-status {
  font-size: 10px;
  opacity: 0.8;
}

.no-data {
  color: #999;
  font-style: italic;
  font-size: 12px;
}

.filter-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.filter-modal-content {
  background-color: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.filter-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
}

.filter-modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.close-modal-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.filter-modal-body {
  padding: 20px;
}

.filter-section {
  margin-bottom: 20px;
}

.filter-section:last-child {
  margin-bottom: 0;
}

.filter-modal-footer {
  padding: 15px 20px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.reset-btn, .apply-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.reset-btn {
  background-color: #f0f0f0;
  color: #333;
}

.apply-btn {
  background-color: #3498db;
  color: white;
}

@media (max-width: 768px) {
  .charts-container {
    flex-direction: column;
  }
  
  .chart-card {
    min-width: 100%;
  }
  
  .data-table {
    display: block;
    overflow-x: auto;
  }
}
</style>