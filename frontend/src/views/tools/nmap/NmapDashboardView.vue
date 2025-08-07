<template>
  <UnderDevelopmentView
    tool-name="Nmap 网络扫描工具"
    tool-icon="icon-nmap"
    description="集成经典的Nmap网络扫描工具，提供强大的端口扫描、服务识别和操作系统检测功能，专为IPv6网络优化。"
    current-status="架构设计中"
    estimated-completion="2024年第四季度"
    :progress="25"
    :planned-features="nmapFeatures"
    :timeline="nmapTimeline"
  />
</template>

<script setup>
import UnderDevelopmentView from '@/components/public/UnderDevelopmentView.vue'

const nmapFeatures = [
  { name: '需求调研与分析', completed: true },
  { name: '技术架构设计', completed: true },
  { name: 'Nmap集成方案', inProgress: true },
  { name: 'IPv6扫描优化', inProgress: false },
  { name: '端口扫描功能', inProgress: false },
  { name: '服务版本检测', inProgress: false },
  { name: '操作系统识别', inProgress: false },
  { name: '脚本引擎支持', inProgress: false },
  { name: '扫描结果可视化', inProgress: false },
  { name: '报告生成功能', inProgress: false },
  { name: '任务调度管理', inProgress: false },
  { name: '性能监控', inProgress: false }
]

const nmapTimeline = [
  { 
    title: '项目启动', 
    description: '确定Nmap集成需求和技术方案', 
    date: '2024-01', 
    completed: true 
  },
  { 
    title: '架构设计', 
    description: '设计Nmap与平台的集成架构', 
    date: '2024-02', 
    completed: true 
  },
  { 
    title: '核心集成', 
    description: '实现Nmap核心功能集成', 
    date: '2024-03', 
    current: true 
  },
  { 
    title: 'IPv6优化', 
    description: '针对IPv6网络进行扫描优化', 
    date: '2024-05', 
    completed: false 
  },
  { 
    title: '界面开发', 
    description: '开发用户界面和结果展示', 
    date: '2024-07', 
    completed: false 
  },
  { 
    title: '测试发布', 
    description: '全面测试并正式发布', 
    date: '2024-09', 
    completed: false 
  }
]
</script>

<style scoped>
/* 如果需要特定样式可以在这里添加 */
</style>
