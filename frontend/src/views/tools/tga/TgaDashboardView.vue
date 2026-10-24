<template>
  <div class="tga-dashboard">
    <div class="page-header">
      <h1>🎯 目标生成</h1>
      <p class="page-description">
        IPv6 地址空间太大，无法全量扫描。目标生成（TGA）以已知的活跃地址为种子，推测其他可能活跃的地址，把候选目标缩小到可以探测的规模。
        生成只在本机计算，不发送任何探测包；结果登记为 XMap 白名单，在 XMap 里选用时才会受扫描策略检查。
        生成的是候选而不是结论：命中率取决于种子质量和网络的编号习惯，需要实际探测后才知道。
      </p>
    </div>

    <el-alert v-if="tga.error" :title="tga.error" type="error" show-icon closable class="block" @close="tga.error = ''" />

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 生成目标 -->
      <el-tab-pane label="生成目标" name="create">
        <el-card shadow="never" class="form-card">
          <!-- novalidate：数字框的 step 会触发浏览器原生校验（如 min=1、step=10000 时 100000 被判非法），范围由 min/max 与后端校验保证 -->
          <el-form label-width="150px" novalidate @submit.prevent="submit">
            <el-form-item label="算法">
              <el-radio-group v-model="form.algorithm" @change="resetOptions">
                <el-radio-button v-for="item in tga.algorithms" :key="item.id" :value="item.id">{{ item.name }}</el-radio-button>
              </el-radio-group>
              <p v-if="currentAlgorithm" class="hint block-hint">{{ currentAlgorithm.description }}</p>
            </el-form-item>

            <el-form-item v-for="(spec, key) in optionSpecs" :key="key" :label="spec.label">
              <el-input-number
                v-model="form.options[key]"
                :min="spec.min"
                :max="spec.max"
                :step="spec.type === 'integer' ? 1 : 0.01"
                :precision="spec.type === 'integer' ? 0 : 2"
                controls-position="right"
              />
              <span class="hint inline">{{ spec.description }}</span>
            </el-form-item>

            <el-form-item label="种子来源">
              <el-radio-group v-model="form.source">
                <el-radio-button value="file">地址文件</el-radio-button>
                <el-radio-button value="prefix">库内前缀</el-radio-button>
                <el-radio-button value="asn">库内 ASN</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.source === 'file'" label="种子文件">
              <el-select v-model="form.seedFile" filterable placeholder="选择已上传的地址文件" style="width: 360px">
                <el-option v-for="file in tga.addressFiles" :key="file.id" :label="fileLabel(file)" :value="file.file_name" />
              </el-select>
              <span class="hint inline">每行一个已知活跃地址</span>
            </el-form-item>
            <el-form-item v-else-if="form.source === 'prefix'" label="种子前缀">
              <el-input v-model="form.seedPrefix" placeholder="如 2400:3200::/32" style="width: 300px" clearable />
              <span class="hint inline">取库里该前缀下的活跃地址作种子</span>
            </el-form-item>
            <el-form-item v-else label="种子 ASN">
              <el-input-number v-model="form.seedAsn" :min="1" :max="4294967295" :controls="false" placeholder="如 4134" style="width: 200px" />
              <span class="hint inline">取库里该 ASN 的活跃地址作种子</span>
            </el-form-item>
            <el-form-item v-if="form.source !== 'file'" label="最多种子数">
              <el-input-number v-model="form.seedLimit" :min="1" :max="tga.limits.maxSeedLimit" :step="10000" controls-position="right" />
            </el-form-item>

            <el-form-item label="生成数量上限">
              <el-input-number v-model="form.budget" :min="1" :max="tga.limits.maxBudget" :step="1000" controls-position="right" />
              <span class="hint inline">最多 {{ tga.limits.maxBudget.toLocaleString() }}；候选空间不足时会少于该值</span>
            </el-form-item>
            <el-form-item label="排除已知别名">
              <el-switch v-model="form.excludeAliased" />
              <span class="hint inline">剔除落在“别名前缀检测”已识别前缀内的候选，避免把不存在的主机当成目标</span>
            </el-form-item>
            <el-form-item label="随机种子">
              <el-input-number v-model="form.rngSeed" :min="0" :controls="false" placeholder="留空自动生成" style="width: 200px" />
              <span class="hint inline">相同种子地址 + 参数 + 随机种子可复现同一结果</span>
            </el-form-item>
            <el-form-item label="任务描述">
              <el-input v-model="form.description" maxlength="200" placeholder="可选" style="width: 360px" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" :disabled="!canSubmit" native-type="submit">开始生成</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 任务 -->
      <el-tab-pane label="生成任务" name="tasks">
        <div class="toolbar">
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="loadTasks(1)">
            <el-option v-for="(label, key) in statusText" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button @click="loadTasks(tga.pagination.page)">刷新</el-button>
        </div>
        <el-table :data="tga.tasks" v-loading="tga.isLoading && !tga.tasks.length" empty-text="暂无生成任务">
          <el-table-column prop="id" label="任务 ID" width="170" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTag[row.status]" size="small">{{ statusText[row.status] || row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
              <el-button v-if="row.status === 'completed'" link type="success" @click="download(row.id)">下载结果</el-button>
              <el-button v-if="['pending', 'running'].includes(row.status)" link type="warning" @click="cancel(row)">终止</el-button>
              <el-button v-if="row.status !== 'running'" link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="tga.pagination.total > tga.pagination.perPage"
          class="pager"
          background
          layout="prev, pager, next, total"
          :total="tga.pagination.total"
          :page-size="tga.pagination.perPage"
          :current-page="tga.pagination.page"
          @current-change="loadTasks"
        />
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="detailVisible" title="任务详情" size="480px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="kv"><span>任务 ID</span><b>{{ detail.id }}</b></div>
        <div class="kv"><span>状态</span><el-tag :type="statusTag[detail.status]" size="small">{{ statusText[detail.status] || detail.status }}</el-tag></div>
        <div class="kv"><span>算法</span><b>{{ algorithmName(detail.algorithm) }}</b></div>
        <div class="kv"><span>数量上限</span><b>{{ detail.budget }}</b></div>
        <div class="kv"><span>种子来源</span><b>{{ seedSourceText(detail.seedSource) }}</b></div>
        <div class="kv"><span>开始</span><b>{{ formatTime(detail.started_at) }}</b></div>
        <div class="kv"><span>结束</span><b>{{ formatTime(detail.completed_at) }}</b></div>
        <el-alert v-if="detail.error_message" type="error" show-icon :closable="false" class="block" :title="detail.error_message" />
        <template v-if="detail.summary">
          <el-divider>生成结果</el-divider>
          <el-row :gutter="12">
            <el-col :span="8"><el-statistic title="种子" :value="detail.summary.seeds" /></el-col>
            <el-col :span="8"><el-statistic title="生成" :value="detail.summary.generated" /></el-col>
            <el-col :span="8"><el-statistic title="剔除别名" :value="detail.summary.aliasedSkipped" /></el-col>
          </el-row>
          <div class="kv top"><span>重复丢弃</span><b>{{ detail.summary.duplicates }}</b></div>
          <div class="kv">
            <span>候选空间</span>
            <b>{{ detail.summary.exhausted ? '已枚举完（不足上限）' : '达到数量上限' }}</b>
          </div>
          <div v-if="detail.summary.rngSeed !== undefined && detail.summary.rngSeed !== null" class="kv"><span>随机种子</span><b>{{ detail.summary.rngSeed }}</b></div>
          <div v-if="detail.summary.durationMs !== undefined" class="kv"><span>耗时</span><b>{{ detail.summary.durationMs }} ms</b></div>
          <el-alert
            v-if="detail.summary.generated === 0"
            type="warning"
            show-icon
            :closable="false"
            class="block"
            title="没有生成新地址：种子太少、过于分散，或候选都已在种子里 / 别名前缀内"
          />
          <template v-else>
            <el-alert
              v-if="detail.summary.scannable && !detail.summary.scannable.allowed"
              type="warning"
              show-icon
              :closable="false"
              class="block"
              :title="'按当前扫描策略，这批地址暂时不能直接扫描'"
              :description="detail.summary.scannable.reason"
            />
            <el-alert
              v-else
              type="success"
              show-icon
              :closable="false"
              class="block"
              :title="`已登记为 XMap 白名单：${detail.summary.fileName}`"
              description="在 XMap 新建扫描时选用这个白名单文件即可探测；创建扫描时会再次检查扫描策略。"
            />
            <el-button type="success" @click="download(detail.id)">下载地址文件</el-button>
          </template>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTgaStore } from '@/stores/tga'

const tga = useTgaStore()

const activeTab = ref('create')

const statusText = { pending: '排队中', running: '运行中', completed: '已完成', failed: '失败', canceled: '已取消' }
const statusTag = { pending: 'info', running: 'warning', completed: 'success', failed: 'danger', canceled: 'info' }

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '-')
const fileLabel = (file) => `${file.file_name}（${file.tool_name || '文件'}，${formatTime(file.uploaded_at)}）`
const algorithmName = (id) => tga.algorithms.find((a) => a.id === id)?.name || id || '-'
const seedSourceText = (source) => {
  if (!source) return '-'
  if (source.type === 'file') return `文件 ${source.fileName}`
  const parts = []
  if (source.prefix) parts.push(`前缀 ${source.prefix}`)
  if (source.asn) parts.push(`AS${source.asn}`)
  return `${parts.join(' ')}（库内 ${source.count} 个地址）`
}

// ----- 生成目标 -----
const form = reactive({
  algorithm: 'density-expand',
  options: {},
  source: 'file',
  seedFile: '',
  seedPrefix: '',
  seedAsn: undefined,
  seedLimit: 100000,
  budget: 10000,
  excludeAliased: true,
  rngSeed: undefined,
  description: ''
})
const submitting = ref(false)

const currentAlgorithm = computed(() => tga.algorithms.find((a) => a.id === form.algorithm))
const optionSpecs = computed(() => currentAlgorithm.value?.options || {})

// 切换算法时把参数重置为该算法的默认值
const resetOptions = () => {
  const next = {}
  for (const [key, spec] of Object.entries(optionSpecs.value)) next[key] = spec.default
  form.options = next
}

const canSubmit = computed(() => {
  if (!currentAlgorithm.value) return false
  if (form.source === 'file') return form.seedFile !== ''
  if (form.source === 'prefix') return form.seedPrefix.trim() !== ''
  return Number.isInteger(form.seedAsn)
})

const submit = async () => {
  const payload = {
    algorithm: form.algorithm,
    budget: form.budget,
    options: { ...form.options },
    excludeAliased: form.excludeAliased,
    description: form.description.trim() || undefined
  }
  if (Number.isInteger(form.rngSeed)) payload.rngSeed = form.rngSeed
  if (form.source === 'file') {
    payload.seedFile = form.seedFile
  } else {
    if (form.source === 'prefix') payload.seedPrefix = form.seedPrefix.trim()
    else payload.seedAsn = form.seedAsn
    payload.seedLimit = form.seedLimit
  }
  submitting.value = true
  try {
    await tga.createTask(payload)
    ElMessage.success('已提交生成任务')
    activeTab.value = 'tasks'
    startPolling()
  } catch {
    // 原因已显示在页面顶部
  } finally {
    submitting.value = false
  }
}

// ----- 任务 -----
const statusFilter = ref('')
let timer = null

const loadTasks = (page = 1) => tga.fetchTasks(statusFilter.value, page).catch(() => {})

// 有排队或运行中的任务时每 4 秒刷新一次，没有就停
const startPolling = () => {
  stopPolling()
  timer = setInterval(async () => {
    if (activeTab.value !== 'tasks') return
    await loadTasks(tga.pagination.page)
    if (!tga.tasks.some((t) => ['pending', 'running'].includes(t.status))) stopPolling()
  }, 4000)
}
const stopPolling = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const confirm = (message, okText) =>
  ElMessageBox.confirm(message, '确认', { type: 'warning', confirmButtonText: okText, cancelButtonText: '取消' })

const cancel = async (row) => {
  try {
    await confirm(`终止任务 ${row.id}？`, '终止')
  } catch {
    return
  }
  try {
    await tga.cancelTask(row.id, statusFilter.value)
    ElMessage.success('已终止')
  } catch {
    // 原因已显示
  }
}

const remove = async (row) => {
  try {
    await confirm(`删除任务 ${row.id}？已登记的 XMap 白名单文件会保留，可在文件管理里单独删除。`, '删除')
  } catch {
    return
  }
  try {
    await tga.deleteTask(row.id, statusFilter.value)
    ElMessage.success('已删除')
  } catch {
    // 原因已显示
  }
}

const download = (taskId) => tga.downloadResult(taskId).catch(() => {})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const openDetail = async (taskId) => {
  detail.value = null
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await tga.getTaskDetails(taskId)
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const loaded = new Set(['create'])
const onTabChange = (name) => {
  if (name === 'tasks') {
    loadTasks(1).then(() => {
      if (tga.tasks.some((t) => ['pending', 'running'].includes(t.status))) startPolling()
    })
  }
  loaded.add(name)
}

onMounted(async () => {
  tga.fetchAddressFiles().catch(() => {})
  try {
    await tga.fetchAlgorithms()
    form.budget = tga.limits.defaultBudget
    form.seedLimit = tga.limits.defaultSeedLimit
    resetOptions()
  } catch {
    // 原因已显示
  }
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.tga-dashboard { padding: 20px; }
.page-header h1 { margin: 0 0 6px; font-size: 24px; }
.page-description { margin: 0 0 16px; color: #666; line-height: 1.6; }
.block { margin-bottom: 16px; }
.form-card { max-width: 900px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.hint { color: #888; font-size: 12px; line-height: 1.5; margin: 6px 0; }
.hint.inline { margin: 0 0 0 12px; }
.hint.block-hint { width: 100%; margin: 8px 0 0; }
.pager { margin-top: 16px; justify-content: flex-end; }
.kv { display: flex; justify-content: space-between; padding: 6px 0; gap: 12px; }
.kv b { text-align: right; word-break: break-all; }
.kv.top { margin-top: 12px; }
</style>
