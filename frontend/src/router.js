import { createRouter, createWebHistory } from 'vue-router';
import Login from './components/Login.vue';
import DetectionPlatform from './components/DetectionPlatform.vue';
import ToolsDashboard from './components/ToolsDashboard.vue';

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { 
    path: '/detection-platform', 
    component: DetectionPlatform,
    meta: { isPublic: true }
  },
  { 
    path: '/tools', 
    component: ToolsDashboard,
    meta: { requiresAuth: true }
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：检查 Token 有效性
router.beforeEach(async (to, from, next) => {
  const isPublic = to.meta.isPublic;
  const token = localStorage.getItem('token');

  if (isPublic) {
    return next(); // 允许访问公开页面
  }

  if (!token) {
    return next('/login'); // 未登录跳转到登录页
  }

  // 验证 Token 是否有效（可选：调用后端校验接口）
  try {
    // 示例：简单解析 Token（实际项目应发送到后端验证）
    const decoded = jwt_decode(token);
    if (decoded.exp < Date.now() / 1000) {
      throw new Error('Token 已过期');
    }
    next();
  } catch (error) {
    localStorage.removeItem('token');
    next('/login');
  }
});

export default router;