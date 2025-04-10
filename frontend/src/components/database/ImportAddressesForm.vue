<template>
    <div class="import-form">
      <div class="form-group">
        <label for="country">国家</label>
        <select id="country" v-model="formData.countryId" required>
          <option value="">选择国家</option>
          <option v-for="country in countries" :key="country.country_id" :value="country.country_id">
            {{ country.country_name_zh || country.country_name }}
          </option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="asn">ASN</label>
        <select id="asn" v-model="formData.asn" required>
          <option value="">选择ASN</option>
          <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
            {{ asn.as_name_zh || asn.as_name }} (AS{{ asn.asn }})
          </option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="prefix">IPv6前缀</label>
        <input 
          id="prefix" 
          v-model="formData.prefix" 
          type="text" 
          placeholder="例如: 2001:db8::/32" 
          required
        />
      </div>
      
      <div class="form-group">
        <label for="file">IPv6地址文件</label>
        <div class="file-upload">
          <input 
            id="file" 
            type="file" 
            @change="handleFileChange" 
            accept=".txt,.csv,.json"
          />
          <div class="file-info">
            <span v-if="!selectedFile">未选择文件</span>
            <span v-else>{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</span>
          </div>
        </div>
        <p class="file-hint">支持TXT（每行一个地址）、CSV或JSON格式</p>
      </div>
      
      <div class="form-group">
        <label for="format">文件格式</label>
        <select id="format" v-model="formData.format" required>
          <option value="txt">TXT (每行一个地址)</option>
          <option value="csv">CSV (地址,前缀,国家,ASN)</option>
          <option value="json">JSON</option>
        </select>
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
  import { ref, computed, onMounted } from 'vue';
  import { useDetectionStore } from '@/stores/detection';
  
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
  const selectedFile = ref(null);
  
  const formData = ref({
    countryId: '',
    asn: '',
    prefix: '',
    format: 'txt',
    addresses: []
  });
  
  const isFormValid = computed(() => {
    return formData.value.countryId && 
           formData.value.asn && 
           formData.value.prefix && 
           selectedFile.value;
  });
  
  // 加载国家和ASN数据
  const loadData = async () => {
    try {
      await detectionStore.fetchCountryRanking();
      await detectionStore.fetchAsnRanking();
      
      countries.value = detectionStore.countries;
      asns.value = detectionStore.asns;
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };
  
  // 处理文件选择
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      selectedFile.value = file;
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
  
  // 处理导入
  const handleImport = async () => {
    if (!isFormValid.value) return;
    
    try {
      // 读取文件内容
      const fileContent = await readFile(selectedFile.value);
      
      // 解析地址
      let addresses = [];
      
      if (formData.value.format === 'txt') {
        // 每行一个地址
        addresses = fileContent.split(/\r?\n/).filter(line => line.trim());
      } else if (formData.value.format === 'csv') {
        // CSV格式
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
        addresses = lines.map(line => line.split(',')[0].trim()).filter(Boolean);
      } else if (formData.value.format === 'json') {
        // JSON格式
        try {
          const jsonData = JSON.parse(fileContent);
          if (Array.isArray(jsonData)) {
            addresses = jsonData.map(item => {
              if (typeof item === 'string') return item;
              return item.address || '';
            }).filter(Boolean);
          } else if (jsonData.addresses && Array.isArray(jsonData.addresses)) {
            addresses = jsonData.addresses.filter(Boolean);
          }
        } catch (error) {
          throw new Error('JSON格式解析失败');
        }
      }
      
      if (addresses.length === 0) {
        throw new Error('未找到有效的IPv6地址');
      }
      
      // 发送导入请求
      const importData = {
        ...formData.value,
        addresses
      };
      
      emit('import-addresses', importData);
    } catch (error) {
      console.error('导入失败:', error);
      alert(`导入失败: ${error.message}`);
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
  
  .icon-import:before { content: "📥"; }
  </style>