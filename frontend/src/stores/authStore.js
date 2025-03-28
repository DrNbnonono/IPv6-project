import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

// 创建带基础路径的axios实例
const apiClient = axios.create({
  baseURL: 'http://localhost:3000', // 明确指向后端服务
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const useAuthStore = defineStore('auth', () => {
  const router = useRouter()
  const token = ref(localStorage.getItem('token') || null)
  const role = ref(localStorage.getItem('role') || null)
  const errorMessage = ref('')

  const login = async (phone, password) => {
    try {
      const response = await apiClient.post('/api/auth/login', { 
        phone, 
        password 
      })
      
      if (response.data.success) {
        token.value = response.data.token
        role.value = response.data.role
        localStorage.setItem('token', token.value)
        localStorage.setItem('role', role.value)
        router.push('/tools')
      }
      return response.data
    } catch (error) {
      errorMessage.value = error.response?.data?.message || `登录失败: ${error.message}`
      console.error('API请求详情:', {
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data
      })
      throw error
    }
  }
  const logout = () => {
    token.value = null
    role.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    router.push('/login')
  }

  const isAuthenticated = () => {
    return !!token.value
  }

  return {
    token,
    role,
    errorMessage,
    login,
    logout,
    isAuthenticated
  }
})