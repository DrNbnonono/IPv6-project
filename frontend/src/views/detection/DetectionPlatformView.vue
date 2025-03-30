<template>
  <div class="detection-platform">
    <header class="platform-header">
      <h1>IPv6网络探测平台</h1>
      <button @click="searchVisible = true" class="btn btn-search">
        <i class="icon-search"></i> 搜索
      </button>
      <div class="header-right">
        <div class="time-display">{{ currentTime }}</div>
        <div v-if="!authStore.isAuthenticated" class="auth-actions">
          <button @click="goToLogin" class="btn btn-primary">登录</button>
          <button @click="showGuestTooltip = true" class="btn btn-tools">工具平台</button>
          <div v-if="showGuestTooltip" class="tooltip">请登录后使用工具平台</div>
        </div>
        <div v-else class="auth-actions">
          <span class="username">欢迎，{{ authStore.username }}</span>
          <button @click="goToTools" class="btn btn-tools">工具平台</button>
          <button @click="handleLogout" class="btn btn-secondary">退出</button>
        </div>
      </div>
    </header>
    
    <main class="platform-main">
      <div v-if="!authStore.isAuthenticated" class="guest-notice">
        <h2>访客模式</h2>
        <p>您当前以访客身份访问，可以查询公开的IPv6地址信息。</p>
        <p>登录后可解锁更多功能，包括XMap探测工具等。</p>
      </div>
      
      <div class="detection-container">
        <SearchPanel 
          v-model:visible="searchVisible"
          @search="handleSearch"
        />
        
        <GlobeMap 
          ref="globeMap"
          :countries="countries"
          :asns="asns"
          @country-selected="handleCountrySelect"
          @asn-selected="handleAsnSelect"
        />
        
        <div class="ranking-panels">
          <SidePanel 
            title="国家IPv6地址排名"
            :items="countryRanking"
            class="country-panel"
            @item-selected="handleCountrySelect"
          />
          <SidePanel 
            title="ASN IPv6地址排名"
            :items="asnRanking"
            class="asn-panel"
            @item-selected="handleAsnSelect"
          />
        </div>
        
        <transition name="slide">
          <div v-if="selectedItem" class="detail-panel">
            <CountryDetail 
              v-if="selectedItem.type === 'country'" 
              :data="selectedItem.data"
              @close="selectedItem = null"
            />
            <AsnDetail 
              v-else-if="selectedItem.type === 'asn'"
              :data="selectedItem.data"
              @close="selectedItem = null"
            />
          </div>
        </transition>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDetectionStore } from '@/stores/detection'
import GlobeMap from '@/components/detection/GlobeMap.vue'
import SidePanel from '@/components/detection/SidePanel.vue'
import CountryDetail from '@/components/detection/CountryDetail.vue'
import AsnDetail from '@/components/detection/AsnDetail.vue'
import SearchPanel from '@/components/detection/SearchPanel.vue'

const router = useRouter()
const authStore = useAuthStore()
const detectionStore = useDetectionStore()
const globeMap = ref(null)

// 数据状态
const currentTime = ref('')
const searchVisible = ref(false)
const selectedItem = ref(null)
const showGuestTooltip = ref(false)

// 从store获取数据
const countries = computed(() => detectionStore.countries)
const asns = computed(() => detectionStore.asns)
const countryRanking = computed(() => detectionStore.countryRanking)
const asnRanking = computed(() => detectionStore.asnRanking)

// 初始化数据
onMounted(async () => {
  await detectionStore.fetchData()
  updateTime()
  setInterval(updateTime, 1000)
  
  // 加载Three.js资源
  loadThreeJS().then(() => {
    if (globeMap.value) {
      globeMap.value.initGlobe()
    }
  })
})

// 加载Three.js资源
const loadThreeJS = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js'
    script.onload = () => {
      const orbitScript = document.createElement('script')
      orbitScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/controls/OrbitControls.js'
      orbitScript.onload = resolve
      document.head.appendChild(orbitScript)
    }
    document.head.appendChild(script)
  })
}

// 更新时间显示
const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// 处理国家选择
const handleCountrySelect = (country) => {
  selectedItem.value = {
    type: 'country',
    data: country
  }
  if (globeMap.value) {
    globeMap.value.flyToCountry(country.country_id)
  }
}

// 处理ASN选择
const handleAsnSelect = (asn) => {
  selectedItem.value = {
    type: 'asn',
    data: asn
  }
  if (globeMap.value) {
    globeMap.value.flyToAsn(asn.asn)
  }
}

// 处理搜索
const handleSearch = (result) => {
  if (result.type === 'country') {
    handleCountrySelect(result.data)
  } else if (result.type === 'asn') {
    handleAsnSelect(result.data)
  }
}

// 导航控制
const goToLogin = () => {
  router.push('/login')
}

const goToTools = () => {
  router.push('/tools')
}

// 退出登录
const handleLogout = async () => {
  try {
    await authStore.logout()
    router.push('/login')
  } catch (error) {
    console.error('退出登录失败:', error)
  }
}
</script>

<style scoped>
.detection-platform {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #0f1621;
  color: white;
  overflow: hidden;
}

.platform-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.platform-header h1 {
  margin: 0;
  font-size: 24px;
  color: #4fc3f7;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.time-display {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.auth-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  position: relative;
}

.username {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.tooltip {
  position: absolute;
  top: 100%;
  right: 0;
  background: #ff4757;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.guest-notice {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 2rem;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  text-align: center;
  z-index: 100;
  max-width: 500px;
}

.guest-notice h2 {
  margin-bottom: 1rem;
  color: #4fc3f7;
}

.guest-notice p {
  margin-bottom: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
}

.platform-main {
  height: calc(100vh - 60px);
  position: relative;
}

.detection-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.ranking-panels {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  z-index: 10;
}

.country-panel {
  animation: slideInLeft 0.5s ease-out;
}

.asn-panel {
  animation: slideInLeft 0.7s ease-out;
}

.detail-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 400px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 5px;
  padding: 15px;
  z-index: 100;
  box-shadow: 0 0 20px rgba(0, 150, 255, 0.3);
}

/* 按钮样式 */
.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: #4fc3f7;
  color: white;
}

.btn-primary:hover {
  background: #3db8e8;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.btn-tools {
  background: #42b983;
  color: white;
}

.btn-tools:hover {
  background: #3aa876;
}

/* 动画 */
@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

.btn-search {
  background: #42b983;
  margin-left: auto; /* 使按钮靠右 */
  margin-right: 15px;
}

.icon-search:before {
  content: "🔍";
  margin-right: 5px;
}
</style>