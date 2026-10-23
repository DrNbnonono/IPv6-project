<template>
  <div class="preset-panel">
    <h3 class="section-title">扫描预设</h3>
    <p class="hint">
      预设是一组“模块 + 端口”的套件。套用后会生成一个多模块（multiple）配置文件，并自动切换到多模块扫描、选中该文件；
      扫描目标仍由输入文件决定，并照常经过扫描策略检查。
    </p>

    <div v-if="error" class="panel-error">{{ error }}</div>

    <div class="preset-row">
      <select v-model="selectedId" class="form-select preset-select" aria-label="选择预设">
        <option :value="null">请选择预设</option>
        <option v-for="preset in zgrab2Store.presets" :key="preset.id" :value="preset.id">
          {{ preset.name }}{{ preset.builtin ? '（内置）' : '' }}
        </option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!selected || applying" @click="apply">
        {{ applying ? '正在生成…' : '套用' }}
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="openManager">管理预设</button>
    </div>

    <div v-if="selected" class="preset-detail">
      <span v-if="selected.description" class="desc">{{ selected.description }}</span>
      <span v-for="entry in selected.entries" :key="entry.module + ':' + entry.port" class="chip">{{ entry.module }}:{{ entry.port }}</span>
    </div>

    <!-- 管理对话框 -->
    <div v-if="showManager" class="modal-overlay" @click="showManager = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>管理扫描预设</h3>
          <button type="button" class="btn-close" aria-label="关闭" @click="showManager = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="managerError" class="panel-error">{{ managerError }}</div>

          <table class="preset-table">
            <thead><tr><th>名称</th><th>内容</th><th></th></tr></thead>
            <tbody>
              <tr v-for="preset in zgrab2Store.presets" :key="preset.id">
                <td>{{ preset.name }}<span v-if="preset.builtin" class="badge">内置</span></td>
                <td>
                  <span v-for="entry in preset.entries" :key="entry.module + ':' + entry.port" class="chip">{{ entry.module }}:{{ entry.port }}</span>
                </td>
                <td>
                  <button v-if="!preset.builtin" type="button" class="btn btn-danger btn-sm" @click="remove(preset)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>

          <h4 class="sub-title">保存我的预设</h4>
          <div class="form-group">
            <label for="presetName">名称</label>
            <input id="presetName" v-model="draft.name" type="text" maxlength="64" class="form-input" placeholder="例如：内网 Web 巡检" />
          </div>
          <div class="form-group">
            <label for="presetDesc">描述（可选）</label>
            <input id="presetDesc" v-model="draft.description" type="text" maxlength="255" class="form-input" />
          </div>
          <div v-for="(entry, index) in draft.entries" :key="index" class="entry-row">
            <select v-model="entry.module" class="form-select" :aria-label="`第 ${index + 1} 项模块`" @change="entry.port = defaultPort(entry.module)">
              <option value="">选择模块</option>
              <option v-for="m in modules" :key="m.module" :value="m.module">{{ m.module }} - {{ m.description }}</option>
            </select>
            <input v-model.number="entry.port" type="number" min="1" max="65535" class="form-input port-input" :aria-label="`第 ${index + 1} 项端口`" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="draft.entries.length === 1" @click="draft.entries.splice(index, 1)">移除</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="draft.entries.length >= 20" @click="addEntry">添加一项</button>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showManager = false">关闭</button>
          <button type="button" class="btn btn-primary" :disabled="!canSave || saving" @click="save">{{ saving ? '保存中…' : '保存预设' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useZgrab2Store } from '@/stores/zgrab2'

const props = defineProps({
  // 支持的模块列表：[{ module, description, defaultPort }]
  modules: { type: Array, default: () => [] }
})
const emit = defineEmits(['applied'])

const zgrab2Store = useZgrab2Store()
const selectedId = ref(null)
const applying = ref(false)
const saving = ref(false)
const showManager = ref(false)
const error = ref('')
const managerError = ref('')
const draft = ref({ name: '', description: '', entries: [{ module: '', port: '' }] })

const selected = computed(() => zgrab2Store.presets.find((p) => p.id === selectedId.value) || null)
const canSave = computed(() => draft.value.name.trim() && draft.value.entries.every((e) => e.module && e.port))

const defaultPort = (module) => props.modules.find((m) => m.module === module)?.defaultPort || ''
const addEntry = () => draft.value.entries.push({ module: '', port: '' })

const load = async () => {
  try {
    await zgrab2Store.fetchPresets()
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}

const apply = async () => {
  if (!selected.value) return
  applying.value = true
  error.value = ''
  try {
    const result = await zgrab2Store.applyPreset(selected.value.id)
    emit('applied', { fileName: result.fileName, name: result.name })
  } catch (e) {
    error.value = e.message
  } finally {
    applying.value = false
  }
}

const openManager = () => {
  managerError.value = ''
  showManager.value = true
}

const remove = async (preset) => {
  if (!confirm(`确定要删除预设 "${preset.name}" 吗？`)) return
  managerError.value = ''
  try {
    await zgrab2Store.deletePreset(preset.id)
    if (selectedId.value === preset.id) selectedId.value = null
  } catch (e) {
    managerError.value = e.message
  }
}

const save = async () => {
  saving.value = true
  managerError.value = ''
  try {
    const created = await zgrab2Store.createPreset({
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || undefined,
      entries: draft.value.entries.map((e) => ({ module: e.module, port: Number(e.port) }))
    })
    selectedId.value = created.id
    draft.value = { name: '', description: '', entries: [{ module: '', port: '' }] }
  } catch (e) {
    managerError.value = e.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* 父表单的样式是组件私有的，这里自带一份最小的通用样式 */
.section-title { margin: 0 0 4px; font-size: 1.05em; font-weight: 600; }
.form-input, .form-select { width: 100%; padding: 8px 12px; font-size: 0.9em; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; box-sizing: border-box; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; margin-bottom: 4px; font-size: 0.9em; color: #444; }
.btn { display: inline-flex; align-items: center; font-weight: 500; border: 1px solid transparent; padding: 0.5rem 1rem; font-size: 0.95rem; border-radius: 6px; cursor: pointer; }
.btn-sm { padding: 0.3rem 0.7rem; font-size: 0.85rem; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { color: #fff; background: #3b82f6; border-color: #3b82f6; }
.btn-secondary { color: #fff; background: #6c757d; border-color: #6c757d; }
.btn-danger { color: #fff; background: #dc3545; border-color: #dc3545; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #fff; border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); max-width: 720px; width: 92%; max-height: 82vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; font-size: 1.1em; }
.btn-close { background: none; border: 0; font-size: 1.5em; cursor: pointer; line-height: 1; }
.modal-body { padding: 16px 20px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid #eee; }
.preset-panel { margin-bottom: 8px; }
.hint { color: #888; font-size: 12px; line-height: 1.6; margin: 4px 0 12px; }
.panel-error { background: #fef0f0; color: #c45656; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; font-size: 13px; }
.preset-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.preset-select { min-width: 260px; flex: 0 1 360px; }
.preset-detail { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.desc { color: #666; font-size: 13px; margin-right: 4px; }
.chip { display: inline-block; background: #eef3fb; color: #345; border-radius: 10px; padding: 1px 9px; font-size: 12px; }
.badge { margin-left: 6px; font-size: 11px; color: #67c23a; border: 1px solid #b3e19d; border-radius: 3px; padding: 0 4px; }
.preset-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 13px; }
.preset-table th, .preset-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
.preset-table .chip { margin: 0 4px 4px 0; }
.sub-title { margin: 16px 0 8px; font-size: 14px; }
.entry-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.entry-row .form-select { flex: 1; }
.port-input { width: 110px; flex: none; }
</style>
