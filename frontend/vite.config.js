import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command }) => {
  const config = {
    plugins: [vue()],
    assetsInclude: ['**/*.tif', '**/*.tiff'], // 添加 .tif 和 .tiff
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: '::', // 监听 IPv6（同时覆盖所有地址）
      port: 5173,
      strictPort: false,
      hmr: {
        protocol: 'ws'
        // 让 Vite 自动使用当前服务端口和访问主机，避免端口不一致
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000', // 后端API地址
          changeOrigin: true
        }
      }
    },
    preview: {
      host: '::', // 预览模式也支持 IPv6
      port: 5173
    },
    build: {
      // 优化构建配置，减少内存使用
      chunkSizeWarningLimit: 2000, // 提高块大小警告限制
      minify: 'terser', // 使用terser进行更高效的压缩
      terserOptions: {
        compress: {
          drop_console: true, // 移除console
          drop_debugger: true // 移除debugger
        }
      },
      rollupOptions: {
        output: {
          // 使用函数形式的 manualChunks 进行智能分块
          manualChunks(id) {
            // 常用库单独打包
            if (id.includes('node_modules/vue/') || 
                id.includes('node_modules/vue-router/') || 
                id.includes('node_modules/pinia/')) {
              return 'vendor-vue';
            }
            
            // 其他 node_modules 模块按包名分组
            if (id.includes('node_modules/')) {
              const arr = id.toString().split('node_modules/');
              const packageName = arr[arr.length - 1].split('/')[0];
              return `vendor-${packageName}`;
            }
          }
        }
      },
      // 限制CSS提取大小
      cssCodeSplit: true,
      // 启用源码映射，但使用更轻量的方式
      sourcemap: command === 'serve' ? 'inline' : false
    }
  };

  // 开发环境特定配置
  if (command === 'serve') {
    // 开发环境可以保留代理调试
    config.server.proxy['/api'].configure = (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        console.log('代理转发的请求头:', proxyReq.getHeaders());
      });
    };
  }

  return config;
});
