<template>
    <div class="search-panel" :class="{ 'visible': visible }">
      <div class="search-header">
        <h3>IPv6搜索</h3>
        <button @click="closePanel">
          <i class="close-icon">×</i>
        </button>
      </div>
      
      <div class="search-content">
        <div class="search-input">
          <input 
            v-model="searchQuery" 
            placeholder="输入国家、ASN或IPv6前缀..."
            @keyup.enter="performSearch"
          />
          <button @click="performSearch">
            <i class="search-icon">🔍</i>
          </button>
        </div>
        
        <div v-if="isLoading" class="loading">
          搜索中...
        </div>
        
        <div v-if="searchResults.length > 0" class="search-results">
          <div 
            v-for="result in searchResults" 
            :key="result.id"
            class="result-item"
            @click="selectResult(result)"
          >
            <div class="result-type">{{ result.type }}</div>
            <div class="result-name">{{ result.name }}</div>
            <div class="result-count" v-if="result.count">{{ result.count }}</div>
          </div>
        </div>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { useDetectionStore } from '@/stores/detection'
  
  const emit = defineEmits(['update:visible', 'search'])
  const detectionStore = useDetectionStore()  // 新增这行
  
  const searchQuery = ref('')
  const searchResults = ref([])
  const isLoading = ref(false)
  const errorMessage = ref('')
  
  const closePanel = () => {
    emit('update:visible', false)
  }
  
  const performSearch = async () => {
    if (!searchQuery.value.trim()) return
    
    isLoading.value = true
    errorMessage.value = ''
    searchResults.value = []
    
    try {
      // 修改这行：通过 detectionStore 调用 searchIPv6Data
      const results = await detectionStore.searchIPv6Data(searchQuery.value)
      searchResults.value = results.map(item => {
        if (item.type === 'country') {
          return {
            type: '国家',
            id: item.country_id,
            name: item.country_name_zh || item.country_name,
            count: item.total_active_ipv6,
            data: item
          }
        } else if (item.type === 'asn') {
          return {
            type: 'ASN',
            id: item.asn,
            name: item.as_name_zh || item.as_name,
            count: item.total_active_ipv6,
            data: item
          }
        } else if (item.type === 'prefix') {
          return {
            type: '前缀',
            id: item.prefix_id,
            name: item.prefix,
            count: item.active_addresses,
            data: item
          }
        }
      })
    } catch (error) {
      errorMessage.value = error.message || '搜索失败'
    } finally {
      isLoading.value = false
    }
  }
  
  const selectResult = (result) => {
    emit('search', {
      type: result.data.type,
      data: result.data
    })
    closePanel()
  }
  </script>
  
  <style scoped>
  .search-panel {
    position: absolute;
    top: 80px;
    right: 20px;
    width: 350px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 5px;
    padding: 15px;
    z-index: 100;
    box-shadow: 0 0 20px rgba(0, 150, 255, 0.3);
    transform: translateX(400px);
    transition: transform 0.3s ease;
  }
  
  .search-panel.visible {
    transform: translateX(0);
  }
  
  .search-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }
  
  .search-header h3 {
    margin: 0;
    color: #4fc3f7;
    font-size: 18px;
  }
  
  .search-header button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 5px;
  }
  
  .search-input {
    display: flex;
    margin-bottom: 15px;
  }
  
  .search-input input {
    flex-grow: 1;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px 0 0 3px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  
  .search-input button {
    background: #4fc3f7;
    border: none;
    border-radius: 0 3px 3px 0;
    padding: 0 15px;
    cursor: pointer;
  }
  
  .loading, .error-message {
    padding: 10px;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .result-item {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    margin-bottom: 5px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .result-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .result-type {
    width: 60px;
    color: #81c784;
    font-size: 12px;
  }
  
  .result-name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .result-count {
    color: #4fc3f7;
    font-family: monospace;
    margin-left: 10px;
  }
  </style>