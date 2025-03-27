<template>
    <div class="login-container">
      <h2>网络监测平台登录</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>手机号</label>
          <input v-model="phone" type="text" placeholder="请输入手机号" required />
        </div>
        <div class="form-group">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" required />
        </div>
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>
        <!-- 直接进入平台按钮（不验证身份） -->
        <button type="button" class="btn-guest" @click="enterAsGuest">
          直接进入平台
        </button>
      </form>
      <!-- 错误提示 -->
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </div>
  </template>
  
  <script>
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import axios from 'axios';
  
  export default {
    setup() {
      const phone = ref('');
      const password = ref('');
      const errorMessage = ref('');
      const isLoading = ref(false);
      const router = useRouter();
  
      const handleLogin = async () => {
        errorMessage.value = '';
        isLoading.value = true;
  
        try {
          // 调用后端登录接口
          const response = await axios.post('/api/auth/login', {
            phone: phone.value,
            password: password.value,
          });
  
          if (response.data.success) {
            // 存储 Token 和角色
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('role', response.data.role);
            
            // 跳转到工具页
            router.push('/tools');
          } else {
            errorMessage.value = response.data.message;
          }
        } catch (error) {
          errorMessage.value = error.response?.data?.message || '登录失败，请重试';
        } finally {
          isLoading.value = false;
        }
      };
  
      const enterAsGuest = () => {
        router.push('/detection-platform');
      };
  
      return { phone, password, errorMessage, isLoading, handleLogin, enterAsGuest };
    },
  };
  </script>
  
  <style scoped>
  .login-container {
    max-width: 400px;
    margin: 0 auto;
    padding: 20px;
  }
  .error-message {
    color: red;
    margin-top: 10px;
  }
  .btn-guest {
    margin-top: 10px;
    background: none;
    border: none;
    color: #666;
    text-decoration: underline;
    cursor: pointer;
  }
  </style>