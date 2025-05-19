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
    error: null,
    vulnerabilityDefinitions: [], // 存储漏洞定义列表
    countriesList: [],          // 存储国家列表 (用于选择器)
    protocolDefinitions: [], // 协议定义列表
    
    // 文件管理相关状态
    addressFiles: [],
    isUploading: false,
    uploadProgress: 0,
    isLoadingFiles: false,
    
    // 任务相关状态
    importTasks: [],
    isLoadingTasks: false,
    currentTask: null,
    
    // 地址更新相关状态
    isUpdating: false,
    updateError: null,

    // 国家管理相关状态
    countries: [],
    countriesPagination: {
      total: 0,
      page: 1,
      limit: 50,
      pages: 0
    },
    countriesLoading: false,
    countriesError: null,

    // ASN管理相关状态
    asns: [],

    // 前缀管理相关状态
    prefixes: [],
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
        console.log('发送高级查询请求:', JSON.stringify(queryParams, null, 2));
        const response = await api.database.advancedQuery(queryParams);
        console.log('高级查询响应:', response);
        
        if (response.data && response.data.data) {
          console.log(`查询成功，返回 ${response.data.data.length} 条记录`);
          if (response.data.data.length === 0) {
            console.log('查询结果为空，没有符合条件的数据');
          }
        } else {
          console.warn('查询响应格式异常:', response.data);
        }
        
        return response.data;
      } catch (error) {
        console.error('执行高级查询失败:', error);
        console.error('错误详情:', error.response ? error.response.data : '无响应数据');
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
    },

    //IID更新
    async updateIIDTypes(iidTypeData) {
      try {
        this.isLoading = true;
        const response = await api.database.updateIIDTypes(iidTypeData);
        await this.fetchDatabaseStats();
        return response.data;  // 注意这里返回的是 response.data
      } catch (error) {
        console.error('更新IID类型信息失败:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    // 获取 IID 类型列表
    async getIIDTypes() {
      try {
        const response = await api.database.getIIDTypes();
        return response.data;
      } catch (error) {
        console.error('获取IID类型列表失败:', error);
        this.error = error.message;
        return [];
      }
    },

    //---------------文件上传相关Action已经单独实现----------------//
    

    //---------------IPv6地址导入任务相关Action----------------//
    async createImportTask(data) {
      try {
        this.isLoading = true;
        const response = await api.database.createImportTask(data);
        return response.data;
      } catch (error) {
        console.error('创建导入任务失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async getImportTasks() {
      try {
        this.isLoading = true;
        console.log('[databaseStore] 开始获取导入任务列表...');
        
        // 清除之前的错误
        this.error = null;
        
        const response = await api.database.getImportTasks();
        console.log('[databaseStore] 获取导入任务列表响应:', response);
        
        // 检查响应数据
        if (!response.data) {
          console.error('[databaseStore] 响应数据为空');
          throw new Error('响应数据为空');
        }

        // 处理任务数据，确保正确解析国家、ASN和前缀信息
        const tasks = (response.data.tasks || []).map(task => {
          // 从description中提取信息
          const description = task.description || '';
          let countryId = task.country_id;
          let asn = task.asn;
          let prefix = task.prefix;

          // 如果从数据库字段中没有获取到信息，尝试从description中解析
          if (!countryId || !asn || !prefix) {
            const countryMatch = description.match(/国家:?\s*([A-Z]{2})/);
            const asnMatch = description.match(/ASN:?\s*(\d+)/);
            const prefixMatch = description.match(/前缀:?\s*([0-9a-fA-F:]+(?:\/\d+)?)/);

            countryId = countryId || (countryMatch ? countryMatch[1] : null);
            asn = asn || (asnMatch ? asnMatch[1] : null);
            prefix = prefix || (prefixMatch ? prefixMatch[1] : null);
          }

          return {
            ...task,
            country_id: countryId,
            asn: asn,
            prefix: prefix,
            // 确保其他字段也有默认值
            status: task.status || 'unknown',
            error_message: task.error_message || null,
            created_at: task.created_at || null,
            completed_at: task.completed_at || null,
            file_name: task.file_name || null,
            file_id: task.file_id || null
          };
        });

        // 构建返回结果
        const result = {
          tasks: tasks,
          pagination: response.data.pagination || {
            total: tasks.length,
            page: 1,
            pageSize: 10,
            totalPages: Math.ceil(tasks.length / 10)
          }
        };
        
        console.log('[databaseStore] 处理后的任务列表:', result);
        return result;
        
      } catch (error) {
        console.error('[databaseStore] 获取导入任务列表失败:', error);
        console.error('[databaseStore] 错误详情:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        
        // 设置错误信息
        this.error = error.response?.data?.message || error.message;
        
        // 返回空的任务列表
        return {
          tasks: [],
          pagination: {
            total: 0,
            page: 1,
            pageSize: 10,
            totalPages: 0
          }
        };
      } finally {
        this.isLoading = false;
      }
    },

    async getImportTaskStatus(taskId) {
      try {
        this.isLoading = true;
        const response = await api.database.getImportTaskStatus(taskId);
        return response.data;
      } catch (error) {
        console.error('获取导入任务状态失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async cancelImportTask(taskId) {
      try {
        this.isLoading = true;
        const response = await api.database.cancelImportTask(taskId);
        return response.data;
      } catch (error) {
        console.error('取消导入任务失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async deleteImportTask(taskId) {
      try {
        this.isLoading = true;
        console.log('[databaseStore] 开始删除任务:', taskId);
        const response = await api.database.deleteImportTask(taskId);
        console.log('[databaseStore] 删除任务响应:', response);
        return response.data;
      } catch (error) {
        console.error('[databaseStore] 删除任务失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    
    //---------------国家管理相关的Action----------------//
    async createCountry(data) {
      try {
        await api.database.createCountry(data);
        await this.getCountries();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async updateCountry(id, data) {
      try {
        await api.database.updateCountry(id, data);
        await this.getCountries();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async deleteCountry(id) {
      try {
        await api.database.deleteCountry(id);
        await this.getCountries();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },

    //---------------ASN管理相关的Action----------------//

    async createAsn(data) {
      try {
        await api.database.createAsn(data);
        await this.getAllAsns();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async updateAsn(id, data) {
      try {
        await api.database.updateAsn(id, data);
        await this.getAllAsns();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async deleteAsn(id) {
      try {
        await api.database.deleteAsn(id);
        await this.getAllAsns();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },

    //---------------前缀管理相关的Action----------------//
    async getAllPrefixes(page = 1, pageSize = 1000) {
      try {
        console.log('[Store] 开始获取前缀列表...');
        const response = await api.database.getPrefixes({ page, pageSize });
        console.log('[Store] 获取前缀列表响应:', response);
        
        if (response.data) {
          // 详细记录响应数据结构
          console.log('[Store] 前缀列表响应数据类型:', typeof response.data);
          console.log('[Store] 前缀列表响应数据结构:', 
            response.data ? Object.keys(response.data) : '无数据');
          
          if (response.data.success && Array.isArray(response.data.data)) {
            console.log('[Store] 前缀列表数据格式: success.data 格式');
            console.log('[Store] 前缀数量:', response.data.data.length);
            console.log('[Store] 第一个前缀示例:', response.data.data[0]);
            this.prefixes = response.data.data;
            return this.prefixes;
          } else if (Array.isArray(response.data)) {
            console.log('[Store] 前缀列表数据格式: 直接数组格式');
            console.log('[Store] 前缀数量:', response.data.length);
            console.log('[Store] 第一个前缀示例:', response.data[0]);
            this.prefixes = response.data;
            return this.prefixes;
          } else {
            console.warn('[Store] 前缀列表响应格式异常:', response.data);
            this.prefixes = [];
            return [];
          }
        }
        return [];
      } catch (e) {
        console.error('[Store] 获取前缀列表失败:', e);
        this.error = e.message;
        throw e;
      }
    },
    
    async createPrefix(data) {
      try {
        // 预处理数据，确保包含所有必填字段
        const processedData = {
          ...data,
          prefix_length: data.prefix.split('/')[1] || '',
          version: data.prefix.includes(':') ? '6' : '4',
          country_id: data.country_id || null,
          asn: data.asn || null,
          registry: data.registry || null,
          active_ipv6_count: data.active_ipv6_count || 0
        };
        await api.database.createPrefix(processedData);
        await this.getAllPrefixes();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async updatePrefix(id, data) {
      try {
        // 预处理数据，确保包含所有必填字段
        const processedData = {
          ...data,
          prefix_length: data.prefix.split('/')[1] || '',
          version: data.prefix.includes(':') ? '6' : '4',
          country_id: data.country_id || null,
          asn: data.asn || null,
          registry: data.registry || null,
          active_ipv6_count: data.active_ipv6_count
        };
        
        await api.database.updatePrefix(id, processedData);
        await this.getAllPrefixes();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },
    async deletePrefix(id) {
      try {
        await api.database.deletePrefix(id);
        await this.getAllPrefixes();
      } catch (e) {
        this.error = e.message;
        throw e;
      }
    },

    //---------------协议管理相关Action----------------//
    async fetchProtocolDefinitions() {
      try {
        this.isLoading = true;
        const response = await api.database.getProtocolDefinitions();
        console.log('协议定义API响应:', response.data);
        
        // 确保正确处理响应数据
        if (response.data && response.data.data) {
          this.protocolDefinitions = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
          this.protocolDefinitions = response.data;
        } else {
          console.error('协议定义响应格式异常:', response.data);
          this.protocolDefinitions = [];
        }
        
        this.error = null;
      } catch (error) {
        console.error('获取协议定义列表失败:', error);
        this.error = error.response?.data?.message || error.message;
        this.protocolDefinitions = [];
      } finally {
        this.isLoading = false;
      }
    },
    async createProtocolDefinition(definitionData) {
      try {
        this.isLoading = true;
        const response = await api.database.createProtocolDefinition(definitionData);
        await this.fetchProtocolDefinitions(); // 创建后刷新列表
        return response.data;
      } catch (error) {
        console.error('创建协议定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async updateProtocolDefinition(id, definitionData) {
      try {
        this.isLoading = true;
        const response = await api.database.updateProtocolDefinition(id, definitionData);
        await this.fetchProtocolDefinitions(); // 更新后刷新列表
        return response.data;
      } catch (error) {
        console.error('更新协议定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async deleteProtocolDefinition(id) {
      try {
        this.isLoading = true;
        const response = await api.database.deleteProtocolDefinition(id);
        await this.fetchProtocolDefinitions(); // 删除后刷新列表
        return response.data;
      } catch (error) {
        console.error('删除协议定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async batchUpdateAsnProtocolStats(operations) {
      try {
        this.isLoading = true;
        const response = await api.database.batchUpdateAsnProtocolStats({ operations });
        console.log('[Store] 批量更新响应:', response);
        
        // 检查响应数据
        if (response?.data) {
          const responseData = response.data;
          // 检查是否是完全成功
          if (responseData.success === true) {
            console.log('[Store] 批量更新完全成功:', responseData);
            return {
              success: true,
              message: responseData.message || '更新成功',
              results: responseData.results || []
            };
          } else if (response.status === 207) {
            // 部分成功的情况
            console.log('[Store] 批量更新部分成功:', responseData);
            return {
              success: false,
              message: responseData.message || '部分更新失败',
              results: responseData.results || []
            };
          } else {
            // 其他情况
            console.log('[Store] 批量更新返回其他状态:', responseData);
            return {
              success: false,
              message: responseData.message || '更新失败',
              results: responseData.results || []
            };
          }
        }
        
        // 如果响应格式不正确
        console.warn('[Store] 批量更新响应格式不正确:', response);
        return {
          success: false,
          message: '服务器响应格式不正确',
          results: operations.map(op => ({
            ...op,
            success: false,
            message: '服务器响应格式不正确'
          }))
        };
      } catch (error) {
        console.error('[Store] 批量更新ASN协议统计失败:', error);
        this.error = error.response?.data?.message || error.message;
        // 返回一个包含错误信息的响应对象
        return {
          success: false,
          message: error.response?.data?.message || error.message || '更新失败',
          results: operations.map(op => ({
            ...op,
            success: false,
            message: error.response?.data?.message || error.message || '更新失败'
          }))
        };
      } finally {
        this.isLoading = false;
      }
    },
    
    //---------------漏洞管理相关Action----------------//
    async fetchVulnerabilityDefinitions() {
      try {
        this.isLoading = true;
        const response = await api.database.getVulnerabilityDefinitions();
        console.log('漏洞定义API响应:', response.data);
        
        // 确保正确处理响应数据
        if (response.data && response.data.data) {
          this.vulnerabilityDefinitions = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
          this.vulnerabilityDefinitions = response.data;
        } else {
          console.error('漏洞定义响应格式异常:', response.data);
          this.vulnerabilityDefinitions = [];
        }
        
        this.error = null;
      } catch (error) {
        console.error('获取漏洞定义列表失败:', error);
        this.error = error.response?.data?.message || error.message;
        this.vulnerabilityDefinitions = [];
      } finally {
        this.isLoading = false;
      }
    },
    async createVulnerabilityDefinition(definitionData) {
      try {
        this.isLoading = true;
        const response = await api.database.createVulnerabilityDefinition(definitionData);
        await this.fetchVulnerabilityDefinitions(); // 创建后刷新列表
        return response.data;
      } catch (error) {
        console.error('创建漏洞定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async updateVulnerabilityDefinition(id, definitionData) {
      try {
        this.isLoading = true;
        const response = await api.database.updateVulnerabilityDefinition(id, definitionData);
        await this.fetchVulnerabilityDefinitions(); // 更新后刷新列表
        return response.data;
      } catch (error) {
        console.error('更新漏洞定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async deleteVulnerabilityDefinition(id) {
      try {
        this.isLoading = true;
        const response = await api.database.deleteVulnerabilityDefinition(id);
        await this.fetchVulnerabilityDefinitions(); // 删除后刷新列表
        return response.data;
      } catch (error) {
        console.error('删除漏洞定义失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    async batchUpdateAsnVulnerabilityStats(operations) {
      try {
        this.isLoading = true;
        const response = await api.database.batchUpdateAsnVulnerabilityStats({ operations });
        console.log('[Store] 批量更新响应:', response);
        
        // 检查响应数据
        if (response?.data) {
          const responseData = response.data;
          // 检查是否是完全成功
          if (responseData.success === true) {
            console.log('[Store] 批量更新完全成功:', responseData);
            return {
              success: true,
              message: responseData.message || '更新成功',
              results: responseData.results || []
            };
          } else if (response.status === 207) {
            // 部分成功的情况
            console.log('[Store] 批量更新部分成功:', responseData);
            return {
              success: false,
              message: responseData.message || '部分更新失败',
              results: responseData.results || []
            };
          } else {
            // 其他情况
            console.log('[Store] 批量更新返回其他状态:', responseData);
            return {
              success: false,
              message: responseData.message || '更新失败',
              results: responseData.results || []
            };
          }
        }
        
        // 如果响应格式不正确
        console.warn('[Store] 批量更新响应格式不正确:', response);
        return {
          success: false,
          message: '服务器响应格式不正确',
          results: operations.map(op => ({
            ...op,
            success: false,
            message: '服务器响应格式不正确'
          }))
        };
      } catch (error) {
        console.error('[Store] 批量更新ASN漏洞统计失败:', error);
        this.error = error.response?.data?.message || error.message;
        // 返回一个包含错误信息的响应对象
        return {
          success: false,
          message: error.response?.data?.message || error.message || '更新失败',
          results: operations.map(op => ({
            ...op,
            success: false,
            message: error.response?.data?.message || error.message || '更新失败'
          }))
        };
      } finally {
        this.isLoading = false;
      }
    },
    
    //---------------搜索相关Action----------------//
    async fetchAsnsByCountry(countryId, query = '') { // 确保接收 query 参数
      try {
        console.log(`[Store] 请求获取ASN列表: 国家ID=${countryId}, 查询='${query}'`);
        
        let response;
        if (countryId) {
          // 如果有国家ID，获取该国家的ASN
          response = await api.database.getAsnsByCountry(countryId, query);
          console.log(`[Store] 通过国家ID获取ASN: ${countryId}`);
        } else {
          // 如果没有国家ID，获取所有ASN或搜索ASN
          if (query) {
            // 如果有查询参数，搜索ASN
            response = await api.database.searchAsns(query);
            console.log(`[Store] 搜索ASN: ${query}`);
          } else {
            // 如果没有查询参数，获取所有ASN（限制数量）
            response = await api.database.getAllAsns(1, 50);
            console.log(`[Store] 获取所有ASN (限制50个)`);
          }
        }
        
        // 详细记录后端返回的原始数据结构
        console.log(`[Store] API响应 for ASN列表 (country: ${countryId || 'all'}, query: '${query}')的数据结构:`, 
          response.data ? Object.keys(response.data) : '无数据');
        console.log(`[Store] API响应 for ASN列表的数据类型:`, typeof response.data);
        
        // 修复这里：检查response.data的结构并正确处理
        if (response.data && Array.isArray(response.data)) {
          console.log(`[Store] 成功获取ASN数据(数组形式)，数量: ${response.data.length}`);
          return response.data;
        }
        // 检查success字段和data字段
        else if (response.data && response.data.success === true) {
          if (Array.isArray(response.data.data)) {
            console.log(`[Store] 成功获取ASN数据(success.data形式)，数量: ${response.data.data.length}`);
            return response.data.data;
          } else {
            console.warn(`[Store] 响应成功但data不是数组:`, response.data.data);
            return []; // 确保返回空数组
          }
        } else {
          console.warn(`[Store] 获取ASN列表失败或响应格式不正确。Success: ${response.data?.success}, Message: ${response.data?.message}`);
          this.error = response.data?.message || '获取ASN列表失败 (来自Store)';
          return []; // 出错或未成功时返回空数组
        }
      } catch (error) {
        console.error(`[Store] 调用ASN API时出错 (国家: ${countryId || 'all'}, 查询: '${query}'):`, error);
        if (error.response) {
          console.error('[Store] 错误响应数据:', error.response.data);
          console.error('[Store] 错误响应状态:', error.response.status);
          this.error = error.response.data?.message || error.message;
        } else {
          this.error = error.message;
        }
        return []; // 发生异常时也返回空数组，防止组件出错
      } finally {
        this.isLoading = false;
      }
    },
    async searchAsns(query) {
      try {
          const response = await api.database.searchAsns(query);
          // 处理标准success.data格式
          if (response.data && response.data.success && Array.isArray(response.data.data)) {
              return response.data.data;
          }
          // 处理直接返回数组格式
          if (Array.isArray(response.data)) {
              return response.data;
          }
          return [];
      } catch (error) {
          console.error('搜索ASN失败:', error);
          throw error;
      }
    },
    async getCountries(page = 1, limit = 50, search = '') {
      try {
        console.log(`Store: 开始获取国家列表 (页码: ${page}, 每页数量: ${limit}, 搜索: ${search})`);
        this.countriesLoading = true;
        this.countriesError = null;
        
        // 确保传递正确的参数格式
        const response = await api.database.getCountries({
          page,
          limit,
          search
        });
        console.log('Store: 获取到的国家列表响应:', response);
        
        // 首先检查响应是否有效
        if (!response.data) {
          console.error('国家列表响应无效:', response);
          this.countriesError = '获取国家列表失败: 无效响应';
          this.countries = [];
          return [];
        }
        
        // 处理标准成功响应格式 {success: true, data: [...], pagination: {...}}
        if (response.data.success === true && Array.isArray(response.data.data)) {
          console.log('Store: 处理标准成功响应格式');
          this.countries = response.data.data;
          
          // 设置分页信息
          if (response.data.pagination) {
            console.log('Store: 设置分页信息:', response.data.pagination);
            this.countriesPagination = response.data.pagination;
          } else {
            console.log('Store: 响应中没有分页信息，使用默认值');
            this.countriesPagination = {
              total: response.data.data.length,
              page: page,
              limit: limit,
              pages: 5
            };
          }
          
          return response.data;
        } 
        // 处理直接返回数组的情况
        else if (Array.isArray(response.data)) {
          console.log('Store: 响应是直接数组格式，没有分页信息');
          this.countries = response.data;
          this.countriesPagination = {
            total: response.data.length,
            page: 1,
            limit: response.data.length,
            pages: 5
          };
          return response.data;
        } 
        // 处理其他异常情况
        else {
          console.error('国家列表响应格式异常:', response.data);
          this.countriesError = '获取国家列表失败: 响应格式异常';
          this.countries = [];
          return [];
        }
      } catch (error) {
        console.error('获取国家列表失败:', error);
        this.countriesError = error.message || '获取国家列表失败';
        this.countries = [];
        return [];
      } finally {
        this.countriesLoading = false;
      }
    },
    async getAllAsns(page = 1, limit = 1000) {
      try {
        console.log('[Store] 开始获取所有ASN列表，参数:', { page, limit });
        const response = await api.database.getAllAsns(page, limit);
        console.log('[Store] 获取ASN列表原始响应:', response);
        console.log('[Store] 响应数据类型:', typeof response);
        console.log('[Store] 响应数据结构:', {
          hasData: !!response.data,
          dataType: typeof response.data,
          keys: response.data ? Object.keys(response.data) : 'no data',
          success: response.data?.success,
          dataLength: response.data?.data?.length,
          pagination: response.data?.pagination
        });

        if (response.data) {
          if (response.data.success && Array.isArray(response.data.data)) {
            console.log('[Store] 成功获取ASN数据，数量:', response.data.data.length);
            return response.data.data;
          } else if (Array.isArray(response.data)) {
            console.log('[Store] 成功获取ASN数据(直接数组格式)，数量:', response.data.length);
            return response.data;
          }
        }
        
        console.warn('[Store] 获取ASN列表响应格式不正确:', response.data);
        return [];
      } catch (error) {
        console.error('[Store] 获取所有ASN列表失败:', error);
        if (error.response) {
          console.error('[Store] 错误响应数据:', error.response.data);
          console.error('[Store] 错误响应状态:', error.response.status);
        }
        throw error;
      }
    },
    async searchPrefixes(query) {
      try {
        const response = await api.database.searchPrefixes(query);
        console.log('[store.searchPrefixes] 原始响应:', response);
        if (response.data && response.data.success && Array.isArray(response.data.data)) {
          console.log('[store.searchPrefixes] 返回success.data数组，数量:', response.data.data.length);
          return response.data.data;
        }
        if (Array.isArray(response.data)) {
          console.log('[store.searchPrefixes] 返回直接数组，数量:', response.data.length);
          return response.data;
        }
        if (response.data && Array.isArray(response.data.data)) {
          console.log('[store.searchPrefixes] 返回data数组，数量:', response.data.data.length);
          return response.data.data;
        }
        console.warn('[store.searchPrefixes] 未知响应格式:', response);
        return [];
      } catch (error) {
        console.error('[store.searchPrefixes] 搜索前缀失败:', error);
        throw error;
      }
    },
    // 添加获取ASN前缀列表的方法
    async getPrefixesByAsn(asn) {
      try {
        console.log(`[Store] 获取ASN ${asn} 的前缀列表...`);
        const response = await api.database.getPrefixesByAsn(asn);
        
        if (response.data) {
          if (response.data.success && Array.isArray(response.data.data)) {
            console.log(`[Store] 成功获取ASN ${asn} 的前缀列表，数量:`, response.data.data.length);
            return response.data.data;
          } else if (Array.isArray(response.data)) {
            console.log(`[Store] 成功获取ASN ${asn} 的前缀列表(直接数组格式)，数量:`, response.data.length);
            return response.data;
          }
        }
        
        console.warn(`[Store] 获取ASN ${asn} 的前缀列表响应格式不正确:`, response.data);
        return [];
      } catch (error) {
        console.error(`[Store] 获取ASN ${asn} 的前缀列表失败:`, error);
        throw error;
      }
    },

  },


});