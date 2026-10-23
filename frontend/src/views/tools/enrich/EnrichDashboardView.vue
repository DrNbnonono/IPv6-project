<template>
  <div class="enrich-dashboard">
    <div class="page-header">
      <h1>🏷️ 地址分类与富化</h1>
      <p class="page-description">
        接口标识（IID，地址的后 64 位）反映地址是怎么来的：低位编号（::1、::53）多是人工配置的服务器或路由器，EUI-64 能还原网卡 MAC，随机 IID 多是终端的临时地址。
        分类按固定规则判断，是启发式的：同一个 ::1234 既可能是人为编号也可能是巧合，结果用来缩小范围，不是结论。
      </p>
    </div>

    <el-alert v-if="enrich.error" :title="enrich.error" type="error" show-icon closable class="block" @close="enrich.error = ''" />

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 地址分类 -->
      <el-tab-pane label="地址分类" name="classify">
        <el-card shadow="never" class="form-card">
          <el-form label-width="90px" novalidate @submit.prevent="runClassify">
            <el-form-item label="地址">
              <el-input v-model="classifyText" type="textarea" :rows="7" placeholder="每行一个 IPv6 地址，一次最多 1000 个" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="classifying" :disabled="!classifyText.trim()" native-type="submit">分类</el-button>
              <span class="hint inline">只做计算，不访问数据库里的地址，也不发送任何探测包</span>
            </el-form-item>
          </el-form>

          <div v-if="classified" class="result">
            <div class="type-tags">
              <el-tag v-for="(count, type) in classified.counts" :key="type" :type="typeTag(type)" effect="plain" class="type-tag">
                {{ typeLabel(type) }} {{ count }}
              </el-tag>
              <el-tag v-if="classified.invalid" type="info" effect="plain" class="type-tag">无效 {{ classified.invalid }}</el-tag>
            </div>
            <el-table :data="classified.items" size="small" max-height="420" empty-text="没有结果">
              <el-table-column prop="address" label="地址" min-width="260" show-overflow-tooltip />
              <el-table-column label="IID 类型" width="190">
                <template #default="{ row }">
                  <el-tag v-if="row.valid" :type="typeTag(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
                  <el-tag v-else type="info" size="small">不是 IPv6 地址</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="风险" width="80">
                <template #default="{ row }">
                  <el-tag v-if="row.isRisky" type="warning" size="small">可预测</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="mac" label="MAC（EUI-64）" width="160" />
              <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
            </el-table>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 按类型过滤 -->
      <el-tab-pane label="按类型过滤" name="filter">
        <el-card shadow="never" class="form-card">
          <p class="hint">按 IID 类型保留或剔除地址，可保存成 ZGrab2 / XMap 的输入文件。例如剔除随机 IID（多为终端的临时地址），只扫描更像基础设施的地址。</p>
          <el-form label-width="110px" novalidate @submit.prevent="runFilter">
            <el-form-item label="地址来源">
              <el-radio-group v-model="filterForm.source">
                <el-radio-button value="file">地址文件</el-radio-button>
                <el-radio-button value="text">粘贴地址</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="filterForm.source === 'file'" label="地址文件">
              <el-select v-model="filterForm.addressFile" filterable placeholder="选择已上传的地址文件" style="width: 360px">
                <el-option v-for="file in enrich.addressFiles" :key="file.id" :label="fileLabel(file)" :value="file.file_name" />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="地址">
              <el-input v-model="filterForm.text" type="textarea" :rows="6" placeholder="每行一个地址" />
            </el-form-item>
            <el-form-item label="过滤方式">
              <el-radio-group v-model="filterForm.mode">
                <el-radio-button value="drop">剔除所选类型</el-radio-button>
                <el-radio-button value="keep">只保留所选类型</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="IID 类型">
              <el-checkbox-group v-model="filterForm.types">
                <el-checkbox v-for="item in typeList" :key="item.id" :value="item.id">{{ item.label }}</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="保存结果">
              <el-switch v-model="filterForm.save" />
              <el-select v-if="filterForm.save" v-model="filterForm.tool" style="width: 160px; margin-left: 12px">
                <el-option label="作为 ZGrab2 输入" value="zgrab2" />
                <el-option label="作为 XMap 白名单" value="xmap" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="filtering" :disabled="!canFilter" native-type="submit">开始过滤</el-button>
            </el-form-item>
          </el-form>

          <div v-if="filterResult" class="result">
            <el-row :gutter="12">
              <el-col :span="6"><el-statistic title="输入" :value="filterResult.total" /></el-col>
              <el-col :span="6"><el-statistic title="保留" :value="filterResult.kept" /></el-col>
              <el-col :span="6"><el-statistic title="剔除" :value="filterResult.removed" /></el-col>
              <el-col :span="6"><el-statistic title="无效（非 IPv6）" :value="filterResult.invalid" /></el-col>
            </el-row>
            <div class="type-tags top">
              <el-tag v-for="(count, type) in filterResult.counts" :key="type" :type="typeTag(type)" effect="plain" class="type-tag">
                输入中 {{ typeLabel(type) }} {{ count }}
              </el-tag>
            </div>
            <el-alert
              v-if="filterResult.savedFile"
              type="success"
              show-icon
              :closable="false"
              class="block"
              :title="`已保存 ${filterResult.savedFile.count} 个地址：${filterResult.savedFile.fileName}`"
              description="可在对应工具的文件列表里选用；用于 XMap 时创建扫描会再次检查扫描策略。"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 库内富化（管理员） -->
      <el-tab-pane v-if="isAdmin" label="库内富化" name="enrich">
        <el-card shadow="never" class="form-card">
          <p class="hint">
            对数据库里的地址批量做 IID 分类，并补全缺失的来源前缀（按最长前缀匹配）。导入时统一记为 random（等于未分类），所以默认只改“未分类 / random”的行，不动外部导入的结果。
            任务在后台分批执行，可以随时终止，已写入的批次保留。
          </p>
          <el-form label-width="130px" novalidate @submit.prevent="submitTask">
            <el-form-item label="范围">
              <el-radio-group v-model="taskForm.scope">
                <el-radio-button value="asn">按 ASN</el-radio-button>
                <el-radio-button value="countryId">按国家 ID</el-radio-button>
                <el-radio-button value="prefixId">按前缀 ID</el-radio-button>
                <el-radio-button value="all">全表</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="taskForm.scope !== 'all'" :label="scopeLabel">
              <el-input-number v-model="taskForm.scopeValue" :min="1" :controls="false" style="width: 200px" />
            </el-form-item>
            <el-form-item label="覆盖已有类型">
              <el-switch v-model="taskForm.overwrite" />
              <span class="hint inline">会覆盖外部导入（IID 类型管理）写入的结果，一般不需要</span>
            </el-form-item>
            <el-form-item label="补全来源前缀">
              <el-switch v-model="taskForm.fillPrefix" />
              <span class="hint inline">只补 prefix_id 为空的地址，已有的不会改</span>
            </el-form-item>
            <el-form-item label="最多扫描行数">
              <el-input-number v-model="taskForm.limit" :min="1" :controls="false" placeholder="不限" style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" :disabled="!canSubmitTask" native-type="submit">开始富化</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <h3 class="section-title">富化任务</h3>
        <div class="toolbar">
          <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 140px" @change="loadTasks(1)">
            <el-option v-for="(label, key) in statusText" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button @click="loadTasks(enrich.pagination.page)">刷新</el-button>
        </div>
        <el-table :data="enrich.tasks" v-loading="enrich.isLoading && !enrich.tasks.length" empty-text="暂无富化任务">
          <el-table-column prop="id" label="任务 ID" width="170" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTag[row.status]" size="small">{{ statusText[row.status] || row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
              <el-button v-if="['pending', 'running'].includes(row.status)" link type="warning" @click="cancel(row)">终止</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="enrich.pagination.total > enrich.pagination.perPage"
          class="pager"
          background
          layout="prev, pager, next, total"
          :total="enrich.pagination.total"
          :page-size="enrich.pagination.perPage"
          :current-page="enrich.pagination.page"
          @current-change="loadTasks"
        />
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="detailVisible" title="任务详情" size="480px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="kv"><span>任务 ID</span><b>{{ detail.id }}</b></div>
        <div class="kv"><span>状态</span><el-tag :type="statusTag[detail.status]" size="small">{{ statusText[detail.status] || detail.status }}</el-tag></div>
        <div class="kv"><span>范围</span><b>{{ scopeText(detail.params) }}</b></div>
        <div class="kv"><span>覆盖已有类型</span><b>{{ detail.params.overwrite ? '是' : '否' }}</b></div>
        <div class="kv"><span>补全来源前缀</span><b>{{ detail.params.fillPrefix === false ? '否' : '是' }}</b></div>
        <div v-if="detail.params.limit" class="kv"><span>最多扫描行数</span><b>{{ detail.params.limit }}</b></div>
        <div class="kv"><span>开始</span><b>{{ formatTime(detail.started_at) }}</b></div>
        <div class="kv"><span>结束</span><b>{{ formatTime(detail.completed_at) }}</b></div>
        <el-alert v-if="detail.error_message" type="error" show-icon :closable="false" class="block" :title="detail.error_message" />

        <template v-if="detail.progress">
          <el-divider>进度</el-divider>
          <el-row :gutter="12">
            <el-col :span="8"><el-statistic title="已扫描" :value="detail.progress.scanned" /></el-col>
            <el-col :span="8"><el-statistic title="已更新" :value="detail.progress.updated" /></el-col>
            <el-col :span="8"><el-statistic title="已补前缀" :value="detail.progress.prefixFilled" /></el-col>
          </el-row>
          <p class="hint">进度只保存在服务内存里，服务重启后丢失（任务会被标记为失败，重新创建即可，已处理的行会被跳过）。</p>
        </template>

        <template v-if="detail.summary">
          <el-divider>结果</el-divider>
          <el-row :gutter="12">
            <el-col :span="8"><el-statistic title="扫描" :value="detail.summary.scanned" /></el-col>
            <el-col :span="8"><el-statistic title="更新类型" :value="detail.summary.updated" /></el-col>
            <el-col :span="8"><el-statistic title="补前缀" :value="detail.summary.prefixFilled" /></el-col>
          </el-row>
          <div class="kv top"><span>已是正确类型 / 被保留</span><b>{{ detail.summary.unchanged }}</b></div>
          <div v-if="detail.summary.unknownType" class="kv"><span>库里缺少对应类型名</span><b>{{ detail.summary.unknownType }}</b></div>
          <div v-if="detail.summary.prefixesLoaded" class="kv"><span>载入的 IPv6 前缀</span><b>{{ detail.summary.prefixesLoaded }}</b></div>
          <div class="kv"><span>耗时</span><b>{{ detail.summary.durationMs }} ms</b></div>
          <div class="type-tags top">
            <el-tag v-for="(count, type) in detail.summary.byType" :key="type" :type="typeTag(type)" effect="plain" class="type-tag">
              {{ typeLabel(type) }} {{ count }}
            </el-tag>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEnrichStore } from '@/stores/enrich'
import { useAuthStore } from '@/stores/auth'

const enrich = useEnrichStore()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')

const activeTab = ref('classify')

const statusText = { pending: '排队中', running: '运行中', completed: '已完成', failed: '失败', canceled: '已取消' }
const statusTag = { pending: 'info', running: 'warning', completed: 'success', failed: 'danger', canceled: 'info' }

// 与后端 enrichService.CLASSIFIER_TYPES 一致；库里的 ipv4-all / embed-port-all / embed-port-rev 分类器不产出
const typeList = [
  { id: 'random', label: '随机', tag: 'info' },
  { id: 'low-byte', label: '低位编号', tag: 'warning' },
  { id: 'service', label: '服务端口', tag: 'warning' },
  { id: 'embed-port', label: '嵌入端口', tag: 'warning' },
  { id: 'byte-pattern', label: '字节模式', tag: 'warning' },
  { id: 'ieee', label: 'EUI-64', tag: 'success' },
  { id: 'isatap', label: 'ISATAP 隧道', tag: 'success' },
  { id: 'ipv4-32', label: '嵌入 IPv4（32 位）', tag: 'warning' },
  { id: 'ipv4-64', label: '嵌入 IPv4（64 位）', tag: 'warning' }
]
const typeLabel = (id) => typeList.find((t) => t.id === id)?.label || id
const typeTag = (id) => typeList.find((t) => t.id === id)?.tag || 'info'

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '-')
const fileLabel = (file) => `${file.file_name}（${file.tool_name || '文件'}，${formatTime(file.uploaded_at)}）`
const splitList = (text) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)

// ----- 地址分类 -----
const classifyText = ref('')
const classifying = ref(false)
const classified = ref(null)

const runClassify = async () => {
  const addresses = splitList(classifyText.value)
  if (addresses.length > 1000) {
    ElMessage.warning('一次最多分类 1000 个地址')
    return
  }
  classifying.value = true
  try {
    classified.value = await enrich.classify(addresses)
  } catch {
    classified.value = null
  } finally {
    classifying.value = false
  }
}

// ----- 按类型过滤 -----
const filterForm = reactive({ source: 'file', addressFile: '', text: '', mode: 'drop', types: ['random'], save: true, tool: 'zgrab2' })
const filtering = ref(false)
const filterResult = ref(null)
const canFilter = computed(() =>
  filterForm.types.length > 0 && (filterForm.source === 'file' ? filterForm.addressFile !== '' : filterForm.text.trim() !== '')
)

const runFilter = async () => {
  const payload = { mode: filterForm.mode, types: [...filterForm.types] }
  if (filterForm.source === 'file') payload.addressFile = filterForm.addressFile
  else payload.addresses = splitList(filterForm.text)
  if (filterForm.save) {
    payload.save = true
    payload.tool = filterForm.tool
  }
  filtering.value = true
  try {
    filterResult.value = await enrich.filter(payload)
  } catch {
    filterResult.value = null
  } finally {
    filtering.value = false
  }
}

// ----- 库内富化（管理员） -----
const taskForm = reactive({ scope: 'asn', scopeValue: undefined, overwrite: false, fillPrefix: true, limit: undefined })
const submitting = ref(false)
const scopeLabel = computed(() => ({ asn: 'ASN', countryId: '国家 ID', prefixId: '前缀 ID' }[taskForm.scope]))
const canSubmitTask = computed(() => taskForm.scope === 'all' || Number.isInteger(taskForm.scopeValue))

const scopeText = (params) => {
  const scope = params?.scope || {}
  if (scope.asn) return `AS${scope.asn}`
  if (scope.countryId) return `国家 ${scope.countryId}`
  if (scope.prefixId) return `前缀 ${scope.prefixId}`
  return '全表'
}

const confirm = (message, okText) =>
  ElMessageBox.confirm(message, '确认', { type: 'warning', confirmButtonText: okText, cancelButtonText: '取消' })

const submitTask = async () => {
  const payload = { overwrite: taskForm.overwrite, fillPrefix: taskForm.fillPrefix }
  if (taskForm.scope === 'all') payload.all = true
  else payload[taskForm.scope] = taskForm.scopeValue
  if (Number.isInteger(taskForm.limit)) payload.limit = taskForm.limit

  if (taskForm.scope === 'all' || taskForm.overwrite) {
    const parts = []
    if (taskForm.scope === 'all') parts.push('对全表地址做分类，可能耗时很长')
    if (taskForm.overwrite) parts.push('会覆盖外部导入写入的 IID 类型')
    try {
      await confirm(`${parts.join('，')}。继续？`, '继续')
    } catch {
      return
    }
  }

  submitting.value = true
  try {
    await enrich.createTask(payload)
    ElMessage.success('已提交富化任务')
    startPolling()
  } catch {
    // 原因已显示在页面顶部
  } finally {
    submitting.value = false
  }
}

const statusFilter = ref('')
let timer = null

const loadTasks = (page = 1) => enrich.fetchTasks(statusFilter.value, page).catch(() => {})

// 有排队或运行中的任务时每 4 秒刷新一次，没有就停
const startPolling = () => {
  stopPolling()
  timer = setInterval(async () => {
    if (activeTab.value !== 'enrich') return
    await loadTasks(enrich.pagination.page)
    if (!enrich.tasks.some((t) => ['pending', 'running'].includes(t.status))) stopPolling()
  }, 4000)
}
const stopPolling = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const cancel = async (row) => {
  try {
    await confirm(`终止任务 ${row.id}？已写入的批次会保留。`, '终止')
  } catch {
    return
  }
  try {
    await enrich.cancelTask(row.id, statusFilter.value)
    ElMessage.success('已终止')
  } catch {
    // 原因已显示
  }
}

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const openDetail = async (taskId) => {
  detail.value = null
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await enrich.getTaskDetails(taskId)
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const onTabChange = (name) => {
  if (name === 'filter') enrich.fetchAddressFiles().catch(() => {})
  if (name === 'enrich') {
    loadTasks(1).then(() => {
      if (enrich.tasks.some((t) => ['pending', 'running'].includes(t.status))) startPolling()
    })
  }
}

onMounted(() => {
  enrich.fetchAddressFiles().catch(() => {})
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.enrich-dashboard { padding: 20px; }
.page-header h1 { margin: 0 0 6px; font-size: 24px; }
.page-description { margin: 0 0 16px; color: #666; line-height: 1.6; }
.block { margin-bottom: 16px; }
.form-card { max-width: 960px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.hint { color: #888; font-size: 12px; line-height: 1.5; margin: 6px 0; }
.hint.inline { margin: 0 0 0 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.section-title { margin: 24px 0 12px; font-size: 16px; }
.result { margin-top: 16px; }
.type-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.type-tags.top { margin-top: 12px; }
.kv { display: flex; justify-content: space-between; padding: 6px 0; gap: 12px; }
.kv b { text-align: right; word-break: break-all; }
.kv.top { margin-top: 12px; }
</style>
