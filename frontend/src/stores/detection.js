import { defineStore } from 'pinia'
import { ref } from 'vue'
import { 
  fetchCountries, 
  fetchAsns, 
  fetchCountryRanking, 
  fetchAsnRanking 
} from '@/api/detection'

export const useDetectionStore = defineStore('detection', () => {
  const countries = ref([])
  const asns = ref([])
  const countryRanking = ref([])
  const asnRanking = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const fetchData = async () => {
    try {
      isLoading.value = true
      error.value = null
      
      const [countriesData, asnsData, countryRankingData, asnRankingData] = await Promise.all([
        fetchCountries(),
        fetchAsns(),
        fetchCountryRanking(),
        fetchAsnRanking()
      ])
      
      countries.value = countriesData
      asns.value = asnsData
      countryRanking.value = countryRankingData
      asnRanking.value = asnRankingData
    } catch (err) {
      error.value = err.message || '获取数据失败'
      console.error('获取探测数据失败:', err)
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
    fetchData
  }
})