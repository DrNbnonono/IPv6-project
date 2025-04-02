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
    isLoading.value = true
    error.value = null
    try {
      const response = await api.detection.searchIPv6(query)
      searchResults.value = response.data
      return response.data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
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
    searchIPv6Data
  }
})