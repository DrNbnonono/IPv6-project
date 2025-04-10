import { defineStore } from 'pinia';
import api from '@/api';

export const useDatabaseStore = defineStore('database', {
  state: () => ({
    stats: {
      activeAddresses: 0,
      prefixes: 0,
      countries: 0,
      asns: 0,
      vulnerabilities: 0
    },
    isLoading: false,
    error: null
  }),
  
  actions: {
    async fetchDatabaseStats() {
      try {
        this.isLoading = true;
        const response = await api.database.getStats();
        this.stats = response.data;
      } catch (error) {
        console.error('获取数据库统计信息失败:', error);
        this.error = error.message;
      } finally {
        this.isLoading = false;
      }
    },
    
    async importAddresses(importData) {
      try {
        this.isLoading = true;
        const response = await api.database.importAddresses(importData);
        await this.fetchDatabaseStats();
        return response.data;
      } catch (error) {
        console.error('导入地址失败:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async updateVulnerabilities(vulnerabilityData) {
      try {
        this.isLoading = true;
        const response = await api.database.updateVulnerabilities(vulnerabilityData);
        await this.fetchDatabaseStats();
        return response.data;
      } catch (error) {
        console.error('更新漏洞信息失败:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async updateProtocolSupport(protocolData) {
      try {
        this.isLoading = true;
        const response = await api.database.updateProtocolSupport(protocolData);
        await this.fetchDatabaseStats();
        return response.data;
      } catch (error) {
        console.error('更新协议支持信息失败:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async performAdvancedQuery(queryParams) {
      try {
        this.isLoading = true;
        const response = await api.database.advancedQuery(queryParams);
        return response.data;
      } catch (error) {
        console.error('执行高级查询失败:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async getCountryStats() {
      try {
        const response = await api.database.getCountryStats();
        return response.data;
      } catch (error) {
        console.error('获取国家统计信息失败:', error);
        this.error = error.message;
        return [];
      }
    },
    
    async getVulnerabilityStats() {
      try {
        const response = await api.database.getVulnerabilityStats();
        return response.data;
      } catch (error) {
        console.error('获取漏洞统计信息失败:', error);
        this.error = error.message;
        return [];
      }
    }
  }
});