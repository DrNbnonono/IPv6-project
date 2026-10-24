<template>
  <section class="trend-panel">
    <header class="trend-header">
      <h4>{{ title }}</h4>
      <div class="range-switch" role="group" aria-label="时间范围">
        <button
          v-for="option in rangeOptions"
          :key="option"
          type="button"
          :class="{ active: option === days }"
          @click="selectRange(option)"
        >{{ option }} 天</button>
      </div>
    </header>

    <p v-if="state === 'loading'" class="trend-hint">加载中…</p>
    <p v-else-if="state === 'disabled'" class="trend-hint">趋势数据尚未启用（管理员需要先执行数据库迁移 15）。</p>
    <p v-else-if="state === 'error'" class="trend-hint error">
      趋势加载失败，<button type="button" class="link-btn" @click="load">重试</button>
    </p>
    <p v-else-if="state === 'empty'" class="trend-hint">还没有这个范围的快照数据。快照每天记录一次，几天后这里会出现曲线。</p>

    <template v-else>
      <ul v-if="summary" class="trend-summary">
        <li>
          <span class="label">活跃地址</span>
          <span class="value">{{ formatNumber(summary.addresses.last) }}</span>
          <span :class="['delta', deltaClass(summary.addresses.change)]">{{ formatDelta(summary.addresses) }}</span>
        </li>
        <li>
          <span class="label">前缀</span>
          <span class="value">{{ formatNumber(summary.prefixes.last) }}</span>
          <span :class="['delta', deltaClass(summary.prefixes.change)]">{{ formatDelta(summary.prefixes) }}</span>
        </li>
      </ul>
      <p v-if="points.length === 1" class="trend-hint">目前只有 1 天的数据（{{ points[0].date }}），曲线需要至少 2 天。</p>
      <div ref="chartRef" class="trend-chart" role="img" :aria-label="title"></div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useDetectionStore } from '@/stores/detection'

echarts.use([LineChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const props = defineProps({
  // global 全局；country 需要 id=两位国家代码；asn 需要 id=AS 号
  scope: { type: String, default: 'global', validator: (v) => ['global', 'country', 'asn'].includes(v) },
  id: { type: [String, Number], default: null },
  initialDays: { type: Number, default: 30 },
  label: { type: String, default: '' }
})

const rangeOptions = [7, 30, 90]
const store = useDetectionStore()

const days = ref(rangeOptions.includes(props.initialDays) ? props.initialDays : 30)
const state = ref('loading') // loading | ready | empty | disabled | error
const points = ref([])
const summary = ref(null)
const chartRef = ref(null)
let chart = null
let requestSeq = 0 // 切换对象 / 时间范围时丢弃过期响应

const title = computed(() => {
  const name = props.label || (props.scope === 'global' ? '全球' : props.scope === 'country' ? props.id : `AS${props.id}`)
  return `${name} 趋势`
})

// 坐标轴刻度用紧凑写法（7500 万），避免长数字撑开坐标轴
const axisNumber = (v) => (Math.abs(v) >= 1e8 ? `${+(v / 1e8).toFixed(2)} 亿` : Math.abs(v) >= 1e4 ? `${+(v / 1e4).toFixed(1)} 万` : String(v))
const formatNumber = (value) => (Number(value) || 0).toLocaleString('zh-CN')
const formatDelta = (item) => {
  const sign = item.change > 0 ? '+' : ''
  const pct = item.changePct === null || item.changePct === undefined ? '' : `（${sign}${item.changePct}%）`
  return `${sign}${formatNumber(item.change)}${pct}`
}
const deltaClass = (change) => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat')

const load = async () => {
  const seq = ++requestSeq
  state.value = 'loading'
  try {
    const data = await store.fetchTrends({ scope: props.scope, id: props.id, days: days.value })
    if (seq !== requestSeq) return
    points.value = data?.points || []
    summary.value = data?.summary || null
    state.value = points.value.length === 0 ? 'empty' : 'ready'
    if (state.value === 'ready') {
      await nextTick()
      render()
    }
  } catch (error) {
    if (seq !== requestSeq) return
    state.value = error?.response?.status === 503 ? 'disabled' : 'error'
  }
}

const render = () => {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  const dates = points.value.map((p) => p.date)
  chart.setOption({
    color: ['#4fc3f7', '#ffb74d'],
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#ddd' } },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { color: '#bbb' } },
    yAxis: [
      { type: 'value', name: '地址', scale: true, axisLabel: { color: '#bbb', formatter: axisNumber }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
      { type: 'value', name: '前缀', scale: true, axisLabel: { color: '#bbb', formatter: axisNumber }, splitLine: { show: false } }
    ],
    series: [
      { name: '活跃地址', type: 'line', yAxisIndex: 0, showSymbol: points.value.length < 40, data: points.value.map((p) => p.addresses) },
      { name: '前缀', type: 'line', yAxisIndex: 1, showSymbol: points.value.length < 40, data: points.value.map((p) => p.prefixes) }
    ]
  }, true)
}

const selectRange = (value) => {
  if (value === days.value) return
  days.value = value
}

const onResize = () => chart && chart.resize()

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  requestSeq += 1
  if (chart) chart.dispose()
  chart = null
})

watch(() => [props.scope, props.id], () => {
  if (chart) { chart.dispose(); chart = null }
  load()
})
watch(days, () => load())
</script>

<style scoped>
.trend-panel {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  color: #eee;
}
.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.trend-header h4 { margin: 0; color: #4fc3f7; font-size: 14px; }
.range-switch { display: inline-flex; gap: 4px; }
.range-switch button {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ddd;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.range-switch button.active { background: #4fc3f7; border-color: #4fc3f7; color: #00212e; }
.trend-hint { margin: 10px 0 0; font-size: 12px; color: #aaa; }
.trend-hint.error { color: #ef9a9a; }
.link-btn { background: none; border: none; color: #4fc3f7; cursor: pointer; padding: 0; font-size: inherit; text-decoration: underline; }
.trend-summary { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 10px 0 0; padding: 0; font-size: 13px; }
.trend-summary li { display: flex; align-items: baseline; gap: 6px; }
.trend-summary .label { color: #aaa; }
.trend-summary .value { font-weight: 600; }
.delta.up { color: #81c784; }
.delta.down { color: #e57373; }
.delta.flat { color: #aaa; }
.trend-chart { width: 100%; height: 220px; margin-top: 6px; }
</style>
