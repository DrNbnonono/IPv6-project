/**
 * 任务报告接口（P5-2）
 *   POST /api/reports                 body { taskId, format?: 'html' | 'pdf' } → 生成并保存报告
 *   GET  /api/reports/:id/download    ?format=html|pdf → 下载（附件，不在浏览器里内联渲染）
 * 业务逻辑在 services/reportService.js。
 */

const fs = require('fs');
const reports = require('../services/reportService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('report-controller');

const fail = (res, label, error) => {
  if (error instanceof reports.ReportError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  logger.error(`${label}失败:`, error.message);
  return res.status(500).json({ success: false, message: `${label}失败` });
};

exports.generateTaskReport = async (req, res) => {
  try {
    const { taskId, format = 'html' } = req.body || {};
    if (format !== 'html' && format !== 'pdf') {
      return res.status(400).json({ success: false, message: 'format 只能是 html 或 pdf' });
    }

    const { html, summary } = await reports.buildTaskReport({ taskId, user: req.user });

    let pdf = null;
    let warning = null;
    if (format === 'pdf') {
      try {
        pdf = await reports.renderPdf(html);
      } catch (error) {
        logger.warn(`PDF 渲染失败: ${error.message}`);
      }
      if (!pdf) warning = '服务器未安装或无法使用 PDF 渲染组件，已只生成 HTML 报告';
    }

    reports.pruneOldReports();
    const reportId = reports.saveReport({ html, pdf, userId: req.user.id, taskId: summary.taskId });

    res.status(201).json({
      success: true,
      data: { reportId, formats: pdf ? ['html', 'pdf'] : ['html'], summary, ...(warning ? { warning } : {}) }
    });
  } catch (error) {
    fail(res, '生成报告', error);
  }
};

exports.downloadReport = (req, res) => {
  try {
    const format = req.query.format === undefined ? 'html' : String(req.query.format);
    const { file, contentType, filename } = reports.resolveReport({ reportId: req.params.id, format, user: req.user });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    const stream = fs.createReadStream(file);
    stream.on('error', (error) => {
      logger.error('读取报告文件失败:', error.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: '读取报告失败' });
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    fail(res, '下载报告', error);
  }
};
