<template>
  <div class="ai-assistant-view">
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <span class="page-icon">🤖</span>
          <div class="header-info">
            <h1>AI探测助手</h1>
            <p class="subtitle">集成LangChain & MCP - 智能辅助网络探测</p>
          </div>
        </div>
        <div class="header-stats">
          <div class="stat-item">
            <span class="stat-label">对话次数</span>
            <span class="stat-value">{{ aiStore.toolsMessages.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">状态</span>
            <span class="stat-value" :class="{ online: !aiStore.toolsLoading }">
              {{ aiStore.toolsLoading ? '思考中' : '在线' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="page-content">
      <ToolsAIChat />
    </div>
  </div>
</template>

<script setup>
import { useAIStore } from '@/stores/ai'
import ToolsAIChat from '@/components/aichat/ToolsAIChat.vue'

const aiStore = useAIStore()
</script>

<style scoped lang="scss">
.ai-assistant-view {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 300px);
  background: #f5f7fa;
  padding-bottom: 10px; // 为footer留出空间
}

.page-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 24px 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .page-icon {
      font-size: 48px;
      animation: float 3s ease-in-out infinite;
    }

    .header-info {
      h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        color: #333;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .subtitle {
        margin: 4px 0 0;
        font-size: 14px;
        color: #666;
      }
    }
  }

  .header-stats {
    display: flex;
    gap: 32px;

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;

      .stat-label {
        font-size: 12px;
        color: #999;
        margin-bottom: 4px;
      }

      .stat-value {
        font-size: 20px;
        font-weight: 600;
        color: #333;

        &.online {
          color: #4ade80;
        }
      }
    }
  }
}

.page-content {
  flex: 1;
  padding: 32px 32px 96px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  min-height: calc(100vh - 200px);
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

// 调整ToolsAIChat组件在此页面中的样式
:deep(.tools-ai-chat) {
  margin: 0;
  flex: 1;
  min-height: 600px;
  max-height: calc(100vh - 400px);
}
</style>
