<template>
  <div class="database-management">
    <div class="dashboard-header">
      <div class="header-content">
        <h2>
          <i class="icon-database"></i> IPv6数据库管理
          <span class="subtitle">管理和查询IPv6地址数据</span>
        </h2>
        <div class="header-actions">
          <button class="btn btn-help" @click="activeTab = 'help'">
            <i class="icon-help"></i> 使用帮助
          </button>
        </div>
      </div>
    </div>
    
    <!-- 顶部导航栏 -->
    <div class="top-navigation">
      <div class="nav-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="['nav-tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <i :class="tab.icon"></i>
          <span class="tab-name">{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </div>
    </div>
    
    <div class="dashboard-container">
      <!-- 主内容区 -->
      <div class="dashboard-content">
        <!-- 批量导入 -->
        <div v-if="activeTab === 'import'" class="import-section">
          <div class="section-header">
            <h3><i class="icon-import"></i> 批量导入IPv6地址</h3>
            <p>上传IPv6地址文件，批量导入到数据库</p>
          </div>
          
          <ImportAddressesForm 
            @import-addresses="handleImportAddresses"
            :is-loading="isImporting"
          />
        </div>
        
        <!-- 漏洞管理 -->
          <div v-if="activeTab === 'vulnerabilities'" key="vulnerabilitiesTab" class="vulnerabilities-section">
            <div class="section-header">
              <h3><i class="icon-security"></i> 漏洞管理</h3>
              <p>管理IPv6地址漏洞信息</p>
            </div>
            
            <VulnerabilityManagementForm 
              @update-vulnerabilities="handleUpdateVulnerabilities"
              :is-loading="isUpdatingVulnerabilities"
            />
          </div>
          
          <!-- 协议支持 -->
          <div v-if="activeTab === 'protocols'" key="protocolsTab" class="protocols-section">
            <div class="section-header">
              <h3><i class="icon-protocol"></i> 协议支持管理</h3>
              <p>更新IPv6地址协议支持状态</p>
            </div>
            
            <ProtocolSupportForm 
              @update-protocols="handleUpdateProtocols"
              :is-loading="isUpdatingProtocols"
            />
          </div>

          <!-- IID 类型管理 -->
          <div v-if="activeTab === 'iidtypes'" key="iidtypesTab" class="iidtypes-section">
            <div class="section-header">
              <h3><i class="icon-iid"></i> IID类型管理</h3>
              <p>更新IPv6地址的IID类型检测结果</p>
            </div>
            
            <IIDTypeManagementForm 
              @update-iid-types="handleUpdateIIDTypes"
              :is-loading="isUpdatingIIDTypes"
            />
          </div>
          
          <!-- 国家管理 -->
          <div v-if="activeTab === 'country'" key="countryTab" class="country-section">
            <div class="section-header">
              <h3><i class="icon-database"></i> 国家管理</h3>
              <p>管理国家信息</p>
            </div>
            <CountryManagementForm />
          </div>
          <!-- ASN管理 -->
          <div v-if="activeTab === 'asn'" key="asnTab" class="asn-section">
            <div class="section-header">
              <h3><i class="icon-network"></i> ASN管理</h3>
              <p>管理ASN信息</p>
            </div>
            <AsnManagementForm />
          </div>
          <!-- 前缀管理 -->
          <div v-if="activeTab === 'prefix'" key="prefixTab" class="prefix-section">
            <div class="section-header">
              <h3><i class="icon-network"></i> 前缀管理</h3>
              <p>管理前缀信息</p>
            </div>
            <PrefixManagementForm />
          </div>

        <!-- 高级查询 -->
        <div v-if="activeTab === 'query'" class="query-section">
          <div class="section-header">
            <h3><i class="icon-search"></i> 高级查询</h3>
            <p>多维度查询IPv6数据</p>
          </div>
          
          <AdvancedQueryForm 
            @perform-query="handlePerformQuery"
            :is-loading="isQuerying"
          />
          
          <div v-if="queryResults.length > 0" class="query-results">
            <h4>查询结果 ({{ queryResults.length }} 条记录)</h4>
            <div class="results-table-container">
              <table class="results-table">
                <thead>
                  <tr>
                    <th v-for="column in queryColumns" :key="column.key">{{ column.label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in queryResults" :key="index">
                    <td v-for="column in queryColumns" :key="column.key">
                      {{ formatCellValue(row[column.key], column.type) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div class="export-actions">
              <button class="btn btn-export" @click="exportResults('csv')">
                <i class="icon-download"></i> 导出CSV
              </button>
              <button class="btn btn-export" @click="exportResults('json')">
                <i class="icon-download"></i> 导出JSON
              </button>
            </div>
          </div>
        </div>
        
        <!-- 数据统计 -->
        <div v-if="activeTab === 'stats'" class="stats-section">
          <div class="section-header">
            <h3><i class="icon-chart"></i> 数据统计</h3>
            <p>查看数据库统计信息</p>
          </div>
          
          <div class="stats-summary">
            <div class="stats-cards">
              <div class="stats-card" v-for="stat in databaseStats" :key="stat.label">
                <div class="stat-value">{{ formatNumber(stat.value) }}</div>
                <div class="stat-label">{{ stat.label }}</div>
              </div>
            </div>
          </div>
          
          <div class="stats-charts">
            <div class="chart-container">
              <h4>国家IPv6分布</h4>
              <div class="chart" ref="countryChart"></div>
            </div>
            <div class="chart-container">
              <h4>漏洞分布</h4>
              <div class="chart" ref="vulnerabilityChart"></div>
            </div>
          </div>
        </div>
        
        <!-- 使用帮助 -->
        <div v-if="activeTab === 'help'" class="help-section">
          <div class="section-header">
            <h3><i class="icon-help"></i> 使用帮助</h3>
          </div>
          
          <div class="help-content">
            <div class="help-section">
              <h4>批量导入IPv6地址</h4>
              <p>通过上传文件批量导入IPv6地址，支持以下格式：</p>
              <ul>
                <li>每行一个IPv6地址</li>
                <li>CSV格式（地址,前缀,国家,ASN）</li>
                <li>JSON格式</li>
              </ul>
              <p>导入过程会自动更新相关统计信息，并确保数据一致性。</p>
            </div>
            
            <div class="help-section">
              <h4>漏洞管理</h4>
              <p>管理IPv6地址的漏洞信息，支持以下操作：</p>
              <ul>
                <li>批量添加漏洞关联</li>
                <li>批量更新漏洞修复状态</li>
                <li>查看漏洞统计信息</li>
              </ul>
            </div>
            
            <div class="help-section">
              <h4>协议支持管理</h4>
              <p>更新IPv6地址的协议支持状态，支持以下操作：</p>
              <ul>
                <li>批量更新协议支持状态</li>
                <li>按国家或ASN筛选地址</li>
                <li>查看协议支持统计</li>
              </ul>
            </div>
            
            <div class="help-section">
              <h4>高级查询</h4>
              <p>多维度查询IPv6数据，支持以下功能：</p>
              <ul>
                <li>复杂条件组合查询</li>
                <li>查询结果导出</li>
                <li>自定义查询字段</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import { useDatabaseStore } from '@/stores/database';
import ImportAddressesForm from '@/components/database/ImportAddressesForm.vue';
import VulnerabilityManagementForm from '@/components/database/VulnerabilityManagementForm.vue';
import ProtocolSupportForm from '@/components/database/ProtocolSupportForm.vue';
import IIDTypeManagementForm from '@/components/database/IIDTypeManagementForm.vue'; 
import AdvancedQueryForm from '@/components/database/AdvancedQueryForm.vue';
import CountryManagementForm from '@/components/database/CountryManagementForm.vue';
import AsnManagementForm from '@/components/database/AsnManagementForm.vue';
import PrefixManagementForm from '@/components/database/PrefixManagementForm.vue';

import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 注册ECharts组件
echarts.use([
  BarChart,
  PieChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer
]);
let operationIdCounter = 0; 
const databaseStore = useDatabaseStore();
const activeTab = ref('import');
const isImporting = ref(false);
const isUpdatingVulnerabilities = ref(false);
const isUpdatingProtocols = ref(false);
const isQuerying = ref(false);
const queryResults = ref([]);
const queryColumns = ref([]);
const countryChartInstance = ref(null);
const vulnerabilityChartInstance = ref(null);
const isUpdatingIIDTypes = ref(false);
const tabs = [
  { id: 'import', label: '批量导入', icon: 'icon-import' },
  { id: 'vulnerabilities', label: '漏洞管理', icon: 'icon-security' },
  { id: 'protocols', label: '协议支持', icon: 'icon-protocol' },
  { id: 'iidtypes', label: 'IID类型', icon: 'icon-iid' }, // IID 类型选项卡
  { id: 'country', label: '国家管理', icon: 'icon-database' },
  { id: 'asn', label: 'ASN管理', icon: 'icon-network' },
  { id: 'prefix', label: '前缀管理', icon: 'icon-network' },
  { id: 'query', label: '高级查询', icon: 'icon-search' },
  { id: 'stats', label: '数据统计', icon: 'icon-chart' },
  { id: 'help', label: '使用帮助', icon: 'icon-help', badge: '新' }
];

const databaseStats = computed(() => [
  { label: '活跃IPv6地址', value: databaseStore.stats.activeAddresses || 0 },
  { label: 'IPv6前缀', value: databaseStore.stats.prefixes || 0 },
  { label: '国家数量', value: databaseStore.stats.countries || 0 },
  { label: 'ASN数量', value: databaseStore.stats.asns || 0 },
  { label: '漏洞数量', value: databaseStore.stats.vulnerabilities || 0 }
]);

// 处理批量导入
const handleImportAddresses = async (importData) => {
  try {
    isImporting.value = true;
    await databaseStore.importAddresses(importData);
    alert('导入成功');
  } catch (error) {
    console.error('导入失败:', error);
    alert(`导入失败: ${error.message}`);
  } finally {
    isImporting.value = false;
  }
};

// 处理漏洞更新
const handleUpdateVulnerabilities = async (vulnerabilityData) => {
  try {
    isUpdatingVulnerabilities.value = true;
    await databaseStore.updateVulnerabilities(vulnerabilityData);
    alert('漏洞信息更新成功');
  } catch (error) {
    console.error('更新漏洞信息失败:', error);
    alert(`更新失败: ${error.message}`);
  } finally {
    isUpdatingVulnerabilities.value = false;
  }
};

// 处理协议支持更新
const handleUpdateProtocols = async (protocolData) => {
  try {
    isUpdatingProtocols.value = true;
    await databaseStore.updateProtocolSupport(protocolData);
    alert('协议支持信息更新成功');
  } catch (error) {
    console.error('更新协议支持信息失败:', error);
    alert(`更新失败: ${error.message}`);
  } finally {
    isUpdatingProtocols.value = false;
  }
};

// 处理 IID 类型更新
const handleUpdateIIDTypes = async (iidTypeData) => {
  try {
    isUpdatingIIDTypes.value = true;
    await databaseStore.updateIIDTypes(iidTypeData);
    alert('IID类型信息更新成功');
  } catch (error) {
    console.error('更新IID类型信息失败:', error);
    alert(`更新失败: ${error.message}`);
  } finally {
    isUpdatingIIDTypes.value = false;
  }
};

// 处理高级查询
const handlePerformQuery = async (queryParams) => {
  try {
    isQuerying.value = true;
    console.log('开始执行高级查询:', queryParams);
    const result = await databaseStore.performAdvancedQuery(queryParams);
    console.log('查询结果:', result);
    
    // 检查响应结构
    if (!result || typeof result !== 'object') {
      console.error('查询响应格式错误:', result);
      alert('查询响应格式错误，请检查控制台');
      return;
    }
    
    // 确保从正确的属性中获取数据
    if (result.data) {
      queryResults.value = result.data;
    } else if (Array.isArray(result)) {
      queryResults.value = result;
    } else {
      console.error('无法识别的响应格式:', result);
      alert('无法识别的响应格式，请检查控制台');
      return;
    }
    
    console.log(`设置查询结果: ${queryResults.value.length} 条记录`);
    console.log('查询结果示例:', queryResults.value.length > 0 ? queryResults.value[0] : '无数据');
    
    // 设置查询结果列
    if (queryResults.value.length > 0) {
      const firstRow = queryResults.value[0];
      console.log('第一条记录:', firstRow);
      queryColumns.value = Object.keys(firstRow).map(key => {
        // 检查值的类型
        let type = typeof firstRow[key];
        // 特殊处理日期类型
        if (firstRow[key] && (key.includes('_at') || key.includes('date') || key.includes('seen'))) {
          type = 'date';
        }
        return {
          key,
          label: formatColumnLabel(key),
          type: type
        };
      });
      console.log('设置查询结果列:', queryColumns.value);
    } else {
      console.log('查询结果为空，无法设置列信息');
      queryColumns.value = [];
    }
  } catch (error) {
    console.error('查询失败:', error);
    console.error('错误详情:', error.response ? error.response.data : '无响应数据');
    alert(`查询失败: ${error.message}`);
  } finally {
    isQuerying.value = false;
  }
};

// 格式化列标签
const formatColumnLabel = (key) => {
  // 添加特殊字段的中文映射
  const fieldMappings = {
    'address': 'IPv6地址',
    'address_id': '地址ID',
    'prefix': '前缀',
    'country_name_zh': '国家(中文)',
    'country_name': '国家(英文)',
    'asn': 'ASN',
    'as_name_zh': 'AS名称(中文)',
    'as_name': 'AS名称(英文)',
    'first_seen': '首次发现时间',
    'last_seen': '最后活跃时间',
    'uptime_percentage': '在线率',
    'iid_type': 'IID类型'
  };
  
  // 如果有映射，直接返回
  if (fieldMappings[key]) {
    return fieldMappings[key];
  }
  
  // 否则使用通用格式化
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase());
};

// 格式化单元格值
const formatCellValue = (value, type) => {
  if (value === null || value === undefined) return '-';
  
  if (type === 'date' && value) {
    try {
      // 尝试将字符串转换为日期对象
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('zh-CN');
      }
    } catch (e) {
      console.warn('日期格式化失败:', e);
    }
    // 如果转换失败，返回原始值
    return value;
  } else if (type === 'boolean') {
    return value ? '是' : '否';
  } else if (type === 'number') {
    return typeof value === 'number' ? value.toLocaleString() : value;
  }
  
  return value;
};

// 格式化数字
const formatNumber = (num) => {
  return num.toLocaleString();
};

// 导出结果
const exportResults = (format) => {
  if (queryResults.value.length === 0) return;
  
  if (format === 'csv') {
    const headers = queryColumns.value.map(col => col.label).join(',');
    const rows = queryResults.value.map(row => {
      return queryColumns.value.map(col => {
        const value = row[col.key];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(',');
    }).join('\n');
    
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ipv6-query-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (format === 'json') {
    const jsonContent = JSON.stringify(queryResults.value, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ipv6-query-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// 初始化图表
const initCharts = async () => {
  if (activeTab.value !== 'stats') return;
  
  await nextTick();
  
  // 初始化国家分布图表
  const countryChartElement = document.querySelector('.chart-container .chart');
  if (countryChartElement && !countryChartInstance.value) {
    countryChartInstance.value = echarts.init(countryChartElement);
    
    // 获取国家数据
    const countryData = await databaseStore.getCountryStats();
    
    // 设置图表选项
    const countryOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['活跃地址数', 'IPv6前缀数']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01]
      },
      yAxis: {
        type: 'category',
        data: countryData.slice(0, 10).map(item => item.country_name_zh || item.country_name)
      },
      series: [
        {
          name: '活跃地址数',
          type: 'bar',
          data: countryData.slice(0, 10).map(item => item.total_active_ipv6)
        },
        {
          name: 'IPv6前缀数',
          type: 'bar',
          data: countryData.slice(0, 10).map(item => item.total_ipv6_prefixes)
        }
      ]
    };
    
    countryChartInstance.value.setOption(countryOption);
  }
  
  // 初始化漏洞分布图表
  const vulnerabilityChartElement = document.querySelectorAll('.chart-container .chart')[1];
  if (vulnerabilityChartElement && !vulnerabilityChartInstance.value) {
    vulnerabilityChartInstance.value = echarts.init(vulnerabilityChartElement);
    
    // 获取漏洞数据
    const vulnerabilityData = await databaseStore.getVulnerabilityStats();
    
    // 设置图表选项
    const vulnerabilityOption = {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 10,
        data: vulnerabilityData.map(item => item.vulnerability_name)
      },
      series: [
        {
          name: '漏洞分布',
          type: 'pie',
          radius: ['50%', '70%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '18',
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: vulnerabilityData.map(item => ({
            name: item.vulnerability_name,
            value: item.affected_addresses
          }))
        }
      ]
    };
    
    vulnerabilityChartInstance.value.setOption(vulnerabilityOption);
  }
};

// 监听标签页变化
watch(activeTab, async (newTab) => {
  if (newTab === 'stats') {
    await databaseStore.fetchDatabaseStats();
    initCharts();
  }
});

// 组件挂载时
onMounted(async () => {
  await databaseStore.fetchDatabaseStats();
  
  // 初始化图表（如果当前是统计页面）
  if (activeTab.value === 'stats') {
    initCharts();
  }
});


</script>

<style scoped lang="scss">
.database-management {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dashboard-header {
  padding: 1.5rem 2rem;
  background-color: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    
    i {
      font-size: 1.8rem;
    }
    
    .subtitle {
      margin-left: 0.5rem;
      color: #718096;
      font-size: 0.95rem;
      font-weight: normal;
    }
  }
}

.header-actions {
  display: flex;
  gap: 1rem;
}

/* 顶部导航样式 */
.top-navigation {
  background-color: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0.5rem 2rem;
  display: flex;
  justify-content: center;
  align-items: center;
  
  .nav-tabs {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    
    &::-webkit-scrollbar {
      height: 4px;
    }
    
    &::-webkit-scrollbar-thumb {
      background-color: #cbd5e0;
      border-radius: 4px;
    }
  }
  
  .nav-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.2rem;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: #718096;
    transition: all 0.2s ease;
    white-space: nowrap;
    
    &:hover {
      background-color: #edf2f7;
      color: #4a5568;
    }
    
    &.active {
      background-color: #e6f7ef;
      color: #42b983;
      font-weight: 500;
    }
    
    i {
      font-size: 1.1rem;
    }
    
    .tab-badge {
      font-size: 0.7rem;
      background-color: #ff4757;
      color: white;
      padding: 0.1rem 0.4rem;
      border-radius: 10px;
    }
  }
}

.dashboard-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.dashboard-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.section-header {
  margin-bottom: 1.5rem;
  
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.3rem;
    color: #35495e;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  p {
    margin: 0;
    color: #718096;
    font-size: 0.95rem;
  }
}

.stats-summary {
  margin-bottom: 2rem;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stats-card {
  background-color: #f8fafc;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  
  .stat-value {
    font-size: 2rem;
    font-weight: 600;
    color: #42b983;
    margin-bottom: 0.5rem;
  }
  
  .stat-label {
    color: #718096;
    font-size: 0.95rem;
  }
}

.stats-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.chart-container {
  background-color: #f8fafc;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  
  h4 {
    margin: 0 0 1rem;
    color: #35495e;
    font-size: 1.1rem;
  }
  
  .chart {
    height: 350px;
  }
}

.query-results {
  margin-top: 2rem;
  
  h4 {
    margin: 0 0 1rem;
    color: #35495e;
    font-size: 1.1rem;
  }
}

.results-table-container {
  overflow-x: auto;
  margin-bottom: 1.5rem;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 0.8rem 1rem;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  
  th {
    background-color: #f8fafc;
    font-weight: 500;
    color: #4a5568;
  }
  
  tr:hover td {
    background-color: #f8fafc;
  }
}

.export-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn {
  padding: 0.7rem 1.2rem;
  border-radius: 6px;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  
  &-help {
    background-color: #edf2f7;
    color: #4a5568;
    
    &:hover {
      background-color: #e2e8f0;
    }
  }
  
  &-export {
    background-color: #4299e1;
    color: white;
    
    &:hover {
      background-color: #3182ce;
    }
  }
}

.help-content {
  .help-section {
    margin-bottom: 2rem;
    
    h4 {
      margin: 0 0 0.8rem;
      color: #35495e;
      font-size: 1.1rem;
    }
    
    p {
      margin: 0 0 0.8rem;
      color: #4a5568;
    }
    
    ul {
      margin: 0 0 1rem;
      padding-left: 1.5rem;
      
      li {
        margin-bottom: 0.5rem;
        color: #4a5568;
      }
    }
  }
}

/* 图标样式 */
.icon-database:before { content: "🗄️"; }
.icon-help:before { content: "❓"; }
.icon-import:before { content: "📥"; }
.icon-security:before { content: "🔒"; }
.icon-protocol:before { content: "🔌"; }
.icon-iid:before { content: "🔑"; } /* 新增 IID 图标 */
.icon-search:before { content: "🔍"; }
.icon-chart:before { content: "📊"; }
.icon-download:before { content: "💾"; }
</style>