import { createI18n } from 'vue-i18n'
import translations from '@/assets/xmap/translations.json'

// 通用界面文案（加载/空态/错误态等）。帮助文档相关文案在 translations.json，两者合并。
const common = {
  zh: {
    state: {
      loading: '加载中…',
      empty: '暂无数据',
      error: '加载失败',
      retry: '重试',
      noProtocol: '暂无协议数据',
      noVulnerability: '暂无漏洞数据',
      noAsn: '暂无 ASN 数据',
      noRegion: '暂无地区数据',
      noCountry: '暂无国家数据',
      noPrefix: '暂无前缀数据',
      trendDisabled: '趋势数据尚未启用（管理员需要先执行数据库迁移 15）。',
      trendEmpty: '还没有这个范围的快照数据。快照每天记录一次，几天后这里会出现曲线。'
    }
  },
  en: {
    state: {
      loading: 'Loading…',
      empty: 'No data',
      error: 'Failed to load',
      retry: 'Retry',
      noProtocol: 'No protocol data',
      noVulnerability: 'No vulnerability data',
      noAsn: 'No ASN data',
      noRegion: 'No region data',
      noCountry: 'No country data',
      noPrefix: 'No prefix data',
      trendDisabled: 'Trend data is not enabled yet (an administrator must run database migration 15).',
      trendEmpty: 'No snapshots for this range yet. One snapshot is recorded per day; the curve appears after a few days.'
    }
  }
}

const messages = {}
for (const lang of ['zh', 'en']) {
  messages[lang] = { ...(translations[lang] || {}), ...common[lang] }
}

// 平台默认中文；用户可通过 localStorage 的 observ6.locale 切换（读写失败时回退默认）
function initialLocale() {
  try {
    const saved = window.localStorage.getItem('observ6.locale')
    if (saved && messages[saved]) return saved
  } catch (e) {
    // 隐私模式等场景下 localStorage 不可用
  }
  return 'zh'
}

const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages
})

export default i18n
