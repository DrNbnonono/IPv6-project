// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    hmr: {
      host: 'localhost',
      protocol: 'ws'
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})