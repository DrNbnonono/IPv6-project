<template>
    <div class="xmap-help">
      <div class="help-header">
        <h2>{{ t('xmapHelp.title') }}</h2>
        <div class="header-actions">
          <select v-model="currentLang" @change="changeLanguage">
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
            @click="loadDoc(item.id)"
          >
            {{ item.title }}
          </div>
          
          <!-- 多级目录渲染 -->
          <template v-for="section in toc" :key="'section-'+section.id">
            <div 
              v-if="section.children"
              class="toc-section"
            >
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
            {{ t('xmapHelp.loading') }}
          </div>
          
          <template v-else>
            <div v-if="editMode" class="editor-container">
              <textarea v-model="currentDocContent" class="markdown-editor"></textarea>
              <button @click="saveDoc" class="btn btn-save">
                {{ t('common.save') }}
              </button>
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
  const currentDoc = ref('home')
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
      const response = await fetch(`/api/docs/${currentLang.value}/toc`)
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
      { id: 'home', title: t('xmapHelp.toc.home') },
      { id: 'getting-started', title: t('xmapHelp.toc.gettingStarted') },
      { id: 'virtual-machine', title: t('xmapHelp.toc.virtualMachine') },
      { id: 'best-practices', title: t('xmapHelp.toc.bestPractices') },
      { id: 'installation', title: t('xmapHelp.toc.installation') },
      { 
        id: 'global-options', 
        title: t('xmapHelp.toc.globalOptions'),
        children: [
          { id: 'basic-args', title: t('xmapHelp.toc.basicArgs') },
          { id: 'scan-options', title: t('xmapHelp.toc.scanOptions') },
          { id: 'network-options', title: t('xmapHelp.toc.networkOptions') }
        ]
      }
    ]
  }
  
  // 加载文档内容
  const loadDoc = async (docId) => {
    currentDoc.value = docId
    isLoading.value = true
    
    try {
      const response = await fetch(`/api/docs/${currentLang.value}/${docId}`)
      const data = await response.json()
      
      if (data.success) {
        currentDocContent.value = data.content
      } else {
        console.error('加载文档失败:', data.message)
        currentDocContent.value = `# ${docId}\n\n${t('xmapHelp.loadError')}`
      }
    } catch (error) {
      console.error('加载文档失败:', error)
      currentDocContent.value = `# ${docId}\n\n${t('xmapHelp.loadError')}`
    } finally {
      isLoading.value = false
    }
  }
  
  // 保存文档
  const saveDoc = async () => {
    if (!isAdmin.value) return
    
    try {
      const response = await fetch(`/api/docs/${currentLang.value}/${currentDoc.value}`, {
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
    await fetchToc()
    loadDoc('home')
  })
  </script>
  
  <style scoped lang="scss">
  .xmap-help {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #eee;
    
    h2 {
      margin: 0;
    }
    
    .header-actions {
      display: flex;
      gap: 1rem;
      
      select {
        padding: 0.5rem;
        border-radius: 4px;
      }
    }
  }
  
  .help-container {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .help-sidebar {
    width: 250px;
    padding: 1rem;
    border-right: 1px solid #eee;
    overflow-y: auto;
    
    .toc-item, .toc-child-item {
      padding: 0.5rem;
      cursor: pointer;
      border-radius: 4px;
      
      &:hover {
        background-color: #f5f5f5;
      }
      
      &.active {
        background-color: #e3f2fd;
        font-weight: bold;
      }
    }
    
    .toc-section {
      margin-top: 1rem;
      
      .toc-section-title {
        padding: 0.5rem;
        font-weight: bold;
        color: #666;
      }
      
      .toc-child-item {
        padding-left: 1.5rem;
      }
    }
  }
  
  .help-content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }
  
  .loading-message {
    padding: 2rem;
    text-align: center;
    color: #666;
  }
  
  .markdown-editor {
    width: 100%;
    height: 500px;
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
  }
  
  .markdown-content {
    line-height: 1.6;
    
    :deep(h1), :deep(h2), :deep(h3) {
      margin-top: 1.5rem;
      margin-bottom: 1rem;
    }
    
    :deep(pre) {
      background-color: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    
    :deep(code) {
      font-family: monospace;
      background-color: #f5f5f5;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
    }
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    
    &-edit {
      background-color: #ffc107;
      color: #333;
      
      &:hover {
        background-color: #ffb300;
      }
    }
    
    &-save {
      background-color: #4caf50;
      color: white;
      margin-top: 1rem;
      
      &:hover {
        background-color: #43a047;
      }
    }
  }
  </style>