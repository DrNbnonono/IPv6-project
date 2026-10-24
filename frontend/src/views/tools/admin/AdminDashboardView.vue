<template>
  <div class="admin-dashboard">
    <div class="page-header">
      <h1>🛡️ 扫描策略与审计</h1>
      <p class="page-description">
        管理允许扫描的网段、审核探针退出请求、设置用户速率与每日配额，查看操作审计。扫描策略默认拒绝：目标必须完整落在白名单内。
      </p>
    </div>

    <el-alert v-if="admin.error" :title="admin.error" type="error" show-icon closable class="block" @close="admin.error = ''" />

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 扫描策略 -->
      <el-tab-pane label="扫描策略" name="policy">
        <el-alert
          v-if="policy && noAllowlist"
          type="warning"
          show-icon
          :closable="false"
          class="block"
          title="尚未配置任何白名单：所有扫描任务都会被拒绝"
          description="在下方添加已获授权的网段，或在服务端设置 SCAN_ALLOWED_TARGETS。"
        />

        <el-row :gutter="16" v-if="policy" class="block">
          <el-col :xs="24" :md="8">
            <el-card shadow="never">
              <template #header>默认限制</template>
              <div class="kv"><span>单任务速率上限</span><b>{{ policy.defaults.maxRate }}</b></div>
              <div class="kv"><span>未指定时的默认速率</span><b>{{ policy.defaults.defaultRate }}</b></div>
              <div class="kv"><span>每用户每日任务数</span><b>{{ policy.defaults.dailyScanLimit }}</b></div>
              <div class="hint">由服务端 SCAN_MAX_RATE / SCAN_DEFAULT_RATE / SCAN_DAILY_LIMIT 决定，可在“用户配额”里按用户覆盖。</div>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="16">
            <el-card shadow="never">
              <template #header>永远不允许扫描的范围（内置）</template>
              <el-tag v-for="item in policy.builtinBlocked" :key="item.cidr" type="info" class="cidr-tag" :title="item.label">
                {{ item.cidr }}
              </el-tag>
              <div v-if="policy.envAllowedTargets.length" class="env-allow">
                <div class="hint">来自环境变量 SCAN_ALLOWED_TARGETS（只读）：</div>
                <el-tag v-for="cidr in policy.envAllowedTargets" :key="cidr" type="success" class="cidr-tag">{{ cidr }}</el-tag>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="16" v-if="policy">
          <el-col :xs="24" :lg="12" v-for="list in lists" :key="list.kind">
            <el-card shadow="never" class="block">
              <template #header>{{ list.title }}</template>
              <el-form inline @submit.prevent="addEntry(list.kind)">
                <el-form-item>
                  <el-input v-model="forms[list.kind].cidr" placeholder="2001:db8::/32 或单个地址" clearable style="width: 190px" />
                </el-form-item>
                <el-form-item>
                  <el-input v-model="forms[list.kind].note" :placeholder="list.notePlaceholder" maxlength="255" clearable style="width: 170px" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" native-type="submit" :loading="admin.isLoading" :disabled="!forms[list.kind].cidr.trim()">添加</el-button>
                </el-form-item>
              </el-form>
              <el-table :data="policy[list.kind]" size="small" empty-text="暂无条目">
                <el-table-column prop="cidr" label="网段" min-width="170" />
                <el-table-column prop="note" :label="list.noteLabel" min-width="140" show-overflow-tooltip />
                <el-table-column label="添加时间" width="170">
                  <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="80">
                  <template #default="{ row }">
                    <el-button link type="danger" @click="removeEntry(list.kind, row)">移除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 探针退出请求 -->
      <el-tab-pane name="optout">
        <template #label>
          退出请求<el-badge v-if="admin.optOut.counts.pending" :value="admin.optOut.counts.pending" class="tab-badge" />
        </template>
        <el-alert
          type="info"
          show-icon
          :closable="false"
          class="block"
          title="待审核的网段已经被扫描策略拒绝"
          description="通过后网段写入黑名单并永久生效；驳回后暂停解除。联系邮箱只在这里显示，请先核实对方确实管理该网段再通过。公开页面：/about-scanning。"
        />
        <el-form inline class="block" @submit.prevent="loadOptOut">
          <el-form-item label="状态">
            <el-select v-model="optOutStatus" style="width: 130px" @change="loadOptOut">
              <el-option value="pending" label="待审核" />
              <el-option value="approved" label="已通过" />
              <el-option value="rejected" label="已驳回" />
              <el-option value="" label="全部" />
            </el-select>
          </el-form-item>
        </el-form>
        <el-table :data="admin.optOut.items" size="small" empty-text="没有符合条件的请求">
          <el-table-column prop="cidr" label="网段" min-width="170" />
          <el-table-column prop="contact" label="联系邮箱" min-width="170" show-overflow-tooltip />
          <el-table-column prop="organization" label="单位" min-width="120" show-overflow-tooltip />
          <el-table-column prop="note" label="说明" min-width="160" show-overflow-tooltip />
          <el-table-column prop="sourceIp" label="提交 IP" width="140" show-overflow-tooltip />
          <el-table-column label="提交时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="optOutTag[row.status]" size="small">{{ optOutLabel[row.status] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button link type="primary" @click="reviewOptOut(row, 'approve')">通过</el-button>
                <el-button link type="danger" @click="reviewOptOut(row, 'reject')">驳回</el-button>
              </template>
              <span v-else class="hint">{{ row.reviewNote || '' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 用户配额 -->
      <el-tab-pane label="用户配额" name="quotas">
        <el-card shadow="never" class="block">
          <template #header>设置配额</template>
          <el-form inline @submit.prevent="saveQuota">
            <el-form-item label="用户">
              <el-select v-model="quotaForm.userId" placeholder="选择用户" filterable style="width: 200px">
                <el-option v-for="u in admin.users" :key="u.id" :value="u.id" :label="`${u.username || '用户'} (#${u.id})`" />
              </el-select>
            </el-form-item>
            <el-form-item label="速率上限">
              <el-input v-model="quotaForm.maxRate" placeholder="如 20M，留空保持不变" clearable style="width: 190px" />
            </el-form-item>
            <el-form-item label="每日任务数">
              <el-input-number v-model="quotaForm.dailyScanLimit" :min="0" :max="100000" :controls="false" placeholder="留空保持不变" style="width: 150px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" native-type="submit" :loading="admin.isLoading" :disabled="!canSaveQuota">保存</el-button>
            </el-form-item>
          </el-form>
          <div class="hint" v-if="admin.quotas.defaults">
            未设置的用户使用默认值：速率 {{ admin.quotas.defaults.maxRate }}，每日 {{ admin.quotas.defaults.dailyScanLimit }} 个任务。
          </div>
        </el-card>

        <el-table :data="admin.quotas.items" size="small" empty-text="还没有用户设置过自定义配额">
          <el-table-column prop="username" label="用户" min-width="140">
            <template #default="{ row }">{{ row.username || '-' }} (#{{ row.userId }})</template>
          </el-table-column>
          <el-table-column label="速率上限" width="120">
            <template #default="{ row }">{{ row.maxRate || '默认' }}</template>
          </el-table-column>
          <el-table-column label="每日任务数" width="120">
            <template #default="{ row }">{{ row.dailyScanLimit ?? '默认' }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button link type="danger" @click="resetQuota(row)">恢复默认</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 开放 API 密钥 -->
      <el-tab-pane label="API 密钥" name="apikeys">
        <el-card shadow="never" class="block">
          <template #header>创建密钥</template>
          <el-form inline @submit.prevent="createKey">
            <el-form-item label="用途">
              <el-input v-model="keyForm.name" placeholder="给谁、做什么" maxlength="100" style="width: 220px" />
            </el-form-item>
            <el-form-item label="权限">
              <el-checkbox-group v-model="keyForm.scopes">
                <el-checkbox value="stats">统计 (stats)</el-checkbox>
                <el-checkbox value="addresses">完整地址 (addresses)</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="每分钟上限">
              <el-input-number v-model="keyForm.rateLimitPerMin" :min="1" :max="100000" :controls="false" placeholder="默认" style="width: 110px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" native-type="submit" :loading="admin.isLoading" :disabled="!canCreateKey">创建</el-button>
            </el-form-item>
          </el-form>
          <div class="hint">明文密钥只在创建后显示一次，服务器只保存它的哈希。完整地址权限请只发给确实需要的使用者。接口说明见 backend/knowledge/platform/open-api.md；同一把密钥也可用于 MCP 入口 /api/mcp（只读，见 mcp.md）。</div>
        </el-card>

        <el-table :data="admin.apiKeys.items" size="small" empty-text="还没有创建过密钥（需要先执行迁移 16）">
          <el-table-column prop="name" label="用途" min-width="150" show-overflow-tooltip />
          <el-table-column prop="prefix" label="前缀" width="130" />
          <el-table-column label="权限" width="170">
            <template #default="{ row }">{{ row.scopes.join('、') }}</template>
          </el-table-column>
          <el-table-column label="每分钟上限" width="110">
            <template #default="{ row }">{{ row.rateLimitPerMin ?? '默认' }}</template>
          </el-table-column>
          <el-table-column label="最近使用" width="170">
            <template #default="{ row }">{{ formatTime(row.lastUsedAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.revokedAt" type="info" size="small">已吊销</el-tag>
              <el-tag v-else-if="row.expiresAt && new Date(row.expiresAt) <= new Date()" type="warning" size="small">已过期</el-tag>
              <el-tag v-else type="success" size="small">有效</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="!row.revokedAt" link type="danger" @click="revokeKey(row)">吊销</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 审计日志 -->
      <el-tab-pane label="审计日志" name="audit">
        <el-form inline class="block" @submit.prevent="searchAudit(1)">
          <el-form-item label="动作">
            <el-select v-model="auditFilters.action" placeholder="全部" clearable style="width: 160px">
              <el-option v-for="a in actionOptions" :key="a.value" :value="a.value" :label="a.label" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户 ID">
            <el-input v-model="auditFilters.userId" placeholder="全部" clearable style="width: 110px" />
          </el-form-item>
          <el-form-item label="结果">
            <el-select v-model="auditFilters.success" placeholder="全部" clearable style="width: 100px">
              <el-option value="true" label="成功" />
              <el-option value="false" label="失败" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间">
            <el-date-picker v-model="auditFilters.range" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 360px" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" native-type="submit" :loading="admin.isLoading">查询</el-button>
          </el-form-item>
        </el-form>

        <el-table :data="admin.audit.items" size="small" empty-text="没有符合条件的记录">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="用户" width="130">
            <template #default="{ row }">{{ row.username || (row.user_id ? `#${row.user_id}` : '-') }}</template>
          </el-table-column>
          <el-table-column prop="action" label="动作" width="170" />
          <el-table-column label="资源" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ [row.resource_type, row.resource_id].filter(Boolean).join(' / ') || '-' }}</template>
          </el-table-column>
          <el-table-column label="结果" width="80">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="ip" label="来源 IP" width="190" show-overflow-tooltip />
          <el-table-column label="详情" min-width="240">
            <template #default="{ row }">
              <el-tooltip v-if="row.detail" placement="top-start" :show-after="300">
                <template #content><pre class="detail-pop">{{ JSON.stringify(row.detail, null, 2) }}</pre></template>
                <span class="detail-line">{{ summarize(row.detail) }}</span>
              </el-tooltip>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="pager"
          background
          layout="total, prev, pager, next"
          :total="admin.audit.total"
          :page-size="admin.audit.pageSize"
          :current-page="admin.audit.page"
          @current-change="searchAudit"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const activeTab = ref('policy')
const policy = computed(() => admin.policy)

const lists = [
  { kind: 'allowlist', title: '允许扫描的网段（白名单）', noteLabel: '说明', notePlaceholder: '说明（可选）' },
  { kind: 'blacklist', title: '禁止扫描的网段（黑名单）', noteLabel: '原因', notePlaceholder: '原因（可选）' }
]
const forms = reactive({
  allowlist: { cidr: '', note: '' },
  blacklist: { cidr: '', note: '' }
})

const noAllowlist = computed(() =>
  policy.value && policy.value.allowlist.length === 0 && policy.value.envAllowedTargets.length === 0
)

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '-')

const addEntry = async (kind) => {
  const { cidr, note } = forms[kind]
  try {
    const res = await admin.addEntry(kind, cidr.trim(), note.trim())
    ElMessage.success(res.message || '已添加')
    forms[kind].cidr = ''
    forms[kind].note = ''
  } catch {
    // 原因已显示在页面顶部的提示里
  }
}

const removeEntry = async (kind, row) => {
  try {
    await ElMessageBox.confirm(
      kind === 'allowlist'
        ? `移除后，${row.cidr} 内的目标将无法再被扫描（除非被其他白名单条目覆盖）。`
        : `移除后，${row.cidr} 将不再被黑名单拦截。`,
      '确认移除',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await admin.removeEntry(kind, row.id)
    ElMessage.success('已移除')
  } catch {
    // 原因已显示
  }
}

// ----- 探针退出请求 -----
const optOutStatus = ref('pending')
const optOutLabel = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
const optOutTag = { pending: 'warning', approved: 'success', rejected: 'info' }

const loadOptOut = () => admin.fetchOptOutRequests(optOutStatus.value).catch(() => {})

const reviewOptOut = async (row, decision) => {
  const approve = decision === 'approve'
  let note = ''
  try {
    const result = await ElMessageBox.prompt(
      approve
        ? `通过后 ${row.cidr} 将永久加入黑名单。可填写审核备注（如何核实的）：`
        : `驳回后 ${row.cidr} 的暂停解除，可以再次被扫描（前提是仍在白名单内）。可填写驳回原因：`,
      approve ? '通过退出请求' : '驳回退出请求',
      { confirmButtonText: approve ? '通过' : '驳回', cancelButtonText: '取消', inputPattern: /^[\s\S]{0,255}$/, inputErrorMessage: '不能超过 255 个字符' }
    )
    note = (result.value || '').trim()
  } catch {
    return // 用户取消
  }
  try {
    const res = await admin.reviewOptOut(row.id, decision, note, optOutStatus.value)
    ElMessage.success(res.message || '已处理')
  } catch {
    // 原因已显示在页面顶部
  }
}

// ----- 用户配额 -----
const quotaForm = reactive({ userId: null, maxRate: '', dailyScanLimit: undefined })
const canSaveQuota = computed(() =>
  quotaForm.userId && (quotaForm.maxRate.trim() !== '' || (quotaForm.dailyScanLimit !== undefined && quotaForm.dailyScanLimit !== null))
)

const saveQuota = async () => {
  const payload = {}
  if (quotaForm.maxRate.trim() !== '') payload.maxRate = quotaForm.maxRate.trim()
  if (quotaForm.dailyScanLimit !== undefined && quotaForm.dailyScanLimit !== null) payload.dailyScanLimit = quotaForm.dailyScanLimit
  try {
    await admin.saveQuota(quotaForm.userId, payload)
    ElMessage.success('配额已保存')
    quotaForm.maxRate = ''
    quotaForm.dailyScanLimit = undefined
  } catch {
    // 原因已显示
  }
}

const resetQuota = async (row) => {
  try {
    await ElMessageBox.confirm(`将用户 ${row.username || row.userId} 的配额恢复为默认值？`, '确认', {
      type: 'warning', confirmButtonText: '恢复默认', cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await admin.resetQuota(row.userId)
    ElMessage.success('已恢复默认')
  } catch {
    // 原因已显示
  }
}

// ----- 开放 API 密钥 -----
const keyForm = reactive({ name: '', scopes: ['stats'], rateLimitPerMin: undefined })
const canCreateKey = computed(() => keyForm.name.trim() !== '' && keyForm.scopes.length > 0)

const createKey = async () => {
  const payload = { name: keyForm.name.trim(), scopes: keyForm.scopes }
  if (keyForm.rateLimitPerMin !== undefined && keyForm.rateLimitPerMin !== null) payload.rateLimitPerMin = keyForm.rateLimitPerMin
  try {
    const res = await admin.createApiKey(payload)
    keyForm.name = ''
    keyForm.scopes = ['stats']
    keyForm.rateLimitPerMin = undefined
    // 明文只显示这一次；对话框关闭后页面上不再保留
    await ElMessageBox.alert(res.data.key, '请立即保存密钥（关闭后无法再次查看）', {
      confirmButtonText: '我已保存',
      customClass: 'api-key-dialog'
    })
  } catch {
    // 原因已显示在页面顶部
  }
}

const revokeKey = async (row) => {
  try {
    await ElMessageBox.confirm(`吊销后「${row.name}」立即失效，且不可恢复。`, '确认吊销', {
      type: 'warning', confirmButtonText: '吊销', cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await admin.revokeApiKey(row.id)
    ElMessage.success('已吊销')
  } catch {
    // 原因已显示
  }
}

// ----- 审计日志 -----
const actionOptions = [
  { value: 'auth', label: '登录' },
  { value: 'task', label: '任务' },
  { value: 'whitelist', label: '白名单文件' },
  { value: 'agent', label: 'Agent 工具' },
  { value: 'terminal', label: '终端' },
  { value: 'workflow', label: '工作流' },
  { value: 'db', label: '数据库写操作' },
  { value: 'optout', label: '退出请求提交' },
  { value: 'admin', label: '管理员操作' }
]
const auditFilters = reactive({ action: '', userId: '', success: '', range: null })

const searchAudit = (page = 1) => {
  const [since, until] = auditFilters.range || []
  return admin.fetchAuditLogs({
    action: auditFilters.action,
    userId: auditFilters.userId.trim(),
    success: auditFilters.success,
    since: since ? new Date(since).toISOString() : '',
    until: until ? new Date(until).toISOString() : '',
    page
  }).catch(() => {})
}

// 详情摘要：状态码以外的第一两项
const summarize = (detail) =>
  Object.entries(detail)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('  ')

const loaded = new Set()
const onTabChange = (name) => {
  if (loaded.has(name)) return
  loaded.add(name)
  if (name === 'optout') loadOptOut()
  if (name === 'quotas') admin.fetchQuotas().catch(() => {})
  if (name === 'audit') searchAudit(1)
  if (name === 'apikeys') admin.fetchApiKeys().catch(() => {})
}

onMounted(() => {
  loaded.add('policy')
  admin.fetchPolicy().catch(() => {})
  loadOptOut() // 先取一次，让标签上的待审核数量可见
})
</script>

<style scoped>
.admin-dashboard { padding: 20px; }
.page-header h1 { margin: 0 0 6px; font-size: 24px; }
.page-description { margin: 0 0 16px; color: #666; }
.block { margin-bottom: 16px; }
.kv { display: flex; justify-content: space-between; padding: 4px 0; }
.tab-badge { margin-left: 6px; }
.hint { margin-top: 8px; color: #888; font-size: 12px; line-height: 1.5; }
.cidr-tag { margin: 0 6px 6px 0; }
.env-allow { margin-top: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.detail-line { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #555; }
.detail-pop { margin: 0; max-width: 480px; white-space: pre-wrap; word-break: break-all; font-size: 12px; }
</style>
