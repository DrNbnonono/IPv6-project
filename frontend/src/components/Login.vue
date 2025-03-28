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
      <button type="submit" :disabled="authStore.isLoading">
        {{ authStore.isLoading ? '登录中...' : '登录' }}
      </button>
    </form>
    <div v-if="authStore.errorMessage" class="error-message">
      {{ authStore.errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const phone = ref('')
const password = ref('')

const handleLogin = async () => {
  await authStore.login(phone.value, password.value)
}
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button[type="submit"] {
  width: 100%;
  padding: 0.75rem;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.error-message {
  margin-top: 1rem;
  color: #ff5252;
  text-align: center;
}
</style>