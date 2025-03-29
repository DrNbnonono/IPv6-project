<template>
    <div class="tools-view">
      <header class="tools-header">
        <h1>工具中心</h1>
        <div class="user-info">
          <span class="username">{{ authStore.username }}</span>
          <button class="btn btn-danger" @click="handleLogout">退出登录</button>
        </div>
      </header>
      
      <div class="tools-container">
        <aside class="tools-sidebar">
          <nav class="tools-nav">
            <router-link 
              v-for="tool in availableTools" 
              :key="tool.path" 
              :to="tool.path"
              class="nav-item"
              active-class="active"
            >
              {{ tool.name }}
            </router-link>
          </nav>
        </aside>
        
        <main class="tools-main">
          <router-view />
        </main>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { useAuthStore } from '@/stores/auth'
  import { useRouter } from 'vue-router'
  
  const authStore = useAuthStore()
  const router = useRouter()
  
  const availableTools = ref([
    { path: '/tools/xmap', name: 'XMap探测' }
    // 可以添加更多工具
  ])
  
  const handleLogout = () => {
    authStore.logout()
    router.push('/login')
  }
  </script>
  
  <style scoped lang="scss">
  .tools-view {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .tools-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background-color: #35495e;
    color: white;
    
    h1 {
      margin: 0;
      font-size: 1.5rem;
    }
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 1rem;

    .username {
      font-weight: 500;
      color: #42b983;
    }
  }
  
  .tools-container {
    display: flex;
    flex: 1;
  }
  
  .tools-sidebar {
    width: 200px;
    background-color: #f8f9fa;
    border-right: 1px solid #ddd;
  }
  
  .tools-nav {
    padding: 1rem 0;
    
    .nav-item {
      display: block;
      padding: 0.75rem 1.5rem;
      color: #35495e;
      text-decoration: none;
      transition: all 0.2s ease;
      
      &:hover {
        background-color: #e9ecef;
      }
      
      &.active {
        background-color: #42b983;
        color: white;
      }
    }
  }
  
  .tools-main {
    flex: 1;
    padding: 2rem;
    background-color: white;
  }
  </style>