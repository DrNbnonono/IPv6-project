<template>
  <div class="history-dashboard">
    <div class="page-header">
      <h1>🕓 导入批次与变化</h1>
      <p class="page-description">
        每次导入地址都会记成一个批次。同一个前缀导入两次以上，就能比较两个批次之间哪些地址是新出现的、哪些不再出现、哪些一直在。
        只能比较同一个前缀的两个批次。
      </p>
    </div>

    <el-alert v-if="history.error" :title="history.error" type="error" show-icon :closable="false" class="block" />

    <el-card shadow="never" class="block">
      <el-form inline novalidate @submit.prevent="search">
        <el-form-item label="前缀 ID">
          <el-input-number v-model="prefixId" :min="1" :controls="false" placeholder="不填则显示全部" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="history.isLoading">查询</el-button>
          <el-button v-if="prefixId" @click="clearPrefix">清除</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="history.batches" v-loading="history.isLoading" size="small" empty-text="还没有批次记录" row-key="batch_id">
        <el-table-column prop="batch_id" label="批次" width="80" />
        <el-table-column prop="target_scope" label="前缀" min-width="200" show-overflow-tooltip />
        <el-table-column label="前缀 ID" width="90">
          <template #default="{ row }">
            <el-link v-if="row.prefix_id" type="primary" @click="filterBy(row.prefix_id)">{{ row.prefix_id }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="完成时间" width="170">
          <template #default="{ row }">{{ formatTime(row.finished_at) }}</template>
        </el-table-column>
        <el-table-column prop="new_count" label="新增" width="90" />
        <el-table-column prop="seen_count" label="再次观察" width="100" />
        <el-table-column prop="skipped_count" label="跳过" width="80" />
        <el-table-column label="对比" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :type="pickA === row.batch_id ? 'primary' : 'default'" @click="pick('A', row)">起点</el-button>
            <el-button size="small" :type="pickB === row.batch_id ? 'primary' : 'default'" @click="pick('B', row)">终点</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="history.pagination.totalPages > 1"
        class="pager"
        background
        layout="prev, pager, next"
        :total="history.pagination.total"
        :page-size="history.pagination.perPage"
        :current-page="history.pagination.page"
        @current-change="(page) => load(page)"
      />
      <p class="hint">“跳过”是这次导入的地址里，已经属于其他前缀、没有改动的数量。</p>
    </el-card>

    <el-card shadow="never">
      <template #header>批次对比</template>
      <p v-if="!pickA || !pickB" class="hint">在上表里分别点一个“起点”（较早的批次）和一个“终点”（较晚的批次）。</p>
      <el-alert v-else-if="problem" :title="problem" type="warning" show-icon :closable="false" />
      <BatchDiffPanel v-else :batch-a="pickA" :batch-b="pickB" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useHistoryStore } from '@/stores/history'
import BatchDiffPanel from '@/components/history/BatchDiffPanel.vue'

const history = useHistoryStore()
const prefixId = ref(null)
const pickA = ref(null)
const pickB = ref(null)
const rowsById = new Map()

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '')

const load = async (page = 1) => {
  try {
    const res = await history.fetchBatches({ prefixId: prefixId.value || undefined, page })
    for (const row of res.batches) rowsById.set(row.batch_id, row)
  } catch (e) {
    // 文案已写入 store.error
  }
}
const search = () => load(1)
const clearPrefix = () => {
  prefixId.value = null
  load(1)
}
const filterBy = (id) => {
  prefixId.value = id
  load(1)
}
const pick = (which, row) => {
  if (which === 'A') pickA.value = row.batch_id
  else pickB.value = row.batch_id
}

// 选择不合法时给出原因，不发请求
const problem = computed(() => {
  if (!pickA.value || !pickB.value) return ''
  if (pickA.value >= pickB.value) return '起点必须早于终点（起点的批次号要小于终点）'
  const a = rowsById.get(pickA.value)
  const b = rowsById.get(pickB.value)
  if (a && b && a.prefix_id !== b.prefix_id) return '两个批次不属于同一个前缀，无法比较'
  return ''
})

onMounted(() => load(1))
</script>

<style scoped>
.history-dashboard { padding: 20px; }
.page-header h1 { margin: 0 0 6px; font-size: 24px; }
.page-description { margin: 0 0 16px; color: #666; line-height: 1.6; }
.block { margin-bottom: 16px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.hint { color: #888; font-size: 12px; line-height: 1.5; margin: 8px 0 0; }
</style>
