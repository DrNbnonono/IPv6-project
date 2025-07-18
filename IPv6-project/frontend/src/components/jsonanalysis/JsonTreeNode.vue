<template>
  <div class="json-tree-node" :style="{ marginLeft: level * 20 + 'px' }">
    <div class="node-header" @click="toggleExpanded" v-if="isExpandable">
      <span class="expand-icon" :class="{ expanded: isExpanded }">
        {{ isExpanded ? '▼' : '▶' }}
      </span>
      <span class="node-key">{{ displayKey }}</span>
      <span class="node-type">{{ nodeType }}</span>
      <span class="node-count" v-if="itemCount">{{ itemCount }}</span>
    </div>
    
    <div class="node-header" v-else>
      <span class="node-key">{{ displayKey }}</span>
      <span class="node-value" :class="valueClass">{{ displayValue }}</span>
      <span class="node-type">{{ nodeType }}</span>
    </div>
    
    <div class="node-children" v-if="isExpanded && isExpandable">
      <JsonTreeNode
        v-for="(value, key) in data"
        :key="key"
        :data="value"
        :path="childPath(key)"
        :level="level + 1"
        :nodeKey="key"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps } from 'vue'

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
  expanded: {
    type: Boolean,
    default: false
  }
})

const isExpanded = ref(props.expanded)

const isExpandable = computed(() => {
  return typeof props.data === 'object' && props.data !== null
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

const displayValue = computed(() => {
  if (props.data === null) return 'null'
  if (typeof props.data === 'string') return `"${props.data}"`
  if (typeof props.data === 'boolean') return props.data.toString()
  if (typeof props.data === 'number') return props.data.toString()
  return ''
})

const valueClass = computed(() => {
  return `value-${nodeType.value}`
})

const itemCount = computed(() => {
  if (!isExpandable.value) return null
  if (Array.isArray(props.data)) return `[${props.data.length}]`
  return `{${Object.keys(props.data).length}}`
})

const childPath = (key) => {
  if (props.path === 'root') return key.toString()
  if (Array.isArray(props.data)) return `${props.path}[${key}]`
  return `${props.path}.${key}`
}

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<style scoped lang="scss">
.json-tree-node {
  .node-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
    cursor: pointer;
    
    &:hover {
      background-color: #f8fafc;
    }
  }
  
  .expand-icon {
    width: 12px;
    font-size: 0.8rem;
    color: #64748b;
    transition: transform 0.2s ease;
    
    &.expanded {
      transform: rotate(0deg);
    }
  }
  
  .node-key {
    font-weight: 500;
    color: #2563eb;
  }
  
  .node-value {
    &.value-string {
      color: #059669;
    }
    
    &.value-number {
      color: #dc2626;
    }
    
    &.value-boolean {
      color: #7c3aed;
    }
    
    &.value-null {
      color: #6b7280;
      font-style: italic;
    }
  }
  
  .node-type {
    font-size: 0.8rem;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }
  
  .node-count {
    font-size: 0.8rem;
    color: #6b7280;
  }
  
  .node-children {
    border-left: 1px solid #e5e7eb;
    margin-left: 6px;
  }
}
</style>
