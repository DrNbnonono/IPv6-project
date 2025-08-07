<template>
  <div class="under-development">
    <div class="development-container">
      <div class="development-header">
        <div class="icon-container">
          <i :class="toolIcon" class="tool-icon"></i>
          <div class="construction-badge">
            <i class="icon-construction"></i>
          </div>
        </div>
        <h1>{{ toolName }}</h1>
        <p class="tool-description">{{ description }}</p>
      </div>

      <div class="development-content">
        <div class="status-card">
          <div class="status-header">
            <i class="icon-status"></i>
            <h3>开发状态</h3>
          </div>
          <div class="status-info">
            <div class="status-item">
              <span class="status-label">当前状态:</span>
              <span class="status-value developing">{{ currentStatus }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">预计完成:</span>
              <span class="status-value">{{ estimatedCompletion }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">开发进度:</span>
              <div class="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: progress + '%' }"></div>
                </div>
                <span class="progress-text">{{ progress }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="features-card">
          <div class="features-header">
            <i class="icon-features"></i>
            <h3>计划功能</h3>
          </div>
          <div class="features-list">
            <div 
              v-for="(feature, index) in plannedFeatures" 
              :key="index"
              class="feature-item"
              :class="{ completed: feature.completed, 'in-progress': feature.inProgress }"
            >
              <i :class="getFeatureIcon(feature)"></i>
              <span class="feature-text">{{ feature.name }}</span>
              <span v-if="feature.completed" class="feature-status completed">已完成</span>
              <span v-else-if="feature.inProgress" class="feature-status in-progress">开发中</span>
              <span v-else class="feature-status planned">计划中</span>
            </div>
          </div>
        </div>

        <div class="timeline-card">
          <div class="timeline-header">
            <i class="icon-timeline"></i>
            <h3>开发时间线</h3>
          </div>
          <div class="timeline-list">
            <div 
              v-for="(milestone, index) in timeline" 
              :key="index"
              class="timeline-item"
              :class="{ completed: milestone.completed, current: milestone.current }"
            >
              <div class="timeline-marker">
                <i :class="milestone.completed ? 'icon-check' : milestone.current ? 'icon-current' : 'icon-future'"></i>
              </div>
              <div class="timeline-content">
                <h4>{{ milestone.title }}</h4>
                <p>{{ milestone.description }}</p>
                <span class="timeline-date">{{ milestone.date }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-header">
            <i class="icon-contact"></i>
            <h3>联系我们</h3>
          </div>
          <div class="contact-content">
            <p>如果您对此工具有任何建议或需求，欢迎联系我们：</p>
            <div class="contact-methods">
              <div class="contact-item">
                <i class="icon-email"></i>
                <span>邮箱: dev@ipv6detection.com</span>
              </div>
              <div class="contact-item">
                <i class="icon-github"></i>
                <span>GitHub: github.com/ipv6-detection</span>
              </div>
              <div class="contact-item">
                <i class="icon-feedback"></i>
                <span>反馈: 点击右上角反馈按钮</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="development-actions">
        <button class="btn btn-primary" @click="goBack">
          <i class="icon-back"></i>
          返回工具列表
        </button>
        <button class="btn btn-secondary" @click="subscribeDevelopment">
          <i class="icon-subscribe"></i>
          订阅开发进度
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const props = defineProps({
  toolName: {
    type: String,
    required: true
  },
  toolIcon: {
    type: String,
    default: 'icon-tool'
  },
  description: {
    type: String,
    default: '这是一个强大的网络探测工具，正在积极开发中。'
  },
  currentStatus: {
    type: String,
    default: '积极开发中'
  },
  estimatedCompletion: {
    type: String,
    default: '2024年第二季度'
  },
  progress: {
    type: Number,
    default: 30
  },
  plannedFeatures: {
    type: Array,
    default: () => [
      { name: '基础功能开发', completed: true },
      { name: '用户界面设计', inProgress: true },
      { name: '核心算法实现', inProgress: false },
      { name: '性能优化', inProgress: false },
      { name: '测试与调试', inProgress: false }
    ]
  },
  timeline: {
    type: Array,
    default: () => [
      { 
        title: '项目启动', 
        description: '确定需求和技术方案', 
        date: '2024-01', 
        completed: true 
      },
      { 
        title: '原型开发', 
        description: '开发基础功能原型', 
        date: '2024-02', 
        current: true 
      },
      { 
        title: '功能完善', 
        description: '实现完整功能集', 
        date: '2024-03', 
        completed: false 
      },
      { 
        title: '测试发布', 
        description: '测试优化并正式发布', 
        date: '2024-04', 
        completed: false 
      }
    ]
  }
})

const router = useRouter()

const getFeatureIcon = (feature) => {
  if (feature.completed) return 'icon-check'
  if (feature.inProgress) return 'icon-progress'
  return 'icon-planned'
}

const goBack = () => {
  router.push('/tools')
}

const subscribeDevelopment = () => {
  ElMessage.success('已订阅开发进度通知！我们会在有重要更新时通知您。')
}
</script>

<style scoped lang="scss">
.under-development {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.development-container {
  max-width: 1000px;
  width: 100%;
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.development-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 3rem 2rem;
  text-align: center;
  position: relative;

  .icon-container {
    position: relative;
    display: inline-block;
    margin-bottom: 1rem;

    .tool-icon {
      font-size: 4rem;
      opacity: 0.9;
    }

    .construction-badge {
      position: absolute;
      top: -10px;
      right: -10px;
      background: #ff6b6b;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bounce 2s infinite;

      .icon-construction {
        color: white;
        font-size: 1.2rem;
      }
    }
  }

  h1 {
    margin: 0 0 1rem;
    font-size: 2.5rem;
    font-weight: 700;
  }

  .tool-description {
    margin: 0;
    font-size: 1.1rem;
    opacity: 0.9;
    max-width: 600px;
    margin: 0 auto;
  }
}

.development-content {
  padding: 2rem;
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.status-card, .features-card, .timeline-card, .contact-card {
  background: #f8fafc;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;

  .status-header, .features-header, .timeline-header, .contact-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;

    h3 {
      margin: 0;
      color: #2d3748;
      font-size: 1.2rem;
    }

    i {
      color: #667eea;
      font-size: 1.3rem;
    }
  }
}

.status-info {
  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    .status-label {
      color: #4a5568;
      font-weight: 500;
    }

    .status-value {
      font-weight: 600;

      &.developing {
        color: #ed8936;
      }
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      margin-left: 1rem;

      .progress-bar {
        flex: 1;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          transition: width 0.3s ease;
        }
      }

      .progress-text {
        font-size: 0.9rem;
        color: #4a5568;
        font-weight: 600;
      }
    }
  }
}

.features-list {
  .feature-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    transition: all 0.2s ease;

    &:hover {
      background: white;
    }

    &.completed {
      background: #f0fff4;
      border-left: 4px solid #48bb78;
    }

    &.in-progress {
      background: #fffaf0;
      border-left: 4px solid #ed8936;
    }

    i {
      font-size: 1.1rem;
    }

    .feature-text {
      flex: 1;
      color: #2d3748;
    }

    .feature-status {
      font-size: 0.8rem;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-weight: 500;

      &.completed {
        background: #c6f6d5;
        color: #22543d;
      }

      &.in-progress {
        background: #feebc8;
        color: #744210;
      }

      &.planned {
        background: #e2e8f0;
        color: #4a5568;
      }
    }
  }
}

.timeline-list {
  .timeline-item {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;

    &:not(:last-child)::after {
      content: '';
      position: absolute;
      left: 20px;
      top: 40px;
      bottom: -24px;
      width: 2px;
      background: #e2e8f0;
    }

    &.completed::after {
      background: #48bb78;
    }

    &.current::after {
      background: linear-gradient(to bottom, #48bb78, #e2e8f0);
    }

    .timeline-marker {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      color: #a0aec0;
      flex-shrink: 0;

      i {
        font-size: 1.2rem;
      }
    }

    &.completed .timeline-marker {
      background: #48bb78;
      color: white;
    }

    &.current .timeline-marker {
      background: #ed8936;
      color: white;
      animation: pulse 2s infinite;
    }

    .timeline-content {
      flex: 1;

      h4 {
        margin: 0 0 0.5rem;
        color: #2d3748;
        font-size: 1.1rem;
      }

      p {
        margin: 0 0 0.5rem;
        color: #4a5568;
        font-size: 0.9rem;
      }

      .timeline-date {
        font-size: 0.8rem;
        color: #a0aec0;
        font-weight: 500;
      }
    }
  }
}

.contact-content {
  p {
    color: #4a5568;
    margin-bottom: 1rem;
  }

  .contact-methods {
    .contact-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      color: #2d3748;

      i {
        color: #667eea;
        font-size: 1.1rem;
        width: 20px;
      }
    }
  }
}

.development-actions {
  padding: 2rem;
  background: #f8fafc;
  display: flex;
  gap: 1rem;
  justify-content: center;
  border-top: 1px solid #e2e8f0;
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;

  &.btn-primary {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
    }
  }

  &.btn-secondary {
    background: white;
    color: #4a5568;
    border: 2px solid #e2e8f0;

    &:hover {
      border-color: #667eea;
      color: #667eea;
    }
  }
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(237, 137, 54, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(237, 137, 54, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(237, 137, 54, 0);
  }
}

// 图标样式
.icon-construction:before { content: "🚧"; }
.icon-status:before { content: "📊"; }
.icon-features:before { content: "⭐"; }
.icon-timeline:before { content: "📅"; }
.icon-contact:before { content: "📞"; }
.icon-check:before { content: "✅"; }
.icon-progress:before { content: "⚡"; }
.icon-planned:before { content: "📋"; }
.icon-current:before { content: "🔄"; }
.icon-future:before { content: "⏳"; }
.icon-back:before { content: "⬅️"; }
.icon-subscribe:before { content: "🔔"; }
.icon-email:before { content: "✉️"; }
.icon-github:before { content: "🐙"; }
.icon-feedback:before { content: "💬"; }
.icon-tool:before { content: "🔧"; }
</style>
