<template>
  <div class="tools-view">
    <header class="tools-header">
      <div class="header-content">
        <div class="logo-area" @click="goToHome">
          <h1>IPv6网络探测平台</h1>
          <span class="logo-subtitle">专业网络探测工具集合</span>
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
        
        <div class="whitelist-management">
      <div class="section-header">
        <h3><i class="icon icon-whitelist"></i> 白名单管理</h3>
        <div class="tool-filter">
          <select v-model="currentTool" @change="fetchWhitelists" class="filter-select">
            <option value="">所有工具</option>
            <option v-for="tool in availableTools" :key="tool" :value="tool">
              {{ tool }}
            </option>
          </select>
          <button class="btn btn-refresh" @click="fetchWhitelists">
            <i class="icon icon-refresh"></i> 刷新
          </button>
        </div>
      </div>
      
      <!-- 上传区域 -->
      <div class="upload-section">
        <div class="upload-card">
          <h4>上传新白名单</h4>
          <div class="form-group">
            <label>选择工具</label>
            <select v-model="uploadTool" class="form-select">
              <option v-for="tool in availableTools" 
                      :key="tool.path" 
                      :value="tool.name.replace('探测', '').toLowerCase()">
                {{ tool.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>文件描述</label>
            <input v-model="uploadDescription" 
                  type="text" 
                  class="form-input" 
                  placeholder="请输入文件描述(必填)">
          </div>
          <div class="form-group">
            <label>选择文件 (.txt)</label>
            <label class="file-upload-btn">
              <input type="file" @change="handleFileSelect" accept=".txt" ref="fileInput">
              <span v-if="!selectedFile" class="btn btn-outline">选择文件</span>
              <span v-else class="file-name">{{ selectedFile.name }}</span>
            </label>
          </div>
          <button class="btn btn-primary" 
                  @click="handleUpload" 
                  :disabled="!canUpload">
            <i class="icon icon-upload"></i> 上传白名单
          </button>
        </div>
      </div>
      
      <!-- 白名单列表 -->
      <div class="whitelist-table">
        <table>
          <thead>
            <tr>
              <th>工具</th>
              <th>描述</th>
              <th>文件名</th>
              <th>上传时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in whitelists.data" :key="file.id">
              <td>{{ file.tool_name }}</td>
              <td>{{ file.description || '无描述' }}</td>
              <td>{{ file.file_name }}</td>
              <td>{{ formatDate(file.uploaded_at) }}</td>
              <td>
                <button class="btn btn-danger" @click="confirmDelete(file.id)">
                  <i class="icon icon-delete"></i> 删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- 分页控件 -->
        <div v-if="whitelists.pagination.total > 0" class="pagination">
          <button 
            @click="changePage(whitelists.pagination.page - 1)"
            :disabled="whitelists.pagination.page <= 1"
            class="btn btn-pagination"
          >
            上一页
          </button>
          <span class="page-info">
            第 {{ whitelists.pagination.page }} 页 / 共 {{ whitelists.pagination.totalPages }} 页
          </span>
          <button 
            @click="changePage(whitelists.pagination.page + 1)"
            :disabled="whitelists.pagination.page >= whitelists.pagination.totalPages"
            class="btn btn-pagination"
          >
            下一页
          </button>
        </div>
        
        <div v-if="whitelists.data.length === 0" class="empty-state">
          <i class="icon icon-empty"></i>
          <p>暂无白名单文件</p>
        </div>
      </div>
    </div>


        <footer class="tools-footer">
          <div class="footer-content">
            <div class="footer-section">
              <h4><i class="icon-contact"></i> 技术支持</h4>
              <p><i class="icon-email"></i> support@ipv6detection.com</p>
              <p><i class="icon-phone"></i> +86 400-123-4567</p>
            </div>
            <div class="footer-section">
              <h4><i class="icon-team"></i> 开发团队</h4>
              <p>网络探测研发中心</p>
              <p>版本: v1.0.0</p>
            </div>
            <div class="footer-section">
              <h4><i class="icon-time"></i> 系统信息</h4>
              <p>在线用户: {{ onlineUsers }}</p>
              <p>启动时间: {{ startupTime }}</p>
            </div>
          </div>
          <div class="copyright">
            © 2023 IPv6探测平台 版权所有 | <a href="#" @click.prevent="showAbout">关于我们</a>
          </div>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
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


const currentTool = ref('')
const whitelists = ref({
  data: [],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1
  }
})

// 上传相关状态
const uploadTool = ref('xmap')
const uploadDescription = ref('')
const selectedFile = ref(null)
const fileInput = ref(null)
// 跳转到探测平台
const goToDetectionPlatform = () => {
  router.push('/detection-platform')
}

// 工具列表 - 未来可以扩展
const availableTools = ref([
  { path: '/tools/xmap', name: 'XMap探测', icon: 'icon-xmap', badge: '热门' },
  { path: '/tools/zgrab2', name: 'zgrab2', icon: 'icon-zgrab2', badge: '新' },
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

// 计算属性
const canUpload = computed(() => {
  return uploadTool.value && selectedFile.value
})

// 获取白名单列表
const fetchWhitelists = async () => {
  try {
    const response = await axios.get('/api/xmap/whitelists', {
      params: {
        tool: currentTool.value,
        page: whitelists.value.pagination.page,
        pageSize: whitelists.value.pagination.pageSize
      }
    })
    
    if (response.data.success) {
      whitelists.value.data = response.data.data
      whitelists.value.pagination = response.data.pagination
    }
  } catch (error) {
    console.error('获取白名单列表失败:', error)
  }
}

// 分页切换
const changePage = (newPage) => {
  if (newPage < 1 || newPage > whitelists.value.pagination.totalPages) return
  whitelists.value.pagination.page = newPage
  fetchWhitelists()
}

// 文件选择处理
const handleFileSelect = (event) => {
  selectedFile.value = event.target.files[0]
}

// 上传文件
const handleUpload = async () => {
  if (!canUpload.value) return
  
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('tool', uploadTool.value)
  formData.append('description', uploadDescription.value)
  
  try {
    const response = await axios.post('/api/xmap/whitelist', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    if (response.data.success) {
      // 上传成功后重置表单并刷新列表
      uploadDescription.value = ''
      selectedFile.value = null
      if (fileInput.value) fileInput.value.value = ''
      fetchWhitelists()
    }
  } catch (error) {
    console.error('上传失败:', error)
  }
}

// 删除确认
const confirmDelete = (id) => {
  if (confirm('确定要删除这个白名单文件吗？此操作不可恢复。')) {
    deleteWhitelist(id)
  }
}

// 删除文件
const deleteWhitelist = async (id) => {
  try {
    const response = await axios.delete(`/api/xmap/whitelist/${id}`)
    if (response.data.success) {
      fetchWhitelists() // 刷新列表
    }
  } catch (error) {
    console.error('删除失败:', error)
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
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
  alert('IPv6探测平台 v1.0.0\n©2023 网络探测研发中心')
}

// 退出登录
const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}

onMounted(() => {
  fetchUserInfo()
  fetchTaskStats()
  fetchWhitelists()
  // 模拟在线用户数变化
  setInterval(() => {
    onlineUsers.value = Math.max(5, Math.floor(Math.random() * 20))
  }, 10000)
})
</script>

<style scoped lang="scss">
.tools-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f5f7fa;
  font-size: 16px; /* 放大基础字体大小 */
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
  padding: 0.8rem 0;
  box-shadow: 0 2px 15px rgba(0, 0, 0, 0.15);
  
  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 3rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo-area {
    cursor: pointer;
    
    h1 {
      margin: 0;
      font-size: 1.8rem;
      font-weight: 600;
      letter-spacing: 1px;
    }
    
    .logo-subtitle {
      font-size: 0.9rem;
      opacity: 0.8;
    }
  }
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  
  .ip-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    
    .ip-label {
      opacity: 0.8;
    }
    
    .ip-value {
      font-family: monospace;
      font-weight: 500;
    }
    
    .ip-country {
      background-color: rgba(255, 255, 255, 0.1);
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      font-size: 0.8rem;
    }
  }
  
  .user-actions {
    display: flex;
    gap: 0.8rem;
  }
}

.btn {
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &-home {
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    
    &:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
  }
  
  &-logout {
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    
    &:hover {
      background-color: rgba(255, 99, 71, 0.3);
    }
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
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
  padding: 0 1rem;
}

.tools-sidebar {
  width: 260px; /* 加宽侧边栏 */
  background-color: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 0;
  
  .sidebar-header {
    padding: 0 1.5rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    margin-bottom: 1rem;
    
    h3 {
      margin: 0;
      font-size: 1.2rem;
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .tool-count {
      font-size: 0.8rem;
      background-color: #f0f0f0;
      padding: 0.2rem 0.5rem;
      border-radius: 10px;
    }
  }
}

.tools-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
  
  .nav-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.5rem;
    color: #555;
    text-decoration: none;
    transition: all 0.2s ease;
    font-size: 1rem;
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
        width: 4px;
        background-color: #42b983;
      }
    }
    
    i {
      font-size: 1.2rem;
      width: 24px;
      text-align: center;
    }
    
    .tool-name {
      flex: 1;
    }
    
    .tool-badge {
      font-size: 0.7rem;
      background-color: #ff4757;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 10px;
    }
  }
}

.sidebar-footer {
  padding: 1.5rem;
  border-top: 1px solid #eee;
  
  .system-status {
    .status-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 0.5rem;
      
      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
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
  padding: 2rem;
  background-color: white;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.main-content {
  flex: 1;
}

.dashboard-overview {
  margin-bottom: 2.5rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #eee;
  
  .overview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    
    h2 {
      margin: 0;
      font-size: 1.5rem;
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  }
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.8rem;
}

.card {
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 1.8rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  transition: all 0.3s ease;
  border: 1px solid #eee;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  }
  
  .card-icon {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.8rem;
    
    &.bg-blue {
      background-color: #4299e1;
    }
    
    &.bg-green {
      background-color: #48bb78;
    }
    
    &.bg-orange {
      background-color: #ed8936;
    }
    
    &.bg-purple {
      background-color: #9f7aea;
    }
  }
  
  .card-content {
    flex: 1;
    
    h4 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      color: #666;
      font-weight: 500;
    }
    
    .card-value {
      margin: 0;
      font-size: 1.8rem;
      font-weight: 600;
      color: #333;
      line-height: 1.2;
    }
    
    .card-label {
      margin: 0.3rem 0 0;
      font-size: 0.85rem;
      color: #999;
    }
  }
}

.tools-footer {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #eee;
  
  .footer-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 1.5rem;
    
    .footer-section {
      h4 {
        margin: 0 0 1rem;
        font-size: 1.1rem;
        color: #444;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      p {
        margin: 0.5rem 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #666;
        font-size: 0.95rem;
      }
    }
  }
  
  .copyright {
    text-align: center;
    padding: 1rem 0;
    color: #999;
    font-size: 0.9rem;
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

.whitelist-management {
  margin-top: 3rem;
  padding: 2rem;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  
  h3 {
    margin: 0;
    font-size: 1.3rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}

.tool-filter {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.upload-section {
  margin-bottom: 2rem;
}

.upload-card {
  padding: 1.5rem;
  background-color: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e0;
  
  h4 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    color: #4a5568;
  }
}

.form-group {
  margin-bottom: 1.2rem;
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #4a5568;
  }
}

.form-select, .form-input {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
  }
}
.btn-primary {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
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
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #e53e3e;
    transform: translateY(-1px);
  }
}

.file-upload-btn {
  display: block;
  padding: 0.8rem;
  background-color: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #edf2f7;
    border-color: #cbd5e0;
  }
  
  .file-name {
    color: #4299e1;
    font-weight: 500;
  }
}


.whitelist-table {
  margin-top: 2rem;
  overflow-x: auto;
  
  table {
    width: 100%;
    border-collapse: collapse;
    
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    
    th {
      background-color: #f8fafc;
      font-weight: 500;
      color: #4a5568;
    }
    
    tr:hover {
      background-color: #f8fafc;
    }
  }
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.empty-state {
  text-align: center;
  padding: 3rem 0;
  color: #a0aec0;
  
  i {
    font-size: 2rem;
    opacity: 0.5;
    margin-bottom: 1rem;
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
.icon-whitelist:before { content: "📋"; }
.icon-delete:before { content: "🗑️"; }
.icon-empty:before { content: "📭"; }
</style>