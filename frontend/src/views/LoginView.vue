<template>
    <div class="login-container">
      <div class="login-card">
        <h2>IPv6探测平台登录</h2>
        
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="phone">手机号</label>
            <input
              id="phone"
              v-model="form.phone"
              type="text"
              placeholder="请输入手机号"
              required
            />
          </div>
          
          <div class="form-group">
            <label for="password">密码</label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              required
            />
          </div>
          
          <button type="submit" class="btn btn-primary" :disabled="authStore.isLoading">
            {{ authStore.isLoading ? '登录中...' : '登录' }}
          </button>
        </form>
        
        <div v-if="authStore.errorMessage" class="error-message">
          {{ authStore.errorMessage }}
        </div>
        
        <div class="guest-hint">
          <p>或者以访客身份 <router-link to="/detection-platform">进入探测平台</router-link></p>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue'
  import { useAuthStore } from '@/stores/auth'
  
  const authStore = useAuthStore()
  const form = ref({
    phone: '',
    password: ''
  })
  
  const handleLogin = async () => {
    try {
      await authStore.login(form.value.phone, form.value.password)
    } catch (error) {
      console.error('登录失败:', error)
    }
  }
  </script>
  
  <style scoped lang="scss">
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #f5f5f5;
  }
  
  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 2rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    
    h2 {
      margin-bottom: 1.5rem;
      text-align: center;
      color: #333;
    }
  }
  
  .login-form {
    .form-group {
      margin-bottom: 1rem;
      
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
      }
      
      input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
        
        &:focus {
          outline: none;
          border-color: #42b983;
        }
      }
    }
    
    button {
      width: 100%;
      padding: 0.75rem;
      margin-top: 1rem;
    }
  }
  
  .error-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background-color: #ffebee;
    color: #f44336;
    border-radius: 4px;
    text-align: center;
  }
  
  .guest-hint {
    margin-top: 1.5rem;
    text-align: center;
    color: #666;
    
    a {
      color: #42b983;
      text-decoration: none;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
  </style>