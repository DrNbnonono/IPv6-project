<template>
  <div class="detection-platform ">
    <div class="background-container">
      <img src="@/assets/images/background.jpg" alt="背景" class="background-image" />
      <canvas ref="particleCanvas" class="particle-canvas"></canvas>
    </div>
    
        <header class="platform-header">
      <h1>ObserV6</h1>
      <div class="time-display">{{ currentTime }}</div>
      <div class="user-info">
        <button @click="goToAdvancedQuery" class="nav-btn query-btn">高级查询</button>
        <button @click="showProtocolAnalysis = true" class="nav-btn protocol-btn">协议分析</button>
        <button @click="showVulnerabilityAnalysis = true" class="nav-btn vulnerability-btn">漏洞分析</button>
        <button @click="goToTools" class="nav-btn tools-btn">工具平台</button>
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
    <SearchResultsPanel 
      :results="searchResults" 
      :message="searchMessage"
      @close="clearSearchResults" 
      @select="selectSearchResult"
    />
    
    <main class="platform-main">
      <!-- 左侧面板 -->
      <div class="left-panel" :class="{ 'hidden': isZoomedIn || !showLeftPanel }">
        <div class="panel-toggle">
          <button @click="toggleLeftPanel" class="toggle-btn">
            {{ showLeftPanel ? '隐藏' : '显示' }}
          </button>
        </div>
        <div class="panel-container">
          <h2>国家/地区排名</h2>
          <div class="ranking-list" ref="countryRankingList" @mouseenter="pauseCountryScroll" @mouseleave="resumeCountryScroll">
            <div 
              v-for="country in detectionStore.countryRanking" 
              :key="country.country_id"
              class="ranking-item"
              :class="{ active: selectedCountry && selectedCountry.country_id === country.country_id }"
              @click="handleCountrySelect(country)"
            >
              <span class="rank">#{{ country.rank }}</span>
              <span class="name">
                <span class="country-flag">{{ getCountryFlag(country.country_id) }}</span>
                {{ country.country_name_zh || country.country_name }}
              </span>
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
          <div class="ranking-list" ref="asnRankingList" @mouseenter="pauseAsnScroll" @mouseleave="resumeAsnScroll">
            <div 
              v-for="asn in detectionStore.asnRanking" 
              :key="asn.asn"
              class="ranking-item"
              :class="{ active: selectedAsn && selectedAsn.asn === asn.asn }"
              @click="handleAsnSelect(asn)"
            >
              <span class="rank">#{{ asn.rank }}</span>
              <div class="name-container">
                <span class="name">
                  <span class="asn-icon">🌐</span>
                  {{ asn.as_name_zh || asn.as_name }}
                </span>
                <span class="asn-id">AS{{ asn.asn }}</span>
              </div>
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
              <span class="label">ASN数量:</span>
              <span class="value">{{ selectedCountry.asn_count || '暂无数据' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">前缀数量:</span>
              <span class="value">{{ selectedCountry.prefix_count || '暂无数据' }}</span>
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
              <button @click="viewFullCountryDetails(selectedCountry)" class="detail-btn">
              查看完整详情
              </button>
            </div>
          </div>
        </div>
          </div>

          <!-- ASN详情面板 (在放大状态下显示) -->
          <div class="asn-detail-panel" :class="{ 'visible': showAsnDetails && selectedAsn }">
            <div class="detail-header">
              <h3>{{ selectedAsn ? (selectedAsn.as_name_zh || selectedAsn.as_name || 'AS' + selectedAsn.asn) : 'ASN详情' }}</h3>
              <button @click="closeAsnDetails" class="close-btn">返回</button>
            </div>
            <div class="detail-content">
              <div v-if="selectedAsn" class="asn-details">
                <div class="detail-item">
                  <span class="label">ASN编号:</span>
                  <span class="value">{{ selectedAsn.asn }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">名称:</span>
                  <span class="value">{{ selectedAsn.as_name_zh || selectedAsn.as_name }}</span>
                </div>
                <!-- {{ edit_2 }} 移除组织信息 -->
                <div class="detail-item">
                  <span class="label">国家/地区:</span>
                  <span class="value">{{ selectedAsn.country_name_zh || selectedAsn.country_name }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">IPv6地址数:</span>
                  <span class="value">{{ formatNumber(selectedAsn.total_active_ipv6) }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">IPv6前缀数量:</span>
                  <span class="value">{{ formatNumber(selectedAsn.total_ipv6_prefixes) }}</span>
                </div>
                
                <!-- {{ edit_3 }} 添加前缀列表 -->
                <div class="asn-prefixes" v-if="selectedAsn.prefixes && selectedAsn.prefixes.length">
                  <h4>IPv6前缀列表</h4>
                  <ul>
                    <li v-for="prefix in selectedAsn.prefixes.slice(0, 10)" :key="prefix.prefix_id">
                      <span class="prefix-value">{{ prefix.prefix }}/{{ prefix.prefix_length }}</span>
                      <span class="prefix-info">{{ prefix.active_addresses || 0 }} 个活跃地址</span>
                    </li>
                  </ul>
                  <p v-if="selectedAsn.prefixes.length > 10" class="more-info">
                    还有 {{ selectedAsn.prefixes.length - 10 }} 个前缀...
                  </p>
                </div>
                <p v-else class="no-data">暂无前缀数据</p>
                
                <div class="detail-actions">
                  <button @click="viewFullAsnDetails(selectedAsn)" class="detail-btn">查看完整详情</button>
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
    
    <!-- 协议分析面板 -->
    <div class="analysis-panel protocol-analysis-panel" :class="{ 'visible': showProtocolAnalysis }">
      <div class="panel-header">
        <h3>协议分析</h3>
        <button @click="toggleProtocolAnalysis" class="close-btn">×</button>
      </div>
      <div class="panel-content">
        <protocol-analysis-panel />
      </div>
    </div>
    
    <!-- 漏洞分析面板 -->
    <div class="analysis-panel vulnerability-analysis-panel" :class="{ 'visible': showVulnerabilityAnalysis }">
      <div class="panel-header">
        <h3>漏洞分析</h3>
        <button @click="toggleVulnerabilityAnalysis" class="close-btn">×</button>
      </div>
      <div class="panel-content">
        <vulnerability-analysis-panel />
      </div>
    </div>

    <footer class="platform-footer">
      <p>ObserV6 | 最后数据更新: {{ lastDataUpdate }}</p>
    </footer>

    <!-- AI聊天面板 -->
    <AIChatPanel />

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDetectionStore } from '@/stores/detection'
import GlobeMap from '@/components/detection/GlobeMap.vue'
import SearchResultsPanel from '@/components/detection/SearchResultsPanel.vue';
import ProtocolAnalysisPanel from '@/components/detection/ProtocolAnalysisPanel.vue'
import VulnerabilityAnalysisPanel from '@/components/detection/VulnerabilityAnalysisPanel.vue'
import AIChatPanel from '@/components/detection/AIChatPanel.vue'
import axios from 'axios'
// 路由和状态管理
const router = useRouter()
const authStore = useAuthStore()
const detectionStore = useDetectionStore()

// 组件状态
const globeMap = ref(null)
const currentTime = ref(new Date().toLocaleString())
const searchQuery = ref('')
const searchResults = ref([])
const searchMessage = ref(''); // 添加搜索消息状态
const selectedCountry = ref(null)
const selectedAsn = ref(null)
const showDebug = ref(false)
const dataLoadingStatus = ref('等待加载...')
const lastDataUpdate = ref('--')
const retryCount = ref(0)
const maxRetries = 3
const debugInfo = ref({})
const showAsnDetails = ref(false);
const selectedPrefix = ref(null);
const showPrefixDetails = ref(false);
const autoRotate = ref(true) // 修改为默认开启自动旋转
const autoRotateSpeed = ref(0.5) // 增加旋转速度变量，默认值可以调整
const previousLabelState = ref(true) //保存详情页面打开前的标签状态
// 面板显示状态
const showLeftPanel = ref(true)
const showRightPanel = ref(true)
const isZoomedIn = ref(false)

// 添加协议分析和漏洞分析状态变量
const showProtocolAnalysis = ref(false)
const showVulnerabilityAnalysis = ref(false)

const countryRankingList = ref(null)
const asnRankingList = ref(null)
const countryScrollInterval = ref(null)
const asnScrollInterval = ref(null)
const isCountryScrollPaused = ref(false)
const isAsnScrollPaused = ref(false)
const scrollSpeed = 1 // 滚动速度，可以根据需要调整

function toggleProtocolAnalysis() {
  if (showProtocolAnalysis.value) {
    // 关闭面板时重置状态
    showProtocolAnalysis.value = false
    detectionStore.resetProtocolState()
  } else {
    // 打开面板前重置状态
    detectionStore.resetProtocolState()
    showProtocolAnalysis.value = true
  }
}

// 修改漏洞分析面板显示逻辑
function toggleVulnerabilityAnalysis() {
  if (showVulnerabilityAnalysis.value) {
    // 关闭面板时重置状态
    showVulnerabilityAnalysis.value = false
    detectionStore.resetVulnerabilityState()
  } else {
    // 打开面板前重置状态
    detectionStore.resetVulnerabilityState()
    showVulnerabilityAnalysis.value = true
  }
}

// 开始自动滚动国家排名
const startCountryScroll = () => {
  if (countryScrollInterval.value) return
  
  countryScrollInterval.value = setInterval(() => {
    if (isCountryScrollPaused.value || !countryRankingList.value) return
    
    countryRankingList.value.scrollTop += scrollSpeed
    
    // 当滚动到底部时，重新回到顶部
    if (countryRankingList.value.scrollTop + countryRankingList.value.clientHeight >= 
        countryRankingList.value.scrollHeight) {
      countryRankingList.value.scrollTop = 0
    }
  }, 30)
}

// 开始自动滚动ASN排名
const startAsnScroll = () => {
  if (asnScrollInterval.value) return
  
  asnScrollInterval.value = setInterval(() => {
    if (isAsnScrollPaused.value || !asnRankingList.value) return
    
    asnRankingList.value.scrollTop += scrollSpeed
    
    // 当滚动到底部时，重新回到顶部
    if (asnRankingList.value.scrollTop + asnRankingList.value.clientHeight >= 
        asnRankingList.value.scrollHeight) {
      asnRankingList.value.scrollTop = 0
    }
  }, 30)
}

// 暂停国家排名滚动
const pauseCountryScroll = () => {
  isCountryScrollPaused.value = true
}

// 恢复国家排名滚动
const resumeCountryScroll = () => {
  isCountryScrollPaused.value = false
}

// 暂停ASN排名滚动
const pauseAsnScroll = () => {
  isAsnScrollPaused.value = true
}

// 恢复ASN排名滚动
const resumeAsnScroll = () => {
  isAsnScrollPaused.value = false
}

// 停止所有滚动
const stopAllScrolls = () => {
  if (countryScrollInterval.value) {
    clearInterval(countryScrollInterval.value)
    countryScrollInterval.value = null
  }
  
  if (asnScrollInterval.value) {
    clearInterval(asnScrollInterval.value)
    asnScrollInterval.value = null
  }
}
// 计算当前国家的ASN列表
const countryAsns = computed(() => {
  if (!selectedCountry.value || !detectionStore.asns.length) return []
  
  return detectionStore.asns
    .filter(asn => asn.country_id === selectedCountry.value.country_id)
    .sort((a, b) => (b.total_active_ipv6 || 0) - (a.total_active_ipv6 || 0))
    .slice(0, 10)
})

const getCountryFlag = (countryCode) => {
  if (!countryCode) return '';
  
  // 将国家代码转换为区域指示符（Regional Indicator）Unicode字符
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  // 将Unicode代码点转换为emoji字符
  return String.fromCodePoint(...codePoints);
}

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
      }, new Date())
      
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
  if (!searchQuery.value.trim()) return;
  
  try {
    // 清空之前的搜索结果
    searchResults.value = [];
    searchMessage.value = '';

    if (globeMap.value) {
      previousLabelState.value = globeMap.value.getLabelVisibility();
      globeMap.value.setLabelVisibility(false);
    }
    
    // {{ edit_1 }} 显示搜索中状态
    searchMessage.value = '搜索中...';
    
    const response = await detectionStore.searchIPv6Data(searchQuery.value);
    
    // 处理不同格式的响应
    if (response) {
      // 如果响应是数组，直接使用
      if (Array.isArray(response)) {
        if (response.length > 0) {
          // 设置搜索消息
          searchMessage.value = `找到 ${response.length} 条结果`;
          
          // 如果只有一个结果，直接选择
          if (response.length === 1) {
            const item = response[0];
            const result = convertSearchResult(item);
            if (result) {
              selectSearchResult(result);
              return;
            }
          }
          
          // 多个结果，显示搜索结果列表
          searchResults.value = response.map(convertSearchResult).filter(Boolean);
        } else {
          // 没有搜索结果
          searchMessage.value = `未找到与"${searchQuery.value}"相关的结果`;
        }
      } 
      // 如果响应是对象且包含success属性
      else if (typeof response === 'object' && response.success !== undefined) {
        // 设置搜索消息
        searchMessage.value = response.message || '';
        
        // 如果有搜索结果
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // 如果只有一个结果，直接选择
          if (response.data.length === 1) {
            const item = response.data[0];
            const result = convertSearchResult(item);
            if (result) {
              selectSearchResult(result);
              return;
            }
          }
          
          // 多个结果，显示搜索结果列表
          searchResults.value = response.data.map(convertSearchResult).filter(Boolean);
        } else {
          // 没有搜索结果
          searchMessage.value = response.message || `未找到与"${searchQuery.value}"相关的结果`;
        }
      } else {
        // 处理其他格式的响应
        console.warn('搜索结果格式不支持:', response);
        searchMessage.value = '搜索结果格式不支持';
      }
    } else {
      // 响应为空
      searchMessage.value = '未收到搜索结果';
    }
  } catch (error) {
    console.error('搜索失败:', error);
    // {{ edit_2 }} 改进错误提示
    searchMessage.value = '搜索失败: ' + (error.message || '未知错误');
    searchResults.value = []; // 确保清空结果
  }
}
// 添加转换搜索结果的函数
const convertSearchResult = (item) => {
  // 添加日志，查看原始搜索结果
  console.log("转换搜索结果:", item);
  
  if (!item || typeof item !== 'object') {
    console.error("无效的搜索结果项:", item);
    return null;
  }
  
  if (item.type === 'country') {
    // 确保country_id存在
    if (!item.country_id) {
      console.error("搜索结果中缺少country_id:", item);
      return null;
    }
    
    return {
      id: item.country_id,
      type: '国家',
      name: item.country_name_zh || item.country_name,
      count: item.total_active_ipv6 || 0,
      data: item
    }
  } else if (item.type === 'asn') {
    // 确保asn存在
    if (!item.asn) {
      console.error("搜索结果中缺少asn:", item);
      return null;
    }
    
    return {
      id: item.asn,
      type: 'ASN',
      name: item.as_name_zh || item.as_name || `AS${item.asn}`,
      count: item.total_active_ipv6 || 0,
      data: item
    }
  } else if (item.type === 'prefix') {
    // 确保prefix存在
    if (!item.prefix) {
      console.error("搜索结果中缺少prefix:", item);
      return null;
    }
    
    return {
      id: item.prefix_id || item.prefix,
      type: '前缀',
      name: item.prefix + '/' + (item.prefix_length || ''),
      count: item.active_addresses_count || 0,
      data: item
    }
  }
  return null;
}


// 选择搜索结果
const selectSearchResult = async (result) => {
  try {
    // 保存当前标签状态
    if (globeMap.value) {
      previousLabelState.value = globeMap.value.getLabelVisibility();
      // 隐藏标签
      globeMap.value.setLabelVisibility(false);
    }

    // 确保在处理前重置视图状态
    isZoomedIn.value = true; // 设置为放大状态，这样详情面板才会显示

    if (result.type === '国家') {
      // 处理国家搜索结果
      console.log("处理国家搜索结果:", result.data); // 添加日志，查看搜索结果数据
      
      // 确保country_id存在
      if (!result.data.country_id) {
        console.error("搜索结果中缺少country_id:", result.data);
        return;
      }
      
      // 修改：使用handleCountrySelect函数处理国家选择，保持一致的逻辑
      handleCountrySelect(result.data);
      
      // 确保地图放大到选中的国家
      if (globeMap.value) {
        globeMap.value.flyToCountry(result.data.country_id);
      }
    }else if (result.type === 'ASN') {
      // 处理ASN搜索结果
      const asnDetail = await detectionStore.fetchAsnDetail(result.data.asn);
      if (asnDetail && asnDetail.asn) {
        // 确保ASN数据格式正确
        const formattedAsn = {
          asn: asnDetail.asn.asn,
          as_name: asnDetail.asn.as_name,
          as_name_zh: asnDetail.asn.as_name_zh,
          organization: asnDetail.asn.organization,
          country_id: asnDetail.asn.country_id,
          country_name: asnDetail.asn.country_name,
          country_name_zh: asnDetail.asn.country_name_zh,
          total_ipv6_prefixes: asnDetail.asn.total_ipv6_prefixes,
          total_active_ipv6: asnDetail.asn.total_active_ipv6,
          prefixes: asnDetail.prefixes || []
        };
        handleAsnSelect(formattedAsn);
      } else if (asnDetail) {
        // 处理可能的不同响应格式
        handleAsnSelect(asnDetail);
      } else {
        handleAsnSelect(result.data);
      }
    } else if (result.type === '前缀') {
      // 处理前缀搜索结果
      // 如果前缀有关联的国家，先显示国家
      if (result.data.country_id) {
        const countryDetail = await detectionStore.fetchCountryDetail(result.data.country_id);
        if (countryDetail) {
          handleCountrySelect(countryDetail);
          
          // 确保地图放大到选中的国家
          if (globeMap.value) {
            globeMap.value.flyToCountry(result.data.country_id);
            // 移除不存在的方法调用
            // globeMap.value.highlightCountry(result.data.country_id);
          }
        }
      }
      
      // 如果前缀有关联的ASN，也显示ASN
      if (result.data.asn) {
        const asnDetail = await detectionStore.fetchAsnDetail(result.data.asn);
        if (asnDetail && asnDetail.asn) {
          // 确保ASN数据格式正确
          const formattedAsn = {
            asn: asnDetail.asn.asn,
            as_name: asnDetail.asn.as_name,
            as_name_zh: asnDetail.asn.as_name_zh,
            organization: asnDetail.asn.organization,
            country_id: asnDetail.asn.country_id,
            country_name: asnDetail.asn.country_name,
            country_name_zh: asnDetail.asn.country_name_zh,
            total_ipv6_prefixes: asnDetail.asn.total_ipv6_prefixes,
            total_active_ipv6: asnDetail.asn.total_active_ipv6,
            prefixes: asnDetail.prefixes || []
          };
          handleAsnSelect(formattedAsn);
        } else if (asnDetail) {
          handleAsnSelect(asnDetail);
        } else {
          handleAsnSelect(result.data);
        }
      }
    }
    
    // 清除搜索结果
    clearSearchResults();
  } catch (error) {
    console.error('处理搜索结果失败:', error);
    searchMessage.value = '处理搜索结果失败: ' + (error.message || '未知错误');
  }
}

// 清除搜索结果
const clearSearchResults = () => {
  searchResults.value = [];
  searchQuery.value = '';
  searchMessage.value = '';

  // 恢复标签状态
  if (globeMap.value) {
    globeMap.value.setLabelVisibility(previousLabelState.value);
  }
}

// 处理页面点击事件
const handlePageClick = (event) => {
  // 检查点击是否在搜索结果面板外
  const searchPanel = document.querySelector('.search-results-panel');
  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');
  
  if (searchResults.value.length > 0 && 
      searchPanel && 
      !searchPanel.contains(event.target) && 
      !searchInput.contains(event.target) && 
      !searchBtn.contains(event.target)) {
    clearSearchResults();
  }
}

// 处理国家选择
const handleCountrySelect = async (country) => {
  if (!country) return;
  
  // 先设置基本信息，让UI立即响应
  selectedCountry.value = country;
  
  // 确保ASN详情面板不显示
  showAsnDetails.value = false;
  selectedAsn.value = null
  
  // 选择国家时暂停滚动
  pauseCountryScroll()
  
  // 获取更详细的国家信息，包括ASN数量和前缀数量
  try {
    const countryDetail = await detectionStore.fetchCountryDetail(country.country_id);
    console.log("获取到的国家详情:", countryDetail); // 添加日志，查看API返回的数据结构
    
    if (countryDetail) {
      // 更新国家详情，保留原有信息，添加新获取的信息
      let asnCount = 0;
      let prefixCount = 0;
      
      // 尝试从不同的数据结构中获取ASN数量
      if (countryDetail.country && countryDetail.country.asn_count !== undefined) {
        asnCount = countryDetail.country.asn_count;
      } else if (countryDetail.asns) {
        asnCount = countryDetail.asns.length;
      }
      
      // 尝试从不同的数据结构中获取前缀数量
      if (countryDetail.country && countryDetail.country.prefix_count !== undefined) {
        prefixCount = countryDetail.country.prefix_count;
      } else if (countryDetail.prefixes) {
        prefixCount = countryDetail.prefixes.length;
      } else if (countryDetail.asns) {
        // 如果有ASN数据，尝试计算所有ASN的前缀总数
        prefixCount = countryDetail.asns.reduce((total, asn) => {
          return total + (asn.total_ipv6_prefixes || 0);
        }, 0);
      }
      
      selectedCountry.value = {
        ...selectedCountry.value,
        asn_count: asnCount,
        prefix_count: prefixCount
      };
      
      console.log("更新后的国家详情:", selectedCountry.value);
    }
  } catch (error) {
    console.error("获取国家详情失败:", error);
  }
  
  if (globeMap.value) {
    globeMap.value.flyToCountry(country.country_id)
  }
}

// 处理ASN选择
const handleAsnSelect = async (asn) => {
  if (!asn) return;
  
  selectedAsn.value = asn;
  // 确保国家详情面板不显示
  selectedCountry.value = null;
  
  // 立即显示ASN详情面板，不要等待API请求
  showAsnDetails.value = true;
  isZoomedIn.value = true;
  
  // {{ edit_2 }}
  // 获取ASN的详细信息，包括前缀列表
  try {
    const asnDetail = await detectionStore.fetchAsnDetail(asn.asn);
    if (asnDetail && asnDetail.asn) {
      // 更新ASN详情，添加前缀列表
      selectedAsn.value = {
        ...selectedAsn.value,
        prefixes: asnDetail.prefixes || []
      };
      console.log("更新后的ASN详情:", selectedAsn.value);
    }
  } catch (error) {
    console.error("获取ASN详情失败:", error);
  }
  
  // 如果有国家信息，同时选中该国家并放大显示
  if (asn.country_id) {
    // 查找对应的国家
    const country = detectionStore.countries.find(c => c.country_id === asn.country_id);
    if (country) {
      // 调用地图组件的方法放大到该国家
      if (globeMap.value) {
        globeMap.value.flyToCountry(country.country_id);
        // 确保高亮国家边界
        globeMap.value.highlightCountry(country.country_id);
      }
    }
  }
}


// 关闭ASN详情面板
const closeAsnDetails = () => {
  showAsnDetails.value = false;
  selectedAsn.value = null;
  
  // 重置视图，与国家详情面板的resetView函数保持一致
  if (globeMap.value) {
    globeMap.value.resetCamera();
    globeMap.value.resetHighlights();

    globeMap.value.setLabelVisibility(previousLabelState.value);
  }
  
  isZoomedIn.value = false;
};
// 处理缩放状态变化
const handleZoomChanged = (data) => {
  isZoomedIn.value = data.isZoomedIn
  
  if (data.isZoomedIn && data.country) {
    selectedCountry.value = data.country
  }
}

// 添加跳转到高级查询页面的方法
const goToAdvancedQuery = () => {
  router.push({ name: 'advancedQuery' });
}

//国家详细页面
const viewFullCountryDetails = (country) => {
  router.push({ 
    name: 'advancedQuery', 
    query: { type: 'country', countryId: country.country_id } // 修改为使用query参数
  });
}

//ASN详细页面
const viewFullAsnDetails = (asn) => {
  router.push({ 
    name: 'advancedQuery', 
    query: { type: 'asn', asn: asn.asn } // 修改为使用query参数
  });
}



// 重置视图
const resetView = () => {
  if (globeMap.value) {
    globeMap.value.resetCamera()
    globeMap.value.resetHighlights()

    globeMap.value.setLabelVisibility(previousLabelState.value)
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
  
  // 启动自动滚动
  startCountryScroll()
  startAsnScroll()

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
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(5px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  transition: transform 0.5s ease, opacity 0.5s ease, visibility 0.5s;
  visibility: visible;
  /* 移除overflow-y: auto，防止出现双滚动条 */
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
  display: flex;
  flex-direction: column;
  /* 确保panel-container不会溢出 */
  overflow: hidden;
}

.panel-container h2 {
  margin: 0 0 15px 0;
  font-size: 1.2rem;
  color: #4fc3f7;
  border-bottom: 1px solid rgba(79, 195, 247, 0.3);
  padding-bottom: 5px;
}

.ranking-list {
  /* 修改为flex: 1，使其占据剩余空间 */
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(79, 195, 247, 0.5) rgba(0, 0, 0, 0.1);
  scroll-behavior: smooth;
  /* 添加内边距，防止内容贴边 */
  padding-right: 5px;
}

.ranking-list::-webkit-scrollbar {
  width: 6px;
}

.ranking-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

.ranking-list::-webkit-scrollbar-thumb {
  background-color: rgba(79, 195, 247, 0.5);
  border-radius: 3px;
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 5px; /* 增加项目间距 */
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.ranking-item:hover {
  background: rgba(79, 195, 247, 0.15);
  transform: translateX(3px); /* 轻微的位移效果 */
  box-shadow: 0 0 8px rgba(79, 195, 247, 0.3);
}

.ranking-item .rank {
  min-width: 30px;
  text-align: center;
  font-weight: bold;
  color: #4fc3f7;
  margin-right: 5px;
}

.ranking-item .name {
  flex: 1;
  margin: 0 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
}

.country-flag, .asn-icon {
  margin-right: 6px;
  font-size: 1.1em;
}

.ranking-item .value {
  font-size: 0.8rem;
  color: #b0bec5;
  min-width: 60px; /* 确保数值有足够的显示空间 */
  text-align: right;
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
  margin-top: 30px; /* 增加与上方内容的间距 */
  display: flex;
  justify-content: center;
}

.detail-btn {
  background: rgba(79, 195, 247, 0.3);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #e0e0e0;
  padding: 10px 20px; /* 增大按钮内边距 */
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 15px; /* 增大按钮字体 */
}

.detail-btn:hover {
  background: rgba(79, 195, 247, 0.5);
  transform: translateY(-2px); /* 添加悬停效果 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
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

.asn-detail-panel {
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

.asn-detail-panel.visible {
  right: 10px;
}
.asn-details {
  display: flex;
  flex-direction: column;
  gap: 18px; /* 增加行间距 */
}

.asn-details .detail-item {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.asn-details .label {
  color: #90a4ae;
  font-size: 15px; /* 增大标签字体 */
  font-weight: 500;
}

.asn-details .value {
  color: #fff;
  font-size: 15px; /* 增大值字体 */
  font-weight: 500;
}

.asn-prefixes {
  margin-top: 25px; /* 增加与上方内容的间距 */
}

.asn-prefixes h4 {
  margin-bottom: 15px;
  color: #4fc3f7;
  font-size: 16px; /* 增大标题字体 */
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(79, 195, 247, 0.3);
}

.asn-prefixes ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 220px; /* 增加列表高度 */
  overflow-y: auto;
}

.asn-prefixes li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0; /* 增加内边距 */
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 5px; /* 增加项目间距 */
}

.prefix-value {
  font-family: monospace;
  color: #80deea;
  font-size: 14px; /* 增大前缀字体 */
}

.prefix-info {
  color: #b0bec5;
  font-size: 13px; /* 增大信息字体 */
}


.prefix-value {
  font-family: monospace;
  color: #80deea;
}

.prefix-info {
  color: #b0bec5;
  font-size: 0.9em;
}

.name-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 允许子元素收缩 */
  margin-right: 10px; /* 增加与数值的间距 */
}

/* 确保ASN名称可以被截断 */
.name-container .name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.name-container .asn-id {
  font-size: 0.7rem;
  color: #90caf9;
  margin-left: 37px; /* 与图标对齐 */
}

.query-btn {
  padding: 6px 12px;
  background: rgba(79, 195, 247, 0.3);
  border: 1px solid rgba(79, 195, 247, 0.5);
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  margin-right: 10px;
  transition: all 0.2s;
}

.query-btn:hover {
  background: rgba(79, 195, 247, 0.5);
}

/* 统一导航按钮样式 */
.nav-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #e0e0e0;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  margin-right: 8px;
}

.nav-btn:hover {
  background: rgba(79, 195, 247, 0.4);
}

.protocol-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.5);
}

.vulnerability-btn {
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.5);
}

.vulnerability-btn:hover {
  background: rgba(244, 67, 54, 0.4);
}

/* 分析面板样式 */
.analysis-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 90%;
  max-width: 1200px;
  height: 80%;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
  overflow: hidden;
}

.analysis-panel.visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, -50%) scale(1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  color: #4fc3f7;
  font-size: 1.2rem;
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 15px;
}

.protocol-analysis-panel .panel-header {
  border-bottom-color: rgba(79, 195, 247, 0.3);
}

.vulnerability-analysis-panel .panel-header {
  border-bottom-color: rgba(244, 67, 54, 0.3);
}

.vulnerability-analysis-panel .panel-header h3 {
  color: #f44336;
}

.close-btn {
  background: none;
  border: none;
  color: #e0e0e0;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 5px;
  line-height: 1;
}

.close-btn:hover {
  color: #ffffff;
}

/* 确保按钮在移动设备上也能正常显示 */
@media (max-width: 768px) {
  .user-info {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
  }
  
  .nav-btn {
    margin: 5px;
  }
  
  .analysis-panel {
    width: 95%;
    height: 90%;
  }
}
</style>
