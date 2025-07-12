import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import api from '@/api'  // 导入配置好的API客户端

export const useAuthStore = defineStore('auth', () => {
  const router = useRouter()
  const token = ref(localStorage.getItem('token'))
  const phone = ref(localStorage.getItem('phone'))  // 新增 phone 状态
  const username = ref(localStorage.getItem('username'))
  const role = ref(localStorage.getItem('role'))
  const errorMessage = ref('')
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!token.value)

  const login = async (phoneInput, password) => {
    isLoading.value = true
    errorMessage.value = ''
    
    try {
      const response = await api.auth.login({
        phone: phoneInput,
        password
      })

      if (response.success) {
        token.value = response.token
        phone.value = phoneInput  // 存储手机号
        username.value = response.username  // 存储用户名
        role.value = response.role
        localStorage.setItem('token', token.value)
        localStorage.setItem('phone', phone.value)  // 存储到本地
        localStorage.setItem('username', username.value)  // 存储用户名
        localStorage.setItem('role', role.value)

        // 更新axios默认headers
        axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`

        const redirect = router.currentRoute.value.query.redirect || '/tools'
        router.push(redirect)
      }

      return response
    } catch (error) {
      errorMessage.value = error.response?.data?.message || '登录失败，请检查网络连接'
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const logout = () => {
    token.value = null
    phone.value = null  // 清除手机号
    role.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('phone')  // 清除本地存储
    localStorage.removeItem('role')
    localStorage.removeItem('username')  // 清除用户名
    delete axios.defaults.headers.common['Authorization']
    router.push('/login')
  }

  // 刷新token方法（目前项目不支持refresh token，直接返回失败）
  const refreshToken = async () => {
    console.log('尝试刷新token，但当前项目不支持refresh token功能')
    // 由于后端没有实现refresh token，直接抛出错误让拦截器处理登出
    throw new Error('Token已过期，请重新登录')
  }

  const init = () => {
    token.value = localStorage.getItem('token')
    phone.value = localStorage.getItem('phone')  // 初始化时加载
    role.value = localStorage.getItem('role')
    username.value = localStorage.getItem('username')  // 初始化时加载用户名
    
    if (token.value) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
    }
  }

  init()

  return {
    token,
    phone,  // 导出 phone
    username,
    role,
    errorMessage,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    init
  }
})