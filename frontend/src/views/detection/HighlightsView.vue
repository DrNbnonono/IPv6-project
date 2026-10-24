<template>
  <div class="highlights">
    <header class="hero">
      <div>
        <p class="eyebrow">ObserV6 · IPv6 网络观测平台</p>
        <h1>成果概览</h1>
        <p class="lead">主动探测积累的 IPv6 活跃地址、前缀与服务分布。数据来自平台数据库的汇总统计与每日快照。</p>
      </div>
      <nav class="hero-nav">
        <router-link :to="{ name: 'detection-platform' }" class="nav-link">返回检测平台</router-link>
        <router-link :to="{ name: 'advancedQuery' }" class="nav-link">高级查询</router-link>
      </nav>
    </header>

    <p v-if="state === 'loading'" class="status">加载中…</p>
    <div v-else-if="state === 'error'" class="status error">
      数据加载失败。<button type="button" class="link-btn" @click="load">重试</button>
    </div>

    <template v-else>
      <section class="kpis" aria-label="规模">
        <article v-for="item in kpis" :key="item.label" class="kpi">
          <span class="kpi-label">{{ item.label }}</span>
          <strong class="kpi-value">{{ formatFull(item.value) }}</strong>
          <span class="kpi-sub">{{ compact(item.value) }}{{ item.unit }}</span>
        </article>
      </section>

      <section class="card wide">
        <TrendPanel scope="global" label="全球" :initial-days="90" class="trend-embed" />
      </section>

      <div class="grid">
        <section class="card">
          <h2>国家 / 地区 Top 10</h2>
          <EChart v-if="topCountries.length" :option="countryOption" height="340px" aria-label="活跃地址数前十的国家" />
          <p v-else class="empty">暂无数据</p>
        </section>

        <section class="card">
          <h2>区域分布</h2>
          <EChart v-if="regions.length" :option="regionOption" height="340px" aria-label="各区域活跃地址占比" />
          <p v-else class="empty">暂无数据</p>
        </section>

        <section class="card">
          <h2>协议分布 Top 10</h2>
          <EChart v-if="protocols.length" :option="protocolOption" height="340px" aria-label="受影响地址最多的协议" />
          <p v-else class="empty">暂无协议数据</p>
        </section>

        <section class="card">
          <h2>漏洞分布 Top 10</h2>
          <EChart v-if="vulnerabilities.length" :option="vulnerabilityOption" height="340px" aria-label="受影响地址最多的漏洞" />
          <p v-else class="empty">暂无漏洞数据</p>
        </section>
      </div>

      <footer class="foot">
        <p>地址、前缀数量为数据库汇总计数；趋势来自每日一次的快照，曲线从启用快照之日起累积。</p>
        <p v-if="updatedAt">页面数据加载于 {{ updatedAt }}</p>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDetectionStore } from '@/stores/detection'
import TrendPanel from '@/components/detection/TrendPanel.vue'
import EChart from '@/components/detection/EChart.vue'

const store = useDetectionStore()

const state = ref('loading') // loading | ready | error
const stats = ref({})
const topCountries = ref([])
const regions = ref([])
const protocols = ref([])
const vulnerabilities = ref([])
const updatedAt = ref('')

const num = (value) => Number(value) || 0
const formatFull = (value) => num(value).toLocaleString('zh-CN')
const compact = (value) => {
  const n = num(value)
  if (n >= 1e8) return `约 ${(n / 1e8).toFixed(2)} 亿`
  if (n >= 1e4) return `约 ${(n / 1e4).toFixed(1)} 万`
  return ''
}

const kpis = computed(() => [
  { label: '活跃 IPv6 地址', value: stats.value.total_addresses, unit: '' },
  { label: 'IPv6 前缀', value: stats.value.total_prefixes, unit: '' },
  { label: '自治系统 (ASN)', value: stats.value.total_asns, unit: '' },
  { label: '国家 / 地区', value: stats.value.total_countries, unit: '' }
])

// 图表配色：深色背景上的青蓝主色
const TEXT = '#c9d6e2'
const GRID_LINE = 'rgba(255,255,255,0.08)'
const PALETTE = ['#4fc3f7', '#81c784', '#ffb74d', '#ba68c8', '#e57373', '#4db6ac', '#fff176', '#7986cb', '#a1887f', '#90a4ae']

const horizontalBars = (names, values, color, unit = '') => ({
  color: [color],
  grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${formatFull(v)}${unit}` },
  xAxis: { type: 'value', axisLabel: { color: TEXT, formatter: (v) => (v >= 1e4 ? `${v / 1e4} 万` : v) }, splitLine: { lineStyle: { color: GRID_LINE } } },
  yAxis: { type: 'category', inverse: true, data: names, axisLabel: { color: TEXT, width: 110, overflow: 'truncate' }, axisTick: { show: false } },
  series: [{ type: 'bar', data: values, barMaxWidth: 18, itemStyle: { borderRadius: [0, 3, 3, 0] } }]
})

const countryOption = computed(() => horizontalBars(
  topCountries.value.map((c) => c.country_name_zh || c.country_name || c.country_id),
  topCountries.value.map((c) => num(c.total_active_ipv6)),
  '#4fc3f7',
  ' 个地址'
))

const regionOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'item', valueFormatter: (v) => `${formatFull(v)} 个地址` },
  legend: { bottom: 0, textStyle: { color: TEXT } },
  series: [{
    type: 'pie',
    radius: ['42%', '68%'],
    center: ['50%', '44%'],
    // 窄屏上标签会被裁掉，只靠图例与提示框
    label: { show: window.innerWidth >= 600, color: TEXT, formatter: '{b}\n{d}%' },
    labelLine: { show: window.innerWidth >= 600 },
    data: regions.value.map((r) => ({ name: r.region, value: num(r.address_count) }))
  }]
}))

const top10 = (list, key) => [...list].sort((a, b) => num(b[key]) - num(a[key])).slice(0, 10)

const protocolOption = computed(() => {
  const list = top10(protocols.value, 'affected_addresses')
  return horizontalBars(list.map((p) => p.protocol_name), list.map((p) => num(p.affected_addresses)), '#81c784', ' 个地址')
})

const vulnerabilityOption = computed(() => {
  const list = top10(vulnerabilities.value, 'affected_addresses')
  return horizontalBars(list.map((v) => v.name || v.cve_id), list.map((v) => num(v.affected_addresses)), '#ffb74d', ' 个地址')
})

const load = async () => {
  state.value = 'loading'
  try {
    // 协议 / 漏洞列表缺失不影响主体页面，各自容错
    const [global, protocolList, vulnerabilityList] = await Promise.all([
      store.fetchGlobalStats({ limit: 10 }),
      store.fetchProtocols().catch(() => []),
      store.fetchVulnerabilities().catch(() => [])
    ])
    stats.value = global?.stats || {}
    topCountries.value = global?.countries || []
    regions.value = (global?.regionDistribution || []).filter((r) => num(r.address_count) > 0)
    protocols.value = (protocolList || []).filter((p) => num(p.affected_addresses) > 0)
    vulnerabilities.value = (vulnerabilityList || []).filter((v) => num(v.affected_addresses) > 0)
    updatedAt.value = new Date().toLocaleString()
    state.value = 'ready'
  } catch (error) {
    state.value = 'error'
  }
}

onMounted(load)
</script>

<style scoped>
.highlights {
  min-height: 100vh;
  padding: 32px 16px 48px;
  color: #e6edf3;
  background: radial-gradient(1200px 600px at 20% -10%, #12324d 0%, #0b1a2b 55%, #08121d 100%);
  box-sizing: border-box;
}
.highlights > * { max-width: 1180px; margin-left: auto; margin-right: auto; }

.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
.eyebrow { margin: 0 0 6px; color: #4fc3f7; font-size: 13px; letter-spacing: 0.08em; }
.hero h1 { margin: 0; font-size: 34px; font-weight: 700; }
.lead { margin: 8px 0 0; max-width: 640px; color: #9fb1c3; line-height: 1.6; }
.hero-nav { display: flex; gap: 8px; }
.nav-link {
  color: #e6edf3; text-decoration: none; font-size: 14px; padding: 6px 14px;
  border: 1px solid rgba(79, 195, 247, 0.5); border-radius: 4px; background: rgba(79, 195, 247, 0.12);
}
.nav-link:hover, .nav-link:focus-visible { background: rgba(79, 195, 247, 0.28); outline: none; }

.status { text-align: center; color: #9fb1c3; padding: 60px 0; }
.status.error { color: #ef9a9a; }
.link-btn { background: none; border: none; color: #4fc3f7; cursor: pointer; text-decoration: underline; font-size: inherit; }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.kpi {
  display: flex; flex-direction: column; gap: 4px; padding: 18px 20px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px;
}
.kpi-label { color: #9fb1c3; font-size: 13px; }
.kpi-value { font-size: 28px; font-variant-numeric: tabular-nums; color: #4fc3f7; line-height: 1.2; word-break: break-all; }
.kpi-sub { color: #7f93a6; font-size: 12px; min-height: 16px; }

.card {
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px;
  padding: 18px 20px; margin-bottom: 18px; min-width: 0;
}
.card h2 { margin: 0 0 8px; font-size: 16px; color: #e6edf3; }
.card.wide { padding-top: 8px; }
.card.wide .trend-embed { margin-top: 0; padding-top: 0; border-top: none; }
.card.wide :deep(.trend-chart) { height: 300px; }
.empty { color: #7f93a6; padding: 40px 0; text-align: center; margin: 0; }

.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.grid .card { margin-bottom: 0; }

.foot { margin-top: 24px; color: #7f93a6; font-size: 12px; line-height: 1.7; }
.foot p { margin: 0; }

@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .grid { grid-template-columns: 1fr; }
  .hero h1 { font-size: 28px; }
}
@media (max-width: 480px) {
  .kpi-value { font-size: 22px; }
}
</style>
