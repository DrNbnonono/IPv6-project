<template>
  <div class="whitelist-select">
    <div class="select-wrapper">
      <select v-model="selectedFile" @change="handleSelect" class="form-select">
        <option value="">不使用白名单</option>
        <option 
          v-for="file in whitelistFiles" 
          :key="file.id" 
          :value="file.file_name"
        >
          {{ file.file_name }} ({{ formatDate(file.uploaded_at) }})
        </option>
      </select>
      <i class="icon icon-chevron-down"></i>
    </div>
    
    <div class="upload-wrapper">
      <label class="upload-btn">
        <input 
          type="file" 
          @change="handleFileChange" 
          accept=".txt"
          class="file-input"
        />
        <i class="icon icon-upload"></i> 上传白名单
      </label>
      <span v-if="uploading" class="upload-status">
        <i class="icon icon-loading"></i> 上传中...
      </span>
    </div>

    <!-- 错误信息显示 -->
    <div v-if="errorMessage" class="error-message">
      <i class="icon icon-error"></i> {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useXmapStore } from '@/stores/xmap'

const xmapStore = useXmapStore()
const selectedFile = ref('')
const uploading = ref(false)
const errorMessage = ref('')
const whitelistFiles = ref([])

const emit = defineEmits(['update:modelValue', 'upload'])

// 初始化加载白名单列表
onMounted(async () => {
  try {
    await xmapStore.fetchWhitelists()
    whitelistFiles.value = xmapStore.whitelists
  } catch (error) {
    errorMessage.value = '获取白名单列表失败: ' + (error.message || '未知错误')
  }
})

const handleSelect = () => {
  emit('update:modelValue', selectedFile.value)
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 验证文件类型
  if (!file.name.endsWith('.txt')) {
    errorMessage.value = '请上传.txt格式的白名单文件'
    return
  }
  
  // 验证文件大小 (限制5MB)
  if (file.size > 5 * 1024 * 1024) {
    errorMessage.value = '文件大小不能超过5MB'
    return
  }

  uploading.value = true
  errorMessage.value = ''
  
  const formData = new FormData()
  formData.append('file', file) // 使用相同的字段名'file'
  formData.append('tool', 'xmap') // 明确指定工具
  formData.append('description', 'XMap扫描白名单') // 添加默认描述
  try {
    await xmapStore.uploadWhitelist(formData)
    await xmapStore.fetchWhitelists()
    selectedFile.value = file.name
    emit('update:modelValue', file.name)
    emit('upload', file.name)
  } catch (error) {
    errorMessage.value = '上传失败: ' + (error.response?.data?.message || error.message || '未知错误')
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

// 格式化日期显示
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}
</script>

<style scoped lang="scss">
.whitelist-select {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.select-wrapper {
  position: relative;
  
  .icon-chevron-down {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: #718096;
  }
}

.form-select {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  appearance: none;
  background-color: #fff;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
  }
}

.upload-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.upload-btn {
  padding: 0.7rem 1.2rem;
  background-color: #f7fafc;
  border: 1px dashed #cbd5e0;
  border-radius: 8px;
  color: #4a5568;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #edf2f7;
    border-color: #a0aec0;
  }
  
  .file-input {
    display: none;
  }
}

.upload-status {
  color: #718096;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.error-message {
  padding: 0.8rem;
  background-color: #fff5f5;
  color: #f56565;
  border-radius: 8px;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  animation: fadeIn 0.3s ease;
}

/* 图标样式 */
.icon {
  font-style: normal;
  
  &-chevron-down:before { content: "⌄"; }
  &-upload:before { content: "⬆️"; }
  &-loading {
    display: inline-block;
    animation: spin 1s linear infinite;
    
    &:before { content: "🔄"; }
  }
  &-error:before { content: "❌"; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>