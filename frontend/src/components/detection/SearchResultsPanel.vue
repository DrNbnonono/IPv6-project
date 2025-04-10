<template>
    <div class="search-results-panel" :class="{ 'visible': results.length > 0 }">
      <div class="results-header">
        <h3>搜索结果 ({{ results.length }})</h3>
        <button @click="$emit('close')" class="close-btn">×</button>
      </div>
      
      <div class="results-content">
        <div v-if="results.length > 0" class="results-list">
          <div 
            v-for="(result, index) in results" 
            :key="`${result.type}-${result.id}-${index}`"
            class="result-item"
          >
            <div class="result-info">
              <div class="result-type" :class="result.type.toLowerCase()">
                {{ result.type }}
              </div>
              <div class="result-name">{{ result.name }}</div>
              <div class="result-count" v-if="result.count !== undefined">
                {{ formatNumber(result.count) }} 个地址
              </div>
            </div>
            <button 
              class="view-btn"
              @click="$emit('select', result)"
              title="查看详情"
            >
              查看
            </button>
          </div>
        </div>
        
        <div v-else class="no-results">
          <p>未找到匹配的结果</p>
        </div>
        
        <div v-if="message" class="search-message">
          {{ message }}
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { defineProps, defineEmits } from 'vue';
  
  const props = defineProps({
    results: {
      type: Array,
      default: () => []
    },
    message: {
      type: String,
      default: ''
    }
  });
  
  defineEmits(['close', 'select']);
  
  // 格式化数字
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return new Intl.NumberFormat().format(num);
  };
  </script>
  
  <style scoped>
  .search-results-panel {
    position: absolute;
    top: 70px;
    right: -350px;
    width: 340px;
    max-height: 500px;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition: right 0.3s ease;
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .search-results-panel.visible {
    right: 10px;
  }
  
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .results-header h3 {
    margin: 0;
    font-size: 16px;
    color: #fff;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #aaa;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
  }
  
  .close-btn:hover {
    color: #fff;
  }
  
  .results-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }
  
  .results-list {
    padding: 8px;
  }
  
  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    transition: background 0.2s;
  }
  
  .result-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .result-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .result-type {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  
  .result-type.国家 {
    background: rgba(33, 150, 243, 0.3);
    color: #90caf9;
  }
  
  .result-type.asn {
    background: rgba(76, 175, 80, 0.3);
    color: #a5d6a7;
  }
  
  .result-type.前缀 {
    background: rgba(255, 152, 0, 0.3);
    color: #ffcc80;
  }
  
  .result-name {
    font-size: 14px;
    font-weight: bold;
    color: #fff;
  }
  
  .result-count {
    font-size: 12px;
    color: #aaa;
  }
  
  .view-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  
  .view-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .no-results {
    padding: 20px;
    text-align: center;
    color: #aaa;
  }
  
  .search-message {
    padding: 10px 16px;
    font-size: 12px;
    color: #aaa;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  </style>