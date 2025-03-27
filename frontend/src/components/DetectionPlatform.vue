<template>
    <div class="platform-container">
      <h1>IPv6 网络检测平台</h1>
      <div v-if="!isLoggedIn" class="guest-warning">
        <p>访客模式仅展示公开数据，登录后可解锁完整功能。</p>
        <button @click="navigateToLogin">立即登录</button>
      </div>
      <!-- 这里放置检测平台内容（后续实现） -->
    </div>
  </template>
  
  <script>
  import { computed } from 'vue';
  import { useRouter } from 'vue-router';
  
  export default {
    setup() {
      const router = useRouter();
      const isLoggedIn = computed(() => !!localStorage.getItem('role'));
  
      const navigateToLogin = () => {
        router.push('/login');
      };
  
      return { isLoggedIn, navigateToLogin };
    },
  };
  </script>
  
  <style scoped>
  .platform-container {
    padding: 20px;
  }
  .guest-warning {
    background-color: #fff8e1;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 20px;
  }
  </style>