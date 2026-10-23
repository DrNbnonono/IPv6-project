<template>
  <div class="apd-dashboard">
    <div class="page-header">
      <h1>🧩 别名前缀检测</h1>
      <p class="page-description">
        别名前缀是整段前缀下的任何地址都会应答的前缀（常见于 CDN、防火墙把一整段 /64 绑到同一台设备），会让“活跃地址数”虚高。
        对每个候选前缀的 16 个子前缀各随机探测一个地址：16 个全部应答判为别名，0 个为干净，其间为不确定（可能丢包或限速，建议降速复测）。
        检测会发出探测包，候选前缀必须落在管理员配置的扫描白名单内。
      </p>
    </div>

    <el-alert v-if="apd.error" :title="apd.error" type="error" show-icon closable class="block" @close="apd.error = ''" />

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 新建检测 -->
      <el-tab-pane label="新建检测" name="create">
        <el-card shadow="never" class="form-card">
          <el-form label-width="110px" @submit.prevent="submit">
            <el-form-item label="候选前缀来源">
              <el-radio-group v-model="form.source">
                <el-radio-button value="prefixes">手动输入前缀</el-radio-button>
                <el-radio-button value="file">从地址文件推出</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item v-if="form.source === 'prefixes'" label="候选前缀">
              <el-input
                v-model="form.prefixes"
                type="textarea"
                :rows="6"
                placeholder="每行一个，如 2001:db8:1:2::/64（IPv6，长度为 4 的倍数，16–124）"
              />
            </el-form-item>

            <template v-else>
              <el-form-item label="地址文件">
                <el-select v-model="form.addressFile" filterable placeholder="选择已上传的地址文件" style="width: 360px">
                  <el-option v-for="file in apd.addressFiles" :key="file.id" :label="fileLabel(file)" :value="file.file_name" />
                </el-select>
              </el-form-item>
              <el-form-item label="前缀长度">
                <el-select v-model="form.prefixLength" style="width: 120px">
                  <el-option v-for="n in lengthOptions" :key="n" :label="`/${n}`" :value="n" />
                </el-select>
                <span class="hint inline">每个地址取其所在的 /{{ form.prefixLength }} 前缀，去重后逐个检测</span>
              </el-form-item>
            </template>

            <el-form-item label="发送速率">
              <el-input v-model="form.rate" placeholder="留空使用默认速率，如 1M、10M" style="width: 260px" clearable />
            </el-form-item>
            <el-form-item label="任务描述">
              <el-input v-model="form.description" maxlength="200" placeholder="可选" style="width: 360px" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" :disabled="!canSubmit" native-type="submit">开始检测</el-button>
              <span class="hint inline">每个前缀发送 16 个探测包</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 任务 -->
      <el-tab-pane label="检测任务" name="tasks">
        <div class="toolbar">
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="loadTasks(1)">
            <el-option v-for="(label, key) in statusText" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button @click="loadTasks(apd.pagination.page)">刷新</el-button>
        </div>
        <el-table :data="apd.tasks" v-loading="apd.isLoading && !apd.tasks.length" empty-text="暂无检测任务">
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
          v-if="apd.pagination.total > apd.pagination.perPage"
          class="pager"
          background
          layout="prev, pager, next, total"
          :total="apd.pagination.total"
          :page-size="apd.pagination.perPage"
          :current-page="apd.pagination.page"
          @current-change="loadTasks"
        />
      </el-tab-pane>

      <!-- 别名前缀 -->
      <el-tab-pane label="已检测到的别名前缀" name="aliased">
        <div class="toolbar">
          <el-input v-model="search" placeholder="按前缀开头搜索，如 2001:db8" clearable style="width: 260px" @keyup.enter="loadAliased(1)" @clear="loadAliased(1)" />
          <el-button @click="loadAliased(1)">搜索</el-button>
          <span class="hint inline">表里是当前判定：重新检测后完全无应答的前缀会被移除；不确定的不改动。</span>
        </div>
        <el-table :data="apd.aliased.items" empty-text="还没有检测到别名前缀">
          <el-table-column prop="prefix" label="前缀" min-width="240" />
          <el-table-column label="应答/探测" width="110">
            <template #default="{ row }">{{ row.probes_answered }}/{{ row.probes_sent }}</template>
          </el-table-column>
          <el-table-column prop="method" label="方法" width="100" />
          <el-table-column label="最近检测" width="170">
            <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
          </el-table-column>
          <el-table-column v-if="isAdmin" label="操作" width="110">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeAliased(row)">移除误判</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="apd.aliased.total > apd.aliased.pageSize"
          class="pager"
          background
          layout="prev, pager, next, total"
          :total="apd.aliased.total"
          :page-size="apd.aliased.pageSize"
          :current-page="apd.aliased.page"
          @current-change="loadAliased"
        />
      </el-tab-pane>

      <!-- 地址过滤 -->
      <el-tab-pane label="地址过滤" name="filter">
        <el-card shadow="never" class="form-card">
          <p class="hint">用已检测到的别名前缀剔除地址列表中落在别名前缀内的地址，对比过滤前后的数量；不发送任何探测包。</p>
          <el-form label-width="110px" @submit.prevent="runFilter">
            <el-form-item label="地址来源">
              <el-radio-group v-model="filterForm.source">
                <el-radio-button value="file">地址文件</el-radio-button>
                <el-radio-button value="text">粘贴地址</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="filterForm.source === 'file'" label="地址文件">
              <el-select v-model="filterForm.addressFile" filterable placeholder="选择已上传的地址文件" style="width: 360px">
                <el-option v-for="file in apd.addressFiles" :key="file.id" :label="fileLabel(file)" :value="file.file_name" />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="地址">
              <el-input v-model="filterForm.text" type="textarea" :rows="6" placeholder="每行一个地址" />
            </el-form-item>
            <el-form-item label="保存结果">
              <el-switch v-model="filterForm.save" />
              <template v-if="filterForm.save">
                <el-select v-model="filterForm.tool" style="width: 140px; margin-left: 12px">
                  <el-option label="作为 ZGrab2 输入" value="zgrab2" />
                  <el-option label="作为 XMap 白名单" value="xmap" />
                </el-select>
              </template>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="filtering" :disabled="!canFilter" native-type="submit">开始过滤</el-button>
            </el-form-item>
          </el-form>

          <div v-if="filterResult" class="filter-result">
            <el-row :gutter="12">
              <el-col :span="6"><el-statistic title="过滤前" :value="filterResult.total" /></el-col>
              <el-col :span="6"><el-statistic title="剔除" :value="filterResult.removed" /></el-col>
              <el-col :span="6"><el-statistic title="保留" :value="filterResult.kept" /></el-col>
              <el-col :span="6"><el-statistic title="已知别名前缀" :value="filterResult.aliasedPrefixesKnown" /></el-col>
            </el-row>
            <p v-if="filterResult.aliasedPrefixesKnown === 0" class="hint">目前没有已检测到的别名前缀，先在“新建检测”里检测候选前缀。</p>
            <el-table v-if="filterResult.topPrefixes.length" :data="filterResult.topPrefixes" size="small" class="block">
              <el-table-column prop="prefix" label="剔除最多的别名前缀" />
              <el-table-column prop="count" label="地址数" width="100" />
            </el-table>
            <el-alert
              v-if="filterResult.savedFile"
              type="success"
              show-icon
              :closable="false"
              class="block"
              :title="`已保存 ${filterResult.savedFile.count} 个地址：${filterResult.savedFile.fileName}`"
              description="可在对应工具的文件列表里选用。"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="detailVisible" title="任务详情" size="460px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="kv"><span>任务 ID</span><b>{{ detail.id }}</b></div>
        <div class="kv"><span>状态</span><el-tag :type="statusTag[detail.status]" size="small">{{ statusText[detail.status] || detail.status }}</el-tag></div>
        <div class="kv"><span>候选前缀</span><b>{{ detail.prefixCount }}</b></div>
        <div class="kv"><span>探测包</span><b>{{ detail.probeCount }}</b></div>
        <div class="kv"><span>开始</span><b>{{ formatTime(detail.started_at) }}</b></div>
        <div class="kv"><span>结束</span><b>{{ formatTime(detail.completed_at) }}</b></div>
        <el-alert v-if="detail.error_message" type="error" show-icon :closable="false" class="block" :title="detail.error_message" />
        <template v-if="detail.summary">
          <el-divider>检测结果</el-divider>
          <el-row :gutter="12">
            <el-col :span="8"><el-statistic title="别名" :value="detail.summary.counts.aliased" /></el-col>
            <el-col :span="8"><el-statistic title="不确定" :value="detail.summary.counts.uncertain" /></el-col>
            <el-col :span="8"><el-statistic title="干净" :value="detail.summary.counts.clean" /></el-col>
          </el-row>
          <p class="hint">共收到 {{ detail.summary.responders }} 个应答源；{{ detail.summary.clearedFromTable }} 个前缀因完全无应答已从别名前缀表移除。每个前缀的应答数见下载的结果文件。</p>
          <el-button type="success" @click="download(detail.id)">下载结果（JSON）</el-button>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useApdStore } from '@/stores/apd'
import { useAuthStore } from '@/stores/auth'

const apd = useApdStore()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')

const activeTab = ref('create')

const statusText = { pending: '排队中', running: '运行中', completed: '已完成', failed: '失败', canceled: '已取消' }
const statusTag = { pending: 'info', running: 'warning', completed: 'success', failed: 'danger', canceled: 'info' }

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '-')
const fileLabel = (file) => `${file.file_name}（${file.tool_name || '文件'}，${formatTime(file.uploaded_at)}）`
const lengthOptions = [16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124]

// ----- 新建检测 -----
const form = reactive({ source: 'prefixes', prefixes: '', addressFile: '', prefixLength: 64, rate: '', description: '' })
const submitting = ref(false)
const canSubmit = computed(() =>
  form.source === 'prefixes' ? form.prefixes.trim() !== '' : form.addressFile !== ''
)

const submit = async () => {
  const payload = { description: form.description.trim() || undefined, rate: form.rate.trim() || undefined }
  if (form.source === 'prefixes') {
    payload.prefixes = form.prefixes.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  } else {
    payload.addressFile = form.addressFile
    payload.prefixLength = form.prefixLength
  }
  submitting.value = true
  try {
    const res = await apd.createTask(payload)
    ElMessage.success(`已提交：${res.prefixCount} 个前缀，${res.probeCount} 个探测包`)
    activeTab.value = 'tasks'
    startPolling()
  } catch {
    // 原因（包括被扫描策略拒绝）已显示在页面顶部
  } finally {
    submitting.value = false
  }
}

// ----- 任务 -----
const statusFilter = ref('')
let timer = null

const loadTasks = (page = 1) => apd.fetchTasks(statusFilter.value, page).catch(() => {})

// 有排队或运行中的任务时每 4 秒刷新一次，没有就停
const startPolling = () => {
  stopPolling()
  timer = setInterval(async () => {
    if (activeTab.value !== 'tasks') return
    await loadTasks(apd.pagination.page)
    if (!apd.tasks.some((t) => ['pending', 'running'].includes(t.status))) stopPolling()
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
    await apd.cancelTask(row.id, statusFilter.value)
    ElMessage.success('已终止')
  } catch {
    // 原因已显示
  }
}

const remove = async (row) => {
  try {
    await confirm(`删除任务 ${row.id} 及其结果文件？已写入别名前缀表的结果不受影响。`, '删除')
  } catch {
    return
  }
  try {
    await apd.deleteTask(row.id, statusFilter.value)
    ElMessage.success('已删除')
  } catch {
    // 原因已显示
  }
}

const download = (taskId) => apd.downloadResult(taskId).catch(() => {})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const openDetail = async (taskId) => {
  detail.value = null
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await apd.getTaskDetails(taskId)
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// ----- 别名前缀 -----
const search = ref('')
const loadAliased = (page = 1) =>
  apd.fetchAliased({ page, search: search.value.trim() || undefined }).catch(() => {})

const removeAliased = async (row) => {
  try {
    await confirm(`将 ${row.prefix} 从别名前缀表移除（用于更正误判）？`, '移除')
  } catch {
    return
  }
  try {
    await apd.removeAliased(row.id, { page: apd.aliased.page, search: search.value.trim() || undefined })
    ElMessage.success('已移除')
  } catch {
    // 原因已显示
  }
}

// ----- 地址过滤 -----
const filterForm = reactive({ source: 'file', addressFile: '', text: '', save: false, tool: 'zgrab2' })
const filtering = ref(false)
const filterResult = ref(null)
const canFilter = computed(() =>
  filterForm.source === 'file' ? filterForm.addressFile !== '' : filterForm.text.trim() !== ''
)

const runFilter = async () => {
  const payload = { save: filterForm.save || undefined, tool: filterForm.save ? filterForm.tool : undefined }
  if (filterForm.source === 'file') payload.addressFile = filterForm.addressFile
  else payload.addresses = filterForm.text.split(/[\s,;]+/).filter(Boolean)
  filtering.value = true
  try {
    filterResult.value = await apd.filterAddresses(payload)
  } catch {
    filterResult.value = null
  } finally {
    filtering.value = false
  }
}

const loaded = new Set(['create'])
const onTabChange = (name) => {
  if (name === 'tasks') {
    loadTasks(1).then(() => {
      if (apd.tasks.some((t) => ['pending', 'running'].includes(t.status))) startPolling()
    })
  }
  if (loaded.has(name)) return
  loaded.add(name)
  if (name === 'aliased') loadAliased(1)
  if (name === 'filter') apd.fetchAddressFiles().catch(() => {})
}

onMounted(() => {
  apd.fetchAddressFiles().catch(() => {})
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.apd-dashboard { padding: 20px; }
.page-header h1 { margin: 0 0 6px; font-size: 24px; }
.page-description { margin: 0 0 16px; color: #666; line-height: 1.6; }
.block { margin-bottom: 16px; }
.form-card { max-width: 860px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.hint { color: #888; font-size: 12px; line-height: 1.5; margin: 6px 0; }
.hint.inline { margin: 0 0 0 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.kv { display: flex; justify-content: space-between; padding: 6px 0; }
.filter-result { margin-top: 16px; }
</style>
