const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../database/db', () => ({ query: jest.fn(), end: jest.fn() }));

let tmpRoot;
let db;
let reports;
let controller;
let storage;

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-report-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  storage = require('../services/storageService');
  reports = require('../services/reportService');
  controller = require('../controllers/reportController');
  storage.ensureDirs();
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  delete process.env.REPORT_RETENTION_DAYS;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  db.query.mockReset();
});

const user = { id: 7, role: 'user' };
const admin = { id: 1, role: 'admin' };

const taskRow = (overrides = {}) => ({
  id: 1751989268046,
  user_id: 7,
  task_type: 'zgrab2',
  status: 'completed',
  description: '测试任务',
  command: 'zgrab2 http -f in.txt',
  error_message: null,
  log_path: null,
  output_path: null,
  created_at: new Date(2026, 9, 1, 8, 0, 0),
  started_at: new Date(2026, 9, 1, 8, 0, 5),
  completed_at: new Date(2026, 9, 1, 8, 2, 10),
  exit_code: 0,
  process_signal: null,
  params: JSON.stringify({ module: 'http', password: 'p@ss' }),
  ...overrides
});

const writeResult = (name, content) => {
  const file = path.join(storage.DIRS.zgrab2Results, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

describe('buildTaskReport', () => {
  test('一行一个 JSON：统计记录数、去重地址、状态分布，列出样例', async () => {
    const lines = [
      { ip: '2001:db8::1', data: { http: { status: 'success' } } },
      { ip: '2001:db8::1', data: { http: { status: 'success' } } },
      { ip: '2001:db8::2', data: { http: { status: 'connection-timeout' } } },
      { ip: '2001:db8::3', data: { http: { status: 'success' } } }
    ].map((r) => JSON.stringify(r)).join('\n');
    const file = writeResult('basic.jsonl', lines);
    db.query.mockResolvedValue([[taskRow({ output_path: file })]]);

    const { html, summary } = await reports.buildTaskReport({ taskId: '1751989268046', user });
    expect(summary).toMatchObject({ taskId: '1751989268046', taskType: 'zgrab2', status: 'completed', records: 4, distinctAddresses: 3 });
    expect(html).toContain('2001:db8::1'); // 完整地址
    expect(html).toContain('success');
    expect(html).toMatch(/状态分布/);
    expect(html).toMatch(/运行时长[\s\S]*2 分 5 秒/);
    expect(db.query.mock.calls[0][1]).toEqual(['1751989268046']);
  });

  test('参数里的敏感字段被脱敏', async () => {
    db.query.mockResolvedValue([[taskRow()]]);
    const { html } = await reports.buildTaskReport({ taskId: 1, user });
    expect(html).toContain('&quot;module&quot;: &quot;http&quot;');
    expect(html).not.toContain('p@ss');
  });

  test('结果内容来自被探测主机：全部转义，页面带 CSP，不出现可执行标签', async () => {
    const evil = { ip: '2001:db8::bad', data: { http: { status: '<script>alert(1)</script>' } }, banner: '"><img src=x onerror=alert(2)>' };
    const file = writeResult('evil.jsonl', JSON.stringify(evil));
    db.query.mockResolvedValue([[taskRow({ output_path: file, description: '<b>desc</b>', error_message: '<svg onload=alert(3)>' })]]);

    const { html } = await reports.buildTaskReport({ taskId: 1, user });
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/<img src=x/);
    expect(html).not.toMatch(/<svg onload/);
    expect(html).not.toContain('<b>desc</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain("default-src 'none'");
  });

  test('整体是一个 JSON 数组（xmap 常见格式）', async () => {
    const file = path.join(storage.DIRS.xmapResult, 'arr.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([{ saddr: '2001:db8::10' }, { saddr: '2001:db8::11' }, { saddr: '2001:db8::10' }]));
    db.query.mockResolvedValue([[taskRow({ task_type: 'xmap', output_path: file })]]);
    const { summary } = await reports.buildTaskReport({ taskId: 2, user });
    expect(summary).toMatchObject({ records: 3, distinctAddresses: 2 });
  });

  test('不可解析的行计入“无法解析”，样例仍显示原文', async () => {
    const file = writeResult('mixed.txt', 'plain line\n{"ip":"2001:db8::1"}\n');
    db.query.mockResolvedValue([[taskRow({ output_path: file })]]);
    const { html, summary } = await reports.buildTaskReport({ taskId: 3, user });
    expect(summary.records).toBe(2);
    expect(html).toContain('无法解析的行');
    expect(html).toContain('plain line');
  });

  test('样例最多 20 条', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => JSON.stringify({ ip: `2001:db8::${i + 1}` })).join('\n');
    const file = writeResult('many.jsonl', lines);
    db.query.mockResolvedValue([[taskRow({ output_path: file })]]);
    const { html, summary } = await reports.buildTaskReport({ taskId: 4, user });
    expect(summary.records).toBe(100);
    expect(html).toContain('前 20 条');
    expect(html).not.toContain('2001:db8::21<');
  });

  test('没有结果文件 / 路径越界：报告里说明，不读取范围外的文件', async () => {
    const outside = path.join(tmpRoot, 'secret.txt');
    fs.writeFileSync(outside, '{"ip":"leak"}');
    db.query.mockResolvedValue([[taskRow({ output_path: outside })]]);
    const { html, summary } = await reports.buildTaskReport({ taskId: 5, user });
    expect(summary.records).toBeNull();
    expect(html).toContain('没有结果文件');
    expect(html).not.toContain('leak');
  });

  test('失败任务带日志末尾', async () => {
    const logFile = path.join(storage.DIRS.zgrab2Logs, 'fail.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, ['line1', 'line2', 'fatal: <boom>'].join('\n'));
    db.query.mockResolvedValue([[taskRow({ status: 'failed', error_message: '进程异常退出', log_path: logFile })]]);
    const { html } = await reports.buildTaskReport({ taskId: 6, user });
    expect(html).toContain('进程异常退出');
    expect(html).toContain('日志末尾');
    expect(html).toContain('fatal: &lt;boom&gt;');
  });

  test.each([
    ['任务不存在', [[]], 404],
    ['不是自己的任务', [[taskRow({ user_id: 99 })]], 404],
    ['任务未结束（排队）', [[taskRow({ status: 'pending' })]], 409],
    ['任务未结束（运行）', [[taskRow({ status: 'running' })]], 409]
  ])('%s', async (_name, dbResult, status) => {
    db.query.mockResolvedValue(dbResult);
    await expect(reports.buildTaskReport({ taskId: 1, user })).rejects.toMatchObject({ status });
  });

  test('管理员可以为任何任务生成报告', async () => {
    db.query.mockResolvedValue([[taskRow({ user_id: 99 })]]);
    await expect(reports.buildTaskReport({ taskId: 1, user: admin })).resolves.toHaveProperty('html');
  });

  test.each([undefined, '', 'abc', '1; DROP TABLE tasks', '-1', '12345678901234567'])('taskId %j 被拒绝，不查询', async (taskId) => {
    await expect(reports.buildTaskReport({ taskId, user })).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('未登录', async () => {
    await expect(reports.buildTaskReport({ taskId: 1, user: null })).rejects.toMatchObject({ status: 401 });
  });
});

describe('summarizeResultFile 上限', () => {
  test('超过解析上限后只计数', async () => {
    // 200001 行，足以越过 MAX_PARSE_LINES
    const row = '{"ip":"2001:db8::1"}\n';
    const file = writeResult('big.jsonl', row.repeat(200001));
    const result = await reports.summarizeResultFile(file, fs.statSync(file).size);
    expect(result.records).toBe(200001);
    expect(result.skipped).toMatch(/只计数/);
  }, 30000);

  test('超大的单个 JSON 数组不逐条解析', async () => {
    const file = path.join(storage.DIRS.xmapResult, 'huge-array.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[{"saddr":"2001:db8::1"}]');
    const result = await reports.summarizeResultFile(file, 50 * 1024 * 1024);
    expect(result.skipped).toMatch(/JSON 数组/);
    expect(result.records).toBe(0);
  });
});

describe('保存、下载与清理', () => {
  test('saveReport 生成带归属的 ID，resolveReport 校验归属', () => {
    const id = reports.saveReport({ html: '<p>x</p>', userId: 7, taskId: '42', now: 1790000000000 });
    expect(id).toBe('u7_t42_1790000000000');
    expect(reports.resolveReport({ reportId: id, user }).file).toBe(path.join(storage.DIRS.reports, `${id}.html`));
    expect(reports.resolveReport({ reportId: id, user: admin }).filename).toBe('observ6_task_42_report.html');
    expect(() => reports.resolveReport({ reportId: id, user: { id: 8, role: 'user' } })).toThrow(/无权访问/);
  });

  test.each(['../etc/passwd', 'u7_t42_1790000000000/../x', 'u7_t42', 'x7_t42_1790000000000', '', undefined])('非法 reportId %j', (reportId) => {
    expect(() => reports.resolveReport({ reportId, user })).toThrow(reports.ReportError);
  });

  test('format 非法 / 文件不存在 / 未登录', () => {
    expect(() => reports.resolveReport({ reportId: 'u7_t42_1790000000000', format: 'exe', user })).toThrow(/format/);
    expect(() => reports.resolveReport({ reportId: 'u7_t43_1790000000000', user })).toThrow(/不存在/);
    expect(() => reports.resolveReport({ reportId: 'u7_t42_1790000000000', user: null })).toThrow(/未登录/);
  });

  test('saveReport 拒绝非法归属', () => {
    expect(() => reports.saveReport({ html: 'x', userId: '7/../', taskId: 1 })).toThrow(reports.ReportError);
    expect(() => reports.saveReport({ html: 'x', userId: 7, taskId: 'abc' })).toThrow(reports.ReportError);
  });

  test('pruneOldReports 只删过期且命名符合的报告', () => {
    process.env.REPORT_RETENTION_DAYS = '1';
    const dir = storage.DIRS.reports;
    const oldFile = path.join(dir, 'u7_t1_1700000000000.html');
    const freshFile = path.join(dir, 'u7_t2_1790000000001.html');
    const foreign = path.join(dir, 'notes.txt');
    [oldFile, freshFile, foreign].forEach((f) => fs.writeFileSync(f, 'x'));
    const longAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
    fs.utimesSync(oldFile, longAgo, longAgo);
    fs.utimesSync(foreign, longAgo, longAgo);

    expect(reports.pruneOldReports()).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
  });
});

describe('renderPdf', () => {
  test('没有 puppeteer：返回 null', async () => {
    expect(await reports.renderPdf('<p>x</p>', { loader: () => { throw new Error('not installed'); } })).toBeNull();
  });

  test('有 puppeteer：禁用脚本后渲染，并关闭浏览器', async () => {
    const page = { setJavaScriptEnabled: jest.fn(), setContent: jest.fn(), pdf: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])) };
    const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    const pdf = await reports.renderPdf('<p>x</p>', { loader: () => ({ launch: jest.fn().mockResolvedValue(browser) }) });
    expect(pdf.toString()).toBe('%PDF');
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(browser.close).toHaveBeenCalled();
  });
});

const createRes = () => {
  const res = { headers: {} };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; });
  return res;
};

describe('reportController', () => {
  test('生成：201，返回 reportId 与摘要，文件落盘', async () => {
    db.query.mockResolvedValue([[taskRow()]]);
    const res = createRes();
    await controller.generateTaskReport({ body: { taskId: '1751989268046' }, user }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const { data } = res.json.mock.calls[0][0];
    expect(data.reportId).toMatch(/^u7_t1751989268046_\d+$/);
    expect(data.formats).toEqual(['html']);
    expect(fs.existsSync(path.join(storage.DIRS.reports, `${data.reportId}.html`))).toBe(true);
  });

  test('请求 pdf 但没有渲染组件：仍生成 HTML 并给出提示', async () => {
    db.query.mockResolvedValue([[taskRow()]]);
    const res = createRes();
    await controller.generateTaskReport({ body: { taskId: 1, format: 'pdf' }, user }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const { data } = res.json.mock.calls[0][0];
    expect(data.formats).toEqual(['html']);
    expect(data.warning).toMatch(/PDF/);
  });

  test('非法 format：400；业务错误带状态码；其他错误 500 且不泄露细节', async () => {
    let res = createRes();
    await controller.generateTaskReport({ body: { taskId: 1, format: 'doc' }, user }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    db.query.mockResolvedValueOnce([[]]);
    res = createRes();
    await controller.generateTaskReport({ body: { taskId: 1 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    db.query.mockRejectedValueOnce(new Error('secret sql detail'));
    res = createRes();
    await controller.generateTaskReport({ body: { taskId: 1 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
  });

  test('下载：附件头、nosniff、CSP；别人的报告 404', async () => {
    const id = reports.saveReport({ html: '<p>hello</p>', userId: 7, taskId: 5, now: 1790000000005 });
    const res = createRes();
    res.on = jest.fn();
    res.once = jest.fn();
    res.emit = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();
    controller.downloadReport({ params: { id }, query: {}, user }, res);
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="observ6_task_5_report.html"');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Security-Policy']).toContain("default-src 'none'");

    const other = createRes();
    controller.downloadReport({ params: { id }, query: {}, user: { id: 8, role: 'user' } }, other);
    expect(other.status).toHaveBeenCalledWith(404);
  });
});
