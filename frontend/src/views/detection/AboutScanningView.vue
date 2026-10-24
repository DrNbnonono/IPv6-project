<template>
  <div class="about">
    <header class="hero">
      <div>
        <p class="eyebrow">ObserV6 · IPv6 网络观测平台</p>
        <h1>探针说明与退出</h1>
        <p class="lead">
          如果你在日志里看到来自本平台的探测流量，这里说明它是什么、从哪里来，以及怎样让我们不再探测你的网段。
        </p>
      </div>
      <nav class="hero-nav">
        <router-link :to="{ name: 'detection-platform' }" class="nav-link">返回检测平台</router-link>
        <router-link :to="{ name: 'highlights' }" class="nav-link">成果概览</router-link>
      </nav>
    </header>

    <state-block v-if="state === 'loading'" state="loading" />
    <state-block v-else-if="state === 'error'" state="error" @retry="loadInfo" />

    <template v-else>
      <section class="card">
        <h2>我们在做什么</h2>
        <p>
          ObserV6 是一个 IPv6 网络测量项目：通过主动探测，统计 IPv6 活跃地址、前缀和常见服务的分布，用于网络研究与安全观测。
        </p>
        <p v-if="info.purpose" class="purpose">{{ info.purpose }}</p>
        <ul>
          <li>默认拒绝：目标必须落在运营方事先登记并获得授权的网段内，否则任务无法创建。</li>
          <li>回环、组播、链路本地等特殊地址永远不会被探测。</li>
          <li>每个任务有速率上限，每个用户每天有任务数量上限；所有任务都有审计记录。</li>
        </ul>
      </section>

      <section class="card">
        <h2>探测来源</h2>
        <template v-if="info.sourceAddresses.length">
          <p>探测流量来自以下地址，你可以据此在日志中确认：</p>
          <p class="tags">
            <code v-for="addr in info.sourceAddresses" :key="addr" class="addr">{{ addr }}</code>
          </p>
        </template>
        <p v-else class="muted">运营方尚未公布探测来源地址。</p>
        <p v-if="info.organization">运营单位：{{ info.organization }}</p>
        <p>
          联系方式：
          <a v-if="info.contactEmail" :href="`mailto:${info.contactEmail}`">{{ info.contactEmail }}</a>
          <span v-else class="muted">尚未公布，请使用下方表单提交请求</span>
        </p>
      </section>

      <section class="card">
        <h2>请不要探测我的网段</h2>
        <p>
          提交后，这些网段会<strong>立即</strong>停止被探测——不需要等我们审核。管理员核实后会把它们永久加入禁止名单，
          并通过你填写的邮箱联系你；若核实不通过，暂停会被解除。
        </p>
        <p class="muted">
          一次最多 {{ info.limits.maxCidrs }} 个网段；通过本页提交的网段不能比 IPv6 /{{ info.limits.minPrefixV6 }}、IPv4 /{{ info.limits.minPrefixV4 }} 更大。
          更大的范围请直接邮件联系。
        </p>

        <form v-if="!done" class="form" novalidate @submit.prevent="submit">
          <label class="field">
            <span>要排除的 IP 地址或网段 <em>*</em></span>
            <textarea
              v-model="form.cidrs"
              rows="4"
              placeholder="每行一个，例如&#10;2001:db8:1::/48&#10;192.0.2.0/24"
              spellcheck="false"
              required
            ></textarea>
          </label>
          <label class="field">
            <span>联系邮箱 <em>*</em></span>
            <input v-model.trim="form.contact" type="email" maxlength="255" autocomplete="email" placeholder="noc@example.net" required />
            <small>仅用于确认请求，不会公开。</small>
          </label>
          <label class="field">
            <span>单位 / 网络名称</span>
            <input v-model.trim="form.organization" type="text" maxlength="120" />
          </label>
          <label class="field">
            <span>补充说明</span>
            <textarea v-model="form.note" rows="2" maxlength="500"></textarea>
          </label>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button type="submit" class="submit" :disabled="submitting || !canSubmit">
            {{ submitting ? '提交中…' : '提交退出请求' }}
          </button>
        </form>

        <div v-else class="done" role="status">
          <p>{{ doneMessage }}</p>
          <button type="button" class="link-btn" @click="reset">再提交一个</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/api'
import StateBlock from '@/components/common/StateBlock.vue'

const state = ref('loading')
const info = reactive({
  organization: null,
  contactEmail: null,
  sourceAddresses: [],
  purpose: null,
  limits: { maxCidrs: 10, minPrefixV4: 16, minPrefixV6: 32 }
})

const loadInfo = async () => {
  state.value = 'loading'
  try {
    const res = await api.optOut.getInfo()
    Object.assign(info, res.data)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

const form = reactive({ cidrs: '', contact: '', organization: '', note: '' })
const submitting = ref(false)
const error = ref('')
const done = ref(false)
const doneMessage = ref('')

const cidrList = computed(() => form.cidrs.split(/[\s,;]+/).filter(Boolean))
const canSubmit = computed(() => cidrList.value.length > 0 && form.contact.trim() !== '')

const submit = async () => {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await api.optOut.submit({
      cidrs: cidrList.value,
      contact: form.contact.trim(),
      organization: form.organization.trim() || undefined,
      note: form.note.trim() || undefined
    })
    doneMessage.value = res.message || '已收到你的请求。'
    done.value = true
  } catch (e) {
    error.value = e?.response?.data?.message || '提交失败，请稍后重试或直接邮件联系运营方'
  } finally {
    submitting.value = false
  }
}

const reset = () => {
  form.cidrs = ''
  form.note = ''
  done.value = false
  error.value = ''
}

onMounted(loadInfo)
</script>

<style scoped>
.about {
  min-height: 100vh;
  padding: 32px 16px 48px;
  color: #e6edf3;
  background: radial-gradient(1200px 600px at 20% -10%, #12324d 0%, #0b1a2b 55%, #08121d 100%);
  box-sizing: border-box;
}
.about > * { max-width: 860px; margin-left: auto; margin-right: auto; }

.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
.eyebrow { margin: 0 0 6px; color: #4fc3f7; font-size: 13px; letter-spacing: 0.08em; }
.hero h1 { margin: 0; font-size: 34px; font-weight: 700; }
.lead { margin: 8px 0 0; max-width: 620px; color: #9fb1c3; line-height: 1.6; }
.hero-nav { display: flex; gap: 8px; }
.nav-link {
  color: #e6edf3; text-decoration: none; font-size: 14px; padding: 6px 14px;
  border: 1px solid rgba(79, 195, 247, 0.5); border-radius: 4px; background: rgba(79, 195, 247, 0.12);
}
.nav-link:hover, .nav-link:focus-visible { background: rgba(79, 195, 247, 0.28); outline: none; }

.card {
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px;
  padding: 18px 20px; margin-bottom: 18px; line-height: 1.7;
}
.card h2 { margin: 0 0 8px; font-size: 18px; }
.card p { margin: 8px 0; }
.card ul { margin: 8px 0 0; padding-left: 20px; color: #c3d0dc; }
.card a { color: #4fc3f7; }
.muted { color: #8ba0b4; font-size: 14px; }
.purpose { color: #c3d0dc; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.addr {
  padding: 2px 8px; border-radius: 4px; background: rgba(79, 195, 247, 0.12);
  border: 1px solid rgba(79, 195, 247, 0.35); font-size: 14px; word-break: break-all;
}

.form { margin-top: 14px; display: grid; gap: 14px; }
.field { display: grid; gap: 6px; font-size: 14px; }
.field em { color: #ef9a9a; font-style: normal; }
.field small { color: #8ba0b4; }
.field input, .field textarea {
  width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; color: #e6edf3;
  background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 4px;
}
.field input:focus-visible, .field textarea:focus-visible { outline: 2px solid #4fc3f7; outline-offset: 1px; }
.field textarea { resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.form-error { margin: 0; color: #ef9a9a; font-size: 14px; }
.submit {
  justify-self: start; padding: 8px 20px; font: inherit; color: #08121d; font-weight: 600; cursor: pointer;
  background: #4fc3f7; border: none; border-radius: 4px;
}
.submit:disabled { opacity: 0.5; cursor: not-allowed; }
.submit:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.done { margin-top: 14px; padding: 12px 14px; border-radius: 6px; background: rgba(129, 199, 132, 0.12); border: 1px solid rgba(129, 199, 132, 0.4); }
.link-btn { background: none; border: none; color: #4fc3f7; cursor: pointer; text-decoration: underline; font-size: inherit; padding: 0; }

@media (max-width: 600px) {
  .hero h1 { font-size: 28px; }
}
</style>
