import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api/index'

export const useDetectionStore = defineStore('detection', () => {
  const countries = ref([])
  const asns = ref([])
  const countryRanking = ref([])
  const asnRanking = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const globalStats = ref(null)
  const selectedCountry = ref(null)
  const selectedAsn = ref(null)
  const selectedPrefix = ref(null)

  const fetchMapData = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getMapData()
      countries.value = response.data?.countries || []
      asns.value = response.data?.asns || []
      return response.data
    } catch (err) {
      error.value = err.message || '获取地图数据失败'
      console.error('获取地图数据失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchCountryRanking = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getCountryRanking()
      countryRanking.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || '获取国家排名失败'
      console.error('获取国家排名失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchAsnRanking = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getAsnRanking()
      asnRanking.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || '获取ASN排名失败'
      console.error('获取ASN排名失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchCountryDetail = async (countryId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getCountryDetail(countryId)
      return response.data
    } catch (err) {
      error.value = err.message || '获取国家详情失败'
      console.error('获取国家详情失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchAsnDetail = async (asn) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getAsnDetail(asn)
      return response.data
    } catch (err) {
      error.value = err.message || '获取ASN详情失败'
      console.error('获取ASN详情失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const searchIPv6Data = async (query) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.searchIPv6(query)
      
      // 检查响应数据格式并进行标准化处理
      let result = response.data
      
      // 如果响应是数组，转换为标准格式
      if (Array.isArray(result)) {
        result = {
          success: true,
          data: result,
          message: `找到 ${result.length} 条结果`
        }
      }
      
      return result
    } catch (err) {
      error.value = err.message || '搜索失败'
      console.error('搜索失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取前缀详情
  const fetchPrefixDetail = async (prefixId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getPrefixDetail(prefixId)
      selectedPrefix.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取前缀 ${prefixId} 详情失败`
      console.error(`获取前缀 ${prefixId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 获取全球统计数据
  const fetchGlobalStats = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getGlobalStats()
      globalStats.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || '获取全球统计数据失败'
      console.error('获取全球统计数据失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
  globalStats,
  selectedCountry,
  selectedAsn,
  selectedPrefix,
  countries,
  asns,
  countryRanking,
  asnRanking,
  isLoading,
  error,
  fetchMapData,
  fetchCountryRanking,
  fetchAsnRanking,
  fetchCountryDetail,
  fetchAsnDetail,
  searchIPv6Data,
  fetchPrefixDetail,
  fetchGlobalStats
}
})