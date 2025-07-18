<template>
  <div class="json-tree-view">
    <div class="tree-container">
      <JsonTreeNode 
        :data="data" 
        :path="'root'" 
        :level="0"
        :expanded="true"
      />
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'
import JsonTreeNode from './JsonTreeNode.vue'

defineProps({
  data: {
    type: [Object, Array],
    required: true
  }
})
</script>

<style scoped lang="scss">
.json-tree-view {
  .tree-container {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
  }
}
</style>
