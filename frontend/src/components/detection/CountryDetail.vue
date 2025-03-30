<template>
    <div class="country-detail">
      <div class="detail-header">
        <h3>国家详情: {{ data.country_name_zh || data.country_name }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="detail-content">
        <div class="info-row">
          <span class="label">国家代码:</span>
          <span class="value">{{ data.country_id }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">IPv6地址数:</span>
          <span class="value">{{ data.total_active_ipv6 }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">ASN数量:</span>
          <span class="value">{{ data.asn_count }}</span>
        </div>
        
        <div class="info-row">
          <span class="label">IPv6普及率:</span>
          <span class="value">{{ data.ipv6_adoption_rate }}%</span>
        </div>
        
        <div class="info-row">
          <span class="label">主要ISP:</span>
          <div class="isp-list">
            <div v-for="(isp, index) in data.top_isps" :key="index" class="isp-item">
              {{ isp.name }} ({{ isp.count }}个ASN)
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
  .country-detail {
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
    min-width: 120px;
  }
  
  .value {
    flex-grow: 1;
  }
  
  .isp-list {
    flex-grow: 1;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.05);
    padding: 5px;
    border-radius: 3px;
  }
  
  .isp-item {
    padding: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .isp-item:last-child {
    border-bottom: none;
  }
  </style>