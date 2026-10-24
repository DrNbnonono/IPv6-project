import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api/index'

// 任务报告：先在后端生成并保存，再下载。报告是一个自包含的 HTML 文件，可直接用浏览器打开或打印为 PDF。
export const useReportStore = defineStore('report', () => {
  const isExporting = ref(false)
  const error = ref(null)

  /** 为任务生成并下载报告。成功返回 { reportId, summary }；失败抛出带可读 message 的 Error。 */
  const exportTaskReport = async (taskId, format = 'html') => {
    isExporting.value = true
    error.value = null
    try {
      const created = await api.reports.create({ taskId: String(taskId), format })
      const data = created.data
      const downloadFormat = data.formats.includes(format) ? format : 'html'

      // blob 响应由拦截器原样返回（含 data）
      const response = await api.reports.download(data.reportId, downloadFormat)
      if (!(response.data instanceof Blob)) throw new Error('响应不是文件')

      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `observ6_task_${taskId}_report.${downloadFormat}`
      document.body.appendChild(link)
      link.click()
      setTimeout(() => {
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }, 100)

      return { reportId: data.reportId, summary: data.summary, warning: data.warning || null }
    } catch (err) {
      const message = err.response?.data?.message || err.message || '导出报告失败'
      error.value = message
      throw new Error(message)
    } finally {
      isExporting.value = false
    }
  }

  return { isExporting, error, exportTaskReport }
})
