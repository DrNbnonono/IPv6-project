<template>
  <div class="zgrab2-help">
    <div class="help-header">
      <h2>{{ t('zgrab2Help.title') }}</h2>
      <div class="header-actions">
        <select v-model="currentLang" @change="changeLanguage" class="lang-select">
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <button v-if="isAdmin" @click="editMode = !editMode" class="btn btn-edit">
          {{ editMode ? t('common.save') : t('common.edit') }}
        </button>
      </div>
    </div>

    <div class="help-container">
      <!-- 左侧导航 -->
      <div class="help-sidebar">
        <div 
          v-for="item in toc" 
          :key="item.id"
          :class="['toc-item', { active: currentDoc === item.id }]"
          @click="item.id && loadDoc(item.id)"
        >
          {{ item.title }}
        </div>
        
        <!-- 多级目录渲染 -->
        <template v-for="section in toc.filter(item => item.children)" :key="'section-'+section.title">
          <div class="toc-section">
            <div class="toc-section-title">
              {{ section.title }}
            </div>
            <div 
              v-for="child in section.children"
              :key="child.id"
              :class="['toc-child-item', { active: currentDoc === child.id }]"
              @click="loadDoc(child.id)"
            >
              {{ child.title }}
            </div>
          </div>
        </template>
      </div>

      <!-- 右侧内容 -->
      <div class="help-content">
        <div v-if="isLoading" class="loading-message">
          <i class="loading-icon"></i>
          {{ t('zgrab2Help.loading') }}
        </div>
        
        <template v-else>
          <div v-if="editMode" class="editor-container">
            <textarea v-model="currentDocContent" class="markdown-editor"></textarea>
            <div class="editor-actions">
              <button @click="saveDoc" class="btn btn-save">
                {{ t('common.save') }}
              </button>
              <button @click="editMode = false" class="btn btn-cancel">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
          <div v-else class="markdown-content" v-html="compiledMarkdown"></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')

// 文档状态
const currentLang = ref('en')
const currentDoc = ref('Home')
const currentDocContent = ref('')
const editMode = ref(false)
const toc = ref([])
const isLoading = ref(false)

// 计算属性：编译Markdown为HTML
const compiledMarkdown = computed(() => {
  return marked(currentDocContent.value)
})

// 从后端获取文档目录结构
const fetchToc = async () => {
  try {
    const response = await fetch(`/api/docs/zgrab2/${currentLang.value}/toc`)
    const data = await response.json()
    
    if (data.success) {
      toc.value = data.toc
    } else {
      console.error('获取目录失败:', data.message)
      // 使用默认目录结构作为fallback
      toc.value = getDefaultToc()
    }
  } catch (error) {
    console.error('获取目录失败:', error)
    toc.value = getDefaultToc()
  }
}

// 默认目录结构 (当API不可用时使用)
const getDefaultToc = () => {
  return [
    { id: 'Home', title: t('Home') },
    { id: 'BaseFlags', title: t('Base Flags') },
    { id: 'TLSFlags', title: t('TLS Flags') },
    { 
      title: t('Protocols'),
      children: [
        { id: 'FTP', title: 'FTP' },
        { id: 'HTTP', title: 'HTTP' },
        { id: 'MSSQL', title: 'MSSQL' },
        { id: 'MySQL', title: 'MySQL' }
      ]
    },
    { 
      title: t('Development'),
      children: [
        { id: 'Performance-Tuning', title: t('Performance Tuning') },
        { id: 'Adding-new-modules', title: t('Adding New Modules') },
        { id: 'Scanner-details', title: t('Scanner Details') },
        { id: 'Integration-test-details', title: t('Integration Test Details') },
        { id: 'Schema-details', title: t('Schema Details') }
      ]
    }
  ]
}

// 加载文档内容
const loadDoc = async (docId) => {
  currentDoc.value = docId
  isLoading.value = true
  
  try {
    const response = await fetch(`/api/docs/zgrab2/${currentLang.value}/${docId}`)
    const data = await response.json()
    
    if (data.success) {
      currentDocContent.value = data.content
    } else {
      console.error('加载文档失败:', data.message)
      currentDocContent.value = `# ${docId}\n\n${t('zgrab2Help.loadError')}`
    }
  } catch (error) {
    console.error('加载文档失败:', error)
    currentDocContent.value = `# ${docId}\n\n${t('zgrab2Help.loadError')}`
  } finally {
    isLoading.value = false
  }
}

// 保存文档
const saveDoc = async () => {
  if (!isAdmin.value) return
  
  try {
    const response = await fetch(`/api/docs/zgrab2/${currentLang.value}/${currentDoc.value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        content: currentDocContent.value
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      editMode.value = false
      alert(t('common.saveSuccess'))
    } else {
      throw new Error(data.message)
    }
  } catch (error) {
    console.error('保存失败:', error)
    alert(`${t('common.saveFailed')}: ${error.message}`)
  }
}

// 切换语言
const changeLanguage = async () => {
  await fetchToc()
  loadDoc(currentDoc.value)
}

// 初始化
onMounted(async () => {
  try {
    await fetchToc()
    await loadDoc('Home')
  } catch (error) {
    console.error('初始化ZGrab2帮助组件失败:', error)
    // 设置默认内容
    toc.value = getDefaultToc()
    currentDocContent.value = `# Home\n\nZGrab2 is an application-level scanner.\n\nZGrab2 是一个应用层扫描器。`
  }
})
</script>

<style scoped lang="scss">
.zgrab2-help {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background-color: #f8f9fa;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background-color: #35495e;
  color: white;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  
  h2 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 500;
  }
  
  .header-actions {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    
    .lang-select {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      border: none;
      background-color: #ffffff20;
      color: white;
      font-size: 1rem;
      cursor: pointer;
      
      &:hover {
        background-color: #ffffff30;
      }
    }
  }
}

.help-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.help-sidebar {
  width: 280px;
  padding: 1.5rem 0;
  background-color: #2c3e50;
  color: #ecf0f1;
  overflow-y: auto;
  font-size: 1.05rem;
  
  .toc-item {
    padding: 0.8rem 1.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    
    &:hover {
      background-color: #34495e;
    }
    
    &.active {
      background-color: #42b983;
      color: white;
    }
  }
  
  .toc-section {
    margin-top: 1rem;
    
    .toc-section-title {
      padding: 0.8rem 1.5rem;
      font-weight: 600;
      color: #bdc3c7;
      background-color: #34495e;
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: default;
    }
    
    .toc-child-item {
      padding: 0.7rem 1.5rem 0.7rem 2.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.95rem;
      
      &:hover {
        background-color: #3d566e;
      }
      
      &.active {
        background-color: #3aafa9;
        color: white;
      }
    }
  }
}

.help-content {
  flex: 1;
  padding: 2rem 3rem;
  overflow-y: auto;
  background-color: white;
}

.loading-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 1.2rem;
  color: #7f8c8d;
  
  .loading-icon {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top-color: #42b983;
    animation: spin 1s ease-in-out infinite;
    margin-right: 10px;
  }
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  
  .markdown-editor {
    flex: 1;
    width: 100%;
    padding: 1.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 1rem;
    line-height: 1.6;
    resize: none;
    margin-bottom: 1rem;
    
    &:focus {
      outline: none;
      border-color: #42b983;
      box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.2);
    }
  }
  
  .editor-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }
}

.markdown-content {
  font-size: 1.1rem;
  line-height: 1.8;
  color: #333;
  
  :deep(h1) {
    font-size: 2.2rem;
    margin: 2rem 0 1.5rem;
    color: #2c3e50;
    font-weight: 600;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
  }
  
  :deep(h2) {
    font-size: 1.8rem;
    margin: 1.8rem 0 1.2rem;
    color: #2c3e50;
    font-weight: 500;
  }
  
  :deep(h3) {
    font-size: 1.5rem;
    margin: 1.5rem 0 1rem;
    color: #2c3e50;
    font-weight: 500;
  }
  
  :deep(p) {
    margin-bottom: 1.2rem;
  }
  
  :deep(pre) {
    background-color: #f8f9fa;
    padding: 1.2rem;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1.5rem 0;
    border-left: 4px solid #42b983;
  }
  
  :deep(code) {
    font-family: 'Consolas', 'Monaco', monospace;
    background-color: #f8f9fa;
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-size: 0.95rem;
  }
  
  :deep(blockquote) {
    border-left: 4px solid #42b983;
    padding-left: 1rem;
    margin: 1.5rem 0;
    color: #7f8c8d;
    font-style: italic;
  }
  
  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    
    th, td {
      padding: 0.8rem 1rem;
      border: 1px solid #ddd;
      text-align: left;
    }
    
    th {
      background-color: #f8f9fa;
      font-weight: 500;
    }
    
    tr:nth-child(even) {
      background-color: #f8f9fa;
    }
  }
}

.btn {
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &-edit {
    background-color: #f39c12;
    color: white;
    
    &:hover {
      background-color: #e67e22;
    }
  }
  
  &-save {
    background-color: #2ecc71;
    color: white;
    
    &:hover {
      background-color: #27ae60;
    }
  }
  
  &-cancel {
    background-color: #e74c3c;
    color: white;
    
    &:hover {
      background-color: #c0392b;
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>