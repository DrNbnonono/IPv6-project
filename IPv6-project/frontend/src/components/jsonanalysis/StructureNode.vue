<template>
  <div class="structure-node" :style="{ marginLeft: level * 15 + 'px' }">
    <div class="node-line">
      <span class="node-key">{{ displayKey }}</span>
      <span class="node-type" :class="`type-${nodeType}`">{{ nodeType }}</span>
      <span class="node-info" v-if="nodeInfo">{{ nodeInfo }}</span>
    </div>
    
    <div v-if="shouldShowChildren" class="node-children">
      <StructureNode
        v-for="(value, key) in limitedChildren"
        :key="key"
        :data="value"
        :path="childPath(key)"
        :level="level + 1"
        :nodeKey="key"
        :maxLevel="maxLevel"
      />
      <div v-if="hasMoreChildren" class="more-indicator">
        ... 还有 {{ remainingChildrenCount }} 个字段
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue'

const props = defineProps({
  data: {
    type: [Object, Array, String, Number, Boolean],
    required: true
  },
  path: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    default: 0
  },
  nodeKey: {
    type: [String, Number],
    default: ''
  },
  maxLevel: {
    type: Number,
    default: 3
  }
})

const nodeType = computed(() => {
  if (props.data === null) return 'null'
  if (Array.isArray(props.data)) return 'array'
  return typeof props.data
})

const displayKey = computed(() => {
  if (props.path === 'root') return 'root'
  return props.nodeKey
})

const nodeInfo = computed(() => {
  if (props.data === null) return null
  if (Array.isArray(props.data)) return `[${props.data.length}]`
  if (typeof props.data === 'object') return `{${Object.keys(props.data).length}}`
  return null
})

const shouldShowChildren = computed(() => {
  return props.level < props.maxLevel && 
         typeof props.data === 'object' && 
         props.data !== null
})

const limitedChildren = computed(() => {
  if (!shouldShowChildren.value) return {}
  
  const maxChildren = 5
  if (Array.isArray(props.data)) {
    return props.data.slice(0, maxChildren).reduce((acc, item, index) => {
      acc[index] = item
      return acc
    }, {})
  } else {
    const keys = Object.keys(props.data).slice(0, maxChildren)
    return keys.reduce((acc, key) => {
      acc[key] = props.data[key]
      return acc
    }, {})
  }
})

const hasMoreChildren = computed(() => {
  if (!shouldShowChildren.value) return false
  
  const maxChildren = 5
  if (Array.isArray(props.data)) {
    return props.data.length > maxChildren
  } else {
    return Object.keys(props.data).length > maxChildren
  }
})

const remainingChildrenCount = computed(() => {
  if (!hasMoreChildren.value) return 0
  
  const maxChildren = 5
  if (Array.isArray(props.data)) {
    return props.data.length - maxChildren
  } else {
    return Object.keys(props.data).length - maxChildren
  }
})

const childPath = (key) => {
  if (props.path === 'root') return key.toString()
  if (Array.isArray(props.data)) return `${props.path}[${key}]`
  return `${props.path}.${key}`
}
</script>

<style scoped lang="scss">
.structure-node {
  .node-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.1rem 0;
    
    .node-key {
      font-weight: 500;
      color: #2563eb;
    }
    
    .node-type {
      font-size: 0.8rem;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      font-weight: 500;
      
      &.type-string { 
        background: #dcfce7; 
        color: #166534; 
      }
      &.type-number { 
        background: #fee2e2; 
        color: #991b1b; 
      }
      &.type-boolean { 
        background: #f3e8ff; 
        color: #6b21a8; 
      }
      &.type-object { 
        background: #dbeafe; 
        color: #1e40af; 
      }
      &.type-array { 
        background: #fed7aa; 
        color: #c2410c; 
      }
      &.type-null { 
        background: #f3f4f6; 
        color: #6b7280; 
      }
    }
    
    .node-info {
      font-size: 0.8rem;
      color: #6b7280;
    }
  }
  
  .node-children {
    border-left: 1px solid #e5e7eb;
    margin-left: 8px;
    padding-left: 8px;
  }
  
  .more-indicator {
    font-size: 0.8rem;
    color: #6b7280;
    font-style: italic;
    margin-left: 15px;
    padding: 0.2rem 0;
  }
}
</style>
