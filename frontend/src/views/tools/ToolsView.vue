<template>
  <div class="tools-view">
    <header class="tools-header">
      <div class="header-content">
        <div class="logo-area" @click="goToHome">
          <h1>ObserV6</h1>
          <span class="logo-subtitle">IPv6网络安全态势感知与漏洞治理可视化平台</span>
        </div>
        <div class="user-info">
          <div class="ip-info">
            <span class="ip-label">您的IP:</span>
            <span class="ip-value">{{ userIP }}</span>
            <span class="ip-country">{{ userCountry }}</span>
            <span class="user-name" v-if="authStore.username">
              <i class="icon icon-user"></i> {{ authStore.username }}
            </span>
          </div>
          <div class="user-actions">
            <button class="btn btn-platform" @click="goToDetectionPlatform">
              <i class="icon icon-radar"></i> 探测平台
            </button>
            <button class="btn btn-home" @click="goToHome">
              <i class="icon icon-home"></i> 首页
            </button>
            <button class="btn btn-logout" @click="handleLogout">
              <i class="icon icon-logout"></i> 退出
            </button>
          </div>
        </div>
      </div>
    </header>
    
    <div class="tools-container">
      <aside class="tools-sidebar">
        <div class="sidebar-header">
          <h3><i class="icon-toolbox"></i> 工具箱</h3>
          <span class="tool-count">{{ availableTools.length }}个工具</span>
        </div>
        <nav class="tools-nav">
          <router-link
            v-for="tool in availableTools"
            :key="tool.path"
            :to="tool.path"
            class="nav-item"
            active-class="active"
          >
            <i :class="tool.icon"></i>
            <span class="tool-name">{{ tool.name }}</span>
            <span v-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
          </router-link>
        </nav>
        <div class="sidebar-footer">
          <div class="system-status">
            <div class="status-item">
              <span class="status-dot online"></span>
              <span>系统状态: 正常</span>
            </div>
            <div class="status-item">
              <span class="status-dot"></span>
              <span>最后更新: {{ lastUpdate }}</span>
            </div>
          </div>
        </div>
      </aside>
      
      <main class="tools-main">
        <div class="main-content">
          <div class="dashboard-overview">
            <div class="overview-header">
              <h2><i class="icon-dashboard"></i> 控制面板</h2>
              <button class="btn btn-refresh" @click="refreshData">
                <i class="icon-refresh"></i> 刷新数据
              </button>
            </div>
            
            <div class="overview-cards">
              <div class="card" v-for="stat in stats" :key="stat.title">
                <div class="card-icon" :class="stat.bgColor">
                  <i :class="stat.icon"></i>
                </div>
                <div class="card-content">
                  <h4>{{ stat.title }}</h4>
                  <p class="card-value">{{ stat.value }}</p>
                  <p class="card-label">{{ stat.label }}</p>
                </div>
              </div>
            </div>
          </div>
          
          <router-view />
        </div>
        



        <footer class="tools-footer">
          <div class="footer-content">
            <div class="footer-section">
              <h4><i class="icon-contact"></i> 技术支持</h4>
              <p><i class="icon-email"></i> http://observ6.com/</p>
              <p><i class="icon-phone"></i> +86 1352656040</p>
            </div>
            <div class="footer-section">
              <h4><i class="icon-team"></i> 开发团队</h4>
              <p>MNGA</p>
              <p>版本: v2.0.0</p>
            </div>
            <div class="footer-section">
              <h4><i class="icon-time"></i> 系统信息</h4>
              <p>在线用户: {{ onlineUsers }}</p>
              <p>启动时间: {{ startupTime }}</p>
            </div>
          </div>
          <div class="copyright">
            © 2025 ObserV6 版权所有 | <a href="#" @click.prevent="showAbout">关于我们</a>
          </div>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useAuthStore } from '@/stores/auth'
  import { useRouter } from 'vue-router'
  import axios from 'axios'

  const authStore = useAuthStore()
  const router = useRouter()

  // 用户信息
  const userIP = ref('获取中...')
  const userCountry = ref('中国')
  const onlineUsers = ref(12)
  const startupTime = ref('2025-03-30 08:00:00')
  const lastUpdate = ref(new Date().toLocaleDateString())



  // 跳转到探测平台
  const goToDetectionPlatform = () => {
    router.push('/detection-platform')
  }

  // 工具列表 - 未来可以扩展
  const availableTools = ref([
    { path: '/tools/database', name: 'database', icon: 'icon-database'},
    { path: '/tools/xmap', name: 'XMap探测', icon: 'icon-xmap', badge: '热门' },
    { path: '/tools/zgrab2', name: 'zgrab2', icon: 'icon-zgrab2', badge: '新' },
    { path: '/tools/workflows', name: '工作流管理', icon: 'icon-workflow', badge: '新' },
    { path: '/tools/files', name: '文件管理', icon: 'icon-files' },
    { path: '/tools/jsonanalysis', name: 'JSON分析', icon: 'icon-json', badge: '新' },
    { path: '/tools/addr6', name: 'addr6', icon: 'icon-addr6' },
    { path: '/tools/nmap', name: 'nmap', icon: 'icon-nmap'}
  ])

  // 统计数据
  const stats = ref([
    { title: '总任务数', value: 0, label: '全部扫描任务', icon: 'icon-total', bgColor: 'bg-blue' },
    { title: '进行中', value: 0, label: '正在运行任务', icon: 'icon-running', bgColor: 'bg-orange' },
    { title: '已完成', value: 0, label: '成功完成任务', icon: 'icon-completed', bgColor: 'bg-green' },
    { title: '今日新增', value: 0, label: '24小时内新增', icon: 'icon-new', bgColor: 'bg-purple' }
  ])

  // 获取用户IP和国家
  const fetchUserInfo = async () => {
    try {
      // 实际项目中这里应该调用您的后端API
      const ipResponse = await axios.get('https://api.ipify.org?format=json')
      userIP.value = ipResponse.data.ip
      
      // 模拟国家信息
      const countries = ['中国', '美国', '日本', '德国', '英国']
      userCountry.value = countries[Math.floor(Math.random() * countries.length)]
    } catch (error) {
      userIP.value = '未知'
      userCountry.value = '未知'
    }
  }



  // 获取任务统计
  const fetchTaskStats = async () => {
    try {
      const response = await axios.get('/api/xmap/tasks')
      if (response.data.tasks) {
        const tasks = response.data.tasks
        stats.value[0].value = tasks.length
        stats.value[1].value = tasks.filter(t => t.status === 'running').length
        stats.value[2].value = tasks.filter(t => t.status === 'completed').length
        stats.value[3].value = tasks.filter(t => {
          const taskDate = new Date(t.created_at)
          const now = new Date()
          return (now - taskDate) < 24 * 60 * 60 * 1000
        }).length
      }
    } catch (error) {
      console.error('获取任务统计失败:', error)
    }
  }

  // 刷新数据
  const refreshData = () => {
    fetchUserInfo()
    fetchTaskStats()
  }

  // 返回首页
  const goToHome = () => {
    router.push('/tools')
  }

  // 显示关于信息
  const showAbout = () => {
    alert('IPv6探测平台 v1.0.0\n©2025 网络探测研发中心')
  }

  // 退出登录
  const handleLogout = () => {
    authStore.logout()
    router.push('/login')
  }

  onMounted(() => {
    fetchUserInfo()
    fetchTaskStats()
    // 模拟在线用户数变化
    setInterval(() => {
      onlineUsers.value = Math.max(5, Math.floor(Math.random() * 20))
    }, 10000)
  })
</script>

// ... existing code ...
<style scoped lang="scss">
.tools-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f5f7fa;
  font-size: 12px; /* 放大基础字体大小 */
  line-height: 1.6;
}

.user-name {
  margin-left: 1rem;
  padding: 0.3rem 0.8rem;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  
  .icon-user {
    font-size: 0.9rem;
  }
}

.btn-platform {
  padding: 0.6rem 1.2rem;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  
  &:hover {
    background-color: rgba(70, 130, 180, 0.3);
  }
}

.tools-header {
  background: linear-gradient(135deg, #35495e 0%, #2c3e50 100%);
  color: white;
  padding: 0.6rem 0; // 减小垂直内边距
  box-shadow: 0 2px 15px rgba(0, 0, 0, 0.15);
  
  .header-content {
    max-width: 1400px; // 保持头部内容居中，如果需要头部内容也靠左，可以移除此行和下一行
    margin: 0 auto;    // 保持头部内容居中
    padding: 0 1.5rem; // 减小水平内边距
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo-area {
    cursor: pointer;
    
    h1 {
      margin: 0;
      font-size: 1.4rem; // 略微减小字体
      font-weight: 600;
      letter-spacing: 1px;
    }
    
    .logo-subtitle {
      font-size: 0.85rem; // 略微减小字体
      opacity: 0.8;
    }
  }
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem; // 减小间距
  
  .ip-info {
    display: flex;
    align-items: center;
    gap: 0.4rem; // 减小间距
    font-size: 0.85rem; // 略微减小字体
    margin-bottom: 0.4rem; // 减小间距
    
    .ip-label {
      opacity: 0.8;
    }
    
    .ip-value {
      font-family: monospace;
      font-weight: 500;
    }
    
    .ip-country {
      background-color: rgba(255, 255, 255, 0.1);
      padding: 0.15rem 0.4rem; // 减小内边距
      border-radius: 10px; // 调整圆角
      font-size: 0.75rem; // 略微减小字体
    }
  }
  
  .user-actions {
    display: flex;
    gap: 0.6rem; // 减小间距
  }
}

.btn {
  padding: 0.5rem 1rem; // 减小内边距
  border-radius: 5px; // 调整圆角
  font-size: 0.85rem; // 略微减小字体
  display: inline-flex;
  align-items: center;
  gap: 0.4rem; // 减小间距
  cursor: pointer;
  transition: all 0.2s ease;
  
  &-home, &-logout, &-platform { // 合并相似按钮样式
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    
    &:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
  }
  
  &-logout:hover {
    background-color: rgba(255, 99, 71, 0.3);
  }
   &-platform:hover {
    background-color: rgba(70, 130, 180, 0.3);
  }
  
  &-refresh {
    background-color: #42b983;
    color: white;
    border: none;
    
    &:hover {
      background-color: #3aa876;
    }
  }
}

.tools-container {
  display: flex;
  flex: 1;
  // max-width: 1400px; // 移除此行使容器占满宽度
  // margin: 0 auto;    // 移除此行使容器占满宽度
  width: 100%;
  padding: 0; // 移除容器的水平内边距，使侧边栏紧贴左侧
}

.tools-sidebar {
  width: 240px; // 略微减小侧边栏宽度
  background-color: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  padding: 1rem 0; // 减小垂直内边距
  
  .sidebar-header {
    padding: 0 1rem 0.8rem; // 减小内边距
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    margin-bottom: 0.8rem; // 减小外边距
    
    h3 {
      margin: 0;
      font-size: 1.1rem; // 略微减小字体
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.4rem; // 减小间距
    }
    
    .tool-count {
      font-size: 0.75rem; // 略微减小字体
      background-color: #f0f0f0;
      padding: 0.15rem 0.4rem; // 减小内边距
      border-radius: 8px; // 调整圆角
    }
  }
}

.tools-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.4rem 0; // 减小垂直内边距
  
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.8rem; // 减小间距
    padding: 0.7rem 1rem; // 减小内边距
    color: #555;
    text-decoration: none;
    transition: all 0.2s ease;
    font-size: 0.9rem; // 略微减小字体
    position: relative;
    
    &:hover {
      background-color: #f5f7fa;
      color: #35495e;
    }
    
    &.active {
      background-color: #f0f7ff;
      color: #42b983;
      font-weight: 500;
      
      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px; // 减小指示器宽度
        background-color: #42b983;
      }
    }
    
    i {
      font-size: 1.1rem; // 略微减小图标大小
      width: 20px; // 调整宽度
      text-align: center;
    }
    
    .tool-name {
      flex: 1;
    }
    
    .tool-badge {
      font-size: 0.65rem; // 略微减小字体
      background-color: #ff4757;
      color: white;
      padding: 0.15rem 0.4rem; // 减小内边距
      border-radius: 8px; // 调整圆角
    }
  }
}

.sidebar-footer {
  padding: 1rem; // 减小内边距
  border-top: 1px solid #eee;
  
  .system-status {
    .status-item {
      display: flex;
      align-items: center;
      gap: 0.4rem; // 减小间距
      font-size: 0.8rem; // 略微减小字体
      color: #666;
      margin-bottom: 0.4rem; // 减小外边距
      
      .status-dot {
        display: inline-block;
        width: 7px; // 减小点大小
        height: 7px; // 减小点大小
        border-radius: 50%;
        background-color: #ccc;
        
        &.online {
          background-color: #42b983;
        }
      }
    }
  }
}

.tools-main {
  flex: 1;
  padding: 1.5rem; // 减小内边距
  background-color: white;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.main-content {
  flex: 1;
}

.dashboard-overview {
  margin-bottom: 1.5rem; // 减小外边距
  padding-bottom: 1.5rem; // 减小内边距
  border-bottom: 1px solid #eee;
  
  .overview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem; // 减小外边距
    
    h2 {
      margin: 0;
      font-size: 1.3rem; // 略微减小字体
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.4rem; // 减小间距
    }
  }
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); // 调整最小宽度
  gap: 1rem; // 减小间距
}

.card {
  background-color: white;
  border-radius: 8px; // 调整圆角
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.07); // 调整阴影
  padding: 1.2rem; // 减小内边距
  display: flex;
  align-items: center;
  gap: 1rem; // 减小间距
  transition: all 0.3s ease;
  border: 1px solid #eee;
  
  &:hover {
    transform: translateY(-4px); // 调整悬浮效果
    box-shadow: 0 5px 14px rgba(0, 0, 0, 0.1); // 调整悬浮阴影
  }
  
  .card-icon {
    width: 50px; // 减小图标容器大小
    height: 50px; // 减小图标容器大小
    border-radius: 10px; // 调整圆角
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.6rem; // 减小图标大小
    
    &.bg-blue { background-color: #4299e1; }
    &.bg-green { background-color: #48bb78; }
    &.bg-orange { background-color: #ed8936; }
    &.bg-purple { background-color: #9f7aea; }
  }
  
  .card-content {
    flex: 1;
    
    h4 {
      margin: 0 0 0.3rem; // 调整外边距
      font-size: 0.9rem; // 略微减小字体
      color: #666;
      font-weight: 500;
    }
    
    .card-value {
      margin: 0;
      font-size: 1.6rem; // 略微减小字体
      font-weight: 600;
      color: #333;
      line-height: 1.2;
    }
    
    .card-label {
      margin: 0.2rem 0 0; // 调整外边距
      font-size: 0.8rem; // 略微减小字体
      color: #999;
    }
  }
}

.tools-footer {
  margin-top: 2rem; // 减小外边距
  padding-top: 1.5rem; // 减小内边距
  border-top: 1px solid #eee;
  
  .footer-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); // 调整最小宽度
    gap: 1.5rem; // 减小间距
    margin-bottom: 1rem; // 减小外边距
    
    .footer-section {
      h4 {
        margin: 0 0 0.8rem; // 调整外边距
        font-size: 1rem; // 略微减小字体
        color: #444;
        display: flex;
        align-items: center;
        gap: 0.4rem; // 减小间距
      }
      
      p {
        margin: 0.4rem 0; // 调整外边距
        display: flex;
        align-items: center;
        gap: 0.4rem; // 减小间距
        color: #666;
        font-size: 0.85rem; // 略微减小字体
      }
    }
  }
  
  .copyright {
    text-align: center;
    padding: 0.8rem 0; // 减小内边距
    color: #999;
    font-size: 0.85rem; // 略微减小字体
    border-top: 1px solid #eee;
    
    a {
      color: #4299e1;
      text-decoration: none;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
}


.btn-primary {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 0.7rem 1.2rem; // 减小内边距
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #3aa876;
    transform: translateY(-1px);
  }
  
  &:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
}

.btn-danger {
  background-color: #f56565;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem; // 减小内边距
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #e53e3e;
    transform: translateY(-1px);
  }
}





/* 图标样式 */
.icon {
  &-user:before { content: "👤"; }
  &-radar:before { content: "📡"; }
}
.icon-home:before { content: "🏠"; }
.icon-logout:before { content: "🚪"; }
.icon-toolbox:before { content: "🧰"; }
.icon-xmap:before { content: "📡"; }
.icon-scan:before { content: "🔍"; }
.icon-analyze:before { content: "📊"; }
.icon-dashboard:before { content: "📈"; }
.icon-refresh:before { content: "🔄"; }
.icon-total:before { content: "📋"; }
.icon-running:before { content: "⚡"; }
.icon-completed:before { content: "✅"; }
.icon-new:before { content: "🆕"; }
.icon-contact:before { content: "📞"; }
.icon-email:before { content: "✉️"; }
.icon-phone:before { content: "📱"; }
.icon-team:before { content: "👥"; }
.icon-time:before { content: "⏱️"; }
.icon-delete:before { content: "🗑️"; }
.icon-empty:before { content: "📭"; }
.icon-database:before { content: "🗄️"; }
.icon-zgrab2:before { content: "🛰️"; } // 添加zgrab2图标示例
.icon-addr6:before { content: "🌐"; } // 添加addr6图标示例
.icon-nmap:before { content: "🗺️"; } // 添加nmap图标示例
.icon-upload:before { content: "📤"; } // 添加上传图标示例
.icon-files:before { content: "📁"; } // 添加文件管理图标
.icon-json:before { content: "📊"; } // JSON分析图标
.icon-workflow:before { content: "🔗"; } // 工作流图标
.icon-node:before { content: "⚪"; } // 节点图标
.icon-template:before { content: "📋"; } // 模板图标
.icon-play:before { content: "▶️"; } // 播放图标
.icon-pause:before { content: "⏸️"; } // 暂停图标
.icon-stop:before { content: "⏹️"; } // 停止图标
.icon-history:before { content: "📜"; } // 历史图标
.icon-edit:before { content: "✏️"; } // 编辑图标
.icon-eye:before { content: "👁️"; } // 查看图标
.icon-plus:before { content: "➕"; } // 加号图标
.icon-close:before { content: "❌"; } // 关闭图标
.icon-arrow-left:before { content: "⬅️"; } // 左箭头图标
.icon-arrow-right:before { content: "➡️"; } // 右箭头图标
.icon-save:before { content: "💾"; } // 保存图标
.icon-check:before { content: "✔️"; } // 检查图标
.icon-warning:before { content: "⚠️"; } // 警告图标
.icon-filter:before { content: "🔽"; } // 过滤图标
.icon-download:before { content: "⬇️"; } // 下载图标
.icon-file:before { content: "📄"; } // 文件图标
.icon-list:before { content: "📝"; } // 列表图标
.icon-all:before { content: "🌟"; } // 全部图标
.icon-chart:before { content: "📈"; } // 图表图标
.icon-robot:before { content: "🤖"; } // 机器人图标
.icon-shield:before { content: "🛡️"; } // 盾牌图标
</style>
