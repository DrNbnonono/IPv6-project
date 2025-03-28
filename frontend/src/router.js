import { createRouter, createWebHistory } from 'vue-router'
import Login from './components/Login.vue'
import ToolsDashboard from './components/ToolsDashboard.vue'
import DetectionPlatform from './components/DetectionPlatform.vue'

const routes = [
  { 
    path: '/',
    redirect: () => {
      return localStorage.getItem('token') ? '/tools' : '/login'
    }
  },
  { path: '/login', component: Login },
  { 
    path: '/tools',
    component: ToolsDashboard,
    meta: { requiresAuth: true }
  },
  {
    path: '/detection-platform',
    component: DetectionPlatform,
    meta: { isPublic: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const requiresAuth = to.meta.requiresAuth
  const token = localStorage.getItem('token')

  if (requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router