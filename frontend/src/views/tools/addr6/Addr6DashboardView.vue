<template>
  <UnderDevelopmentView
    tool-name="Addr6 IPv6地址生成工具"
    tool-icon="icon-addr6"
    description="专业的IPv6地址生成和分析工具，支持多种地址生成算法和模式，为网络探测提供高质量的目标地址。"
    current-status="核心开发中"
    estimated-completion="2024年第三季度"
    :progress="45"
    :planned-features="addr6Features"
    :timeline="addr6Timeline"
  />
</template>

<script setup>
import UnderDevelopmentView from '@/components/public/UnderDevelopmentView.vue'

const addr6Features = [
  { name: '基础地址生成算法', completed: true },
  { name: '多种生成模式支持', completed: true },
  { name: '用户界面设计', inProgress: true },
  { name: 'EUI-64地址生成', inProgress: true },
  { name: '随机地址生成', inProgress: false },
  { name: '前缀扫描功能', inProgress: false },
  { name: '地址验证与分析', inProgress: false },
  { name: '批量导出功能', inProgress: false },
  { name: '与其他工具集成', inProgress: false },
  { name: '性能优化', inProgress: false }
]

const addr6Timeline = [
  { 
    title: '需求分析', 
    description: '分析IPv6地址生成需求和算法研究', 
    date: '2024-01', 
    completed: true 
  },
  { 
    title: '核心算法开发', 
    description: '实现基础的IPv6地址生成算法', 
    date: '2024-02', 
    completed: true 
  },
  { 
    title: '界面开发', 
    description: '开发用户友好的操作界面', 
    date: '2024-03', 
    current: true 
  },
  { 
    title: '高级功能', 
    description: '实现前缀扫描和批量生成功能', 
    date: '2024-04', 
    completed: false 
  },
  { 
    title: '集成测试', 
    description: '与平台其他工具集成测试', 
    date: '2024-05', 
    completed: false 
  },
  { 
    title: '正式发布', 
    description: '完成测试并正式发布', 
    date: '2024-06', 
    completed: false 
  }
]
</script>

<style scoped>
/* 如果需要特定样式可以在这里添加 */
</style>
