<template>
  <div id="app">
    <div v-if="authStore.isLoading" class="global-loading">
      正在验证登录状态...
    </div>
    <router-view v-else />
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import axios from 'axios'
// 路由
const router = useRouter()

// 认证状态
const authStore = useAuthStore()

// 组件挂载时初始化认证状态
onMounted(() => {
  authStore.init()
})

watch(router.currentRoute, (to) => {
  console.log('全局路由跳转:', to.path)
}, { immediate: true })

// 监听所有axios请求
axios.interceptors.request.use(config => {
  console.log('全局请求监控:', config.url, config.headers)
  return config
})
</script>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background: #ff9800;
  color: white;
  text-align: center;
  z-index: 9999;
}
</style>