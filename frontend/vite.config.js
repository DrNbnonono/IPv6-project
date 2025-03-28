// vite.config.js
export default defineConfig({
  plugins: [vue({
    template: {
      transformAssetUrls: {
        base: '/'
      }
    }
  })],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    hmr: {
      clientPort: 8080
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url))
      }
    }
  }
})