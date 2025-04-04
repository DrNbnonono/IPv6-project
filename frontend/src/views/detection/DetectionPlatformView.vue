<template>
  <div class="detection-platform">
    <div class="background-container">
      <img src="@/assets/images/background.jpg" alt="背景" class="background-image" />
      <canvas ref="particleCanvas" class="particle-canvas"></canvas>
    </div>
    
    <header class="platform-header">
      <h1>IPv6网络探测平台</h1>
      <div class="time-display">{{ currentTime }}</div>
      <div class="user-info">
        <button @click="goToTools" class="tools-btn">工具平台</button>
        <span v-if="authStore.isAuthenticated">欢迎，{{ authStore.username }}</span>
        <button v-if="authStore.isAuthenticated" @click="handleLogout" class="logout-btn">退出</button>
        <button v-else @click="goToLogin" class="login-btn">登录</button>
      </div>
    </header>
    
    <div class="search-container">
      <div class="search-input-group">
        <input 
          v-model="searchQuery" 
          placeholder="输入国家、ASN或IPv6前缀..."
          @keyup.enter="performSearch"
        />
        <button @click="performSearch" class="search-button">
          <i class="search-icon">🔍</i> 搜索
        </button>
      </div>
    </div>
    
    <main class="platform-main">
      <!-- 左侧面板 -->
      <div class="left-panel" :class="{ 'hidden': isZoomedIn || !showLeftPanel }">
        <div class="panel-toggle">
          <button @click="toggleLeftPanel" class="toggle-btn">
            {{ showLeftPanel ? '隐藏' : '显示' }}
          </button>
        </div>
        <div class="panel-container">
          <h2>国家排名</h2>
          <div class="ranking-list">
            <div 
              v-for="country in detectionStore.countryRanking" 
              :key="country.country_id"
              class="ranking-item"
              :class="{ active: selectedCountry && selectedCountry.country_id === country.country_id }"
              @click="handleCountrySelect(country)"
            >
              <span class="rank">{{ country.rank }}</span>
              <span class="name">{{ country.country_name_zh || country.country_name }}</span>
              <span class="value">{{ formatNumber(country.total_active_ipv6) }}</span>
            </div>
          </div>
        </div>
      </div>
      <button 
        v-if="!showLeftPanel && !isZoomedIn" 
        @click="toggleLeftPanel" 
        class="panel-show-btn left-show-btn"
      >
        显示国家排名
      </button>
      <!-- 中央地图区域 -->
      <div class="globe-container" :class="{ 'expanded': isZoomedIn }">
        <GlobeMap 
          ref="globeMap"
          :countries="detectionStore.countries"
          :asns="detectionStore.asns"
          @country-selected="handleCountrySelect"
          @asn-selected="handleAsnSelect"
          @data-load-error="handleDataLoadError"
          @data-load-success="handleDataLoadSuccess"
          @retry-fetch="retryFetchData"
          @zoom-changed="handleZoomChanged"
        />
      </div>
      <!-- 添加右侧面板显示按钮 -->
      <button 
        v-if="!showRightPanel && !isZoomedIn" 
        @click="toggleRightPanel" 
        class="panel-show-btn right-show-btn"
      >
        显示ASN排名
      </button>
      <!-- 右侧面板 -->
      <div class="right-panel" :class="{ 'hidden': isZoomedIn || !showRightPanel }">
          <div class="panel-toggle">
            <button @click="toggleRightPanel" class="toggle-btn">
              {{ showRightPanel ? '隐藏' : '显示' }}
            </button>
          </div>
          <div class="panel-container">
            <h2>ASN排名</h2>
          <div class="ranking-list">
            <div 
              v-for="asn in detectionStore.asnRanking" 
              :key="asn.asn"
              class="ranking-item"
              :class="{ active: selectedAsn && selectedAsn.asn === asn.asn }"
              @click="handleAsnSelect(asn)"
            >
              <span class="rank">{{ asn.rank }}</span>
              <span class="name">{{ asn.as_name_zh || asn.as_name }}</span>
              <span class="value">{{ formatNumber(asn.total_active_ipv6) }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 国家详情面板 (在放大状态下显示) -->
      <div class="country-detail-panel" :class="{ 'visible': isZoomedIn && selectedCountry }">
        <div class="detail-header">
          <h3>{{ selectedCountry ? (selectedCountry.country_name_zh || selectedCountry.country_name) : '国家详情' }}</h3>
          <button @click="resetView" class="close-btn">返回</button>
        </div>
        <div class="detail-content">
          <div v-if="selectedCountry" class="country-details">
            <div class="detail-item">
              <span class="label">国家代码:</span>
              <span class="value">{{ selectedCountry.country_id }}</span>
            </div>
            <div class="detail-item">
              <span class="label">活跃IPv6地址:</span>
              <span class="value">{{ formatNumber(selectedCountry.total_active_ipv6) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">IPv6渗透率:</span>
              <span class="value">{{ selectedCountry.ipv6_penetration ? 
                ((selectedCountry.ipv6_penetration * 100).toFixed(2) + '%') : '暂无数据' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">ASN数量:</span>
              <span class="value">{{ selectedCountry.asn_count || '暂无数据' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">前缀数量:</span>
              <span class="value">{{ selectedCountry.prefix_count || '暂无数据' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">最近更新:</span>
              <span class="value">{{ formatDate(selectedCountry.last_updated) }}</span>
            </div>
            
            <!-- 国家ASN列表 -->
            <div class="country-asns">
              <h4>主要ASN提供商</h4>
              <ul v-if="countryAsns.length">
                <li v-for="asn in countryAsns" :key="asn.asn">
                  <span class="asn-name">{{ asn.as_name_zh || asn.as_name || 'AS' + asn.asn }}</span>
                  <span class="asn-value">{{ formatNumber(asn.total_active_ipv6) }} 个活跃地址</span>
                </li>
              </ul>
              <p v-else>暂无ASN数据</p>
            </div>
            
            <div class="detail-actions">
              <button @click="viewCountryDetails(selectedCountry)" class="detail-btn">查看完整详情</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 搜索结果 -->
      <div v-if="searchResults.length > 0" class="search-results">
        <div class="results-header">
          <h3>搜索结果</h3>
          <button @click="clearSearchResults" class="close-btn">×</button>
        </div>
        <div class="results-list">
          <div 
            v-for="result in searchResults" 
            :key="`${result.type}-${result.id}`"
            class="result-item"
            @click="selectSearchResult(result)"
          >
            <div class="result-type">{{ result.type }}</div>
            <div class="result-name">{{ result.name }}</div>
            <div class="result-value">{{ formatNumber(result.count) }}</div>
          </div>
        </div>
      </div>
    </main>
    
    <!-- 调试面板 -->
    <div class="debug-panel" v-if="showDebug">
      <div class="debug-header">
        <h3>调试信息</h3>
        <button @click="showDebug = false" class="close-btn">×</button>
      </div>
      <div class="debug-content">
        <div class="debug-section">
          <h4>系统状态</h4>
          <p>当前时间: {{ currentTime }}</p>
          <p>数据加载状态: {{ dataLoadingStatus }}</p>
          <p>重试次数: {{ retryCount }}/{{ maxRetries }}</p>
          <p>缩放状态: {{ isZoomedIn ? '已放大' : '全局视图' }}</p>
        </div>
        <div class="debug-section">
          <h4>数据状态</h4>
          <p>国家数据: {{ detectionStore.countries.length > 0 ? '✅' : '❌' }}</p>
          <p>ASN数据: {{ detectionStore.asns.length > 0 ? '✅' : '❌' }}</p>
          <p>国家排名: {{ detectionStore.countryRanking.length > 0 ? '✅' : '❌' }}</p>
          <p>ASN排名: {{ detectionStore.asnRanking.length > 0 ? '✅' : '❌' }}</p>
          <p>国家边界数据: {{ debugInfo.geoDataLoaded ? `✅ (${debugInfo.bordersCreated}条)` : '❌' }}</p>
        </div>
        <div class="debug-section">
          <h4>交互状态</h4>
          <p>选中的国家: {{ selectedCountry ? (selectedCountry.country_name_zh || selectedCountry.country_name) : '无' }}</p>
          <p>选中的ASN: {{ selectedAsn ? (selectedAsn.as_name_zh || selectedAsn.as_name) : '无' }}</p>
        </div>
        <div class="debug-actions">
          <button @click="reloadData" class="debug-btn">重新加载数据</button>
          <button @click="resetView" class="debug-btn">重置视图</button>
          <button @click="toggleAllPanels" class="debug-btn">{{ showAllPanels ? '隐藏所有面板' : '显示所有面板' }}</button>
        </div>
      </div>
    </div>
    <button v-if="!showDebug" @click="showDebug = true" class="debug-toggle-btn">显示调试</button>
    
    <footer class="platform-footer">
      <p>IPv6网络探测平台 | 最后数据更新: {{ lastDataUpdate }}</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDetectionStore } from '@/stores/detection'
import GlobeMap from '@/components/detection/GlobeMap.vue'

// 路由和状态管理
const router = useRouter()
const authStore = useAuthStore()
const detectionStore = useDetectionStore()

// 组件状态
const globeMap = ref(null)
const currentTime = ref(new Date().toLocaleString())
const searchQuery = ref('')
const searchResults = ref([])
const selectedCountry = ref(null)
const selectedAsn = ref(null)
const showDebug = ref(false)
const dataLoadingStatus = ref('等待加载...')
const lastDataUpdate = ref('--')
const retryCount = ref(0)
const maxRetries = 3
const debugInfo = ref({})

// 面板显示状态
const showLeftPanel = ref(true)
const showRightPanel = ref(true)
const isZoomedIn = ref(false)

// 计算当前国家的ASN列表
const countryAsns = computed(() => {
  if (!selectedCountry.value || !detectionStore.asns.length) return []
  
  return detectionStore.asns
    .filter(asn => asn.country_id === selectedCountry.value.country_id)
    .sort((a, b) => (b.total_active_ipv6 || 0) - (a.total_active_ipv6 || 0))
    .slice(0, 10)
})

// 计算是否显示所有面板
const showAllPanels = computed(() => showLeftPanel.value && showRightPanel.value)

// 更新当前时间
const updateTime = () => {
  currentTime.value = new Date().toLocaleString()
}

// 加载数据
const loadData = async () => {
  dataLoadingStatus.value = '正在加载数据...'
  try {
    // 使用正确的API获取地图数据
    await detectionStore.fetchMapData()
    await detectionStore.fetchCountryRanking()
    await detectionStore.fetchAsnRanking()
    
    dataLoadingStatus.value = '数据加载完成'
    retryCount.value = 0
    
    // 更新最后数据更新时间
    if (detectionStore.countries.length > 0) {
      const latestUpdate = detectionStore.countries.reduce((latest, country) => {
        if (!country.last_updated) return latest
        const updateTime = new Date(country.last_updated)
        return updateTime > latest ? updateTime : latest
      }, new Date(0))
      
      lastDataUpdate.value = latestUpdate.toLocaleString()
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    dataLoadingStatus.value = `数据加载失败: ${error.message}`
    
    // 如果数据加载失败且未超过最大重试次数，则重试
    if (retryCount.value < maxRetries) {
      retryCount.value++
      dataLoadingStatus.value = `正在重试 (${retryCount.value}/${maxRetries})...`
      setTimeout(loadData, 2000)
    }
  }
}

// 重新加载数据
const reloadData = () => {
  retryCount.value = 0
  loadData()
  
  if (globeMap.value) {
    globeMap.value.reloadData()
  }
}

// 重试获取数据
const retryFetchData = () => {
  if (retryCount.value < maxRetries) {
    retryCount.value++
    dataLoadingStatus.value = `正在重试 (${retryCount.value}/${maxRetries})...`
    loadData()
  }
}

// 处理数据加载成功
const handleDataLoadSuccess = () => {
  dataLoadingStatus.value = '数据加载成功'
}

// 处理数据加载错误
const handleDataLoadError = (error) => {
  dataLoadingStatus.value = `数据加载失败: ${error}`
  
  if (retryCount.value < maxRetries) {
    retryCount.value++
    dataLoadingStatus.value = `正在重试 (${retryCount.value}/${maxRetries})...`
    setTimeout(loadData, 2000)
  }
}

// 执行搜索
const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  
  try {
    const results = await detectionStore.searchIPv6Data(searchQuery.value)
    
    // 格式化搜索结果
    searchResults.value = results.map(item => {
      if (item.type === 'country') {
        return {
          id: item.country_id,
          type: '国家',
          name: item.country_name_zh || item.country_name,
          count: item.total_active_ipv6,
          data: item
        }
      } else if (item.type === 'asn') {
        return {
          id: item.asn,
          type: 'ASN',
          name: item.as_name_zh || item.as_name,
          count: item.total_active_ipv6,
          data: item
        }
      } else if (item.type === 'prefix') {
        return {
          id: item.prefix_id,
          type: '前缀',
          name: item.prefix,
          count: item.active_addresses_count,
          data: item
        }
      }
      return null
    }).filter(Boolean)
  } catch (error) {
    console.error('搜索失败:', error)
    searchResults.value = []
  }
}

// 选择搜索结果
const selectSearchResult = (result) => {
  if (result.type === '国家') {
    handleCountrySelect(result.data)
  } else if (result.type === 'ASN') {
    handleAsnSelect(result.data)
  } else if (result.type === '前缀') {
    // 处理前缀点击
    console.log('选择前缀:', result.data)
    // 这里可以添加前缀详情的处理逻辑
  }
}

// 清除搜索结果
const clearSearchResults = () => {
  searchResults.value = []
  searchQuery.value = ''
}

// 处理国家选择
const handleCountrySelect = (country) => {
  selectedCountry.value = country
  selectedAsn.value = null
  
  if (globeMap.value) {
    globeMap.value.flyToCountry(country.country_id)
  }
}

// 处理ASN选择
const handleAsnSelect = (asn) => {
  selectedAsn.value = asn
  selectedCountry.value = null
  
  if (globeMap.value) {
    globeMap.value.flyToAsn(asn.asn)
  }
}

// 处理缩放状态变化
const handleZoomChanged = (data) => {
  isZoomedIn.value = data.isZoomedIn
  
  if (data.isZoomedIn && data.country) {
    selectedCountry.value = data.country
  }
}

// 查看国家详情
const viewCountryDetails = (country) => {
  router.push(`/detection/country/${country.country_id}`)
}

// 查看ASN详情
const viewAsnDetails = (asn) => {
  router.push(`/detection/asn/${asn.asn}`)
}

// 重置视图
const resetView = () => {
  if (globeMap.value) {
    globeMap.value.resetCamera()
    globeMap.value.resetHighlights()
  }
  
  isZoomedIn.value = false
  selectedCountry.value = null
  selectedAsn.value = null
}

// 切换左侧面板
const toggleLeftPanel = () => {
  showLeftPanel.value = !showLeftPanel.value
}

// 切换右侧面板
const toggleRightPanel = () => {
  showRightPanel.value = !showRightPanel.value
}

// 切换所有面板
const toggleAllPanels = () => {
  const newState = !showAllPanels.value
  showLeftPanel.value = newState
  showRightPanel.value = newState
}

// 跳转到登录页
const goToLogin = () => {
  // 直接使用window.location.href进行跳转，这会导致页面刷新
  window.location.href = '/login'
}

const goToTools = () => {
  // 直接使用window.location.href进行跳转，这会导致页面刷新
  window.location.href = '/tools'
}

// 处理登出
const handleLogout = () => {
  // 先执行登出操作
  authStore.logout()
  // 然后使用页面刷新方式跳转
  window.location.href = '/login'
}


// 格式化数字
const formatNumber = (num) => {
  if (num === undefined || num === null) return '-'
  return new Intl.NumberFormat().format(num)
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString()
}

const particleCanvas = ref(null)
let particleContext = null
let particles = []
let animationFrame = null

// 初始化粒子系统
const initParticleSystem = () => {
  if (!particleCanvas.value) return
  
  const canvas = particleCanvas.value
  particleContext = canvas.getContext('2d')
  
  // 设置画布大小为窗口大小
  const resizeCanvas = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  
  // 监听窗口大小变化
  window.addEventListener('resize', resizeCanvas)
  resizeCanvas()
  
  // 创建粒子
  const createParticles = () => {
    particles = []
    const particleCount = Math.floor(window.innerWidth * window.innerHeight / 10000)
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.5,
        color: `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.25})`,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25
      })
    }
  }
  
  // 绘制粒子
  const drawParticles = () => {
    particleContext.clearRect(0, 0, canvas.width, canvas.height)
    
    particles.forEach(particle => {
      particleContext.beginPath()
      particleContext.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
      particleContext.fillStyle = particle.color
      particleContext.fill()
      
      // 更新粒子位置
      particle.x += particle.speedX
      particle.y += particle.speedY
      
      // 边界检查
      if (particle.x < 0 || particle.x > canvas.width) {
        particle.speedX = -particle.speedX
      }
      
      if (particle.y < 0 || particle.y > canvas.height) {
        particle.speedY = -particle.speedY
      }
    })
    
    // 绘制粒子之间的连线
    drawLines()
    
    // 继续动画
    animationFrame = requestAnimationFrame(drawParticles)
  }
  
  // 绘制粒子之间的连线
  const drawLines = () => {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < 100) {
          particleContext.beginPath()
          particleContext.strokeStyle = `rgba(255, 255, 255, ${0.2 * (1 - distance / 100)})`
          particleContext.lineWidth = 0.5
          particleContext.moveTo(particles[i].x, particles[i].y)
          particleContext.lineTo(particles[j].x, particles[j].y)
          particleContext.stroke()
        }
      }
    }
  }
  
  // 启动粒子系统
  createParticles()
  drawParticles()
  
  // 清理函数
  onUnmounted(() => {
    window.removeEventListener('resize', resizeCanvas)
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
    }
  })
}

//组件卸载之前主动清理资源

// 组件挂载时初始化
onMounted(() => {
  // 加载数据
  loadData()
  
  // 设置时间更新定时器
  const timeInterval = setInterval(updateTime, 1000)
  
  // 初始化粒子系统
  initParticleSystem()
  
  // 组件卸载时清除定时器和粒子系统
  onUnmounted(() => {
    clearInterval(timeInterval)
    
    // 确保清理粒子系统资源
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    
    // 清理粒子上下文
    if (particleContext && particleCanvas.value) {
      particleContext.clearRect(0, 0, particleCanvas.value.width, particleCanvas.value.height)
      particleContext = null
    }
    
    // 清空粒子数组
    particles = []
    
    // 强制垃圾回收提示（不能直接调用，但可以帮助释放内存）
    setTimeout(() => {
      console.log('Detection平台资源已清理')
    }, 100)
  })
})
</script>

<style scoped>
.detection-platform {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  position: relative;
  overflow: hidden;
  color: #e0e0e0;
  font-family: 'Arial', sans-serif;
}

.background-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  overflow: hidden;
}

.background-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* 确保图片覆盖整个容器 */
  opacity: 1.0; /* 可以调整透明度 */
}


.platform-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.platform-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #4fc3f7;
  text-shadow: 0 0 10px rgba(79, 195, 247, 0.5);
}

.time-display {
  font-size: 0.9rem;
  color: #b0bec5;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logout-btn, .login-btn, .tools-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #e0e0e0;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover, .login-btn:hover, .tools-btn:hover {
  background: rgba(79, 195, 247, 0.4);
}

.search-container {
  display: flex;
  justify-content: center;
  padding: 15px 0;
  z-index: 10;
}

.search-input-group {
  display: flex;
  width: 50%;
  max-width: 600px;
}

.search-input-group input {
  flex: 1;
  padding: 10px 15px;
  border: none;
  border-radius: 4px 0 0 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  font-size: 1rem;
  outline: none;
  transition: background 0.2s;
}

.search-input-group input:focus {
  background: rgba(255, 255, 255, 0.15);
}

.search-input-group input::placeholder {
  color: #90a4ae;
}

.search-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 15px;
  background: rgba(79, 195, 247, 0.3);
  border: none;
  border-radius: 0 4px 4px 0;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.2s;
}

.search-button:hover {
  background: rgba(79, 195, 247, 0.5);
}

.search-icon {
  font-style: normal;
}

.platform-main {
  display: flex;
  flex: 1;
  position: relative;
  overflow: hidden;
}

.left-panel, .right-panel {
  width: 280px;
  height: 100%;
  background: rgba(0, 0, 0, 0.25); /* 增加透明度 */
  backdrop-filter: blur(5px);
  overflow-y: auto;
  z-index: 5;
  display: flex;
  flex-direction: column;
  transition: transform 0.5s ease, opacity 0.5s ease, visibility 0.5s;
  visibility: visible;
}

.left-panel.hidden {
  transform: translateX(-300px);
  opacity: 0;
  visibility: hidden; /* 完全隐藏元素 */
}

.right-panel.hidden {
  transform: translateX(300px);
  opacity: 0;
  visibility: hidden; /* 完全隐藏元素 */
}

.left-panel {
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.right-panel {
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}


.panel-toggle {
  display: flex;
  justify-content: flex-end;
  padding: 5px 10px;
  background: rgba(0, 0, 0, 0.3);
}

.toggle-btn {
  background: rgba(79, 195, 247, 0.3);
  border: none;
  color: white;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: rgba(79, 195, 247, 0.5);
}

.panel-container {
  padding: 15px;
  flex: 1;
}

.panel-container h2 {
  margin: 0 0 15px 0;
  font-size: 1.2rem;
  color: #4fc3f7;
  border-bottom: 1px solid rgba(79, 195, 247, 0.3);
  padding-bottom: 5px;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.ranking-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ranking-item.active {
  background: rgba(79, 195, 247, 0.2);
  border-left: 3px solid #4fc3f7;
}

.ranking-item .rank {
  width: 30px;
  text-align: center;
  font-weight: bold;
  color: #4fc3f7;
}

.ranking-item .name {
  flex: 1;
  margin: 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ranking-item .value {
  font-size: 0.8rem;
  color: #b0bec5;
}

.globe-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: transparent !important;
  transition: transform 0.5s ease, margin 0.5s ease, width 0.5s ease;
}

.globe-container.expanded {
  transform: translateX(-140px);
  width: calc(100% - 400px); /* 调整宽度而不是margin */
}

.country-detail-panel {
  position: absolute;
  top: 10px;
  right: -400px;
  width: 380px;
  height: calc(100% - 20px);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: right 0.5s ease;
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.country-detail-panel.visible {
  right: 10px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(79, 195, 247, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #4fc3f7;
}

.close-btn {
  background: none;
  border: none;
  color: #e0e0e0;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.country-details {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
}

.detail-item .label {
  color: #90a4ae;
}

.detail-item .value {
  color: #fff;
  font-weight: 500;
}

.country-asns {
  margin-top: 20px;
}

.country-asns h4 {
  color: #4fc3f7;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(79, 195, 247, 0.3);
}

.country-asns ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.country-asns li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.asn-name {
  color: #4fc3f7;
  font-size: 14px;
}

.asn-value {
  color: #e0e0e0;
  font-size: 14px;
}

.detail-actions {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

.detail-btn {
  background: rgba(79, 195, 247, 0.3);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #e0e0e0;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.detail-btn:hover {
  background: rgba(79, 195, 247, 0.5);
}

.search-results {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  max-width: 700px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 30;
  overflow: hidden;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: rgba(79, 195, 247, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.results-header h3 {
  margin: 0;
  color: #4fc3f7;
}

.results-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: background 0.2s;
}

.result-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.result-type {
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 12px;
  margin-right: 10px;
  min-width: 50px;
  text-align: center;
}

.result-name {
  flex: 1;
  color: #e0e0e0;
}

.result-value {
  color: #b0bec5;
  font-size: 14px;
  margin-left: 10px;
}

.debug-panel {
  position: absolute;
  bottom: 40px;
  right: 10px;
  width: 300px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  overflow: hidden;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: rgba(255, 152, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.debug-header h3 {
  margin: 0;
  color: #ff9800;
}

.debug-content {
  padding: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.debug-section {
  margin-bottom: 15px;
}

.debug-section h4 {
  color: #ff9800;
  margin: 0 0 8px 0;
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 152, 0, 0.3);
  padding-bottom: 3px;
}

.debug-section p {
  margin: 5px 0;
  font-size: 12px;
  color: #b0bec5;
}

.debug-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.debug-btn {
  background: rgba(255, 152, 0, 0.2);
  border: 1px solid rgba(255, 152, 0, 0.5);
  color: #e0e0e0;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.debug-btn:hover {
  background: rgba(255, 152, 0, 0.4);
}

.debug-toggle-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 152, 0, 0.5);
  color: #ff9800;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  z-index: 100;
  transition: background 0.2s;
}

.debug-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.platform-footer {
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
  font-size: 0.8rem;
  color: #90a4ae;
  z-index: 10;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .left-panel, .right-panel {
    width: 240px;
  }
  
  .country-detail-panel {
    width: 340px;
  }
  
  .globe-container.expanded {
    transform: translateX(-120px);
    margin-right: 340px;
  }
}

@media (max-width: 992px) {
  .left-panel, .right-panel {
    width: 200px;
  }
  
  .country-detail-panel {
    width: 300px;
  }
  
  .globe-container.expanded {
    transform: translateX(-100px);
    margin-right: 300px;
  }
  
  .search-input-group {
    width: 70%;
  }
}

@media (max-width: 768px) {
  .platform-main {
    flex-direction: column;
  }
  
  .left-panel, .right-panel {
    width: 100%;
    height: auto;
    max-height: 200px;
  }
  
  .left-panel.hidden, .right-panel.hidden {
    transform: translateY(-220px);
  }
  
  .right-panel.hidden {
    transform: translateY(220px);
  }
  
  .globe-container.expanded {
    transform: none;
    margin-right: 0;
  }
  
  .country-detail-panel {
    width: 90%;
    left: 5%;
    right: auto;
    transform: translateY(100%);
    bottom: 10px;
    top: auto;
    height: 60%;
  }
  
  .country-detail-panel.visible {
    transform: translateY(0);
    right: auto;
  }
  
  .search-input-group {
    width: 90%;
  }
  
  .search-results {
    width: 90%;
  }
}

.particle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 确保不会阻止鼠标事件 */
  z-index: 0;
}

.panel-show-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(79, 195, 247, 0.3);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #e0e0e0;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  z-index: 15;
  transition: background 0.2s;
}

.panel-show-btn:hover {
  background: rgba(79, 195, 247, 0.5);
}

.left-show-btn {
  left: 0;
  border-radius: 0 4px 4px 0;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 15px 5px;
}

.right-show-btn {
  right: 0;
  border-radius: 4px 0 0 4px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 15px 5px;
}
</style>