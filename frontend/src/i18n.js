import { createI18n } from 'vue-i18n'
import translations from '@/assets/xmap/translations.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: translations
})

export default i18n