<template>
  <div class="diff-panel">
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="block" />

    <template v-if="diff">
      <div class="batch-meta">
        <div>
          <b>批次 {{ diff.batchA.batch_id }}</b>（起点）· {{ formatTime(diff.batchA.finished_at) }}
        </div>
        <div>
          <b>批次 {{ diff.batchB.batch_id }}</b>（终点）· {{ formatTime(diff.batchB.finished_at) }}
        </div>
        <div class="scope">前缀 {{ diff.batchA.target_scope || diff.prefixId }}</div>
      </div>

      <div class="counts">
        <el-card
          v-for="item in kinds"
          :key="item.kind"
          shadow="hover"
          :class="['count-card', { active: kind === item.kind }]"
          @click="select(item.kind)"
        >
          <el-statistic :title="item.label" :value="diff.counts[item.kind]" />
          <div class="count-hint">{{ item.hint }}</div>
        </el-card>
      </div>

      <div class="list-toolbar">
        <span class="hint">共 {{ diff.counts[kind] }} 个，已加载 {{ addresses.length }} 个</span>
        <el-button size="small" :disabled="!addresses.length" @click="download">下载已加载的地址</el-button>
      </div>
      <el-table v-loading="loadingList" :data="addresses" size="small" max-height="440" empty-text="没有地址">
        <el-table-column prop="address" label="地址" min-width="280" show-overflow-tooltip />
        <el-table-column label="首次出现" width="110">
          <template #default="{ row }">{{ row.first_batch_id ? `批次 ${row.first_batch_id}` : '追踪前' }}</template>
        </el-table-column>
        <el-table-column label="最近出现" width="110">
          <template #default="{ row }">{{ row.last_batch_id ? `批次 ${row.last_batch_id}` : '—' }}</template>
        </el-table-column>
      </el-table>
      <div v-if="hasMore" class="more">
        <el-button :loading="loadingList" @click="loadMore">加载更多</el-button>
      </div>

      <p class="note">
        口径：把每个地址的观察历史看成从“首次出现”到“最近出现”的连续区间。新增 = 起点之后首次出现；消失 = 起点时已存在，但最近一次出现早于终点；
        保留 = 起点时已存在且在终点仍被观察到。追踪功能启用前就存在、之后从未被再次导入的地址无法判断去向，不计入任何一类。
      </p>
    </template>
    <el-skeleton v-else-if="loading" :rows="4" animated />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useHistoryStore } from '@/stores/history'

const props = defineProps({
  batchA: { type: Number, required: true },
  batchB: { type: Number, required: true }
})

const history = useHistoryStore()
const PAGE = 100
const kinds = [
  { kind: 'new', label: '新增', hint: '起点之后首次出现' },
  { kind: 'gone', label: '消失', hint: '最近出现早于终点' },
  { kind: 'persisted', label: '保留', hint: '终点仍被观察到' }
]

const diff = ref(null)
const kind = ref('new')
const addresses = ref([])
const next = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const loadingList = ref(false)
const error = ref('')
let token = 0 // 切换批次或类别后丢弃过期响应

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '')

const load = async (reset) => {
  const mine = ++token
  error.value = ''
  loadingList.value = true
  if (reset) {
    addresses.value = []
    next.value = null
    hasMore.value = false
  }
  try {
    const res = await history.fetchDiff({
      batchA: props.batchA,
      batchB: props.batchB,
      kind: kind.value,
      after: reset ? undefined : next.value,
      pageSize: PAGE
    })
    if (mine !== token) return
    if (reset) diff.value = res // 翻页响应不带数量，沿用第一页的
    addresses.value = reset ? res.addresses : addresses.value.concat(res.addresses)
    next.value = res.next
    hasMore.value = res.hasMore
  } catch (e) {
    if (mine !== token) return
    error.value = e.message
    if (reset) diff.value = null
  } finally {
    if (mine === token) {
      loadingList.value = false
      loading.value = false
    }
  }
}

const select = (value) => {
  if (value === kind.value) return
  kind.value = value
  load(true)
}
const loadMore = () => load(false)

const download = () => {
  const blob = new Blob([addresses.value.map((a) => a.address).join('\n') + '\n'], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `batch-${props.batchA}-${props.batchB}-${kind.value}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

watch(
  () => [props.batchA, props.batchB],
  () => {
    diff.value = null
    loading.value = true
    load(true)
  },
  { immediate: true }
)
</script>

<style scoped>
.block { margin-bottom: 12px; }
.batch-meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; color: #444; }
.batch-meta .scope { color: #888; }
.counts { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.count-card { min-width: 180px; cursor: pointer; border: 1px solid transparent; }
.count-card.active { border-color: var(--el-color-primary); }
.count-hint { color: #999; font-size: 12px; margin-top: 4px; }
.list-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.hint { color: #888; font-size: 12px; }
.more { text-align: center; margin-top: 12px; }
.note { color: #888; font-size: 12px; line-height: 1.6; margin-top: 16px; }
</style>
