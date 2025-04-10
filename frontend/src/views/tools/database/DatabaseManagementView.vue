<template>
    <div class="database-management">
      <div class="dashboard-header">
        <div class="header-content">
          <h2>
            <i class="icon-database"></i> 数据库管理工具
          </h2>
          <div class="header-actions">
            <button class="btn btn-back" @click="goBackToTools">
              <i class="icon-arrow-left"></i> 返回工具平台
            </button>
            <button class="btn btn-help" @click="activeTab = 'help'">
              <i class="icon-help"></i> 使用帮助
            </button>
          </div>
        </div>
        <p class="subtitle">IPv6数据库高级管理与维护工具</p>
      </div>
      
      <div class="dashboard-container">
        <!-- 左侧边栏 -->
        <div class="dashboard-sidebar">
          <div class="sidebar-header">
            <h3>功能导航</h3>
          </div>
          <div class="sidebar-nav">
            <button 
              v-for="tab in tabs" 
              :key="tab.id"
              :class="['nav-item', { active: activeTab === tab.id }]"
              @click="activeTab = tab.id"
            >
              <i :class="tab.icon"></i>
              <span class="tab-name">{{ tab.label }}</span>
              <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
            </button>
          </div>
          
          <div class="sidebar-footer">
            <div class="database-stats-mini">
              <div class="stat-item" v-for="(stat, index) in databaseStats.slice(0, 3)" :key="index">
                <div class="stat-label">{{ stat.label }}</div>
                <div class="stat-value">{{ formatNumber(stat.value) }}</div>
              </div>
            </div>
          </div>
        </div>
        
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
          <div v-if="activeTab === 'vulnerabilities'" class="vulnerabilities-section">
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
          <div v-if="activeTab === 'protocols'" class="protocols-section">
            <div class="section-header">
              <h3><i class="icon-protocol"></i> 协议支持管理</h3>
              <p>更新IPv6地址协议支持状态</p>
            </div>
            
            <ProtocolSupportForm 
              @update-protocols="handleUpdateProtocols"
              :is-loading="isUpdatingProtocols"
            />
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
            
            <div class="stats-cards">
              <div class="stats-card" v-for="stat in databaseStats" :key="stat.label">
                <div class="stat-value">{{ formatNumber(stat.value) }}</div>
                <div class="stat-label">{{ stat.label }}</div>
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
  import { ref, onMounted, computed, nextTick } from 'vue';
  import { useRouter } from 'vue-router';
  import { useDatabaseStore } from '@/stores/database';
  import ImportAddressesForm from '@/components/database/ImportAddressesForm.vue';
  import VulnerabilityManagementForm from '@/components/database/VulnerabilityManagementForm.vue';
  import ProtocolSupportForm from '@/components/database/ProtocolSupportForm.vue';
  import AdvancedQueryForm from '@/components/database/AdvancedQueryForm.vue';
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
  
  const router = useRouter();
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
  
  const tabs = [
    { id: 'import', label: '批量导入', icon: 'icon-import' },
    { id: 'vulnerabilities', label: '漏洞管理', icon: 'icon-security' },
    { id: 'protocols', label: '协议支持', icon: 'icon-protocol' },
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
  
  // 返回工具平台
  const goBackToTools = () => {
    router.push('/tools');
  };
  
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
  
  // 处理高级查询
  const handlePerformQuery = async (queryParams) => {
    try {
      isQuerying.value = true;
      const result = await databaseStore.performAdvancedQuery(queryParams);
      queryResults.value = result.data || [];
      
      // 设置查询结果列
      if (queryResults.value.length > 0) {
        const firstRow = queryResults.value[0];
        queryColumns.value = Object.keys(firstRow).map(key => {
          const type = typeof firstRow[key];
          return {
            key,
            label: formatColumnLabel(key),
            type: type === 'object' && firstRow[key] instanceof Date ? 'date' : type
          };
        });
      }
    } catch (error) {
      console.error('查询失败:', error);
      alert(`查询失败: ${error.message}`);
    } finally {
      isQuerying.value = false;
    }
  };
  
  // 格式化列标签
  const formatColumnLabel = (key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  };
  
  // 格式化单元格值
  const formatCellValue = (value, type) => {
    if (value === null || value === undefined) return '-';
    
    if (type === 'date') {
      return new Date(value).toLocaleString('zh-CN');
    } else if (type === 'boolean') {
      return value ? '是' : '否';
    } else if (type === 'number') {
      return value.toLocaleString();
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
  const watchActiveTab = async () => {
    if (activeTab.value === 'stats') {
      await databaseStore.fetchDatabaseStats();
      initCharts();
    }
  };
  
  // 组件挂载时
  onMounted(async () => {
    await databaseStore.fetchDatabaseStats();
    
    // 监听标签页变化
    watchActiveTab();
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
    }
    
    .subtitle {
      margin: 0.5rem 0 0;
      color: #718096;
      font-size: 0.95rem;
    }
  }
  
  .header-actions {
    display: flex;
    gap: 1rem;
  }
  
  .dashboard-container {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .dashboard-sidebar {
    width: 240px;
    background-color: #f8fafc;
    border-right: 1px solid #edf2f7;
    display: flex;
    flex-direction: column;
    
    .sidebar-header {
      padding: 1.5rem;
      border-bottom: 1px solid #edf2f7;
      
      h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #4a5568;
      }
    }
    
    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 0;
    }
    
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      width: 100%;
      padding: 0.9rem 1.5rem;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      color: #718096;
      position: relative;
      transition: all 0.2s ease;
      
      &:hover {
        background-color: #edf2f7;
        color: #4a5568;
      }
      
      &.active {
        background-color: #e6f7ef;
        color: #42b983;
        font-weight: 500;
        
        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background-color: #42b983;
        }
      }
      
      i {
        font-size: 1.2rem;
        width: 24px;
        text-align: center;
      }
      
      .tab-name {
        flex: 1;
      }
      
      .tab-badge {
        font-size: 0.7rem;
        background-color: #ff4757;
        color: white;
        padding: 0.1rem 0.4rem;
        border-radius: 10px;
      }
    }
    
    .sidebar-footer {
      padding: 1.5rem;
      border-top: 1px solid #edf2f7;
      
      .database-stats-mini {
        .stat-item {
          margin-bottom: 0.8rem;
          
          .stat-label {
            font-size: 0.8rem;
            color: #718096;
            margin-bottom: 0.2rem;
          }
          
          .stat-value {
            font-size: 1.1rem;
            font-weight: 600;
            color: #42b983;
          }
        }
      }
    }
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
  
  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
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
    
    &-back {
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
  .icon-search:before { content: "🔍"; }
  .icon-chart:before { content: "📊"; }
  .icon-download:before { content: "💾"; }
  .icon-arrow-left:before { content: "⬅️"; }
  </style>