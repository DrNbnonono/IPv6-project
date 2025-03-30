<template>
    <div class="side-panel" :class="{ 'collapsed': collapsed }" 
         @mousedown="startDrag" :style="panelStyle">
      <div class="panel-header" @dblclick="toggleCollapse">
        <h3>{{ title }}</h3>
        <div class="header-actions">
          <button @click="toggleCollapse" class="btn-icon">
            <i :class="collapsed ? 'icon-expand' : 'icon-collapse'"></i>
          </button>
        </div>
      </div>
      
      <div class="panel-content">
        <div class="ranking-header">
          <span>排名</span>
          <span>名称</span>
          <span>活跃IPv6</span>
        </div>
        <div class="ranking-list">
          <div v-for="(item, index) in displayedItems" :key="item.id || item.asn"
               class="ranking-item" @click="$emit('item-selected', item)">
            <span class="rank-badge" :class="getRankClass(index)">{{ index + 1 }}</span>
            <span class="name">
              {{ item.country_name_zh || item.country_name || item.as_name_zh || item.as_name }}
              <span class="sub-info" v-if="item.country_id">
                <i class="icon-location"></i> {{ item.country_id }}
              </span>
            </span>
            <span class="count">
              {{ item.total_active_ipv6.toLocaleString() }}
              <span class="trend" :class="getTrendClass(item)">
                <i :class="getTrendIcon(item)"></i>
              </span>
            </span>
          </div>
        </div>
        <div class="panel-footer">
          <span v-if="hasMore" class="show-more" @click="showMore">显示更多...</span>
          <div class="stats-summary">
            总计: {{ totalItems }} | 显示: {{ displayedItems.length }}
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue';
  
  const props = defineProps({
    title: String,
    items: Array,
    initialPosition: { type: Object, default: () => ({ x: 0, y: 0 }) }
  });
  
  const emit = defineEmits(['item-selected']);
  
  // 拖动逻辑
  const collapsed = ref(false);
  const isDragging = ref(false);
  const panelPosition = ref({ ...props.initialPosition });
  const dragStartPos = ref({ x: 0, y: 0 });
  const displayLimit = ref(10);
  
  const panelStyle = computed(() => ({
    left: `${panelPosition.value.x}px`,
    top: `${panelPosition.value.y}px`,
    zIndex: isDragging.value ? 1000 : 10
  }));
  
  const startDrag = (e) => {
    if (e.target.closest('.btn-icon')) return;
    
    isDragging.value = true;
    dragStartPos.value = {
      x: e.clientX - panelPosition.value.x,
      y: e.clientY - panelPosition.value.y
    };
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  };
  
  const drag = (e) => {
    if (!isDragging.value) return;
    panelPosition.value = {
      x: e.clientX - dragStartPos.value.x,
      y: e.clientY - dragStartPos.value.y
    };
  };
  
  const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  };
  
  // 数据展示逻辑
  const totalItems = computed(() => props.items.length);
  const hasMore = computed(() => props.items.length > displayLimit.value);
  const displayedItems = computed(() => 
    props.items.slice(0, displayLimit.value)
  );
  
  const showMore = () => {
    displayLimit.value += 10;
  };
  
  const getRankClass = (index) => {
    if (index === 0) return 'rank-gold';
    if (index === 1) return 'rank-silver';
    if (index === 2) return 'rank-bronze';
    return '';
  };
  
  const getTrendClass = (item) => {
    if (!item.trend) return '';
    return item.trend > 0 ? 'trend-up' : 'trend-down';
  };
  
  const getTrendIcon = (item) => {
    if (!item.trend) return '';
    return item.trend > 0 ? 'icon-up' : 'icon-down';
  };
  
  const toggleCollapse = () => {
    collapsed.value = !collapsed.value;
  };
  </script>
  
  <style scoped>
  .side-panel {
    position: absolute;
    width: 320px;
    background: rgba(15, 22, 33, 0.9);
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.3s ease;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    user-select: none;
  }
  
  .side-panel.collapsed {
    width: 50px;
  }
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(79, 195, 247, 0.2);
    border-bottom: 1px solid rgba(79, 195, 247, 0.3);
    cursor: move;
  }
  
  .panel-header h3 {
    margin: 0;
    font-size: 16px;
    color: #4fc3f7;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .btn-icon {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 4px;
    font-size: 14px;
  }
  
  .ranking-header {
    display: flex;
    padding: 10px 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .ranking-header span {
    flex: 1;
  }
  
  .ranking-header span:first-child {
    flex: 0 0 50px;
  }
  
  .ranking-list {
    max-height: 500px;
    overflow-y: auto;
    padding: 8px 0;
  }
  
  .ranking-item {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    margin: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .ranking-item:hover {
    background: rgba(79, 195, 247, 0.1);
  }
  
  .rank-badge {
    flex: 0 0 40px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 12px;
    font-weight: bold;
    margin-right: 10px;
  }
  
  .rank-gold {
    background: linear-gradient(135deg, #FFD700, #FFA500);
    color: #333;
  }
  
  .rank-silver {
    background: linear-gradient(135deg, #C0C0C0, #A0A0A0);
    color: #333;
  }
  
  .rank-bronze {
    background: linear-gradient(135deg, #CD7F32, #A05A2C);
    color: white;
  }
  
  .name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    flex-direction: column;
  }
  
  .sub-info {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
  }
  
  .count {
    flex: 0 0 80px;
    text-align: right;
    font-family: 'Roboto Mono', monospace;
    font-size: 14px;
  }
  
  .trend {
    margin-left: 5px;
    font-size: 12px;
  }
  
  .trend-up {
    color: #81c784;
  }
  
  .trend-down {
    color: #f44336;
  }
  
  .panel-footer {
    display: flex;
    justify-content: space-between;
    padding: 8px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
  
  .show-more {
    color: #4fc3f7;
    cursor: pointer;
  }
  
  .show-more:hover {
    text-decoration: underline;
  }
  
  .stats-summary {
    opacity: 0.7;
  }
  
  /* 图标样式 */
  .icon-collapse:before { content: "−"; }
  .icon-expand:before { content: "+"; }
  .icon-location:before { content: "📍"; }
  .icon-up:before { content: "↑"; }
  .icon-down:before { content: "↓"; }
  
  /* 滚动条样式 */
  .ranking-list::-webkit-scrollbar {
    width: 6px;
  }
  
  .ranking-list::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }
  
  .ranking-list::-webkit-scrollbar-thumb {
    background: rgba(79, 195, 247, 0.5);
    border-radius: 3px;
  }
  </style>