<template>
  <form @submit.prevent="submitForm" class="parameter-form">
    <div class="form-section">
      <div class="section-header">
        <h3><i class="icon icon-scan"></i> 基础配置</h3>
      </div>
      <div class="form-group">
        <label>扫描目标 (CIDR格式，可选):</label>
        <input 
          v-model="formData.targetaddress" 
          placeholder="例如: 2001:db8::/32 或 192.168.1.0/24"
          class="form-input"
        />
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>协议类型:</label>
          <div class="protocol-toggle">
            <button 
              type="button"
              :class="{ active: formData.ipv6 }"
              @click="setProtocol(true)"
              class="toggle-btn"
            >
              <i class="icon icon-ipv6"></i> IPv6
            </button>
            <button 
              type="button"
              :class="{ active: !formData.ipv6 }"
              @click="setProtocol(false)"
              class="toggle-btn"
            >
              <i class="icon icon-ipv4"></i> IPv4
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">
        <h3><i class="icon icon-advanced"></i> 高级配置</h3>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>扫描速率 (Mbps):</label>
          <div class="input-with-unit">
            <input 
              v-model="formData.rate" 
              type="number" 
              min="1"
              placeholder="例如: 10"
              step="0.1"
              class="form-input"
            >
            <span class="unit">Mbps</span>
          </div>
        </div>
        
        <div class="form-group">
          <label>最大结果数:</label>
          <input 
            v-model="formData.max_results" 
            type="number" 
            min="1"
            placeholder="可选，限制返回结果数量"
            class="form-input"
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
            class="form-input"
          />
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">
        <h3><i class="icon icon-settings"></i> 扫描设置</h3>
      </div>
      <div class="form-group">
        <label>扫描模式:</label>
        <div class="select-wrapper">
          <select v-model="formData.probeModule" class="form-select">
            <option value="">默认</option>
            <option 
              v-for="module in probeModules" 
              :key="module"
              :value="module"
            >
              {{ module }}
            </option>
          </select>
          <i class="icon icon-chevron-down"></i>
        </div>
      </div>
    </div>
  
    <div class="form-section">
      <div class="section-header">
        <h3><i class="icon icon-whitelist"></i> 白名单配置</h3>
      </div>
      <div class="form-group">
        <label>白名单文件:</label>
        <XmapWhitelistSelect 
          v-model="formData.whitelistFile"
          @upload="handleWhitelistUpload"
          @error="handleWhitelistError"
        />
        <div v-if="whitelistError" class="error-message">
          <i class="icon icon-error"></i> {{ whitelistError }}
        </div>
        <div v-if="whitelistSuccess" class="success-message">
          <i class="icon icon-success"></i> {{ whitelistSuccess }}
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">
        <h3><i class="icon icon-info"></i> 任务信息</h3>
      </div>
      <div class="form-group">
        <label>任务描述 (可选):</label>
        <input 
          v-model="formData.description" 
          type="text" 
          placeholder="简短描述此任务的目的"
          maxlength="255"
          class="form-input"
        />
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" :disabled="isLoading">
        <i class="icon icon-play"></i> {{ isLoading ? '扫描中...' : '开始扫描' }}
      </button>
      <button type="button" class="btn btn-secondary" @click="resetForm">
        <i class="icon icon-reset"></i> 重置表单
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref, computed } from 'vue'
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
  description: '',
  probeModule: ''
})

const whitelistError = ref('')
const whitelistSuccess = ref('')

const handleWhitelistUpload = (file) => {
  formData.value.whitelistFile = file
  whitelistError.value = ''
  whitelistSuccess.value = '白名单文件上传成功'
  setTimeout(() => {
    whitelistSuccess.value = ''
  }, 3000)
}

const handleWhitelistError = (error) => {
  whitelistError.value = error
  whitelistSuccess.value = ''
  setTimeout(() => {
    whitelistError.value = ''
  }, 5000)
}

const setProtocol = (isIPv6) => {
  formData.value.ipv6 = isIPv6
  formData.value.ipv4 = !isIPv6
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
    whitelistFile: '',
    probeModule: '',
  }
  whitelistError.value = ''
  whitelistSuccess.value = ''
}

const probeModules = computed(() => {
  return formData.value.ipv6 ? [
    'udp', 'dnsx', 'dnsa', 'dnsae', 'dnsan', 'dnsane', 'dnsane16',
    'dnsai', 'dnsaie', 'dnsap', 'dnsape', 'dnsaf', 'dnsafe',
    'tcp_syn', 'icmp_echo', 'icmp_echo_gw', 'icmp_echo_tmxd'
  ] : [
    'udp', 'dns', 'dnsr', 'dnsx', 'dnsf', 'dnsz', 'dnss', 'dnsv',
    'dnsa', 'dnsae', 'dnsan', 'dnsane', 'dnsane16', 'dnsai', 'dnsaie',
    'dnsap', 'dnsape', 'dnsaf', 'dnsafe', 'tcp_scan', 'tcp_syn', 'icmp_echo'
  ]
})

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
.parameter-form {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.form-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background-color: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.section-header {
  margin-bottom: 1.5rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid #e2e8f0;
  
  h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #2d3748;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    
    .icon {
      color: #4299e1;
    }
  }
}

.form-group {
  margin-bottom: 1.5rem;
  
  label {
    display: block;
    margin-bottom: 0.6rem;
    font-weight: 500;
    color: #4a5568;
    font-size: 0.95rem;
  }
}

.form-row {
  display: flex;
  gap: 1.5rem;
  
  .form-group {
    flex: 1;
  }
}

.form-input {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s ease;
  background-color: #fff;
  
  &:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
  }
  
  &::placeholder {
    color: #a0aec0;
  }
}

.protocol-toggle {
  display: flex;
  gap: 0.8rem;
  background-color: #edf2f7;
  padding: 0.3rem;
  border-radius: 8px;
}

.toggle-btn {
  flex: 1;
  padding: 0.8rem;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &.active {
    background-color: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    color: #2b6cb0;
  }
  
  &:not(.active):hover {
    background-color: rgba(255, 255, 255, 0.5);
  }
}

.input-with-unit {
  position: relative;
  
  .unit {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: #718096;
    pointer-events: none;
  }
}

.select-wrapper {
  position: relative;
  
  .icon-chevron-down {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: #718096;
  }
}

.form-select {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  appearance: none;
  background-color: #fff;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
  }
}

.error-message {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background-color: #fff5f5;
  border: 1px solid #fed7d7;
  border-radius: 6px;
  color: #e53e3e;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.success-message {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background-color: #f0fff4;
  border: 1px solid #c6f6d5;
  border-radius: 6px;
  color: #38a169;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
  
  .btn {
    padding: 0.8rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &-primary {
      background-color: #4299e1;
      color: white;
      border: none;
      
      &:hover {
        background-color: #3182ce;
      }
      
      &:disabled {
        background-color: #a0aec0;
        cursor: not-allowed;
      }
    }
    
    &-secondary {
      background-color: #fff;
      border: 1px solid #e2e8f0;
      color: #4a5568;
      
      &:hover {
        background-color: #f7fafc;
        border-color: #cbd5e0;
      }
    }
  }
}

/* 图标样式 */
.icon {
  font-style: normal;
  
  &-scan:before { content: "🔍"; }
  &-advanced:before { content: "⚙️"; }
  &-settings:before { content: "🛠️"; }
  &-whitelist:before { content: "📋"; }
  &-info:before { content: "ℹ️"; }
  &-ipv6:before { content: "🌐"; }
  &-ipv4:before { content: "📶"; }
  &-play:before { content: "▶️"; }
  &-reset:before { content: "🔄"; }
  &-chevron-down:before { content: "⌄"; }
  &-error:before { content: "❌"; }
  &-success:before { content: "✅"; }
}
</style>