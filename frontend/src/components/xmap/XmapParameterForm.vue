<template>
    <form @submit.prevent="submitForm" class="parameter-form">
      <div class="form-section">
        <h3>基础配置</h3>
        <div class="form-group">
          <label>扫描目标 (CIDR格式，可选):</label>
          <input 
            v-model="formData.targetaddress" 
            placeholder="例如: 2001:db8::/32 或 192.168.1.0/24"
          />
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>协议类型:</label>
            <select v-model="formData.ipv6">
              <option :value="true">IPv6</option>
              <option :value="false">IPv4</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>目标端口:</label>
            <input 
              v-model="formData.targetPort" 
              type="number" 
              min="1" 
              max="65535"
              placeholder="可选，默认扫描所有端口"
            />
          </div>

          
          
        </div>
      </div>
  
      <div class="form-section">
        <h3>高级配置</h3>
        <div class="form-row">
        <div class="form-group">
          <label>扫描速率 (Mbps):</label>
          <input 
            v-model="formData.rate" 
            type="number" 
            min="1"
            placeholder="例如: 10"
            step="0.1"
          >
          <span class="unit-suffix">Mbps</span>
        </div>
        
        <div class="form-group">
          <label>最大结果数:</label>
          <input 
            v-model="formData.max_results" 
            type="number" 
            min="1"
            placeholder="可选，限制返回结果数量"
          >
        </div>
      </div>
  
        <div class="form-row">
          <div class="form-group">
            <label>扫描长度:</label>
            <input 
              v-model="formData.maxlen" 
              type="number" 
              min="1"
              placeholder="可选，默认自动计算"
            />
          </div>
        </div>
      </div>
  
      <div class="form-section">
        <h3>白名单配置</h3>
        <div class="form-group">
          <label>白名单文件:</label>
          <XmapWhitelistSelect 
            v-model="formData.whitelistFile"
            @upload="handleWhitelistUpload"
          />
        </div>
      </div>
  
      <div class="form-section">
        <h3>任务信息</h3>
        <div class="form-group">
            <label>任务描述 (可选):</label>
            <input 
            v-model="formData.description" 
            type="text" 
            placeholder="简短描述此任务的目的"
            maxlength="255"
            />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '扫描中...' : '开始扫描' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="resetForm">
          重置表单
        </button>
      </div>
    </form>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import XmapWhitelistSelect from './XmapWhitelistSelect.vue'
  
  const emit = defineEmits(['start-scan'])
  defineProps({
    isLoading: Boolean
  })
  
  // 初始化表单数据，包含所有可能的XMap参数
  const formData = ref({
    targetaddress: '',
    ipv6: true,
    ipv4: false,
    targetPort: '',
    rate: '',
    max_results: '',
    maxlen: '',
    whitelistFile: '',
    description: ''
  })
  
  const handleWhitelistUpload = (file) => {
    formData.value.whitelistFile = file
  }
  

  
  const resetForm = () => {
    formData.value = {
      targetaddress: '',
      ipv6: true,
      ipv4: false,
      targetPort: '',
      rate: '',
      max_results: '',
      maxlen: '',
      whitelistFile: ''
    }
  }
  
  
  const submitForm = () => {
  // 过滤空值并转换数字类型
  const params = {
    ...formData.value,
    ipv6: formData.value.ipv6,
    ipv4: formData.value.ipv4,
    rate: formData.value.rate ? `${formData.value.rate}M` : ''
  }
  
  // 移除空值
  Object.keys(params).forEach(key => {
    if (params[key] === '' || params[key] === false) {
      delete params[key]
    }
  })
  
  emit('start-scan', params)
}
  </script>
  
  <style scoped lang="scss">
  .unit-suffix {
  margin-left: 0.5rem;
  color: #666;
}
  .parameter-form {
    .form-section {
      margin-bottom: 2rem;
      padding: 1rem;
      border: 1px solid #eee;
      border-radius: 8px;
      
      h3 {
        margin: 0 0 1rem 0;
        color: #35495e;
        font-size: 1.1rem;
      }
    }
  
    .form-group {
      margin-bottom: 1.5rem;
      
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
      }
      
      input, select {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
        
        &:focus {
          outline: none;
          border-color: #42b983;
        }
      }
    }
    
    .form-row {
      display: flex;
      gap: 1.5rem;
      
      .form-group {
        flex: 1;
      }
    }
    
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 2rem;
      
      button {
        padding: 0.75rem 1.5rem;
      }
      
      .btn-secondary {
        background-color: #f0f0f0;
        color: #333;
        
        &:hover {
          background-color: #e0e0e0;
        }
      }
    }
  }
  </style>