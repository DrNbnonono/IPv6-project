<template>
  <div ref="el" class="echart" :style="{ height }" role="img" :aria-label="ariaLabel"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, PieChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

// 把一个 ECharts option 画出来：option 变化时重绘，窗口变化时自适应，卸载时释放。
const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '320px' },
  ariaLabel: { type: String, default: '图表' }
})

const el = ref(null)
let chart = null

const draw = () => {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  chart.setOption(props.option, true)
}

const onResize = () => chart && chart.resize()

onMounted(() => {
  draw()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (chart) chart.dispose()
  chart = null
})

watch(() => props.option, draw, { deep: true })
</script>

<style scoped>
.echart { width: 100%; }
</style>
