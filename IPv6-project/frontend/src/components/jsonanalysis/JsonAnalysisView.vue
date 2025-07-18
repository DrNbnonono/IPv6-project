<template>
  <div class="json-analysis-view">
    <div class="analysis-grid">
      <!-- 基本统计 -->
      <div class="analysis-card">
        <h3><i class="icon-stats"></i> 基本统计</h3>
        <div class="stats-list">
          <div class="stat-item">
            <span class="stat-label">总字段数:</span>
            <span class="stat-value">{{ analysis.totalFields }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最大深度:</span>
            <span class="stat-value">{{ analysis.maxDepth }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">字段路径数:</span>
            <span class="stat-value">{{ analysis.fieldPaths?.length || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 类型分布 -->
      <div class="analysis-card">
        <h3><i class="icon-types"></i> 数据类型分布</h3>
        <div class="type-distribution">
          <div 
            v-for="(count, type) in analysis.typeDistribution" 
            :key="type"
            class="type-item"
          >
            <div class="type-header">
              <span class="type-name" :class="`type-${type}`">{{ getTypeName(type) }}</span>
              <span class="type-count">{{ count }}</span>
            </div>
            <div class="type-bar">
              <div 
                class="type-progress" 
                :class="`type-${type}`"
                :style="{ width: getTypePercentage(count) + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 字段路径 -->
      <div class="analysis-card field-paths-card">
        <h3><i class="icon-paths"></i> 字段路径</h3>
        <div class="paths-controls">
          <input 
            v-model="pathFilter" 
            type="text" 
            placeholder="搜索字段路径..."
            class="path-search"
          >
          <span class="path-count">{{ filteredPaths.length }} / {{ analysis.fieldPaths?.length || 0 }}</span>
        </div>
        <div class="paths-list">
          <div 
            v-for="path in filteredPaths" 
            :key="path"
            class="path-item"
            @click="copyPath(path)"
            :title="'点击复制: ' + path"
          >
            <code class="path-code">{{ path }}</code>
            <i class="icon-copy"></i>
          </div>
        </div>
      </div>

      <!-- 结构预览 -->
      <div class="analysis-card structure-card">
        <h3><i class="icon-structure"></i> 结构预览</h3>
        <div class="structure-tree">
          <StructureNode 
            :data="data" 
            :path="'root'" 
            :level="0"
            :maxLevel="3"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps } from 'vue'
import { ElMessage } from 'element-plus'
import StructureNode from './StructureNode.vue'

const props = defineProps({
  analysis: {
    type: Object,
    required: true
  },
  data: {
    type: [Object, Array],
    required: true
  }
})

const pathFilter = ref('')

const filteredPaths = computed(() => {
  if (!props.analysis.fieldPaths) return []
  if (!pathFilter.value) return props.analysis.fieldPaths
  
  const filter = pathFilter.value.toLowerCase()
  return props.analysis.fieldPaths.filter(path => 
    path.toLowerCase().includes(filter)
  )
})

const totalTypeCount = computed(() => {
  return Object.values(props.analysis.typeDistribution || {}).reduce((sum, count) => sum + count, 0)
})

const getTypeName = (type) => {
  const typeNames = {
    'string': '字符串',
    'number': '数字',
    'boolean': '布尔值',
    'object': '对象',
    'array': '数组',
    'null': '空值'
  }
  return typeNames[type] || type
}

const getTypePercentage = (count) => {
  if (totalTypeCount.value === 0) return 0
  return Math.round((count / totalTypeCount.value) * 100)
}

const copyPath = async (path) => {
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success('路径已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped lang="scss">
.json-analysis-view {
  .analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }
  
  .analysis-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.5rem;
    
    h3 {
      margin: 0 0 1rem;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.1rem;
    }
    
    &.field-paths-card,
    &.structure-card {
      grid-column: span 2;
      
      @media (max-width: 768px) {
        grid-column: span 1;
      }
    }
  }
  
  .stats-list {
    .stat-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f1f5f9;
      
      &:last-child {
        border-bottom: none;
      }
      
      .stat-label {
        color: #64748b;
      }
      
      .stat-value {
        font-weight: 600;
        color: #2c3e50;
        font-size: 1.1rem;
      }
    }
  }
  
  .type-distribution {
    .type-item {
      margin-bottom: 1rem;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
    
    .type-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      
      .type-name {
        font-weight: 500;
        
        &.type-string { color: #059669; }
        &.type-number { color: #dc2626; }
        &.type-boolean { color: #7c3aed; }
        &.type-object { color: #2563eb; }
        &.type-array { color: #ea580c; }
        &.type-null { color: #6b7280; }
      }
      
      .type-count {
        font-weight: 600;
        color: #4a5568;
      }
    }
    
    .type-bar {
      height: 8px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
      
      .type-progress {
        height: 100%;
        transition: width 0.3s ease;
        
        &.type-string { background: #059669; }
        &.type-number { background: #dc2626; }
        &.type-boolean { background: #7c3aed; }
        &.type-object { background: #2563eb; }
        &.type-array { background: #ea580c; }
        &.type-null { background: #6b7280; }
      }
    }
  }
  
  .paths-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
    
    .path-search {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.9rem;
      
      &:focus {
        outline: none;
        border-color: #4299e1;
      }
    }
    
    .path-count {
      color: #7f8c8d;
      font-size: 0.9rem;
      white-space: nowrap;
    }
  }
  
  .paths-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    
    .path-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: background-color 0.2s ease;
      
      &:hover {
        background-color: #f8fafc;
      }
      
      &:last-child {
        border-bottom: none;
      }
      
      .path-code {
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        color: #2563eb;
        background: #f1f5f9;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
      }
      
      .icon-copy {
        opacity: 0;
        transition: opacity 0.2s ease;
        color: #64748b;
      }
      
      &:hover .icon-copy {
        opacity: 1;
      }
    }
  }
  
  .structure-tree {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 1rem;
    background: #f8fafc;
  }
}

// 图标
.icon-stats:before { content: "📊"; }
.icon-types:before { content: "🏷️"; }
.icon-paths:before { content: "🛤️"; }
.icon-structure:before { content: "🏗️"; }
.icon-copy:before { content: "📋"; }
</style>
