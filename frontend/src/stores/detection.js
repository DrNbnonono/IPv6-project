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

  // 添加协议和漏洞相关的状态
  const protocols = ref([])
  const vulnerabilities = ref([])
  const selectedProtocol = ref(null)
  const selectedVulnerability = ref(null)
  const protocolAsns = ref({ asns: [], total: 0 })
  const protocolCountries = ref({ countries: [], total: 0 })
  const vulnerabilityAsns = ref({ asns: [], total: 0 })
  const protocolRegions = ref([])
  const vulnerabilityRegions = ref([])
  const asnProtocolDetail = ref(null)
  const countryProtocolDetail = ref(null)
  const asnVulnerabilityDetail = ref(null)
  const vulnerabilityCountries = ref({ countries: [], total: 0 }) 
  const countryVulnerabilityDetail = ref(null) // 添加国家漏洞详情数据


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

  // 添加协议相关方法
  const fetchProtocols = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getProtocols()
      protocols.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || '获取协议列表失败'
      console.error('获取协议列表失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchProtocolDetail = async (protocolId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getProtocolDetail(protocolId)
      selectedProtocol.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取协议 ${protocolId} 详情失败`
      console.error(`获取协议 ${protocolId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchProtocolAsns = async (protocolId, limit = 20, offset = 0) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getProtocolAsns(protocolId, limit, offset)
      protocolAsns.value = response.data || { asns: [], total: 0 }
      return response.data
    } catch (err) {
      error.value = err.message || `获取协议 ${protocolId} 的ASN列表失败`
      console.error(`获取协议 ${protocolId} 的ASN列表失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchProtocolRegions = async (protocolId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getProtocolRegions(protocolId)
      protocolRegions.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || `获取协议 ${protocolId} 的地区分布失败`
      console.error(`获取协议 ${protocolId} 的地区分布失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchAsnProtocolDetail = async (asn, protocolId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getAsnProtocolDetail(asn, protocolId)
      asnProtocolDetail.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取ASN ${asn} 的协议 ${protocolId} 详情失败`
      console.error(`获取ASN ${asn} 的协议 ${protocolId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchProtocolCountries = async (protocolId, limit = 20, offset = 0) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getProtocolCountries(protocolId, limit, offset)
      protocolCountries.value = response.data || { countries: [], total: 0 }
      return response.data
    } catch (err) {
      error.value = err.message || `获取协议 ${protocolId} 的国家列表失败`
      console.error(`获取协议 ${protocolId} 的国家列表失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  const fetchCountryProtocolDetail = async (countryId, protocolId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getCountryProtocolDetail(countryId, protocolId)
      countryProtocolDetail.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取国家 ${countryId} 的协议 ${protocolId} 详情失败`
      console.error(`获取国家 ${countryId} 的协议 ${protocolId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 添加漏洞相关方法
  const fetchVulnerabilities = async () => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getVulnerabilities()
      vulnerabilities.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || '获取漏洞列表失败'
      console.error('获取漏洞列表失败:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchVulnerabilityDetail = async (vulnerabilityId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getVulnerabilityDetail(vulnerabilityId)
      selectedVulnerability.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取漏洞 ${vulnerabilityId} 详情失败`
      console.error(`获取漏洞 ${vulnerabilityId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchVulnerabilityAsns = async (vulnerabilityId, limit = 20, offset = 0) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getVulnerabilityAsns(vulnerabilityId, limit, offset)
      vulnerabilityAsns.value = response.data || { asns: [], total: 0 }
      return response.data
    } catch (err) {
      error.value = err.message || `获取漏洞 ${vulnerabilityId} 的ASN列表失败`
      console.error(`获取漏洞 ${vulnerabilityId} 的ASN列表失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchVulnerabilityRegions = async (vulnerabilityId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getVulnerabilityRegions(vulnerabilityId)
      vulnerabilityRegions.value = response.data || []
      return response.data
    } catch (err) {
      error.value = err.message || `获取漏洞 ${vulnerabilityId} 的地区分布失败`
      console.error(`获取漏洞 ${vulnerabilityId} 的地区分布失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 添加 setVulnerabilityRegions 方法
  const setVulnerabilityRegions = (regions) => {
    vulnerabilityRegions.value = regions || []
  }
  const fetchAsnVulnerabilityDetail = async (asn, vulnerabilityId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getAsnVulnerabilityDetail(asn, vulnerabilityId)
      asnVulnerabilityDetail.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取ASN ${asn} 的漏洞 ${vulnerabilityId} 详情失败`
      console.error(`获取ASN ${asn} 的漏洞 ${vulnerabilityId} 详情失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchVulnerabilityCountries = async (vulnerabilityId, limit = 20, offset = 0) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getVulnerabilityCountries(vulnerabilityId, limit, offset)
      vulnerabilityCountries.value = response.data || { countries: [], total: 0 }
      return response.data
    } catch (err) {
      error.value = err.message || `获取漏洞 ${vulnerabilityId} 的国家列表失败`
      console.error(`获取漏洞 ${vulnerabilityId} 的国家列表失败:`, err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchCountryVulnerabilityDetail = async (countryId, vulnerabilityId) => {
    try {
      isLoading.value = true
      error.value = null
      const response = await api.detection.getCountryVulnerabilityDetail(countryId, vulnerabilityId)
      countryVulnerabilityDetail.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message || `获取国家 ${countryId} 的漏洞 ${vulnerabilityId} 详情失败`
      console.error(`获取国家 ${countryId} 的漏洞 ${vulnerabilityId} 详情失败:`, err)
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
  fetchGlobalStats,

  // 添加协议相关返回值
  protocols,
  selectedProtocol,
  protocolAsns,
  protocolRegions,
  asnProtocolDetail,
  protocolCountries,
  countryProtocolDetail,
  fetchProtocols,
  fetchProtocolDetail,
  fetchProtocolAsns,
  fetchProtocolRegions,
  fetchAsnProtocolDetail,
  fetchProtocolCountries,
  fetchCountryProtocolDetail,
  // 添加漏洞相关返回值
  vulnerabilities,
  selectedVulnerability,
  vulnerabilityAsns,
  vulnerabilityRegions,
  asnVulnerabilityDetail,
  vulnerabilityCountries, 
  countryVulnerabilityDetail, 
  fetchVulnerabilities,
  fetchVulnerabilityDetail,
  fetchVulnerabilityAsns,
  fetchVulnerabilityRegions,
  fetchAsnVulnerabilityDetail,
  fetchVulnerabilityCountries, 
  fetchCountryVulnerabilityDetail,
  setVulnerabilityRegions
}
})