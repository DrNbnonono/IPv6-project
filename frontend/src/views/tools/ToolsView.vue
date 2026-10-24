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
          <span class="tool-count">{{ visibleTools.length }}个工具</span>
        </div>
        <nav class="tools-nav">
          <router-link
            v-for="tool in visibleTools"
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
              <p>前端构建: v2.0.0</p>
              <p>访问时间: {{ lastUpdate }}</p>
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
  import { ref, computed, onMounted } from 'vue'
  import { useAuthStore } from '@/stores/auth'
  import { useRouter } from 'vue-router'
  import axios from 'axios' // 仅用于访问第三方（非本平台）接口
  import api from '@/api'

  const authStore = useAuthStore()
  const router = useRouter()

  // 用户信息
  const userIP = ref('获取中...')
  const lastUpdate = ref(new Date().toLocaleDateString())



  // 跳转到探测平台
  const goToDetectionPlatform = () => {
    router.push('/detection-platform')
  }

  // 工具列表 - 未来可以扩展
  const availableTools = ref([
    { path: '/tools/aichat', name: 'AI助手', icon: 'icon-robot', badge: '新' },
    { path: '/tools/database', name: 'database', icon: 'icon-database'},
    { path: '/tools/xmap', name: 'XMap探测', icon: 'icon-xmap', badge: '热门' },
    { path: '/tools/zgrab2', name: 'zgrab2', icon: 'icon-zgrab2', badge: '新' },
    { path: '/tools/workflows', name: '工作流管理', icon: 'icon-workflow', badge: '新' },
    { path: '/tools/files', name: '文件管理', icon: 'icon-files' },
    { path: '/tools/jsonanalysis', name: 'JSON分析', icon: 'icon-json', badge: '新' },
    { path: '/tools/addr6', name: 'addr6', icon: 'icon-addr6' },
    { path: '/tools/nmap', name: 'nmap', icon: 'icon-nmap'},
    { path: '/tools/apd', name: '别名前缀检测', icon: 'icon-apd' },
    { path: '/tools/tga', name: '目标生成', icon: 'icon-tga' },
    { path: '/tools/enrich', name: '地址分类与富化', icon: 'icon-enrich' },
    { path: '/tools/history', name: '导入批次与变化', icon: 'icon-history' },
    { path: '/tools/admin', name: '扫描策略与审计', icon: 'icon-admin', adminOnly: true }
  ])

  // 仅管理员可见的入口不展示给普通用户（后端同样强制校验）
  const visibleTools = computed(() =>
    availableTools.value.filter((tool) => !tool.adminOnly || authStore.role === 'admin')
  )

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
    } catch (error) {
      userIP.value = '未知'
    }
  }



  // 获取任务统计
  const fetchTaskStats = async () => {
    try {
      const response = await api.xmap.getTasks()
      if (response.tasks) {
        const tasks = response.tasks
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
    alert('IPv6探测平台 v2.0.0\n©2025 网络探测研发中心')
  }

  // 退出登录
  const handleLogout = () => {
    authStore.logout()
    router.push('/login')
  }

  onMounted(() => {
    fetchUserInfo()
    fetchTaskStats()
  })
</script>

// ... existing code ...
<style scoped lang="scss">
// 工具箱外壳：深色顶栏 + 浅色侧栏/内容区，配色来自 styles/tokens.css

.tools-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--ov-surface-2);
  font-family: var(--ov-font);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ov-ink);
}

// ---------- 顶栏 ----------
.tools-header {
  position: sticky;
  top: 0;
  z-index: 20;
  color: #fff;
  background: linear-gradient(135deg, var(--ov-bg-deep) 0%, var(--ov-bg-panel-2) 100%);
  border-bottom: 1px solid var(--ov-line);
  box-shadow: 0 4px 20px rgb(2 8 23 / 0.25);

  .header-content {
    max-width: 1600px;
    margin: 0 auto;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .logo-area {
    cursor: pointer;
    min-width: 0;

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: var(--ov-accent-gradient);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .logo-subtitle {
      display: block;
      margin-top: 2px;
      font-size: 12px;
      color: var(--ov-text-dim);
    }
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;

  .ip-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ov-text-dim);

    .ip-value {
      font-family: var(--ov-mono);
      color: var(--ov-text);
    }
  }

  .user-actions {
    display: flex;
    gap: 8px;
  }
}

.user-name {
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ov-text);
  background: rgb(255 255 255 / 0.08);
  border: 1px solid var(--ov-line);
  border-radius: 999px;
}

.btn {
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: var(--ov-radius-sm);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  white-space: nowrap;

  &-home, &-logout, &-platform {
    color: var(--ov-text);
    background: rgb(255 255 255 / 0.06);
    border: 1px solid var(--ov-line);

    &:hover {
      background: rgb(255 255 255 / 0.14);
      border-color: rgb(var(--ov-accent-rgb) / 0.6);
    }
  }

  &-logout:hover {
    background: rgb(239 68 68 / 0.25);
    border-color: rgb(239 68 68 / 0.6);
  }

  &-refresh {
    color: #fff;
    border: none;
    background: var(--ov-accent-gradient);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgb(var(--ov-accent-rgb) / 0.35);
    }
  }
}

// ---------- 主体布局 ----------
.tools-container {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
}

.tools-sidebar {
  width: 248px;
  flex: none;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  background: var(--ov-surface);
  border-right: 1px solid var(--ov-border);

  .sidebar-header {
    padding: 4px 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tool-count {
      padding: 2px 8px;
      font-size: 11px;
      color: var(--ov-ink-dim);
      background: var(--ov-surface-2);
      border: 1px solid var(--ov-border);
      border-radius: 999px;
    }
  }
}

.tools-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;

  .nav-item {
    position: relative;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
    color: var(--ov-ink-dim);
    text-decoration: none;
    border-radius: var(--ov-radius-sm);
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      color: var(--ov-ink);
      background: var(--ov-surface-2);
    }

    &.active {
      font-weight: 600;
      color: var(--ov-accent-2);
      background: var(--ov-accent-soft);

      &::before {
        content: '';
        position: absolute;
        left: -12px;
        top: 8px;
        bottom: 8px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--ov-accent-gradient);
      }
    }

    i {
      width: 20px;
      font-size: 16px;
      text-align: center;
      font-style: normal;
    }

    .tool-name {
      flex: 1;
      white-space: nowrap;
    }

    .tool-badge {
      padding: 1px 7px;
      font-size: 10.5px;
      font-weight: 600;
      color: #fff;
      background: var(--ov-accent-gradient);
      border-radius: 999px;
    }
  }
}

.sidebar-footer {
  margin-top: 12px;
  padding: 12px 8px 0;
  border-top: 1px solid var(--ov-border);

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--ov-ink-dim);

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ov-ink-faint);

      &.online {
        background: var(--ov-success);
        box-shadow: 0 0 0 3px rgb(16 185 129 / 0.18);
      }
    }
  }
}

.tools-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
  display: flex;
  flex-direction: column;
  background: var(--ov-surface);
}

.main-content {
  flex: 1;
  min-width: 0;
}

// ---------- 概览 ----------
.dashboard-overview {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--ov-border);

  .overview-header {
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }
  }
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.card {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--ov-surface);
  border: 1px solid var(--ov-border);
  border-radius: var(--ov-radius);
  box-shadow: var(--ov-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgb(var(--ov-accent-rgb) / 0.4);
    box-shadow: 0 10px 24px rgb(15 23 42 / 0.1);
  }

  .card-icon {
    width: 44px;
    height: 44px;
    flex: none;
    display: grid;
    place-items: center;
    font-size: 20px;
    border-radius: 12px;

    &.bg-blue { background: rgb(59 130 246 / 0.14); }
    &.bg-green { background: rgb(16 185 129 / 0.14); }
    &.bg-orange { background: rgb(245 158 11 / 0.16); }
    &.bg-purple { background: rgb(139 92 246 / 0.14); }
  }

  .card-content {
    flex: 1;
    min-width: 0;

    h4 {
      margin: 0;
      font-size: 12px;
      font-weight: 500;
      color: var(--ov-ink-dim);
    }

    .card-value {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }

    .card-label {
      margin: 0;
      font-size: 11.5px;
      color: var(--ov-ink-faint);
    }
  }
}

// ---------- 页脚 ----------
.tools-footer {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--ov-border);

  .footer-content {
    margin-bottom: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;

    .footer-section {
      h4 {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      p {
        margin: 4px 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--ov-ink-dim);
      }
    }
  }

  .copyright {
    padding: 12px 0 0;
    text-align: center;
    font-size: 12px;
    color: var(--ov-ink-faint);
    border-top: 1px solid var(--ov-border);

    a {
      color: var(--ov-accent-2);
      text-decoration: none;

      &:hover { text-decoration: underline; }
    }
  }
}

.btn-primary {
  padding: 8px 16px;
  color: #fff;
  font-weight: 500;
  border: none;
  border-radius: var(--ov-radius-sm);
  background: var(--ov-accent-gradient);
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgb(var(--ov-accent-rgb) / 0.35); }
  &:disabled { background: var(--ov-ink-faint); cursor: not-allowed; box-shadow: none; transform: none; }
}

.btn-danger {
  padding: 5px 12px;
  color: #fff;
  font-weight: 500;
  border: none;
  border-radius: var(--ov-radius-sm);
  background: var(--ov-danger);
  transition: filter 0.2s ease;

  &:hover { filter: brightness(0.92); }
}

// ---------- 窄屏：侧栏变成顶部横向导航 ----------
@media (max-width: 900px) {
  .tools-header {
    position: static;

    .header-content {
      padding: 10px 16px;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .logo-area .logo-subtitle { display: none; }
  }

  .user-info {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;

    .ip-info { font-size: 11px; }
    .user-actions { gap: 6px; }
  }

  .btn { padding: 5px 10px; font-size: 12px; }

  .tools-container { flex-direction: column; }

  .tools-sidebar {
    width: auto;
    padding: 0;
    border-right: none;
    border-bottom: 1px solid var(--ov-border);

    .sidebar-header,
    .sidebar-footer { display: none; }
  }

  .tools-nav {
    flex-direction: row;
    gap: 6px;
    padding: 10px 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar { display: none; }

    .nav-item {
      flex: none;
      padding: 7px 12px;
      background: var(--ov-surface-2);
      border: 1px solid var(--ov-border);
      border-radius: 999px;

      &.active {
        border-color: rgb(var(--ov-accent-rgb) / 0.5);
        &::before { display: none; }
      }

      .tool-badge { display: none; }
    }
  }

  .tools-main { padding: 16px 12px; }

  .overview-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }

  .card {
    padding: 10px 12px;
    gap: 10px;

    .card-icon { width: 36px; height: 36px; font-size: 17px; border-radius: 10px; }
    .card-content .card-value { font-size: 20px; }
    .card-content .card-label { display: none; }
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
.icon-admin:before { content: "🛡️"; }
.icon-apd:before { content: "🧩"; }
.icon-tga:before { content: "🎯"; }
.icon-enrich:before { content: "🏷️"; }
.icon-history:before { content: "🕓"; }
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
