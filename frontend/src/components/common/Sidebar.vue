<template>
    <div class="sidebar">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['tab', { active: activeTab === tab.id }]"
        @click="$emit('change-tab', tab.id)"
      >
        {{ tab.label }}
      </div>
    </div>
  </template>
  
  <script setup>
  defineProps({
    activeTab: {
      type: String,
      required: true
    }
  })
  
  defineEmits(['change-tab'])
  
  const tabs = [
    { id: 'config', label: '参数配置' },
    { id: 'history', label: '任务历史' }
  ]
  </script>
  
  <style scoped>
  .sidebar {
    width: 200px;
    padding: 20px;
    background: #f5f5f5;
    border-right: 1px solid #ddd;
  }
  .tab {
    padding: 10px;
    margin-bottom: 5px;
    cursor: pointer;
    border-radius: 4px;
  }
  .tab:hover {
    background: #e0e0e0;
  }
  .tab.active {
    background: #42b983;
    color: white;
  }
  </style>