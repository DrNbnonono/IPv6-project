<template>
    <div class="whitelist-upload">
      <h3>白名单管理</h3>
      <input 
        type="file" 
        @change="handleFileChange" 
        accept=".txt"
        ref="fileInput"
      />
      <button @click="uploadFile" :disabled="!selectedFile">
        上传白名单
      </button>
      
      <div v-if="whitelists.length > 0" class="whitelist-list">
        <h4>可用白名单:</h4>
        <ul>
          <li v-for="file in whitelists" :key="file">
            {{ file }}
            <button @click="selectFile(file)">选择</button>
          </li>
        </ul>
      </div>
    </div>
  </template>
  
  <script setup>

  import { ref, onMounted } from 'vue'
  import { useXmapStore } from '@/stores/xmapStore'
  import { storeToRefs } from 'pinia'

  const xmapStore = useXmapStore()
  const { whitelists } = storeToRefs(xmapStore)
  const selectedFile = ref(null)
  const fileInput = ref(null)
  
  onMounted(() => {
    xmapStore.fetchWhitelists()
  })
  
  const handleFileChange = (e) => {
    selectedFile.value = e.target.files[0]
  }
  
  const uploadFile = async () => {
    if (selectedFile.value) {
      await xmapStore.uploadWhitelist(selectedFile.value)
      fileInput.value.value = '' // 清空文件输入
      selectedFile.value = null
    }
  }
  
  const selectFile = (filename) => {
    emit('select', filename)
  }
  </script>
  
  <style scoped>
  .whitelist-upload {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #eee;
    border-radius: 4px;
  }
  .whitelist-list {
    margin-top: 15px;
  }
  .whitelist-list ul {
    list-style: none;
    padding: 0;
  }
  .whitelist-list li {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
  }
  </style>