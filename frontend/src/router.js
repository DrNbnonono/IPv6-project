import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'  // 添加这行导入
import Login from '@/components/Login.vue'
import ToolsDashboard from '@/components/ToolsDashboard.vue'
import DetectionPlatform from '@/components/DetectionPlatform.vue'
import XmapDashboard from '@/views/xmap/XmapDashboard.vue'

const routes = [
  { 
    path: '/',
    redirect: () => {
      return localStorage.getItem('token') ? '/tools' : '/login'
    }
  },
  { 
    path: '/login',
    name: 'login',
    component: Login,
    meta: { hideNav: true }
  },
  { 
    path: '/tools',
    name: 'tools',
    component: ToolsDashboard,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'xmap',
        name: 'xmap',
        component: XmapDashboard,
        meta: { title: 'XMap探测工具' }
      }
    ]
  },
  {
    path: '/detection-platform',
    name: 'detection-platform',
    component: DetectionPlatform,
    meta: { isPublic: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 修正路由守卫
router.beforeEach((to) => {
  // 不能在外部直接使用 store，需要在回调内部初始化
  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated()) {
      return '/login'
    }
  }
})

export default router