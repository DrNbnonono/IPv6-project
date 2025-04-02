import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 路由懒加载
const LoginView = () => import('@/views/auth/LoginView.vue')
const DetectionPlatformView = () => import('@/views/detection/DetectionPlatformView.vue')
const ToolsView = () => import('@/views/tools/ToolsView.vue')
const XmapDashboardView = () => import('@/views/tools/xmap/XmapDashboardView.vue')
const XmapHelpView = () => import('@/views/tools/xmap/XmapHelpView.vue')
const Zgrab2DashboardView = () => import('@/views/tools/zgrab2/Zgrab2DashboardView.vue')
const Zgrab2HelpView = () => import('@/views/tools/zgrab2/Zgrab2HelpView.vue')

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