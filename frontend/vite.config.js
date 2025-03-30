import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // 后端API地址
        changeOrigin: true
        
      }
    }
  },
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          console.log('代理转发的请求头:', proxyReq.getHeaders()) // 调试代理
        })
      }
    }
  }
})