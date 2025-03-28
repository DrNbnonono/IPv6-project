<template>
    <form @submit.prevent="submitForm" class="parameter-form">
      <div class="form-row">
        <label>扫描目标:</label>
        <input v-model="formData.targetaddress" required />
      </div>
      
      <div class="form-row">
        <label>目标端口:</label>
        <input v-model="formData.targetPort" type="number" />
      </div>
      
      <div class="form-row">
        <label>协议类型:</label>
        <select v-model="formData.ipv6">
          <option :value="true">IPv6</option>
          <option :value="false">IPv4</option>
        </select>
      </div>
      
      <div class="form-row">
        <label>扫描速率(bits/sec):</label>
        <input v-model="formData.rate" type="number" />
      </div>
      
      <div class="form-row">
        <label>白名单文件:</label>
        <input type="file" @change="handleFileUpload" />
      </div>
      
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? '扫描中...' : '开始扫描' }}
      </button>

      <div class="form-row">
      <label>白名单:</label>
      <select v-model="formData.whitelistFile">
        <option value="">无</option>
        <option v-for="file in whitelists" :value="file" :key="file">
          {{ file }}
        </option>
      </select>
    </div>
    
    <WhitelistUpload @select="formData.whitelistFile = $event" />
    </form>
  </template>
  
  <script setup>
  
  import { ref } from 'vue'

  import { useXmapStore } from '@/stores/xmapStore'
  import { storeToRefs } from 'pinia'
  import WhitelistUpload from './WhitelistUpload.vue'
  
  const xmapStore = useXmapStore()
  const { whitelists } = storeToRefs(xmapStore)
  const emit = defineEmits(['start-scan'])
  const props = defineProps({
    isLoading: Boolean
  })
  
  const formData = ref({
    targetaddress: '',
    targetPort: '',
    ipv6: true,
    rate: '',
    whitelistFile: null
  })
  
  const handleFileUpload = (event) => {
    formData.value.whitelistFile = event.target.files[0]
  }
  
  const submitForm = () => {
    emit('start-scan', formData.value)
  }
  </script>