<template>
    <div class="protocol-form">
      <div class="form-group">
        <label for="protocol">协议类型</label>
        <select id="protocol" v-model="formData.protocolId" required>
          <option value="">选择协议</option>
          <option v-for="protocol in protocols" :key="protocol.protocol_id" :value="protocol.protocol_id">
            {{ protocol.protocol_name }} - {{ protocol.protocol_description }}
          </option>
        </select>
      </div>
      
      <div class="form-group">
        <label>支持状态</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" v-model="formData.isSupported" :value="true" />
            <span>支持</span>
          </label>
          <label class="radio-label">
            <input type="radio" v-model="formData.isSupported" :value="false" />
            <span>不支持</span>
          </label>
        </div>
      </div>
      
      <div class="form-group">
        <label>更新范围</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" v-model="formData.updateType" value="file" />
            <span>通过文件</span>
          </label>
          <label class="radio-label">
            <input type="radio" v-model="formData.updateType" value="filter" />
            <span>通过筛选条件</span>
          </label>
        </div>
      </div>
      
      <div v-if="formData.updateType === 'file'" class="form-group">
        <label for="addressFile">IPv6地址文件</label>
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
      
      <div v-if="formData.updateType === 'filter'" class="filter-form">
        <div class="form-group">
          <label for="country">国家</label>
          <select id="country" v-model="formData.countryId">
            <option value="">所有国家</option>
            <option v-for="country in countries" :key="country.country_id" :value="country.country_id">
              {{ country.country_name_zh || country.country_name }}
            </option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="asn">ASN</label>
          <select id="asn" v-model="formData.asn">
            <option value="">所有ASN</option>
            <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
              {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
            </option>
          </select>
        </div>
      </div>
      
      <div class="form-actions">
        <button 
          class="btn btn-primary" 
          @click="handleUpdateProtocols" 
          :disabled="isLoading || !isFormValid"
        >
          <i class="icon-update"></i>
          {{ isLoading ? '更新中...' : '更新协议支持状态' }}
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
  
  const emit = defineEmits(['update-protocols']);
  
  const detectionStore = useDetectionStore();
  const countries = ref([]);
  const asns = ref([]);
  const protocols = ref([]);
  const selectedAddressFile = ref(null);
  
  const formData = ref({
    protocolId: '',
    isSupported: true,
    updateType: 'filter',
    countryId: '',
    asn: '',
    addresses: []
  });
  
  const isFormValid = computed(() => {
    if (!formData.value.protocolId) return false;
    
    if (formData.value.updateType === 'file') {
      return !!selectedAddressFile.value;
    } else {
      return !!(formData.value.countryId || formData.value.asn);
    }
  });
  
  // 加载基础数据
  const loadData = async () => {
    try {
      // 加载国家和ASN数据
      await detectionStore.fetchCountryRanking();
      await detectionStore.fetchAsnRanking();
      
      countries.value = detectionStore.countries;
      asns.value = detectionStore.asns;
      
      // 加载协议类型
      const response = await api.detection.getProtocolTypes();
      protocols.value = response.data || [];
    } catch (error) {
      console.error('加载数据失败:', error);
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
  
  // 处理更新协议支持
  const handleUpdateProtocols = async () => {
    if (!isFormValid.value) return;
    
    try {
      let addresses = [];
      
      if (formData.value.updateType === 'file') {
        // 读取文件内容
        const fileContent = await readFile(selectedAddressFile.value);
        
        // 解析地址
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
        addresses = lines.map(line => {
          // 如果是CSV，取第一列
          if (line.includes(',')) {
            return line.split(',')[0].trim();
          }
          return line.trim();
        }).filter(Boolean);
        
        if (addresses.length === 0) {
          throw new Error('未找到有效的IPv6地址');
        }
      }
      
      // 构建请求数据
      const requestData = {
        protocolId: formData.value.protocolId,
        isSupported: formData.value.isSupported,
        updateType: formData.value.updateType,
        addresses
      };
      
      if (formData.value.updateType === 'filter') {
        requestData.filter = {
          countryId: formData.value.countryId || null,
          asn: formData.value.asn || null
        };
      }
      
      emit('update-protocols', requestData);
    } catch (error) {
      console.error('更新协议支持状态失败:', error);
      alert(`更新失败: ${error.message}`);
    }
  };
  
  onMounted(() => {
    loadData();
  });
  </script>
  
  <style scoped lang="scss">
  .protocol-form {
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
  
  .radio-group {
    display: flex;
    gap: 2rem;
  }
  
  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    
    input[type="radio"] {
      width: auto;
    }
  }
  
  .filter-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
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
  
  .icon-update:before { content: "🔄"; }
  </style>