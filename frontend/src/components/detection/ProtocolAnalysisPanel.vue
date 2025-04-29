<template>
    <div class="protocol-analysis-panel">
      <div v-if="!selectedProtocol" class="protocol-selection">
        <h3>全球协议分析</h3>
        <div v-if="isLoading" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else-if="protocols.length === 0" class="empty-state">
          <el-empty description="暂无协议数据" />
        </div>
        <div v-else class="protocol-list">
          <el-table
            :data="protocols"
            stripe
            style="width: 100%"
            @row-click="handleProtocolSelect"
          >
            <el-table-column prop="protocol_name" label="协议名称" min-width="120" />
            <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
              <template #default="scope">
                {{ formatNumber(scope?.row?.affected_addresses) }}
              </template>
            </el-table-column>
            <el-table-column prop="affected_asns" label="受影响ASN数" min-width="120">
              <template #default="scope">
                {{ formatNumber(scope?.row?.affected_asns) }}
              </template>
            </el-table-column>
            <el-table-column prop="affected_countries" label="受影响国家数" min-width="120">
              <template #default="scope">
                {{ formatNumber(scope?.row?.affected_countries) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
  
      <div v-else class="protocol-detail">
        <div class="detail-header">
          <el-button icon="ArrowLeft" @click="backToList">返回列表</el-button>
          <h3>{{ selectedProtocol.protocol_name }} 协议分析</h3>
        </div>
  
        <div class="protocol-overview">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="协议名称">{{ selectedProtocol.protocol_name }}</el-descriptions-item>
            <el-descriptions-item label="受影响地址数">{{ formatNumber(selectedProtocol.affected_addresses) }}</el-descriptions-item>
            <el-descriptions-item label="受影响ASN数">{{ formatNumber(selectedProtocol.affected_asns) }}</el-descriptions-item>
            <el-descriptions-item label="受影响国家数">{{ formatNumber(selectedProtocol.affected_countries) }}</el-descriptions-item>
            <el-descriptions-item label="全球占比" :span="2">
              <el-progress 
                :percentage="parseFloat(selectedProtocol.affected_percentage ? selectedProtocol.affected_percentage : 0)" 
                :format="percentFormat"
                :color="getPercentageColor(selectedProtocol.affected_percentage)"
              />
            </el-descriptions-item>
            <el-descriptions-item label="协议描述" :span="2">
              {{ selectedProtocol.description || '暂无描述' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
  
        <div class="tabs-container">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="ASN分布" name="asns">
              <div v-if="isLoadingAsns" class="loading-container">
                <el-skeleton :rows="5" animated />
              </div>
              <div v-else-if="!protocolAsns.asns || protocolAsns.asns.length === 0" class="empty-state">
                <el-empty description="暂无ASN数据" />
              </div>
              <div v-else>
                <el-table
                  :data="protocolAsns.asns"
                  stripe
                  style="width: 100%"
                  @row-click="handleAsnSelect"
                >
                  <el-table-column prop="asn" label="ASN" min-width="100" />
                  <el-table-column prop="as_name" label="名称" min-width="180">
                    <template #default="scope">
                      {{ scope.row.as_name_zh || scope.row.as_name }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="country_name" label="国家" min-width="100">
                    <template #default="scope">
                      {{ scope.row.country_name_zh || scope.row.country_name }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
                    <template #default="scope">
                      {{ formatNumber(scope.row.affected_addresses) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="affected_percentage" label="占比" min-width="120">
                    <template #default="scope">
                      <el-progress 
                        :percentage="parseFloat(scope.row.affected_percentage ? scope.row.affected_percentage : 0)" 
                        :format="percentFormat"
                        :color="getPercentageColor(scope.row.affected_percentage)"
                      />
                    </template>
                  </el-table-column>
                </el-table>
                
                <div class="pagination">
                  <el-pagination
                    v-model:current-page="currentPage"
                    v-model:page-size="pageSize"
                    :page-sizes="[10, 20, 50, 100]"
                    layout="total, sizes, prev, pager, next"
                    :total="protocolAsns.total || 0"
                    @size-change="handleSizeChange"
                    @current-change="handleCurrentChange"
                  />
                </div>
              </div>
            </el-tab-pane>
            
            <el-tab-pane label="地区分布" name="regions">
              <div v-if="isLoadingRegions" class="loading-container">
                <el-skeleton :rows="5" animated />
              </div>
              <div v-else-if="!protocolRegions || protocolRegions.length === 0" class="empty-state">
                <el-empty description="暂无地区数据" />
              </div>
              <div v-else class="region-distribution">
                <el-table
                  :data="protocolRegions"
                  stripe
                  style="width: 100%"
                >
                  <el-table-column prop="region" label="地区" min-width="150" />
                  <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
                    <template #default="scope">
                      {{ formatNumber(scope.row.affected_addresses) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="total_addresses" label="地区总地址数" min-width="120">
                    <template #default="scope">
                      {{ formatNumber(scope.row.total_addresses) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="affected_percentage" label="占比" min-width="150">
                    <template #default="scope">
                      <el-progress 
                        :percentage="parseFloat(scope.row.affected_percentage ? scope.row.affected_percentage : 0)" 
                        :format="percentFormat"
                        :color="getPercentageColor(scope.row.affected_percentage)"
                      />
                    </template>
                  </el-table-column>
                </el-table>
                
                <div class="chart-container" v-if="protocolRegions.length > 0">
                  <h4>地区分布图</h4>
                  <div ref="regionChartRef" style="width: 100%; height: 400px;"></div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 新增国家分布选项卡 -->
            <el-tab-pane label="国家分布" name="countries">
              <div v-if="isLoadingCountries" class="loading-container">
                <el-skeleton :rows="5" animated />
              </div>
              <div v-else-if="!protocolCountries.countries || protocolCountries.countries.length === 0" class="empty-state">
                <el-empty description="暂无国家数据" />
              </div>
              <div v-else class="country-distribution">
                <el-table
                  :data="protocolCountries.countries"
                  stripe
                  style="width: 100%"
                  @row-click="handleCountrySelect"
                >
                  <el-table-column prop="country_name" label="国家" min-width="150">
                    <template #default="scope">
                      {{ scope.row.country_name_zh || scope.row.country_name }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="region" label="地区" min-width="120" />
                  <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
                    <template #default="scope">
                      {{ formatNumber(scope.row.affected_addresses) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="total_active_ipv6" label="国家总地址数" min-width="120">
                    <template #default="scope">
                      {{ formatNumber(scope.row.total_active_ipv6) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="affected_percentage" label="占比" min-width="150">
                    <template #default="scope">
                      <el-progress 
                        :percentage="parseFloat(scope.row.affected_percentage ? scope.row.affected_percentage : 0)" 
                        :format="percentFormat"
                        :color="getPercentageColor(scope.row.affected_percentage)"
                      />
                    </template>
                  </el-table-column>
                </el-table>
                
                <div class="pagination">
                  <el-pagination
                    v-model:current-page="countriesCurrentPage"
                    v-model:page-size="countriesPageSize"
                    :page-sizes="[10, 20, 50, 100]"
                    layout="total, sizes, prev, pager, next"
                    :total="protocolCountries.total || 0"
                    @size-change="handleCountriesSizeChange"
                    @current-change="handleCountriesCurrentChange"
                  />
                </div>
                
                <div class="chart-container" v-if="protocolCountries.countries && protocolCountries.countries.length > 0">
                  <h4>国家分布图</h4>
                  <div ref="countryChartRef" style="width: 100%; height: 400px;"></div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
  
      <!-- ASN协议详情对话框 -->
      <el-dialog
        v-model="showAsnDetail"
        title="ASN协议详情"
        width="80%"
        destroy-on-close
      >
        <div v-if="!asnProtocolDetail" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="ASN">{{ asnProtocolDetail.info.asn }}</el-descriptions-item>
            <el-descriptions-item label="名称">{{ asnProtocolDetail.info.as_name_zh || asnProtocolDetail.info.as_name }}</el-descriptions-item>
            <el-descriptions-item label="国家">{{ asnProtocolDetail.info.country_name_zh || asnProtocolDetail.info.country_name }}</el-descriptions-item>
            <el-descriptions-item label="协议">{{ asnProtocolDetail.info.protocol_name }}</el-descriptions-item>
            <el-descriptions-item label="受影响地址数">{{ formatNumber(asnProtocolDetail.info.affected_addresses) }}</el-descriptions-item>
            <el-descriptions-item label="总地址数">{{ formatNumber(asnProtocolDetail.info.total_active_ipv6) }}</el-descriptions-item>
            <el-descriptions-item label="占比" :span="2">
              <el-progress 
                :percentage="parseFloat(asnProtocolDetail.info.affected_percentage || 0)" 
                :format="percentFormat"
                :color="getPercentageColor(asnProtocolDetail.info.affected_percentage)"
              />
            </el-descriptions-item>
          </el-descriptions>
  
          <div class="chart-container" v-if="asnProtocolDetail.prefixDistribution.length > 0">
            <h4>前缀分布</h4>
            <div ref="prefixChartRef" style="width: 100%; height: 400px;"></div>
          </div>
  
          <div class="prefix-table" v-if="asnProtocolDetail.prefixDistribution.length > 0">
            <h4>前缀详情</h4>
            <el-table
              :data="asnProtocolDetail.prefixDistribution"
              stripe
              style="width: 100%"
            >
              <el-table-column prop="prefix" label="前缀" min-width="180">
                <template #default="scope">
                  {{ scope.row.prefix }}/{{ scope.row.prefix_length }}
                </template>
              </el-table-column>
              <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
                <template #default="scope">
                  {{ formatNumber(scope.row.affected_addresses) }}
                </template>
              </el-table-column>
              <el-table-column prop="total_addresses" label="总地址数" min-width="120">
                <template #default="scope">
                  {{ formatNumber(scope.row.total_addresses) }}
                </template>
              </el-table-column>
              <el-table-column prop="affected_percentage" label="占比" min-width="150">
                <template #default="scope">
                  <el-progress 
                    :percentage="parseFloat(scope.row.affected_percentage || 0)" 
                    :format="percentFormat"
                    :color="getPercentageColor(scope.row.affected_percentage)"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-dialog>

      <!-- 国家协议详情对话框 -->
      <el-dialog
        v-model="showCountryDetail"
        title="国家协议详情"
        width="80%"
        destroy-on-close
      >
        <div v-if="!countryProtocolDetail" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="国家">{{ countryProtocolDetail.info.country_name_zh || countryProtocolDetail.info.country_name }}</el-descriptions-item>
            <el-descriptions-item label="地区">{{ countryProtocolDetail.info.region }}</el-descriptions-item>
            <el-descriptions-item label="协议">{{ countryProtocolDetail.info.protocol_name }}</el-descriptions-item>
            <el-descriptions-item label="受影响地址数">{{ formatNumber(countryProtocolDetail.info.affected_addresses) }}</el-descriptions-item>
            <el-descriptions-item label="总地址数">{{ formatNumber(countryProtocolDetail.info.total_active_ipv6) }}</el-descriptions-item>
            <el-descriptions-item label="占比" :span="2">
              <el-progress 
                :percentage="parseFloat(countryProtocolDetail.info.affected_percentage || 0)" 
                :format="percentFormat"
                :color="getPercentageColor(countryProtocolDetail.info.affected_percentage)"
              />
            </el-descriptions-item>
          </el-descriptions>
  
          <div class="asn-table" v-if="countryProtocolDetail.asnDistribution.length > 0">
            <h4>ASN分布</h4>
            <el-table
              :data="countryProtocolDetail.asnDistribution"
              stripe
              style="width: 100%"
              @row-click="handleCountryAsnSelect"
            >
              <el-table-column prop="asn" label="ASN" min-width="100" />
              <el-table-column prop="as_name" label="名称" min-width="180">
                <template #default="scope">
                  {{ scope.row.as_name_zh || scope.row.as_name }}
                </template>
              </el-table-column>
              <el-table-column prop="affected_addresses" label="受影响地址数" min-width="120">
                <template #default="scope">
                  {{ formatNumber(scope.row.affected_addresses) }}
                </template>
              </el-table-column>
              <el-table-column prop="total_active_ipv6" label="总地址数" min-width="120">
                <template #default="scope">
                  {{ formatNumber(scope.row.total_active_ipv6) }}
                </template>
              </el-table-column>
              <el-table-column prop="affected_percentage" label="占比" min-width="150">
                <template #default="scope">
                  <el-progress 
                    :percentage="parseFloat(scope.row.affected_percentage || 0)" 
                    :format="percentFormat"
                    :color="getPercentageColor(scope.row.affected_percentage)"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>
          
          <div class="chart-container" v-if="countryProtocolDetail.asnDistribution.length > 0">
            <h4>ASN分布图</h4>
            <div ref="countryAsnChartRef" style="width: 100%; height: 400px;"></div>
          </div>
        </div>
      </el-dialog>

    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
  import { useDetectionStore } from '@/stores/detection';
  import * as echarts from 'echarts/core';
  import { PieChart, BarChart } from 'echarts/charts';
  import { TooltipComponent, LegendComponent, GridComponent, TitleComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';
  
  // 注册ECharts组件
  echarts.use([
    PieChart,
    BarChart,
    TooltipComponent,
    LegendComponent,
    GridComponent,
    TitleComponent,
    CanvasRenderer
  ]);
  
  const detectionStore = useDetectionStore();
  
  // 状态变量
  const isLoading = ref(false);
  const isLoadingAsns = ref(false);
  const isLoadingRegions = ref(false);

  const isLoadingCountries = ref(false); // 新增国家加载状态
  const selectedProtocol = ref(null);
  const activeTab = ref('asns');
  const currentPage = ref(1);
  const pageSize = ref(20);
  const countriesCurrentPage = ref(1); // 新增国家分页
  const countriesPageSize = ref(20); // 新增国家分页大小
  const showCountryDetail = ref(false); // 新增国家详情对话框状态
  const countryProtocolDetail = ref(null); // 新增国家协议详情数据
  const countryAsnChartRef = ref(null); // 新增国家ASN分布图引用
  const showAsnDetail = ref(false);
  const asnProtocolDetail = ref(null);
  const regionChartRef = ref(null);
  const prefixChartRef = ref(null);
  const countryChartRef = ref(null); // 添加这一行
  let regionChart = null;
  let prefixChart = null;
  let countryChart = null; // 新增国家图表实例
  let countryAsnChart = null; // 新增国家ASN图表实例
  
  // 计算属性
  const protocols = computed(() => detectionStore.protocols || []);
  const protocolAsns = computed(() => detectionStore.protocolAsns || { asns: [], total: 0 });
  const protocolRegions = computed(() => detectionStore.protocolRegions || []);
  const protocolCountries = computed(() => detectionStore.protocolCountries || { countries: [], total: 0 }); // 新增国家计算属性
  // 生命周期钩子
  onMounted(async () => {
    await fetchProtocols();
  });
  
  // 监听选项卡变化
  watch(activeTab, async (newTab) => {
    if (newTab === 'asns' && selectedProtocol.value) {
      await fetchProtocolAsns();
    } else if (newTab === 'regions' && selectedProtocol.value) {
      await fetchProtocolRegions();
      // 添加延迟确保DOM渲染完成
      await nextTick();
      await nextTick();
      renderRegionChart();
    } else if (newTab === 'countries' && selectedProtocol.value) {
      await fetchProtocolCountries();
      // 添加延迟确保DOM渲染完成
      await nextTick();
      await nextTick();
      renderCountryChart();
    }
  });
  
// 监听协议ASN数据变化，更新图表
watch(protocolRegions, async () => {
  if (activeTab.value === 'regions' && protocolRegions.value && protocolRegions.value.length > 0) {
    console.log('地区数据已更新，准备渲染图表:', protocolRegions.value);
    // 使用两次nextTick确保DOM完全渲染
    await nextTick();
    await nextTick();
    renderRegionChart();
  }
}, { deep: true });
  
  // 监听ASN协议详情变化，更新图表
  watch(asnProtocolDetail, async () => {
    if (showAsnDetail.value && asnProtocolDetail.value) {
      console.log('ASN协议详情数据:', JSON.stringify(asnProtocolDetail.value));
      await nextTick();
      renderPrefixChart();
    }
  });
  
  // 监听分页变化
  watch([currentPage, pageSize], async () => {
    if (selectedProtocol.value && activeTab.value === 'asns') {
      await fetchProtocolAsns();
    }
  });
  

// 监听国家数据变化，更新图表
watch(() => protocolCountries.value.countries, async () => {
  if (activeTab.value === 'countries' && protocolCountries.value.countries && protocolCountries.value.countries.length > 0) {
    console.log('国家数据已更新，准备渲染图表:', protocolCountries.value.countries);
    // 使用两次nextTick确保DOM完全渲染
    await nextTick();
    await nextTick();
    renderCountryChart();
  }
}, { deep: true });

// 监听国家协议详情变化，更新图表
watch(countryProtocolDetail, async () => {
  if (showCountryDetail.value && countryProtocolDetail.value) {
    console.log('国家协议详情数据:', JSON.stringify(countryProtocolDetail.value));
    await nextTick();
    renderCountryAsnChart();
  }
});

// 监听国家分页变化
watch([countriesCurrentPage, countriesPageSize], async () => {
  if (selectedProtocol.value && activeTab.value === 'countries') {
    await fetchProtocolCountries();
  }
});

  // 方法
  async function fetchProtocols() {
    isLoading.value = true;
    try {
      await detectionStore.fetchProtocols();
    } catch (error) {
      console.error('获取协议列表失败:', error);
    } finally {
      isLoading.value = false;
    }
  }
  
  async function handleProtocolSelect(row) {
    isLoadingAsns.value = true;
    try {
      const protocolDetail = await detectionStore.fetchProtocolDetail(row.protocol_id);
      if (protocolDetail) {
        // 确保affected_percentage是有效值
        if (protocolDetail.affected_percentage === undefined || protocolDetail.affected_percentage === null) {
          protocolDetail.affected_percentage = 0;
        }
        selectedProtocol.value = protocolDetail;
        currentPage.value = 1;
        activeTab.value = 'asns'; // 确保切换到ASN分布标签页
        await fetchProtocolAsns();
      }
    } catch (error) {
      console.error('获取协议详情失败:', error);
    } finally {
      isLoadingAsns.value = false;
    }
  }
  
  async function fetchProtocolAsns() {
    if (!selectedProtocol.value) return;
    
    isLoadingAsns.value = true;
    try {
      await detectionStore.fetchProtocolAsns(
        selectedProtocol.value.protocol_id,
        pageSize.value,
        (currentPage.value - 1) * pageSize.value
      );
    } catch (error) {
      console.error('获取协议ASN列表失败:', error);
    } finally {
      isLoadingAsns.value = false;
    }
  }
  
  async function fetchProtocolRegions() {
    if (!selectedProtocol.value) return;
    
    isLoadingRegions.value = true;
    try {
      await detectionStore.fetchProtocolRegions(selectedProtocol.value.protocol_id);
    } catch (error) {
      console.error('获取协议地区分布失败:', error);
    } finally {
      isLoadingRegions.value = false;
    }
  }

  // 添加获取协议国家分布的函数
  async function fetchProtocolCountries() {
  if (!selectedProtocol.value) return;
  
  isLoadingCountries.value = true;
  try {
    await detectionStore.fetchProtocolCountries(
      selectedProtocol.value.protocol_id,
      countriesPageSize.value,
      (countriesCurrentPage.value - 1) * countriesPageSize.value
    );
  } catch (error) {
    console.error('获取协议国家分布失败:', error);
  } finally {
    isLoadingCountries.value = false;
  }
}
  
  function backToList() {
  selectedProtocol.value = null;
  activeTab.value = 'asns';
  currentPage.value = 1;
  countriesCurrentPage.value = 1; // 重置国家分页
  showAsnDetail.value = false; // 确保关闭ASN详情对话框
  showCountryDetail.value = false; // 确保关闭国家详情对话框
  asnProtocolDetail.value = null; // 清空ASN详情数据
  countryProtocolDetail.value = null; // 清空国家详情数据
}
  
  function handleSizeChange(size) {
    pageSize.value = size;
    currentPage.value = 1;
  }
  
  function handleCurrentChange(page) {
    currentPage.value = page;
  }
  
  async function handleAsnSelect(row) {
    try {
      asnProtocolDetail.value = null;
      showAsnDetail.value = true;
      
      const detail = await detectionStore.fetchAsnProtocolDetail(
        row.asn,
        selectedProtocol.value.protocol_id
      );
      
      if (detail) {
        asnProtocolDetail.value = detail;
      }
    } catch (error) {
      console.error('获取ASN协议详情失败:', error);
    }
  }
  
  function renderRegionChart() {
    if (!regionChartRef.value) {
    console.error('地区图表容器不存在');
    return;
  }
  
  // 确保DOM元素已经渲染
  if (!document.body.contains(regionChartRef.value)) {
    console.warn('地区图表DOM元素尚未渲染到页面中，将在下一个渲染周期尝试');
    nextTick(() => {
      renderRegionChart();
    });
    return;
  }
  
  console.log('开始渲染地区图表，数据:', protocolRegions.value);
  
  try {
    if (regionChart) {
      regionChart.dispose();
    }
    
    regionChart = echarts.init(regionChartRef.value);
    
    // 确保数据存在且格式正确
    if (!protocolRegions.value || !Array.isArray(protocolRegions.value) || protocolRegions.value.length === 0) {
      console.error('地区数据无效:', protocolRegions.value);
      return;
    }
    
    const data = protocolRegions.value.map(item => {
      // 确保数据有效
      if (!item || !item.region) {
        console.warn('发现无效的地区数据项:', item);
        return { name: '未知地区', value: 0 };
      }
      
      return {
        name: item.region || '未知地区',
        value: parseInt(item.affected_addresses || 0)
      };
    }).filter(item => item.value > 0); // 过滤掉值为0的数据
    
    console.log('处理后的图表数据:', data);
    
    if (data.length === 0) {
      console.warn('处理后的图表数据为空');
      return;
    }
    
    const option = {
      title: {
        text: '协议地区分布',
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        data: data.map(item => item.name)
      },
      series: [
        {
          name: '受影响地址数',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
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
          data: data
        }
      ]
    };
    
    regionChart.setOption(option);
    
    // 添加错误处理
    regionChart.on('rendererror', (params) => {
      console.error('地区图表渲染错误:', params);
    });
    
    window.addEventListener('resize', () => {
      if (regionChart) {
        regionChart.resize();
      }
    });
    
    console.log('地区图表渲染完成');
  } catch (error) {
    console.error('渲染地区图表时发生错误:', error);
  }
}
  
  function renderPrefixChart() {
    if (!prefixChartRef.value || !asnProtocolDetail.value) return;
    
    if (prefixChart) {
      prefixChart.dispose();
    }
    
    prefixChart = echarts.init(prefixChartRef.value);
    
    const prefixData = asnProtocolDetail.value.prefixDistribution.map(item => {
      // 确保 affected_percentage 是数字类型
      const percentage = typeof item.affected_percentage === 'number' 
        ? item.affected_percentage 
        : parseFloat(item.affected_percentage || '0');
      
      return {
        name: `${item.prefix}/${item.prefix_length}`,
        value: item.affected_addresses,
        percentage: percentage.toFixed(2)
      };
    });
    
    const option = {
      title: {
        text: 'ASN前缀协议分布',
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} 地址 ({d}%)'
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 20,
        bottom: 20,
        data: prefixData.map(item => item.name)
      },
      series: [
        {
          name: '受影响地址数',
          type: 'pie',
          radius: '55%',
          center: ['40%', '50%'],
          data: prefixData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
    
    prefixChart.setOption(option);
    
    window.addEventListener('resize', () => {
      prefixChart && prefixChart.resize();
    });
  }
  
  // 辅助函数
  function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return new Intl.NumberFormat().format(num);
  }
  
  function percentFormat(percentage) {
    if (percentage === undefined || percentage === null) return '0%';
    return (typeof percentage === 'number' ? percentage.toFixed(2) : parseFloat(percentage || 0).toFixed(2)) + '%';
  }
  
  function getPercentageColor(percentage) {
    const value = parseFloat(percentage || 0);
    if (value >= 70) return '#F56C6C';
    if (value >= 30) return '#E6A23C';
    return '#67C23A';
  }

  // 处理国家选择
async function handleCountrySelect(row) {
  try {
    countryProtocolDetail.value = null;
    showCountryDetail.value = true;
    
    const detail = await detectionStore.fetchCountryProtocolDetail(
      row.country_id,
      selectedProtocol.value.protocol_id
    );
    
    if (detail) {
      countryProtocolDetail.value = detail;
    }
  } catch (error) {
    console.error('获取国家协议详情失败:', error);
  }
}

// 处理国家详情中ASN的选择
async function handleCountryAsnSelect(row) {
  try {
    asnProtocolDetail.value = null;
    showAsnDetail.value = true;
    showCountryDetail.value = false; // 关闭国家详情对话框
    
    const detail = await detectionStore.fetchAsnProtocolDetail(
      row.asn,
      selectedProtocol.value.protocol_id
    );
    
    if (detail) {
      asnProtocolDetail.value = detail;
    }
  } catch (error) {
    console.error('获取ASN协议详情失败:', error);
  }
}

// 处理国家分页大小变化
function handleCountriesSizeChange(size) {
  countriesPageSize.value = size;
  countriesCurrentPage.value = 1;
}

// 处理国家当前页变化
function handleCountriesCurrentChange(page) {
  countriesCurrentPage.value = page;
}

// 渲染国家分布图表
function renderCountryChart() {
  if (!countryChartRef.value) {
    console.error('国家图表容器不存在');
    return;
  }
  
  // 确保DOM元素已经渲染
  if (!document.body.contains(countryChartRef.value)) {
    console.warn('国家图表容器尚未渲染到DOM中');
    return;
  }
  
  // 确保有数据
  if (!protocolCountries.value.countries || protocolCountries.value.countries.length === 0) {
    console.warn('没有国家数据可供渲染');
    return;
  }
  
  // 初始化或重用图表实例
  if (!countryChart) {
    countryChart = echarts.init(countryChartRef.value);
  } else {
    countryChart.clear();
  }
  
  // 准备数据
  const data = protocolCountries.value.countries
    .slice(0, 10) // 只取前10个国家
    .map(country => ({
      name: country.country_name_zh || country.country_name,
      value: country.affected_addresses
    }));
  
  // 设置图表选项
  const option = {
    title: {
      text: '受影响国家TOP10',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: data.map(item => item.name)
    },
    series: [
      {
        name: '受影响地址数',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
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
        data: data
      }
    ]
  };
  
  // 应用选项
  countryChart.setOption(option);
  
  // 响应窗口大小变化
  window.addEventListener('resize', () => {
    countryChart.resize();
  });
}

// 渲染国家ASN分布图表
function renderCountryAsnChart() {
  if (!countryAsnChartRef.value || !countryProtocolDetail.value) return;
  
  if (countryAsnChart) {
    countryAsnChart.dispose();
  }
  
  countryAsnChart = echarts.init(countryAsnChartRef.value);
  
  const asnData = countryProtocolDetail.value.asnDistribution.map(item => {
    // 确保 affected_percentage 是数字类型
    const percentage = typeof item.affected_percentage === 'number' 
      ? item.affected_percentage 
      : parseFloat(item.affected_percentage || '0');
    
    return {
      name: `AS${item.asn} ${item.as_name_zh || item.as_name || ''}`,
      value: item.affected_addresses,
      percentage: percentage.toFixed(2)
    };
  });
  
  const option = {
    title: {
      text: '国家ASN协议分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} 地址 ({d}%)'
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 10,
      top: 20,
      bottom: 20,
      data: asnData.map(item => item.name)
    },
    series: [
      {
        name: '受影响地址数',
        type: 'pie',
        radius: '55%',
        center: ['40%', '50%'],
        data: asnData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };
  
  countryAsnChart.setOption(option);
  
  window.addEventListener('resize', () => {
    countryAsnChart && countryAsnChart.resize();
  });
}

// 在组件卸载时清理图表实例
onUnmounted(() => {
  if (regionChart) {
    regionChart.dispose();
    regionChart = null;
  }
  if (prefixChart) {
    prefixChart.dispose();
    prefixChart = null;
  }
  if (countryChart) {
    countryChart.dispose();
    countryChart = null;
  }
  if (countryAsnChart) {
    countryAsnChart.dispose();
    countryAsnChart = null;
  }
});
  </script>
  
  <style scoped>
  .protocol-analysis-panel {
    padding: 20px;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }
  
  .protocol-selection h3,
  .detail-header h3 {
    margin-top: 0;
    margin-bottom: 20px;
    color: #303133;
  }
  
  .loading-container {
    padding: 20px 0;
  }
  
  .empty-state {
    padding: 40px 0;
  }
  
  .detail-header {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .detail-header button {
    margin-right: 15px;
  }
  
  .protocol-overview {
    margin-bottom: 30px;
  }
  
  .tabs-container {
    margin-top: 20px;
  }
  
  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
  
  .chart-container {
    margin-top: 30px;
  }
  
  .chart-container h4 {
    margin-bottom: 15px;
    color: #606266;
  }
  
  .prefix-table {
    margin-top: 30px;
  }
  
  .prefix-table h4 {
    margin-bottom: 15px;
    color: #606266;
  }
  </style>