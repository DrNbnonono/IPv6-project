/**
 * 任务报告（P5-2）
 *
 *   buildTaskReport({ taskId, user })   读取任务与结果文件，生成一份自包含的 HTML 报告 → { html, summary }
 *   saveReport / resolveReport          报告存放在 reports/ 下，文件名里带用户 ID 与任务 ID，下载时据此校验归属
 *   renderPdf(html)                     可选：装了 puppeteer 才能出 PDF，否则返回 null（只提供 HTML）
 *   pruneOldReports()                   生成新报告时顺带清理超过 REPORT_RETENTION_DAYS（默认 30 天）的旧报告
 *
 * 安全：
 *  - 任务结果里的内容（banner、证书字段、主机名）来自被探测的第三方，不可信：写入 HTML 前全部转义，
 *    页面带 CSP（default-src 'none'，不允许脚本），下载时 Content-Disposition: attachment；
 *  - 只能为自己的任务生成报告（管理员可以为任何任务）；
 *  - 结果文件按流读取，解析行数和读取字节数都有上限，大文件只给出计数和样例。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../database/db');
const { DIRS, ensureDir, resolveStoredPath } = require('./storageService');
const { maskSensitive, createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('report');

class ReportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReportError';
    this.status = status;
  }
}

const SAMPLE_ROWS = 20;
const MAX_PARSE_LINES = 200000; // 超过后只计数、不再逐行解析
const MAX_JSON_ARRAY_BYTES = 20 * 1024 * 1024; // 整体是一个 JSON 数组时，超过这个大小只给文件大小
const LOG_TAIL_BYTES = 8 * 1024;
const STATUS_TOP = 10;
const CELL_LIMIT = 200;

const REPORT_ID_PATTERN = /^u(\d{1,10})_t(\d{1,16})_(\d{10,14})$/;

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const clip = (text, limit = CELL_LIMIT) => {
  const s = String(text ?? '');
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
};

const fmtTime = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDuration = (startedAt, completedAt) => {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt) - new Date(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
};

const STATUS_TEXT = { pending: '排队中', running: '运行中', completed: '已完成', failed: '失败', canceled: '已取消' };

// ---------- 结果文件 ----------

const addressOf = (record) => {
  if (!record || typeof record !== 'object') return null;
  for (const key of ['ip', 'saddr', 'address', 'addr', 'target']) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return null;
};

/** zgrab2 的 data.<module>.status，或记录自身的 status / error 字段。 */
const statusOf = (record) => {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.status === 'string') return record.status;
  if (record.data && typeof record.data === 'object') {
    for (const value of Object.values(record.data)) {
      if (value && typeof value.status === 'string') return value.status;
    }
  }
  if (typeof record.error === 'string' && record.error) return 'error';
  return null;
};

const newAggregate = () => ({ records: 0, parsed: 0, unparsable: 0, addresses: new Set(), statuses: new Map(), sample: [] });

const addRecord = (agg, record, rawLine) => {
  agg.records += 1;
  if (record === undefined) {
    agg.unparsable += 1;
    if (agg.sample.length < SAMPLE_ROWS) agg.sample.push({ address: null, status: null, text: clip(rawLine) });
    return;
  }
  agg.parsed += 1;
  const address = addressOf(record);
  const status = statusOf(record);
  if (address) agg.addresses.add(address);
  if (status) agg.statuses.set(status, (agg.statuses.get(status) || 0) + 1);
  if (agg.sample.length < SAMPLE_ROWS) {
    agg.sample.push({ address, status, text: clip(typeof record === 'object' ? JSON.stringify(record) : String(record)) });
  }
};

const finishAggregate = (agg, extra = {}) => ({
  records: agg.records,
  parsed: agg.parsed,
  unparsable: agg.unparsable,
  distinctAddresses: agg.addresses.size,
  statuses: [...agg.statuses.entries()].sort((a, b) => b[1] - a[1]).slice(0, STATUS_TOP).map(([status, count]) => ({ status, count })),
  sample: agg.sample,
  ...extra
});

const firstNonSpace = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    return buf.slice(0, n).toString('utf8').trimStart().charAt(0);
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * 概览结果文件。支持“一行一个 JSON”和“整体是一个 JSON 数组”两种格式，其他按文本行处理。
 */
const summarizeResultFile = async (filePath, size) => {
  const agg = newAggregate();

  if (firstNonSpace(filePath) === '[') {
    if (size > MAX_JSON_ARRAY_BYTES) {
      return finishAggregate(agg, { format: 'json-array', skipped: `文件为单个 JSON 数组且超过 ${fmtBytes(MAX_JSON_ARRAY_BYTES)}，不逐条解析` });
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => addRecord(agg, item));
        return finishAggregate(agg, { format: 'json-array' });
      }
    } catch (error) {
      // 不是合法的 JSON 数组：按行处理
    }
  }

  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let lines = 0;
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      lines += 1;
      if (lines > MAX_PARSE_LINES) {
        agg.records += 1; // 只计数
        continue;
      }
      let record;
      try { record = JSON.parse(line); } catch (error) { record = undefined; }
      addRecord(agg, record, line);
    }
  } finally {
    rl.close();
  }
  return finishAggregate(agg, {
    format: agg.parsed > 0 ? 'json-lines' : 'text',
    ...(lines > MAX_PARSE_LINES ? { skipped: `超过 ${MAX_PARSE_LINES} 行后只计数，不再逐行解析（状态分布与去重地址数只统计前 ${MAX_PARSE_LINES} 行）` } : {})
  });
};

const readTail = (filePath, bytes = LOG_TAIL_BYTES) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    const lines = buf.toString('utf8').split('\n');
    if (size > length) lines.shift(); // 第一行可能被截断
    return lines.join('\n').trim();
  } finally {
    fs.closeSync(fd);
  }
};

const safeResolve = (stored, baseDir) => {
  if (!stored) return null;
  try {
    const resolved = resolveStoredPath(stored, baseDir);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
  } catch (error) {
    return null;
  }
};

// ---------- HTML ----------

const row = (label, value) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;

const renderHtml = ({ task, params, result, logTail, generatedAt }) => {
  const parts = [];
  parts.push(`<h1>扫描任务报告 #${esc(task.id)}</h1>`);
  parts.push(`<p class="sub">${esc(task.task_type || '未知类型')} · ${esc(STATUS_TEXT[task.status] || task.status)}${task.description ? ` · ${esc(task.description)}` : ''}</p>`);

  parts.push('<h2>任务信息</h2><table class="kv">');
  parts.push(row('任务 ID', esc(task.id)));
  parts.push(row('类型', esc(task.task_type || '—')));
  parts.push(row('状态', esc(STATUS_TEXT[task.status] || task.status)));
  parts.push(row('创建时间', esc(fmtTime(task.created_at))));
  parts.push(row('开始时间', esc(fmtTime(task.started_at))));
  parts.push(row('完成时间', esc(fmtTime(task.completed_at))));
  parts.push(row('运行时长', esc(fmtDuration(task.started_at, task.completed_at))));
  parts.push(row('退出码', esc(task.exit_code ?? '—')));
  if (task.process_signal) parts.push(row('终止信号', esc(task.process_signal)));
  if (task.command) parts.push(row('命令', `<code>${esc(clip(task.command, 1000))}</code>`));
  parts.push('</table>');

  if (params && Object.keys(params).length > 0) {
    parts.push(`<h2>创建参数</h2><pre>${esc(JSON.stringify(params, null, 2))}</pre>`);
  }

  if (task.error_message) {
    parts.push(`<h2>错误信息</h2><pre class="err">${esc(task.error_message)}</pre>`);
  }

  parts.push('<h2>结果概览</h2>');
  if (!result) {
    parts.push('<p class="muted">没有结果文件（任务尚未产出结果，或文件已被清理）。</p>');
  } else {
    parts.push('<table class="kv">');
    parts.push(row('结果文件大小', esc(fmtBytes(result.size))));
    parts.push(row('记录数', esc(result.records.toLocaleString('en-US'))));
    if (result.parsed > 0) parts.push(row('不同地址数', esc(result.distinctAddresses.toLocaleString('en-US'))));
    if (result.unparsable > 0) parts.push(row('无法解析的行', esc(result.unparsable.toLocaleString('en-US'))));
    parts.push('</table>');
    if (result.skipped) parts.push(`<p class="muted">${esc(result.skipped)}</p>`);

    if (result.statuses.length > 0) {
      parts.push('<h3>状态分布</h3><table><thead><tr><th>状态</th><th>数量</th></tr></thead><tbody>');
      result.statuses.forEach((item) => parts.push(`<tr><td>${esc(item.status)}</td><td class="num">${esc(item.count.toLocaleString('en-US'))}</td></tr>`));
      parts.push('</tbody></table>');
    }

    if (result.sample.length > 0) {
      parts.push(`<h3>结果样例（前 ${result.sample.length} 条）</h3><table><thead><tr><th>地址</th><th>状态</th><th>内容</th></tr></thead><tbody>`);
      result.sample.forEach((item) => parts.push(`<tr><td>${esc(item.address || '—')}</td><td>${esc(item.status || '—')}</td><td class="mono">${esc(item.text)}</td></tr>`));
      parts.push('</tbody></table>');
    }
  }

  if (logTail) {
    parts.push(`<h2>日志末尾</h2><pre>${esc(logTail)}</pre>`);
  }

  parts.push(`<footer>由 ObserV6 生成于 ${esc(fmtTime(generatedAt))}。报告含完整地址；结果内容来自被探测的主机，仅作记录，请勿当作可信输入。对外使用前请确认数据范围。</footer>`);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>扫描任务报告 #${esc(task.id)}</title>
<style>
body{font:14px/1.6 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2933;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #d9e2ec;padding-bottom:4px}h3{font-size:14px;margin:18px 0 6px}
.sub{color:#52606d;margin:4px 0 0}.muted{color:#7b8794}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #d9e2ec;padding:4px 8px;text-align:left;vertical-align:top}
table.kv th{width:140px;background:#f5f7fa;font-weight:600}thead th{background:#f5f7fa}td.num{text-align:right;font-variant-numeric:tabular-nums}
.mono,code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
pre{background:#f5f7fa;border:1px solid #d9e2ec;padding:8px;white-space:pre-wrap}pre.err{background:#fff5f5;border-color:#f5c2c2;color:#8a1c1c}
footer{margin-top:32px;padding-top:8px;border-top:1px solid #d9e2ec;color:#7b8794;font-size:12px}
@media print{body{margin:0;max-width:none}}
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>
`;
};

// ---------- 生成 ----------

const parseParams = (value) => {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? maskSensitive(parsed) : null;
  } catch (error) {
    return null;
  }
};

const resultDirFor = (taskType) => {
  switch (taskType) {
    case 'xmap': return DIRS.xmapResult;
    case 'zgrab2': return DIRS.zgrab2Results;
    case 'apd': return DIRS.apdResults;
    case 'tga': return DIRS.tgaResults;
    default: return null;
  }
};

const logDirFor = (taskType) => (taskType === 'xmap' ? DIRS.xmapLog : taskType === 'zgrab2' ? DIRS.zgrab2Logs : null);

/**
 * 为任务生成 HTML 报告。user 需要有 id 和 role。
 * 返回 { html, summary }，summary 是给界面 / 审计用的几个关键数字。
 */
const buildTaskReport = async ({ taskId, user, now = new Date() }) => {
  if (!user || !user.id) throw new ReportError('未登录', 401);
  if (!/^\d{1,16}$/.test(String(taskId ?? ''))) throw new ReportError('taskId 必须是正整数');

  const [rows] = await db.query(
    `SELECT id, user_id, task_type, status, description, command, error_message, log_path, output_path,
            created_at, started_at, completed_at, exit_code, process_signal, params
     FROM tasks WHERE id = ?`,
    [String(taskId)]
  );
  const task = Array.isArray(rows) ? rows[0] : null;
  if (!task || (String(task.user_id) !== String(user.id) && user.role !== 'admin')) {
    throw new ReportError('任务不存在或无权访问', 404);
  }
  if (task.status === 'pending' || task.status === 'running') {
    throw new ReportError('任务还没有结束，等它完成后再生成报告', 409);
  }

  let result = null;
  const resultBase = resultDirFor(task.task_type);
  const resultPath = safeResolve(task.output_path, resultBase || require('./storageService').PROJECT_ROOT);
  if (resultPath) {
    const { size } = fs.statSync(resultPath);
    try {
      result = { size, ...(await summarizeResultFile(resultPath, size)) };
    } catch (error) {
      logger.warn(`读取任务 ${task.id} 结果文件失败: ${error.message}`);
    }
  }

  let logTail = null;
  if ((task.status === 'failed' || task.status === 'canceled') && task.log_path) {
    const logPath = safeResolve(task.log_path, logDirFor(task.task_type) || require('./storageService').PROJECT_ROOT);
    if (logPath) {
      try { logTail = readTail(logPath); } catch (error) { logTail = null; }
    }
  }

  const html = renderHtml({ task, params: parseParams(task.params), result, logTail, generatedAt: now });
  const summary = {
    taskId: String(task.id),
    taskType: task.task_type,
    status: task.status,
    records: result ? result.records : null,
    distinctAddresses: result ? result.distinctAddresses : null,
    resultBytes: result ? result.size : null
  };
  return { html, summary };
};

// ---------- 存放与下载 ----------

const retentionDays = () => {
  const n = parseInt(process.env.REPORT_RETENTION_DAYS, 10);
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : 30;
};

/** 保存报告，返回 reportId（不含扩展名）。 */
const saveReport = ({ html, pdf = null, userId, taskId, now = Date.now() }) => {
  if (!/^\d{1,10}$/.test(String(userId)) || !/^\d{1,16}$/.test(String(taskId))) throw new ReportError('报告归属无效');
  const dir = ensureDir(DIRS.reports);
  const reportId = `u${userId}_t${taskId}_${now}`;
  fs.writeFileSync(path.join(dir, `${reportId}.html`), html, { encoding: 'utf8', mode: 0o640 });
  if (pdf) fs.writeFileSync(path.join(dir, `${reportId}.pdf`), pdf, { mode: 0o640 });
  return reportId;
};

/** 校验 reportId 与归属，返回文件路径。 */
const resolveReport = ({ reportId, format = 'html', user }) => {
  if (!user || !user.id) throw new ReportError('未登录', 401);
  const match = REPORT_ID_PATTERN.exec(String(reportId ?? ''));
  if (!match) throw new ReportError('报告 ID 无效', 400);
  if (format !== 'html' && format !== 'pdf') throw new ReportError('format 只能是 html 或 pdf');
  if (match[1] !== String(user.id) && user.role !== 'admin') throw new ReportError('报告不存在或无权访问', 404);
  const file = path.join(DIRS.reports, `${reportId}.${format}`);
  if (!fs.existsSync(file)) throw new ReportError('报告不存在或已过期', 404);
  return { file, taskId: match[2], contentType: format === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8', filename: `observ6_task_${match[2]}_report.${format}` };
};

/** 清理过期报告，返回删除的文件数。从不抛出。 */
const pruneOldReports = ({ now = Date.now() } = {}) => {
  let removed = 0;
  try {
    const dir = DIRS.reports;
    if (!fs.existsSync(dir)) return 0;
    const cutoff = now - retentionDays() * 24 * 3600 * 1000;
    for (const name of fs.readdirSync(dir)) {
      if (!/^u\d+_t\d+_\d+\.(html|pdf)$/.test(name)) continue; // 只动自己生成的文件
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) {
          fs.unlinkSync(file);
          removed += 1;
        }
      } catch (error) {
        // 单个文件失败不影响其他
      }
    }
  } catch (error) {
    logger.warn(`清理旧报告失败: ${error.message}`);
  }
  return removed;
};

/** 可选：渲染 PDF。没有安装 puppeteer 时返回 null。 */
const renderPdf = async (html, { loader = () => require('puppeteer') } = {}) => {
  let puppeteer;
  try {
    puppeteer = loader();
  } catch (error) {
    return null;
  }
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await browser.close();
  }
};

module.exports = {
  ReportError,
  buildTaskReport,
  saveReport,
  resolveReport,
  pruneOldReports,
  renderPdf,
  renderHtml,
  summarizeResultFile,
  esc,
  REPORT_ID_PATTERN
};
