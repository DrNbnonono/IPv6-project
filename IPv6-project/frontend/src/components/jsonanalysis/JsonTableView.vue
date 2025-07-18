<template>
  <div class="json-table-view">
    <div class="table-controls">
      <div class="path-selector">
        <label>选择数组路径:</label>
        <select v-model="selectedPath" @change="updateTable">
          <option value="">根级别</option>
          <option v-for="path in arrayPaths" :key="path" :value="path">
            {{ path }}
          </option>
        </select>
      </div>
      <div class="table-info">
        <span v-if="tableData.length > 0">
          显示 {{ tableData.length }} 条记录
        </span>
      </div>
    </div>

    <div class="table-container" v-if="tableData.length > 0">
      <table class="json-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in tableData" :key="index">
            <td v-for="column in columns" :key="column">
              <span class="cell-value" :class="getCellClass(row[column])">
                {{ formatCellValue(row[column]) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="empty-state" v-else>
      <i class="icon-table"></i>
      <h3>无法显示表格</h3>
      <p>当前数据不包含数组结构，或选择的路径不是数组</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineProps } from 'vue'

const props = defineProps({
  data: {
    type: [Object, Array],
    required: true
  }
})

const selectedPath = ref('')
const arrayPaths = ref([])
const tableData = ref([])
const columns = ref([])

// 查找所有数组路径
const findArrayPaths = (obj, path = '') => {
  const paths = []
  
  function traverse(data, currentPath) {
    if (Array.isArray(data)) {
      paths.push(currentPath || 'root')
    } else if (data && typeof data === 'object') {
      for (const key in data) {
        const newPath = currentPath ? `${currentPath}.${key}` : key
        traverse(data[key], newPath)
      }
    }
  }
  
  traverse(obj, path)
  return paths
}

// 根据路径获取数据
const getDataByPath = (data, path) => {
  if (!path || path === 'root') return data
  
  const keys = path.split('.')
  let current = data
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key]
    } else {
      return null
    }
  }
  
  return current
}

// 提取表格列
const extractColumns = (arrayData) => {
  if (!Array.isArray(arrayData) || arrayData.length === 0) return []
  
  const columnSet = new Set()
  
  arrayData.forEach(item => {
    if (item && typeof item === 'object') {
      Object.keys(item).forEach(key => columnSet.add(key))
    }
  })
  
  return Array.from(columnSet)
}

// 更新表格数据
const updateTable = () => {
  const targetData = getDataByPath(props.data, selectedPath.value)
  
  if (Array.isArray(targetData)) {
    columns.value = extractColumns(targetData)
    tableData.value = targetData.map(item => {
      const row = {}
      columns.value.forEach(col => {
        row[col] = item && typeof item === 'object' ? item[col] : undefined
      })
      return row
    })
  } else {
    columns.value = []
    tableData.value = []
  }
}

// 格式化单元格值
const formatCellValue = (value) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// 获取单元格样式类
const getCellClass = (value) => {
  if (value === null) return 'cell-null'
  if (value === undefined) return 'cell-undefined'
  if (typeof value === 'string') return 'cell-string'
  if (typeof value === 'number') return 'cell-number'
  if (typeof value === 'boolean') return 'cell-boolean'
  if (typeof value === 'object') return 'cell-object'
  return ''
}

onMounted(() => {
  arrayPaths.value = findArrayPaths(props.data)
  
  // 默认选择第一个数组路径
  if (arrayPaths.value.length > 0) {
    selectedPath.value = arrayPaths.value[0]
  } else if (Array.isArray(props.data)) {
    selectedPath.value = ''
  }
  
  updateTable()
})
</script>

<style scoped lang="scss">
.json-table-view {
  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 6px;
    
    .path-selector {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      
      label {
        font-weight: 500;
        color: #4a5568;
      }
      
      select {
        padding: 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.9rem;
        
        &:focus {
          outline: none;
          border-color: #4299e1;
        }
      }
    }
    
    .table-info {
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }
  
  .table-container {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  
  .json-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    
    th {
      background: #f8fafc;
      padding: 0.75rem;
      text-align: left;
      font-weight: 500;
      color: #4a5568;
      border-bottom: 1px solid #e2e8f0;
      position: sticky;
      top: 0;
    }
    
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }
    
    tr:hover {
      background-color: #f8fafc;
    }
  }
  
  .cell-value {
    &.cell-string {
      color: #059669;
    }
    
    &.cell-number {
      color: #dc2626;
      font-family: monospace;
    }
    
    &.cell-boolean {
      color: #7c3aed;
      font-weight: 500;
    }
    
    &.cell-null,
    &.cell-undefined {
      color: #6b7280;
      font-style: italic;
    }
    
    &.cell-object {
      color: #4338ca;
      font-family: monospace;
      font-size: 0.8rem;
    }
  }
  
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #a0aec0;
    
    i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    
    h3 {
      margin: 0 0 0.5rem;
      color: #4a5568;
    }
    
    p {
      margin: 0;
    }
  }
}

.icon-table:before { content: "📊"; }
</style>
