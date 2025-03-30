<template>
  <div class="login-view">
    <div class="login-background">
      <div class="login-pattern"></div>
    </div>
    
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="logo">
            <i class="icon-globe"></i>
            <h1>IPv6探测平台</h1>
          </div>
          <p class="welcome-text">欢迎回来，请登录您的账户</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="phone">
              <i class="icon-phone"></i> 手机号
            </label>
            <input
              id="phone"
              v-model="form.phone"
              type="text"
              placeholder="请输入注册手机号"
              required
            />
          </div>
          
          <div class="form-group">
            <label for="password">
              <i class="icon-lock"></i> 密码
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              placeholder="请输入登录密码"
              required
            />
          </div>
          
          <button type="submit" class="btn btn-login" :disabled="authStore.isLoading">
            <span v-if="authStore.isLoading">
              <i class="icon-loading"></i> 登录中...
            </span>
            <span v-else>
              <i class="icon-login"></i> 立即登录
            </span>
          </button>
        </form>
        
        <div v-if="authStore.errorMessage" class="error-message">
          <i class="icon-error"></i> {{ authStore.errorMessage }}
        </div>
        
        <div class="login-footer">
          <p>还没有账户？<a href="#" @click.prevent="showRegister">联系管理员注册</a></p>
          <router-link to="/detection-platform" class="guest-link">
            <i class="icon-user"></i> 访客模式进入
          </router-link>
        </div>
      </div>
      
      <div class="login-features">
        <div class="feature-item">
          <i class="icon-shield"></i>
          <h3>安全可靠</h3>
          <p>企业级数据加密保护</p>
        </div>
        <div class="feature-item">
          <i class="icon-speed"></i>
          <h3>高效探测</h3>
          <p>快速发现网络资产</p>
        </div>
        <div class="feature-item">
          <i class="icon-report"></i>
          <h3>专业报告</h3>
          <p>生成详细分析报告</p>
        </div>
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

const showRegister = () => {
  alert('请联系管理员: admin@ipv6detection.com 申请账户')
}
</script>

<style scoped lang="scss">
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f8fafc;
  position: relative;
  overflow: hidden;
}

.login-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #35495e 0%, #42b983 100%);
  z-index: 0;
  
  .login-pattern {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0.1;
    background-image: radial-gradient(#ffffff 1px, transparent 1px);
    background-size: 20px 20px;
  }
}

.login-container {
  display: flex;
  max-width: 1200px;
  width: 90%;
  z-index: 1;
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  overflow: hidden;
}

.login-card {
  flex: 1;
  padding: 3rem;
  background-color: white;
  display: flex;
  flex-direction: column;
}

.login-header {
  text-align: center;
  margin-bottom: 2.5rem;
  
  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    margin-bottom: 1rem;
    
    i {
      font-size: 2.5rem;
      color: #42b983;
    }
    
    h1 {
      margin: 0;
      font-size: 1.8rem;
      color: #35495e;
      font-weight: 600;
    }
  }
  
  .welcome-text {
    margin: 0;
    color: #666;
    font-size: 1rem;
  }
}

.login-form {
  .form-group {
    margin-bottom: 1.5rem;
    
    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #555;
      font-size: 0.95rem;
      
      i {
        font-size: 1.1rem;
      }
    }
    
    input {
      width: 100%;
      padding: 0.9rem 1.2rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.2s ease;
      
      &:focus {
        outline: none;
        border-color: #42b983;
        box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.2);
      }
      
      &::placeholder {
        color: #cbd5e0;
      }
    }
  }
}

.btn-login {
  width: 100%;
  padding: 1rem;
  margin-top: 1rem;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #3aa876;
  }
  
  &:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
}

.error-message {
  margin-top: 1.5rem;
  padding: 0.8rem;
  background-color: #fff5f5;
  color: #f56565;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.login-footer {
  margin-top: auto;
  text-align: center;
  padding-top: 1.5rem;
  border-top: 1px solid #edf2f7;
  font-size: 0.9rem;
  color: #718096;
  
  a {
    color: #4299e1;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  .guest-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.8rem;
    color: #718096;
    
    &:hover {
      color: #4299e1;
    }
  }
}

.login-features {
  width: 350px;
  padding: 3rem 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2rem;
  
  .feature-item {
    color: white;
    padding: 1.5rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
    
    &:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-3px);
    }
    
    i {
      font-size: 2rem;
      margin-bottom: 1rem;
      display: inline-block;
    }
    
    h3 {
      margin: 0 0 0.5rem;
      font-size: 1.2rem;
    }
    
    p {
      margin: 0;
      opacity: 0.8;
      font-size: 0.9rem;
    }
  }
}

/* 图标样式 */
.icon-globe:before { content: "🌐"; }
.icon-phone:before { content: "📱"; }
.icon-lock:before { content: "🔒"; }
.icon-login:before { content: "🚀"; }
.icon-error:before { content: "⚠️"; }
.icon-user:before { content: "👤"; }
.icon-shield:before { content: "🛡️"; }
.icon-speed:before { content: "⚡"; }
.icon-report:before { content: "📊"; }

.icon-loading {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .login-container {
    flex-direction: column;
    width: 95%;
  }
  
  .login-features {
    width: 100%;
    padding: 2rem 1rem;
    flex-direction: row;
    flex-wrap: wrap;
    
    .feature-item {
      flex: 1 1 150px;
    }
  }
  
  .login-card {
    padding: 2rem;
  }
}
</style>