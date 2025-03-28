// frontend/src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)

// 添加挂载前检查
const rootElement = document.getElementById('app')
if (!rootElement) {
  console.error('致命错误：未找到挂载点 #app')
} else {
  console.log('✅ 找到挂载点 #app', rootElement)
  app.mount('#app')
}