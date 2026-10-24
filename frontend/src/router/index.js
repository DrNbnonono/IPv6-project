import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 路由懒加载
const LoginView = () => import('@/views/auth/LoginView.vue')
const DetectionPlatformView = () => import('@/views/detection/DetectionPlatformView.vue')
const ToolsView = () => import('@/views/tools/ToolsView.vue')
const AIAssistantView = () => import('@/views/tools/aichat/AIAssistantView.vue')
const XmapDashboardView = () => import('@/views/tools/xmap/XmapDashboardView.vue')
const XmapHelpView = () => import('@/views/tools/xmap/XmapHelpView.vue')
const Zgrab2DashboardView = () => import('@/views/tools/zgrab2/Zgrab2DashboardView.vue')
const Zgrab2HelpView = () => import('@/views/tools/zgrab2/Zgrab2HelpView.vue')
const FileManagementView = () => import('@/views/tools/files/FileManagementView.vue')
const JsonAnalysisDashboardView = () => import('@/views/tools/jsonanalysis/JsonAnalysisDashboardView.vue')
const Addr6DashboardView = () => import('@/views/tools/addr6/Addr6DashboardView.vue')
const NmapDashboardView = () => import('@/views/tools/nmap/NmapDashboardView.vue')
const WorkflowDashboardView = () => import('@/views/tools/workflows/WorkflowDashboardView.vue')
const AgentDashboardView = () => import('@/views/tools/agent/AgentDashboardView.vue')
const AdvancedQueryView = () => import('@/views/detection/AdvancedQueryView.vue')

const routes = [
  {
    path: '/',
    redirect: '/detection-platform'
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresGuest: true }
  },
  {
    path: '/detection-platform',
    name: 'detection-platform',
    component: DetectionPlatformView,
    meta: { isPublic: true }
  },
  {
    path: '/tools',
    name: 'tools',
    component: ToolsView,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'agent',
        name: 'agent',
        component: AgentDashboardView,
        meta: { title: 'Agent助手' }
      },
      {
        path: 'aichat',
        name: 'aichat',
        component: AIAssistantView,
        meta: { title: 'AI探测助手' }
      },
      {
        path: 'xmap',
        name: 'xmap',
        component: XmapDashboardView,
        meta: { title: 'XMap探测工具' }
      },
      {
        path: 'zgrab2',
        name: 'zgrab2',
        component: Zgrab2DashboardView,
        meta: { title: 'Zgrab2' }
      },
      {
        path: 'files',
        name: 'files',
        component: FileManagementView,
        meta: { title: '文件管理' }
      },
      {
        path: 'jsonanalysis',
        name: 'jsonanalysis',
        component: JsonAnalysisDashboardView,
        meta: { title: 'JSON分析' }
      },
      {
        path: 'addr6',
        name: 'addr6',
        component: Addr6DashboardView,
        meta: { title: 'Addr6地址生成' }
      },
      {
        path: 'nmap',
        name: 'nmap',
        component: NmapDashboardView,
        meta: { title: 'Nmap网络扫描' }
      },
      {
        path: 'workflows',
        name: 'workflows',
        component: WorkflowDashboardView,
        meta: { title: '工作流管理' }
      },
      {
        path: '/tools/apd',
        name: 'apd',
        component: () => import('@/views/tools/apd/ApdDashboardView.vue'),
        meta: {
          requiresAuth: true,
          title: '别名前缀检测'
        }
      },
      {
        path: '/tools/enrich',
        name: 'enrich',
        component: () => import('@/views/tools/enrich/EnrichDashboardView.vue'),
        meta: {
          requiresAuth: true,
          title: '地址分类与富化'
        }
      },
      {
        path: '/tools/history',
        name: 'history',
        component: () => import('@/views/tools/history/HistoryDashboardView.vue'),
        meta: {
          requiresAuth: true,
          title: '导入批次与变化'
        }
      },
      {
        path: '/tools/tga',
        name: 'tga',
        component: () => import('@/views/tools/tga/TgaDashboardView.vue'),
        meta: {
          requiresAuth: true,
          title: '目标生成'
        }
      },
      {
        path: '/tools/admin',
        name: 'admin',
        component: () => import('@/views/tools/admin/AdminDashboardView.vue'),
        meta: {
          requiresAuth: true,
          requiresAdmin: true,
          title: '扫描策略与审计'
        }
      },
      {
        path: '/tools/database',
        name: 'database',
        component: () => import('@/views/tools/database/DatabaseManagementView.vue'),
        meta: {
          requiresAuth: true,
          adminOnly: true,
          title: '数据库管理'
        }
      },
    ]
  },
  {
    path: '/tools/xmap/help',
    name: 'xmap-help',
    component: XmapHelpView,
    meta: { requiresAuth: true }
  },
  {
    path: '/tools/zgrab2/help',
    name: 'zgrab2-help',
    component: Zgrab2HelpView,
    meta: { requiresAuth: true }
  },
 
  {
    path: '/detection/query',
    name: 'advancedQuery',
    component: AdvancedQueryView,
    meta: {
      requiresAuth: false,
      title: 'IPv6高级查询'
    }
  },
  
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  console.groupCollapsed(`路由跳转: ${from.path} -> ${to.path}`)
  const authStore = useAuthStore()
  
  console.log('路由守卫开始执行')
  console.log('当前认证状态:', authStore.isAuthenticated)
  console.log('localStorage token存在:', !!localStorage.getItem('token'))
  // 确保authStore已初始化
  authStore.init()
  
  // 如果路由需要认证但用户未登录
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      name: 'login',
      query: { redirect: to.fullPath }
    })
  }
  
  // 需要管理员的页面：非管理员回到工具首页（后端对 /api/admin 同样强制校验，这里只是不展示一个只会报 403 的页面）
  if (to.meta.requiresAdmin && authStore.role !== 'admin') {
    return next({ name: 'tools' })
  }

  // 如果路由需要访客但用户已登录
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    return next({ name: 'tools' })
  }
  
  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - IPv6探测平台`
  } else {
    document.title = 'IPv6探测平台'
  }
  
  next()
})

export default router