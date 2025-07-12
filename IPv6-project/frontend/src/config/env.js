// 环境配置文件
export const ENV_CONFIG = {
  // API基础地址配置
  API_BASE_URL: (() => {
    const hostname = window.location.hostname
    const protocol = window.location.protocol
    
    // 开发环境检测
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api'
    }
    
    // Docker环境或其他本地环境
    if (hostname.includes('192.168.') || hostname.includes('10.') || hostname.includes('172.')) {
      return `${protocol}//${hostname}:3000/api`
    }
    
    // 生产环境使用相对路径（通过代理）
    return '/api'
  })(),
  
  // 超时配置
  TIMEOUT: 60000,
  
  // 是否为开发环境
  IS_DEV: process.env.NODE_ENV === 'development',
  
  // 是否启用调试日志
  ENABLE_DEBUG: window.location.hostname === 'localhost' || process.env.NODE_ENV === 'development'
}

// 调试信息
if (ENV_CONFIG.ENABLE_DEBUG) {
  console.log('🔧 环境配置:', {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    apiBaseUrl: ENV_CONFIG.API_BASE_URL,
    isDev: ENV_CONFIG.IS_DEV
  })
}

export default ENV_CONFIG
