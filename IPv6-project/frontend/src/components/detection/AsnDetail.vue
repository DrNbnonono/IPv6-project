<template>
    <div class="asn-detail">
      <div class="detail-header">
        <h3>ASN详情: {{ data.as_name_zh || data.as_name }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="detail-content">
        <div class="info-row">
          <span class="label">ASN编号:</span>
          <span class="value">{{ data.asn }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">IPv6地址数:</span>
          <span class="value">{{ data.total_active_ipv6 }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">位置:</span>
          <span class="value">{{ data.country_name_zh || data.country_name }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">ISP:</span>
          <span class="value">{{ data.isp }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">前缀列表:</span>
          <div class="prefixes">
            <div v-for="(prefix, index) in data.prefixes" :key="index" class="prefix-item">
              {{ prefix.prefix }} ({{ prefix.active_addresses }}活跃地址)
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  defineProps({
    data: {
      type: Object,
      required: true
    }
  })
  </script>
  
  <style scoped>
  .asn-detail {
    background: rgba(0, 0, 0, 0.8);
    border-radius: 5px;
    padding: 15px;
    color: white;
    max-height: 80vh;
    overflow-y: auto;
  }
  
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .detail-header h3 {
    margin: 0;
    color: #4fc3f7;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0 5px;
  }
  
  .info-row {
    display: flex;
    margin-bottom: 10px;
  }
  
  .label {
    font-weight: bold;
    color: #81c784;
    min-width: 100px;
  }
  
  .value {
    flex-grow: 1;
  }
  
  .prefixes {
    flex-grow: 1;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.05);
    padding: 5px;
    border-radius: 3px;
  }
  
  .prefix-item {
    padding: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-family: monospace;
  }
  
  .prefix-item:last-child {
    border-bottom: none;
  }
  </style>