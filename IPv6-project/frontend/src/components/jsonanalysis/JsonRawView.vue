<template>
  <div class="json-raw-view">
    <div class="raw-controls">
      <div class="format-options">
        <label>
          <input type="checkbox" v-model="prettyFormat" @change="updateDisplay">
          格式化显示
        </label>
        <label>
          <input type="checkbox" v-model="showLineNumbers" @change="updateDisplay">
          显示行号
        </label>
      </div>
      <div class="raw-info">
        <span>{{ lineCount }} 行 | {{ charCount }} 字符</span>
      </div>
    </div>

    <div class="raw-container">
      <div class="line-numbers" v-if="showLineNumbers">
        <div 
          v-for="n in lineCount" 
          :key="n" 
          class="line-number"
        >
          {{ n }}
        </div>
      </div>
      <pre class="raw-content" :class="{ 'with-line-numbers': showLineNumbers }"><code class="json-code">{{ displayContent }}</code></pre>
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

const prettyFormat = ref(true)
const showLineNumbers = ref(true)
const displayContent = ref('')

const lineCount = computed(() => {
  return displayContent.value.split('\n').length
})

const charCount = computed(() => {
  return displayContent.value.length
})

const updateDisplay = () => {
  if (prettyFormat.value) {
    displayContent.value = JSON.stringify(props.data, null, 2)
  } else {
    displayContent.value = JSON.stringify(props.data)
  }
}

onMounted(() => {
  updateDisplay()
})
</script>

<style scoped lang="scss">
.json-raw-view {
  .raw-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 6px;
    
    .format-options {
      display: flex;
      gap: 1rem;
      
      label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #4a5568;
        cursor: pointer;
        
        input[type="checkbox"] {
          margin: 0;
        }
      }
    }
    
    .raw-info {
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }
  
  .raw-container {
    display: flex;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    background: #ffffff;
  }
  
  .line-numbers {
    background: #f8fafc;
    border-right: 1px solid #e2e8f0;
    padding: 1rem 0.5rem;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #6b7280;
    user-select: none;
    min-width: 3rem;
    text-align: right;
    
    .line-number {
      height: 1.5em;
    }
  }
  
  .raw-content {
    flex: 1;
    margin: 0;
    padding: 1rem;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre;
    
    &.with-line-numbers {
      padding-left: 0.5rem;
    }
    
    .json-code {
      color: #2d3748;
      
      // JSON语法高亮
      .json-key {
        color: #2563eb;
        font-weight: 500;
      }
      
      .json-string {
        color: #059669;
      }
      
      .json-number {
        color: #dc2626;
      }
      
      .json-boolean {
        color: #7c3aed;
        font-weight: 500;
      }
      
      .json-null {
        color: #6b7280;
        font-style: italic;
      }
    }
  }
}
</style>
