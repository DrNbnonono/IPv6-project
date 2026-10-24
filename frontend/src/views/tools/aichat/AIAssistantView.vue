<template>
  <div class="ai-assistant-view">
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <span class="page-icon">🤖</span>
          <div class="header-info">
            <h1>AI探测助手</h1>
            <p class="subtitle">用自然语言描述探测需求，助手给出可执行的命令建议</p>
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
  background: var(--ov-surface-2);
  padding-bottom: 10px;
}

.page-header {
  background: var(--ov-surface);
  border-bottom: 1px solid var(--ov-border);
  padding: 20px 32px;

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;

    .page-icon {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      font-size: 26px;
      border-radius: 16px;
      background: var(--ov-accent-gradient);
      box-shadow: 0 8px 20px rgb(var(--ov-accent-rgb) / 0.3);
    }

    .header-info {
      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--ov-ink);
      }

      .subtitle {
        margin: 4px 0 0;
        font-size: 14px;
        color: var(--ov-ink-dim);
      }
    }
  }

  .header-stats {
    display: flex;
    gap: 12px;

    .stat-item {
      min-width: 92px;
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--ov-surface-2);
      border: 1px solid var(--ov-border);
      border-radius: var(--ov-radius);

      .stat-label {
        font-size: 12px;
        color: var(--ov-ink-faint);
        margin-bottom: 2px;
      }

      .stat-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--ov-ink);

        &.online {
          color: var(--ov-success);
        }
      }
    }
  }
}

.page-content {
  flex: 1;
  padding: 28px 24px 72px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 720px) {
  .page-header {
    padding: 16px;

    .header-left .page-icon { width: 44px; height: 44px; font-size: 22px; }
    .header-left .header-info h1 { font-size: 20px; }
    .header-stats { width: 100%; .stat-item { flex: 1; } }
  }

  .page-content { padding: 16px 0 56px; }
}
</style>
