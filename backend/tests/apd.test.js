/**
 * /api/apd：登录、创建（202/403/400）、任务列表/详情/结果/终止/删除的归属检查、别名前缀表、过滤。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-apdapi-')));
process.env.PROJECT_ROOT = tmpRoot;
process.env.SCAN_ALLOWED_TARGETS = '2001:db8::/32';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
const mockSpawn = jest.fn(() => ({ pid: 1, unref: jest.fn(), on: jest.fn(), stderr: { pipe: jest.fn() }, killed: false }));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const { DIRS } = require('../services/storageService');

const tokenFor = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`;
const ADMIN = tokenFor(1);
const USER = tokenFor(2);

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      const id = params[0];
      return [[{ id, phone: `1380000000${id}`, role: id === 1 ? 'admin' : 'user' }]];
    }
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (new RegExp(pattern).test(sql)) return fn(sql, params);
    }
    return [{ affectedRows: 1 }];
  });
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

beforeAll(() => require('../services/storageService').ensureDirs());
afterAll(() => {
  delete process.env.SCAN_ALLOWED_TARGETS;
  delete process.env.PROJECT_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  jest.clearAllMocks();
  installDb();
});

describe('权限', () => {
  test.each([
    ['post', '/api/apd'], ['post', '/api/apd/cancel/1'], ['get', '/api/apd/tasks'], ['get', '/api/apd/task/1'],
    ['get', '/api/apd/result/1'], ['get', '/api/apd/aliased'], ['delete', '/api/apd/aliased/1'], ['post', '/api/apd/filter'], ['delete', '/api/apd/1']
  ])('%s %s 未登录返回 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  test('移除别名前缀需要管理员', async () => {
    const res = await request(app).delete('/api/apd/aliased/1').set('Authorization', USER);
    expect(res.status).toBe(403);
    expect(calls(/DELETE FROM aliased_prefixes/)).toHaveLength(0);
  });
});

describe('POST /api/apd', () => {
  test('合法请求：202，返回任务 ID 与数量；写审计', async () => {
    const res = await request(app).post('/api/apd').set('Authorization', USER)
      .send({ prefixes: ['2001:db8:1::/48', '2001:db8:2::/48'], rate: '5M' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, prefixCount: 2, probeCount: 32, rate: '5M' });
    expect(typeof res.body.taskId).toBe('number');
    expect(mockSpawn).not.toHaveBeenCalled();
    await flush();
    const audit = calls(/INSERT INTO audit_logs/)[0];
    expect(audit[1]).toEqual(expect.arrayContaining(['task.create', 'apd_task']));
  });

  test('目标不在白名单：403，不创建任务', async () => {
    const res = await request(app).post('/api/apd').set('Authorization', USER).send({ prefixes: ['2400:cb00::/32'] });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(calls(/INSERT INTO tasks/)).toHaveLength(0);
  });

  test('参数不合法：400', async () => {
    const res = await request(app).post('/api/apd').set('Authorization', USER).send({ prefixes: ['2001:db8::/63'] });
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/apd').set('Authorization', USER).send({})).status).toBe(400);
  });

  test('数据库错误：500，不泄露内部信息', async () => {
    installDb({ 'INSERT INTO tasks': () => { throw new Error('secret-db-detail'); } });
    const res = await request(app).post('/api/apd').set('Authorization', USER).send({ prefixes: ['2001:db8::/48'] });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret-db-detail');
  });
});

describe('任务查询', () => {
  test('GET /tasks：只查自己的 apd 任务，支持状态过滤与分页', async () => {
    installDb({
      'FROM tasks WHERE user_id': (sql) => (/COUNT/.test(sql) ? [[{ total: 41 }]] : [[{ id: 1, status: 'completed' }]])
    });
    const res = await request(app).get('/api/apd/tasks?status=completed&page=2').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 41, page: 2, totalPages: 3 });
    const [sql, params] = calls(/SELECT id, description/)[0];
    expect(sql).toContain("task_type = 'apd'");
    expect(params).toEqual([2, 'completed', 20, 20]);
  });

  test('GET /tasks：忽略非法状态', async () => {
    installDb({ 'FROM tasks WHERE user_id': (sql) => (/COUNT/.test(sql) ? [[{ total: 0 }]] : [[]]) });
    await request(app).get('/api/apd/tasks?status=bogus').set('Authorization', USER);
    expect(calls(/SELECT id, description/)[0][1]).toEqual([2, 20, 0]);
  });

  test('任务 ID 非法：400；不属于自己：404', async () => {
    expect((await request(app).get('/api/apd/task/abc').set('Authorization', USER)).status).toBe(400);
    installDb({ 'FROM tasks WHERE id = \\?': () => [[]] });
    for (const [method, url] of [['get', '/api/apd/task/9'], ['get', '/api/apd/result/9'], ['post', '/api/apd/cancel/9'], ['delete', '/api/apd/9']]) {
      expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(404);
    }
    for (const [sql, params] of calls(/FROM tasks WHERE id = \?/)) {
      expect(sql).toContain('user_id = ?');
      expect(sql).toContain("task_type = 'apd'");
      expect(params).toEqual([9, 2]);
    }
  });

  test('GET /task/:id：已完成任务附带摘要计数；不返回内部文件路径', async () => {
    const summaryFile = path.join(DIRS.apdResults, 'detail.json');
    fs.writeFileSync(summaryFile, JSON.stringify({ prefixCount: 3, probesPerPrefix: 16, responders: 19, counts: { aliased: 1, uncertain: 1, clean: 1 }, clearedFromTable: 0, finishedAt: 'x', aliased: [{ prefix: 'secret-list' }] }));
    installDb({
      'FROM tasks WHERE id = \\?': () => [[{ id: 7, status: 'completed', output_path: summaryFile, params: JSON.stringify({ prefixCount: 3, probeCount: 48 }) }]]
    });
    const res = await request(app).get('/api/apd/task/7').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ id: 7, prefixCount: 3, probeCount: 48, summary: { counts: { aliased: 1, uncertain: 1, clean: 1 } } });
    expect(res.body.task.output_path).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secret-list');
  });

  test('GET /task/:id：未完成任务 summary 为 null；摘要文件缺失也不报错', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 7, status: 'running', output_path: 'x', params: {} }]] });
    expect((await request(app).get('/api/apd/task/7').set('Authorization', USER)).body.task.summary).toBeNull();
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 7, status: 'completed', output_path: path.join(tmpRoot, 'nope.json'), params: '{bad' }]] });
    const res = await request(app).get('/api/apd/task/7').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.task.summary).toBeNull();
  });

  test('GET /result/:id：下载摘要；文件不存在 404', async () => {
    const file = path.join(DIRS.apdResults, 'dl.json');
    fs.writeFileSync(file, '{"ok":true}');
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ output_path: file }]] });
    const res = await request(app).get('/api/apd/result/3').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('apd_result_3.json');
    expect(res.body).toEqual({ ok: true });

    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ output_path: path.join(tmpRoot, 'gone.json') }]] });
    expect((await request(app).get('/api/apd/result/3').set('Authorization', USER)).status).toBe(404);
  });

  test('GET /result/:id：结果路径越出存储目录时拒绝', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ output_path: '../../etc/passwd' }]] });
    const res = await request(app).get('/api/apd/result/3').set('Authorization', USER);
    expect([404, 500]).toContain(res.status);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});

describe('终止与删除', () => {
  test('终止 running 任务：先置 canceled 再发信号', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'running' }]] });
    const res = await request(app).post('/api/apd/cancel/3').set('Authorization', USER);
    expect(res.status).toBe(200);
    const update = calls(/SET status = \?/)[0];
    expect(update[1][0]).toBe('canceled');
    expect(mockSpawn).toHaveBeenCalled(); // pkill 兜底
  });

  test('终止 pending 任务：只改状态，不发信号', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'pending' }]] });
    expect((await request(app).post('/api/apd/cancel/3').set('Authorization', USER)).status).toBe(200);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test('已结束的任务不能终止：400', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'completed' }]] });
    expect((await request(app).post('/api/apd/cancel/3').set('Authorization', USER)).status).toBe(400);
  });

  test('删除：运行中的任务拒绝；否则删除文件和记录', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'running' }]] });
    expect((await request(app).delete('/api/apd/3').set('Authorization', USER)).status).toBe(400);

    const out = path.join(DIRS.apdResults, 'del.json');
    fs.writeFileSync(out, '{}');
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'completed', output_path: out, log_path: null, params: JSON.stringify({ planFile: path.join(DIRS.apdInputs, 'nope.json') }) }]] });
    const res = await request(app).delete('/api/apd/3').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(fs.existsSync(out)).toBe(false);
    expect(calls(/DELETE FROM tasks/)[0][1]).toEqual([3, 2]);
  });
});

describe('别名前缀表', () => {
  test('GET /aliased：分页与前缀搜索（LIKE 通配符被转义）', async () => {
    installDb({
      'FROM aliased_prefixes': (sql) => (/COUNT/.test(sql) ? [[{ total: 2 }]] : [[{ id: 1, prefix: '2001:db8::/64' }, { id: 2, prefix: '2001:db8:1::/64' }]])
    });
    const res = await request(app).get('/api/apd/aliased?search=2001:db8%25_&pageSize=500').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, page: 1, pageSize: 200 });
    const [, params] = calls(/SELECT id, prefix/)[0];
    expect(params[0]).toBe('2001:db8\\%\\_%');
  });

  test('DELETE /aliased/:id：管理员移除并写审计；不存在 404；ID 非法 400', async () => {
    installDb({ 'SELECT prefix FROM aliased_prefixes': () => [[{ prefix: '2001:db8::/64' }]] });
    const res = await request(app).delete('/api/apd/aliased/5').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(calls(/DELETE FROM aliased_prefixes WHERE id/)[0][1]).toEqual([5]);
    const audit = calls(/INSERT INTO audit_logs/)[0];
    expect(audit[1]).toEqual(expect.arrayContaining(['apd.aliased.remove', '2001:db8::/64']));

    installDb({ 'SELECT prefix FROM aliased_prefixes': () => [[]] });
    expect((await request(app).delete('/api/apd/aliased/5').set('Authorization', ADMIN)).status).toBe(404);
    expect((await request(app).delete('/api/apd/aliased/x').set('Authorization', ADMIN)).status).toBe(400);
  });
});

describe('POST /api/apd/filter', () => {
  test('用已知别名前缀过滤地址', async () => {
    installDb({ 'FROM aliased_prefixes': () => [[{ prefix: '2001:db8:1::/48' }]] });
    const res = await request(app).post('/api/apd/filter').set('Authorization', USER)
      .send({ addresses: ['2001:db8:1::5', '2001:db8:2::5'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, kept: 1, removed: 1 });
  });

  test('缺少输入：400', async () => {
    expect((await request(app).post('/api/apd/filter').set('Authorization', USER).send({})).status).toBe(400);
  });
});
