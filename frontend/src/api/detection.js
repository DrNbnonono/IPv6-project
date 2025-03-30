import axios from 'axios'

const api = axios.create({
  baseURL: '/api/addresses',
  timeout: 10000
})

export const fetchCountries = async () => {
  try {
    const response = await api.get('/countries')
    return response.data.data || []
  } catch (error) {
    console.error('获取国家数据失败:', error)
    throw error
  }
}

export const fetchAsns = async () => {
  try {
    const response = await api.get('/asns')
    return response.data.data || []
  } catch (error) {
    console.error('获取ASN数据失败:', error)
    throw error
  }
}

export const fetchCountryRanking = async () => {
  try {
    const response = await api.get('/countries/ranking', {
      params: {
        sort: 'total_active_ipv6',
        order: 'desc',
        limit: 10
      }
    })
    return response.data.data || []
  } catch (error) {
    console.error('获取国家排名失败:', error)
    throw error
  }
}

export const fetchAsnRanking = async () => {
  try {
    const response = await api.get('/asns/ranking', {
      params: {
        sort: 'total_active_ipv6',
        order: 'desc',
        limit: 10
      }
    })
    return response.data.data || []
  } catch (error) {
    console.error('获取ASN排名失败:', error)
    throw error
  }
}

export const fetchCountryDetail = async (countryId) => {
  try {
    const response = await api.get(`/countries/${countryId}`)
    return response.data.data || null
  } catch (error) {
    console.error('获取国家详情失败:', error)
    throw error
  }
}

export const fetchAsnDetail = async (asn) => {
  try {
    const response = await api.get(`/asns/${asn}`)
    return response.data.data || null
  } catch (error) {
    console.error('获取ASN详情失败:', error)
    throw error
  }
}

export const fetchPrefixDetail = async (prefixId) => {
  try {
    const response = await api.get(`/prefixes/${prefixId}`)
    return response.data.data || null
  } catch (error) {
    console.error('获取前缀详情失败:', error)
    throw error
  }
}

export const searchIPv6Data = async (query) => {
  try {
    const response = await api.get('/prefixes/search', {
      params: { query }
    })
    return response.data.data || []
  } catch (error) {
    console.error('搜索失败:', error)
    throw error
  }
}