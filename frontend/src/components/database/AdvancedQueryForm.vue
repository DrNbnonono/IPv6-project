<template>
    <div class="query-form">
      <div class="form-section">
        <h4>基本筛选条件</h4>
        
        <div class="filter-grid">
          <div class="form-group">
            <label for="country">国家</label>
            <select id="country" v-model="queryParams.country">
              <option value="">所有国家</option>
              <option v-for="country in countries" :key="country.country_id" :value="country.country_id">
                {{ country.country_name_zh || country.country_name }}
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="asn">ASN</label>
            <select id="asn" v-model="queryParams.asn">
              <option value="">所有ASN</option>
              <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
                {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="prefix">前缀</label>
            <input 
              id="prefix" 
              v-model="queryParams.prefix" 
              type="text" 
              placeholder="例如: 2001:db8" 
            />
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
              <option v-for="vuln in vulnerabilities" :key="vuln.vulnerability_id" :value="vuln.vulnerability_id">
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
              <option value="true">支持特定协议</option>
              <option value="false">不支持特定协议</option>
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
  </template>
  
  <script setup>
  import { ref, computed, onMounted } from 'vue';
  import { useDetectionStore } from '@/stores/detection';
  import api from '@/api';
  
  const props = defineProps({
    isLoading: {
      type: Boolean,
      default: false
    }
  });
  
  const emit = defineEmits(['perform-query']);
  
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
    { key: 'iid_type', label: 'IID类型' }
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
    fields: ['address', 'prefix', 'country', 'asn', 'first_seen', 'last_seen']
  });
  
  const isFormValid = computed(() => {
    // 基本验证：至少选择一个输出字段
    if (queryParams.value.fields.length === 0) return false;
    
    // 协议支持验证
    if (queryParams.value.protocolSupport !== '' && !queryParams.value.protocolType) return false;
    
    return true;
  });
  
  // 加载基础数据
  const loadData = async () => {
    try {
      // 加载国家和ASN数据
      await detectionStore.fetchCountryRanking();
      await detectionStore.fetchAsnRanking();
      
      countries.value = detectionStore.countries;
      asns.value = detectionStore.asns;
      
      // 加载漏洞类型
      const vulnResponse = await api.detection.getVulnerabilityTypes();
      vulnerabilities.value = vulnResponse.data || [];
      
      // 加载协议类型
      const protocolResponse = await api.detection.getProtocolTypes();
      protocols.value = protocolResponse.data || [];
    } catch (error) {
      console.error('加载数据失败:', error);
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
      fields: ['address', 'prefix', 'country', 'asn', 'first_seen', 'last_seen']
    };
  };
  
  // 处理查询
  const handleQuery = () => {
    if (!isFormValid.value) return;
    
    // 构建查询参数
    const params = { ...queryParams.value };
    
    // 转换布尔值
    if (params.hasVulnerability === 'true') params.hasVulnerability = true;
    if (params.hasVulnerability === 'false') params.hasVulnerability = false;
    if (params.vulnerabilityFixed === 'true') params.vulnerabilityFixed = true;
    if (params.vulnerabilityFixed === 'false') params.vulnerabilityFixed = false;
    if (params.protocolSupport === 'true') params.protocolSupport = true;
    if (params.protocolSupport === 'false') params.protocolSupport = false;
    
    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    
    emit('perform-query', params);
  };
  
  onMounted(() => {
    loadData();
  });
  </script>
  
  <style scoped lang="scss">
  .query-form {
    max-width: 1000px;
  }
  
  .form-section {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
    
    h4 {
      margin: 0 0 1rem;
      color: #35495e;
      font-size: 1.1rem;
    }
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  
  .form-group {
    margin-bottom: 1rem;
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #4a5568;
      font-size: 0.9rem;
    }
    
    input, select {
      width: 100%;
      padding: 0.7rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.95rem;
      
      &:focus {
        outline: none;
        border-color: #42b983;
      }
    }
  }
  
  .input-with-unit {
    position: relative;
    
    input {
      padding-right: 2.5rem;
    }
    
    .unit {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: #718096;
    }
  }
  
  .fields-selection {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.8rem;
  }
  
  .field-checkbox {
    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      
      input[type="checkbox"] {
        width: auto;
      }
    }
  }
  
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
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
    
    &-secondary {
      background-color: #edf2f7;
      color: #4a5568;
      
      &:hover {
        background-color: #e2e8f0;
      }
    }
  }
  
  .icon-search:before { content: "🔍"; }
  .icon-reset:before { content: "🔄"; }
  </style>