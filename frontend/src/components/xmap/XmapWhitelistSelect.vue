<template>
    <div class="whitelist-select">
      <select v-model="selectedFile" @change="handleSelect">
        <option value="">不使用白名单</option>
        <option 
          v-for="file in xmapStore.whitelists" 
          :key="file" 
          :value="file"
        >
          {{ file }}
        </option>
      </select>
      
      <div class="upload-section">
        <label class="upload-label">
          <input 
            type="file" 
            @change="handleFileChange" 
            accept=".txt"
            style="display: none"
          />
          上传新白名单
        </label>
        <span v-if="uploading" class="upload-status">上传中...</span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { useXmapStore } from '@/stores/xmap'
  
  const xmapStore = useXmapStore()
  const selectedFile = ref('')
  const uploading = ref(false)
  
  const emit = defineEmits(['update:modelValue', 'upload'])
  
  const handleSelect = () => {
    emit('update:modelValue', selectedFile.value)
  }
  
  const handleFileChange = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    // 验证文件类型
    if (!file.name.endsWith('.txt')) {
      alert('请上传.txt格式的白名单文件')
      return
    }
    
    uploading.value = true
    try {
      await xmapStore.uploadWhitelist(file)
      selectedFile.value = file.name
      emit('update:modelValue', file.name)
      emit('upload', file.name)
    } catch (error) {
      console.error('上传白名单失败:', error)
    } finally {
      uploading.value = false
      event.target.value = '' // 重置文件输入
    }
  }
  </script>
  
  <style scoped lang="scss">
  .whitelist-select {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    
    select {
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
  
  .upload-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .upload-label {
    padding: 0.5rem 1rem;
    background-color: #f0f0f0;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    
    &:hover {
      background-color: #e0e0e0;
    }
  }
  
  .upload-status {
    color: #666;
    font-size: 0.9rem;
  }
  </style>