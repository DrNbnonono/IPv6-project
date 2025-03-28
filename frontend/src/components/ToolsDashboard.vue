<template>
    <div class="tools-container">
      <h1>扫描工具平台</h1>
      <div v-if="userRole" class="user-info">
        当前角色: {{ userRole === 'admin' ? '管理员' : '普通用户' }}
      </div>
      <button @click="handleLogout" class="logout-btn">
        退出登录
      </button>
    </div>
  </template>
  
  <script>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  
  export default {
    setup() {
      const router = useRouter()
      const userRole = ref(localStorage.getItem('role'))
  
      const handleLogout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        router.push('/login')
      }
  
      return { userRole, handleLogout }
    }
  }
  </script>
  
  <style scoped>
  .tools-container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    border: 1px solid #eee;
  }
  .user-info {
    margin: 1rem 0;
    padding: 0.5rem;
    background: #f5f5f5;
  }
  .logout-btn {
    padding: 0.5rem 1rem;
    background: #ff5252;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  </style>