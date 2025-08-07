<template>
  <div class="query-form">
    <div v-if="loading" class="loading-message">
      正在加载数据...
    </div>
    <div v-else>
      <div class="form-section">
        <h4>基本筛选条件</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="country">国家</label>
            <select id="country" v-model="queryParams.country" @change="handleCountryChange">
              <option value="">所有国家</option>
              <option 
                v-for="country in sortedCountries" 
                :key="country.country_id" 
                :value="country.country_id"
              >
                {{ country.country_name_zh || country.country_name }}
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="asn">ASN</label>
            <div class="search-container">
              <select 
                id="asn" 
                v-model="queryParams.asn" 
                @change="handleAsnChange"
                class="full-width-select"
              >
                <option value="">{{ queryParams.country ? '选择该国家的ASN' : '所有ASN' }}</option>
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
          
          <div class="form-group">
            <label for="prefix">IPv6前缀</label>
            <div class="search-container">
              <div class="prefix-input-container">
                <input 
                  id="prefix" 
                  v-model="queryParams.prefix"
                  class="full-width-select"
                  placeholder="输入IPv6前缀进行搜索"
                  @input="searchPrefixes"
                />
                <select 
                  v-if="filteredPrefixes.length > 0 && queryParams.asn"
                  v-model="queryParams.prefix"
                  class="prefix-select"
                >
                  <option value="">选择前缀</option>
                  <option 
                    v-for="prefix in filteredPrefixes" 
                    :key="prefix.prefix_id"
                    :value="prefix.prefix"
                  >
                    {{ prefix.prefix }}
                  </option>
                </select>
              </div>
              <ul v-if="matchedPrefixes.length > 0" class="search-results">
                <li 
                  v-for="prefix in matchedPrefixes" 
                  :key="prefix.prefix_id"
                  @click="selectPrefix(prefix)"
                >
                  {{ prefix.prefix }} ({{ prefix.asn ? 'AS'+prefix.asn : '未知ASN' }})
                </li>
              </ul>
            </div>
          </div>
          
          <div class="form-group">
            <label for="minUptime">最低在线率</label>
            <div class="input-with-unit">
              <input 
                id="minUptime" 
                v-model="queryParams.minUptime" 
                type="number" 
                min="0" 
                max="100" 
                placeholder="例如: 90" 
              />
              <span class="unit">%</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>漏洞筛选</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="hasVulnerability">漏洞状态</label>
            <select id="hasVulnerability" v-model="queryParams.hasVulnerability">
              <option value="">所有地址</option>
              <option value="true">有漏洞</option>
              <option value="false">无漏洞</option>
            </select>
          </div>
          
          <div class="form-group" v-if="queryParams.hasVulnerability === 'true'">
            <label for="vulnerabilityFixed">修复状态</label>
            <select id="vulnerabilityFixed" v-model="queryParams.vulnerabilityFixed">
              <option value="">所有状态</option>
              <option value="true">已修复</option>
              <option value="false">未修复</option>
            </select>
          </div>
          
          <div class="form-group" v-if="queryParams.hasVulnerability === 'true'">
            <label for="vulnerabilityType">漏洞类型</label>
            <select id="vulnerabilityType" v-model="queryParams.vulnerabilityType">
              <option value="">所有类型</option>
              <option 
                v-for="vuln in vulnerabilities" 
                :key="vuln.vulnerability_id" 
                :value="vuln.vulnerability_id"
              >
                {{ vuln.vulnerability_name }}
              </option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>协议支持筛选</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="protocolSupport">协议支持</label>
            <select id="protocolSupport" v-model="queryParams.protocolSupport">
              <option value="">所有地址</option>
              <option value="true">支持协议</option>
              <option value="false">不支持协议</option>
            </select>
          </div>
          
          <div class="form-group" v-if="queryParams.protocolSupport !== ''">
            <label for="protocolType">协议类型</label>
            <select id="protocolType" v-model="queryParams.protocolType">
              <option value="">选择协议</option>
              <option v-for="protocol in protocols" :key="protocol.protocol_id" :value="protocol.protocol_id">
                {{ protocol.protocol_name }}
              </option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>时间筛选</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="firstSeenAfter">首次发现时间（起始）</label>
            <input 
              id="firstSeenAfter" 
              v-model="queryParams.firstSeenAfter" 
              type="date" 
            />
          </div>
          
          <div class="form-group">
            <label for="firstSeenBefore">首次发现时间（截止）</label>
            <input 
              id="firstSeenBefore" 
              v-model="queryParams.firstSeenBefore" 
              type="date" 
            />
          </div>
          
          <div class="form-group">
            <label for="lastSeenAfter">最后活跃时间（起始）</label>
            <input 
              id="lastSeenAfter" 
              v-model="queryParams.lastSeenAfter" 
              type="date" 
            />
          </div>
          
          <div class="form-group">
            <label for="lastSeenBefore">最后活跃时间（截止）</label>
            <input 
              id="lastSeenBefore" 
              v-model="queryParams.lastSeenBefore" 
              type="date" 
            />
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>查询选项</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="limit">结果数量限制</label>
            <input 
              id="limit" 
              v-model="queryParams.limit" 
              type="number" 
              min="1" 
              max="10000" 
              placeholder="默认: 1000" 
            />
          </div>
          
          <div class="form-group">
            <label for="orderBy">排序字段</label>
            <select id="orderBy" v-model="queryParams.orderBy">
              <option value="address">IPv6地址</option>
              <option value="first_seen">首次发现时间</option>
              <option value="last_seen">最后活跃时间</option>
              <option value="uptime_percentage">在线率</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="orderDirection">排序方向</label>
            <select id="orderDirection" v-model="queryParams.orderDirection">
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>输出字段选择</h4>
        
        <div class="fields-selection">
          <div 
            v-for="field in availableFields" 
            :key="field.key"
            class="field-checkbox"
          >
            <label>
              <input 
                type="checkbox" 
                :value="field.key" 
                v-model="queryParams.fields"
              />
              <span>{{ field.label }}</span>
            </label>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <h4>SQL预览</h4>
        <div class="sql-preview">
          <pre>{{ previewSql }}</pre>
        </div>
      </div>
      
      <div class="form-actions">
        <button class="btn btn-secondary" @click="resetForm">
          <i class="icon-reset"></i> 重置
        </button>
        <button 
          class="btn btn-primary" 
          @click="handleQuery" 
          :disabled="isLoading || !isFormValid"
        >
          <i class="icon-search"></i>
          {{ isLoading ? '查询中...' : '执行查询' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useDetectionStore } from '@/stores/detection';
import api from '@/api';
import axios from 'axios';

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  }
});

const loading = ref(true);
const matchedAsns = ref([]);
const matchedPrefixes = ref([]);
const filteredAsns = ref([]);
const filteredPrefixes = ref([]);
const previewSql = ref('');

const emit = defineEmits(['perform-query', 'delete-addresses']);

const detectionStore = useDetectionStore();
const countries = ref([]);
const asns = ref([]);
const vulnerabilities = ref([]);
const protocols = ref([]);

const availableFields = [
  { key: 'address', label: 'IPv6地址' },
  { key: 'prefix', label: '所属前缀' },
  { key: 'country', label: '国家' },
  { key: 'asn', label: 'ASN' },
  { key: 'first_seen', label: '首次发现时间' },
  { key: 'last_seen', label: '最后活跃时间' },
  { key: 'uptime_percentage', label: '在线率' },
  { key: 'vulnerabilities', label: '漏洞信息' },
  { key: 'protocols', label: '支持的协议' },
  { key: 'iid_type', label: 'IID类型' },
  { key: 'address_id', label: '地址ID' } // 添加地址ID字段用于删除操作
];

const queryParams = ref({
  country: '',
  asn: '',
  prefix: '',
  minUptime: '',
  hasVulnerability: '',
  vulnerabilityFixed: '',
  vulnerabilityType: '',
  protocolSupport: '',
  protocolType: '',
  firstSeenAfter: '',
  firstSeenBefore: '',
  lastSeenAfter: '',
  lastSeenBefore: '',
  limit: 1000,
  orderBy: 'address',
  orderDirection: 'asc',
  fields: ['address', 'prefix', 'country', 'asn', 'first_seen', 'last_seen', 'address_id']
});

const isFormValid = computed(() => {
  // 基本验证：至少选择一个输出字段
  if (queryParams.value.fields.length === 0) return false;
  
  // 协议支持验证
  if (queryParams.value.protocolSupport !== '' && !queryParams.value.protocolType) return false;
  
  return true;
});

// 添加排序后的国家列表计算属性
const sortedCountries = computed(() => {
  return [...countries.value].sort((a, b) => {
    const nameA = a.country_name_zh || a.country_name;
    const nameB = b.country_name_zh || b.country_name;
    return nameA.localeCompare(nameB);
  });
});

// 监听国家变化
watch(() => queryParams.value.country, (newVal) => {
  if (newVal) {
    // 如果选择了国家，过滤ASN列表
    loadAsnsByCountry(newVal);
  } else {
    // 如果清空了国家，重置ASN列表
    filteredAsns.value = asns.value;
  }
  // 清空ASN选择
  queryParams.value.asn = '';
  // 不清空前缀，因为用户可能是通过前缀搜索来设置国家的
});

// 监听ASN变化
watch(() => queryParams.value.asn, (newVal) => {
  if (newVal) {
    // 如果选择了ASN，加载前缀列表
    loadPrefixesByAsn(newVal);
  } else {
    // 如果清空了ASN，清空前缀列表，但不清空前缀输入
    // 因为用户可能是通过前缀搜索来设置ASN的
    filteredPrefixes.value = [];
  }
});

// 监听所有查询参数变化，更新SQL预览
watch(queryParams, () => {
  updateSqlPreview();
}, { deep: true });

// 更新SQL预览
const updateSqlPreview = () => {
  try {
    const { sql } = buildSqlQuery();
    previewSql.value = sql;
  } catch (error) {
    console.error('生成SQL预览失败:', error);
    previewSql.value = '生成SQL预览失败';
  }
};

onMounted(async () => {
  try {
    await loadData();
    loading.value = false;
    
    // 初始化过滤后的ASN列表
    filteredAsns.value = asns.value;
    
    // 初始化SQL预览
    updateSqlPreview();
  } catch (error) {
    console.error('初始化查询表单失败:', error);
    alert(`初始化查询表单失败: ${error.message}`);
    loading.value = false;
  }
});

// 加载基础数据
const loadData = async () => {
  try {
    console.log('开始加载基础数据...');
    
    // 并行加载数据
    await Promise.all([
      loadCountries(),
      loadAsns(),
      loadVulnerabilities(),
      loadProtocols()
    ]);
    
    console.log('所有基础数据加载完成');
  } catch (error) {
    console.error('加载数据失败:', error);
    throw new Error(`加载数据失败: ${error.message}`);
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

// 加载漏洞类型
const loadVulnerabilities = async () => {
  try {
    console.log('开始加载漏洞类型...');
    const response = await axios.get('/api/database/vulnerability-types');
    
    if (!response.data || !response.data.data) {
      console.error('漏洞类型响应格式错误:', response);
      throw new Error('漏洞类型响应格式错误');
    }
    
    vulnerabilities.value = response.data.data;
    console.log(`成功加载${vulnerabilities.value.length}个漏洞类型`);
  } catch (error) {
    console.error('加载漏洞类型失败:', error);
    throw error;
  }
};

// 加载协议类型
const loadProtocols = async () => {
  try {
    console.log('开始加载协议类型...');
    const response = await axios.get('/api/database/protocol-types');
    
    if (!response.data || !response.data.data) {
      console.error('协议类型响应格式错误:', response);
      throw new Error('协议类型响应格式错误');
    }
    
    protocols.value = response.data.data;
    console.log(`成功加载${protocols.value.length}个协议类型`);
  } catch (error) {
    console.error('加载协议类型失败:', error);
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

// 加载特定ASN的前缀
const loadPrefixesByAsn = async (asn) => {
  try {
    console.log(`加载ASN ${asn} 的前缀...`);
    const response = await axios.get(`/api/database/asns/${asn}/prefixes`);
    
    if (!response.data || !response.data.data) {
      console.error('ASN前缀响应格式错误:', response);
      return;
    }
    
    filteredPrefixes.value = response.data.data;
    console.log(`成功加载${filteredPrefixes.value.length}个ASN前缀`);
  } catch (error) {
    console.error(`加载ASN ${asn} 的前缀失败:`, error);
    filteredPrefixes.value = [];
  }
};

// 处理ASN变更
const handleAsnChange = () => {
  // 如果选择了ASN，加载前缀
  if (queryParams.value.asn) {
    loadPrefixesByAsn(queryParams.value.asn);
  } else {
    filteredPrefixes.value = [];
  }
};

// 处理国家变更
const handleCountryChange = () => {
  // 如果选择了国家，清空ASN
  if (queryParams.value.country) {
    queryParams.value.asn = '';
    loadAsnsByCountry(queryParams.value.country);
  } else {
    filteredAsns.value = asns.value;
    filteredPrefixes.value = [];
  }
};

// 重置表单
const resetForm = () => {
  queryParams.value = {
    country: '',
    asn: '',
    prefix: '',
    minUptime: '',
    hasVulnerability: '',
    vulnerabilityFixed: '',
    vulnerabilityType: '',
    protocolSupport: '',
    protocolType: '',
    firstSeenAfter: '',
    firstSeenBefore: '',
    lastSeenAfter: '',
    lastSeenBefore: '',
    limit: 1000,
    orderBy: 'address',
    orderDirection: 'asc',
    fields: ['address', 'prefix', 'country', 'asn', 'first_seen', 'last_seen', 'address_id']
  };
  matchedAsns.value = [];
  matchedPrefixes.value = [];
  filteredAsns.value = asns.value;
  filteredPrefixes.value = [];
  updateSqlPreview();
};

// 构建SQL查询
const buildSqlQuery = () => {
  const params = [];
  let sql = 'SELECT ';
  
  // 构建选择字段
  const selectFields = [];
  if (queryParams.value.fields.includes('address')) selectFields.push('aa.address');
  if (queryParams.value.fields.includes('address_id')) selectFields.push('aa.address_id');
  if (queryParams.value.fields.includes('prefix')) selectFields.push('ip.prefix');
  if (queryParams.value.fields.includes('country')) selectFields.push('c.country_name_zh, c.country_name');
  if (queryParams.value.fields.includes('asn')) selectFields.push('a.asn, a.as_name_zh, a.as_name');
  if (queryParams.value.fields.includes('first_seen')) selectFields.push('aa.first_seen');
  if (queryParams.value.fields.includes('last_seen')) selectFields.push('aa.last_seen');
  if (queryParams.value.fields.includes('uptime_percentage')) selectFields.push('aa.uptime_percentage');
  if (queryParams.value.fields.includes('iid_type')) selectFields.push('at.type_name as iid_type');
  
  // 添加协议信息字段，使用GROUP_CONCAT聚合多个协议
  if (queryParams.value.fields.includes('protocols')) {
    selectFields.push(`GROUP_CONCAT(DISTINCT CONCAT(p.protocol_name, ':', IFNULL(ap.port, p.protocol_number)) SEPARATOR '; ') as protocols`);
  }
  
  // 如果需要漏洞信息，也使用GROUP_CONCAT聚合
  if (queryParams.value.fields.includes('vulnerabilities')) {
    selectFields.push(`GROUP_CONCAT(DISTINCT CONCAT(v.description, IF(av.is_fixed, ' (已修复)', ' (未修复)')) SEPARATOR '; ') as vulnerabilities`);
  }
  
  // 如果没有选择字段，默认选择地址
  if (selectFields.length === 0) {
    selectFields.push('aa.address');
  }
  
  sql += selectFields.join(', ');
  
  // 构建FROM和JOIN
  sql += ` FROM active_addresses aa
  JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
  JOIN countries c ON ip.country_id = c.country_id
  JOIN asns a ON ip.asn = a.asn
  LEFT JOIN address_types at ON aa.iid_type = at.type_id`;
  
  // 如果需要漏洞信息
  if (queryParams.value.hasVulnerability === 'true' || queryParams.value.fields.includes('vulnerabilities')) {
    sql += ` LEFT JOIN address_vulnerabilities av ON aa.address_id = av.address_id
    LEFT JOIN vulnerabilities v ON av.vulnerability_id = v.vulnerability_id`;
  }
  
  // 如果需要协议支持信息
  if (queryParams.value.protocolSupport !== '' || queryParams.value.fields.includes('protocols')) {
    sql += ` LEFT JOIN address_protocols ap ON aa.address_id = ap.address_id
    LEFT JOIN protocols p ON ap.protocol_id = p.protocol_id`;
  }
  
  // 构建WHERE条件
  const whereConditions = [];
  
  // 国家筛选
  if (queryParams.value.country) {
    whereConditions.push('c.country_id = ?');
    params.push(queryParams.value.country);
  }
  
  // ASN筛选
  if (queryParams.value.asn) {
    whereConditions.push('a.asn = ?');
    params.push(queryParams.value.asn);
  }
  
  // 前缀筛选
  if (queryParams.value.prefix) {
    whereConditions.push('ip.prefix = ?');
    params.push(queryParams.value.prefix);
  }
  
  // 在线率筛选
  if (queryParams.value.minUptime) {
    whereConditions.push('aa.uptime_percentage >= ?');
    params.push(parseFloat(queryParams.value.minUptime));
  }
  
  // 漏洞筛选
  if (queryParams.value.hasVulnerability === 'true') {
    whereConditions.push('av.address_id IS NOT NULL');
    
    // 漏洞修复状态
    if (queryParams.value.vulnerabilityFixed === 'true') {
      whereConditions.push('av.is_fixed = 1');
    } else if (queryParams.value.vulnerabilityFixed === 'false') {
      whereConditions.push('av.is_fixed = 0');
    }
    
    // 漏洞类型
    if (queryParams.value.vulnerabilityType) {
      whereConditions.push('av.vulnerability_id = ?');
      params.push(queryParams.value.vulnerabilityType);
    }
  } else if (queryParams.value.hasVulnerability === 'false') {
    whereConditions.push('av.address_id IS NULL');
  }
  
  // 协议支持筛选
  if (queryParams.value.protocolSupport === 'true') {
    if (queryParams.value.protocolType) {
      whereConditions.push('ap.protocol_id = ?');
      params.push(queryParams.value.protocolType);
    } else {
      whereConditions.push('ap.address_id IS NOT NULL');
    }
  } else if (queryParams.value.protocolSupport === 'false') {
    if (queryParams.value.protocolType) {
      whereConditions.push('(ap.protocol_id != ? OR ap.address_id IS NULL)');
      params.push(queryParams.value.protocolType);
    } else {
      whereConditions.push('ap.address_id IS NULL');
    }
  }
  
  // 时间筛选
  if (queryParams.value.firstSeenAfter) {
    whereConditions.push('aa.first_seen >= ?');
    params.push(queryParams.value.firstSeenAfter);
  }
  
  if (queryParams.value.firstSeenBefore) {
    whereConditions.push('aa.first_seen <= ?');
    params.push(queryParams.value.firstSeenBefore + ' 23:59:59');
  }
  
  if (queryParams.value.lastSeenAfter) {
    whereConditions.push('aa.last_seen >= ?');
    params.push(queryParams.value.lastSeenAfter);
  }
  
  if (queryParams.value.lastSeenBefore) {
    whereConditions.push('aa.last_seen <= ?');
    params.push(queryParams.value.lastSeenBefore + ' 23:59:59');
  }
  
  // 添加WHERE子句
  if (whereConditions.length > 0) {
    sql += ' WHERE ' + whereConditions.join(' AND ');
  }
  
  // 始终添加GROUP BY，确保聚合函数正常工作
  sql += ' GROUP BY aa.address_id';
  
  // 添加排序
  if (queryParams.value.orderBy) {
    let orderField = queryParams.value.orderBy;
    
    // 映射排序字段到实际数据库字段
    if (orderField === 'address') orderField = 'aa.address';
    else if (orderField === 'first_seen') orderField = 'aa.first_seen';
    else if (orderField === 'last_seen') orderField = 'aa.last_seen';
    else if (orderField === 'uptime_percentage') orderField = 'aa.uptime_percentage';
    
    sql += ` ORDER BY ${orderField} ${queryParams.value.orderDirection || 'ASC'}`;
  }
  
  // 添加限制
  if (queryParams.value.limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(queryParams.value.limit));
  }
  
  return { sql, params };
};

// 处理查询
const handleQuery = async () => {
  if (!isFormValid.value) return;
  
  try {
    // 构建SQL查询
    const { sql, params } = buildSqlQuery();
    
    // 修改这里：将sql改为query
    emit('perform-query', { query: sql, params });
  } catch (error) {
    console.error('构建查询失败:', error);
    alert(`构建查询失败: ${error.message}`);
  }
};

// 搜索ASN
const searchAsns = async () => {
  try {
    if (!queryParams.value.asn) {
      matchedAsns.value = [];
      return;
    }
    
    // 如果输入的是纯数字，则直接搜索ASN编号
    if (/^\d+$/.test(queryParams.value.asn)) {
      const response = await axios.get('/api/database/asns/search', {
        params: { query: queryParams.value.asn, limit: 10 }
      });
      
      if (response.data && response.data.data) {
        matchedAsns.value = response.data.data;
      }
    } else {
      // 否则搜索ASN名称
      const response = await axios.get('/api/database/asns/search', {
        params: { query: queryParams.value.asn, limit: 10 }
      });
      
      if (response.data && response.data.data) {
        matchedAsns.value = response.data.data;
      }
    }
  } catch (error) {
    console.error('搜索ASN失败:', error);
    matchedAsns.value = [];
  }
};

// 搜索前缀
const searchPrefixes = async () => {
  // 如果搜索词为空或太短，清空结果
  if (!queryParams.value.prefix || queryParams.value.prefix.length < 2) {
    matchedPrefixes.value = [];
    return;
  }
  
  try {
    // 如果已经加载了前缀列表，先从本地过滤
    if (filteredPrefixes.value.length > 0) {
      const localMatches = filteredPrefixes.value.filter(prefix => 
        prefix.prefix.toLowerCase().includes(queryParams.value.prefix.toLowerCase())
      ).slice(0, 5);
      
      if (localMatches.length > 0) {
        matchedPrefixes.value = localMatches;
        return;
      }
    }
    
    // 如果本地没有匹配或前缀列表为空，从服务器搜索
    console.log(`搜索前缀: ${queryParams.value.prefix}`);
    const params = {
      query: queryParams.value.prefix,
      limit: 5
    };
    
    // 如果已选择国家和ASN，添加到搜索参数中
    if (queryParams.value.country) params.country_id = queryParams.value.country;
    if (queryParams.value.asn) params.asn = queryParams.value.asn;
    
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
  }
};
// 处理前缀选择
const handlePrefixSelect = (prefix) => {
  selectedPrefix.value = prefix;
  
  // 更新查询条件
  queryConditions.value.push({
    field: 'prefix',
    operator: '=',
    value: prefix.prefix,
    displayValue: `前缀: ${prefix.prefix}`,
    type: 'prefix'
  });
  
  // 重置前缀搜索
  prefixSearchQuery.value = '';
};

// 选择ASN
const selectAsn = (asn) => {
  queryParams.value.asn = asn.asn;
  matchedAsns.value = [];
  
  // 如果选择了ASN，加载该ASN的前缀
  loadPrefixesByAsn(asn.asn);
};

// 选择前缀
const selectPrefix = async (prefix) => {
  queryParams.value.prefix = prefix.prefix;
  matchedPrefixes.value = [];
  
  try {
    // 如果前缀有关联的国家和ASN，自动设置它们
    if (prefix.country_id) {
      queryParams.value.country = prefix.country_id;
      // 加载该国家的ASN列表
      await loadAsnsByCountry(prefix.country_id);
    }
    
    if (prefix.asn) {
      queryParams.value.asn = prefix.asn;
      // 加载该ASN的前缀列表
      await loadPrefixesByAsn(prefix.asn);
    }
  } catch (error) {
    console.error('设置前缀相关信息失败:', error);
  }
};

// 初始化
onMounted(async () => {
  try {
    await loadData();
    loading.value = false;
  } catch (error) {
    console.error('初始化查询表单失败:', error);
    alert(`初始化查询表单失败: ${error.message}`);
    loading.value = false;
  }
});
</script>

<style scoped>
.query-form {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.loading-message {
  text-align: center;
  padding: 20px;
  font-size: 16px;
  color: #666;
}

.form-section {
  margin-bottom: 24px;
  border-bottom: 1px solid #eee;
  padding-bottom: 16px;
}

.form-section h4 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #333;
  font-size: 16px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.form-group {
  margin-bottom: 16px;
  position: relative;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #555;
  font-size: 14px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #4a90e2;
  outline: none;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.input-with-unit {
  position: relative;
}

.input-with-unit input {
  padding-right: 30px;
}

.input-with-unit .unit {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
}

.search-container {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  margin-top: 4px;
  padding: 0;
  list-style: none;
}

.search-results li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.search-results li:last-child {
  border-bottom: none;
}

.search-results li:hover {
  background-color: #f5f5f5;
}

.fields-selection {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.field-checkbox {
  margin-bottom: 8px;
}

.field-checkbox label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.field-checkbox input {
  margin-right: 8px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn i {
  margin-right: 6px;
}

.btn-primary {
  background-color: #4a90e2;
  color: white;
  border: none;
}

.btn-primary:hover {
  background-color: #3a80d2;
}

.btn-primary:disabled {
  background-color: #a0c3e8;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #f5f5f5;
  color: #333;
  border: 1px solid #ddd;
}

.btn-secondary:hover {
  background-color: #e5e5e5;
}

.full-width-select {
  width: 100%;
}

.sql-preview {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
}

.sql-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
  font-size: 13px;
  color: #333;
}

.prefix-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prefix-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background-color: #f9f9f9;
}

.prefix-select:focus {
  border-color: #4a90e2;
  outline: none;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}
</style>