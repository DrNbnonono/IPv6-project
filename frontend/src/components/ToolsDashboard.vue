<template>
    <div class="tools-container">
      <div class="header">
        <h1>扫描工具平台</h1>
        <button @click="authStore.logout()" class="logout-btn">
          <i class="fas fa-sign-out-alt"></i> 退出登录
        </button>
      </div>
      
      <nav class="tool-nav">
        <router-link 
          to="/tools/xmap" 
          class="nav-item"
          active-class="active"
        >
          <i class="fas fa-map-marked-alt"></i> XMap探测
        </router-link>
      </nav>
      
      <div class="tool-content">
        <router-view></router-view>
      </div>
    </div>
  </template>
  
  <script setup>
  import { useAuthStore } from '@/stores/authStore'
  
  const authStore = useAuthStore()
  </script>
  
  <style scoped>
  .tools-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 15px;
    border-bottom: 1px solid #eaeaea;
  }
  
  .tool-nav {
    display: flex;
    gap: 15px;
    margin-bottom: 30px;
  }
  
  .nav-item {
    padding: 10px 20px;
    border-radius: 4px;
    background: #f5f5f5;
    color: #333;
    text-decoration: none;
    transition: all 0.3s;
  }
  
  .nav-item:hover {
    background: #e0e0e0;
  }
  
  .nav-item.active {
    background: #42b983;
    color: white;
  }
  
  .tool-content {
    background: white;
    padding: 25px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  
  .logout-btn {
    padding: 8px 15px;
    background: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.3s;
  }
  
  .logout-btn:hover {
    background: #d32f2f;
  }
  </style>