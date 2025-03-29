import { createApp } from 'vue'
import { createPinia } from 'pinia'
import axios from 'axios'
import i18n from './i18n'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()
app.use(createPinia())
app.use(pinia)
app.use(i18n)
app.use(router)
app.config.globalProperties.$axios = axios
// 确保在挂载前初始化store
router.isReady().then(() => {
    app.mount('#app')
    console.log('App已挂载')
  })