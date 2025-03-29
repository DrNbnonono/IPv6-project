<template>
    <div class="detection-platform">
      <header class="platform-header">
        <h1>IPv6网络探测平台</h1>
        <div v-if="!authStore.isAuthenticated" class="auth-actions">
          <router-link to="/login" class="btn btn-primary">登录</router-link>
        </div>
        <div v-else class="auth-actions">
          <router-link to="/tools" class="btn btn-primary">进入工具中心</router-link>
        </div>
      </header>
      
      <main class="platform-main">
        <div class="guest-notice" v-if="!authStore.isAuthenticated">
          <h2>访客模式</h2>
          <p>您当前以访客身份访问，可以查询公开的IPv6地址信息。</p>
          <p>登录后可解锁更多功能，包括XMap探测工具等。</p>
        </div>
        
        <!-- IPv6地址查询区域 -->
        <div class="search-section">
          <h2>IPv6地址查询</h2>
          <div class="search-form">
            <input 
              type="text" 
              v-model="searchQuery" 
              placeholder="输入地区、ASN或IP段进行查询"
            />
            <button class="btn btn-primary" @click="handleSearch">查询</button>
          </div>
          
          <!-- 查询结果展示 -->
          <div v-if="searchResults.length > 0" class="search-results">
            <h3>查询结果</h3>
            <table>
              <thead>
                <tr>
                  <th>IP地址</th>
                  <th>地区</th>
                  <th>ASN</th>
                  <th>活跃时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="result in searchResults" :key="result.id">
                  <td>{{ result.ip }}</td>
                  <td>{{ result.region }}</td>
                  <td>{{ result.asn }}</td>
                  <td>{{ result.lastActive }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { useAuthStore } from '@/stores/auth'
  
  const authStore = useAuthStore()
  const searchQuery = ref('')
  const searchResults = ref([])
  
  const handleSearch = () => {
    // 这里暂时模拟数据，后续连接后端API
    searchResults.value = [
      {
        id: 1,
        ip: '2001:db8::1',
        region: '北京',
        asn: 'AS4134',
        lastActive: '2023-05-15 14:30'
      },
      {
        id: 2,
        ip: '2001:db8::2',
        region: '上海',
        asn: 'AS4812',
        lastActive: '2023-05-15 13:45'
      }
    ]
  }
  </script>
  
  <style scoped lang="scss">
  .detection-platform {
    padding: 20px;
  }
  
  .platform-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eee;
    
    h1 {
      margin: 0;
      color: #35495e;
    }
  }
  
  .platform-main {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .guest-notice {
    padding: 1.5rem;
    margin-bottom: 2rem;
    background-color: #f8f9fa;
    border-radius: 8px;
    text-align: center;
    
    h2 {
      margin-bottom: 1rem;
      color: #35495e;
    }
    
    p {
      margin-bottom: 0.5rem;
      color: #666;
    }
  }
  
  .search-section {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    
    h2 {
      margin-bottom: 1rem;
      color: #35495e;
    }
  }
  
  .search-form {
    display: flex;
    gap: 10px;
    margin-bottom: 1.5rem;
    
    input {
      flex: 1;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
      
      &:focus {
        outline: none;
        border-color: #42b983;
      }
    }
    
    button {
      padding: 0 1.5rem;
    }
  }
  
  .search-results {
    margin-top: 1.5rem;
    
    h3 {
      margin-bottom: 1rem;
      color: #35495e;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      
      th, td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #eee;
      }
      
      th {
        background-color: #f8f9fa;
        font-weight: 500;
      }
      
      tr:hover {
        background-color: #f5f5f5;
      }
    }
  }
  </style>