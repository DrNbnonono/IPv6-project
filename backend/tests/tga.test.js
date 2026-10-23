/**
 * /api/tga：登录、算法列表、创建（202/400/403/404）、任务查询/下载/终止/删除的归属检查。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-tgaapi-')));
process.env.PROJECT_ROOT = tmpRoot;

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
const mockSpawn = jest.fn(() => ({ pid: 1, unref: jest.fn(), on: jest.fn(), stderr: { pipe: jest.fn() } }));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const { DIRS } = require('../services/storageService');

const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) return [[{ id: params[0], phone: '13800000002', role: 'user' }]];
    for (const [pattern, fn] of Object.entries(handlers)) if (new RegExp(pattern).test(sql)) return fn(sql, params);
    if (/FROM aliased_prefixes/.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  });
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

beforeAll(() => require('../services/storageService').ensureDirs());
afterAll(() => {
  delete process.env.PROJECT_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  jest.clearAllMocks();
  installDb();
});

describe('权限与算法列表', () => {
  test.each([
    ['get', '/api/tga/algorithms'], ['post', '/api/tga'], ['post', '/api/tga/cancel/1'], ['get', '/api/tga/tasks'],
    ['get', '/api/tga/task/1'], ['get', '/api/tga/result/1'], ['delete', '/api/tga/1']
  ])('%s %s 未登录返回 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  test('GET /algorithms：算法、参数说明与上限', async () => {
    const res = await request(app).get('/api/tga/algorithms').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.data.algorithms.map((a) => a.id)).toEqual(['density-expand', 'subnet-walk', 'nibble-dist']);
    expect(res.body.data.limits).toMatchObject({ defaultBudget: 10000, maxBudget: 1000000, maxSeedLimit: 500000 });
  });
});

describe('POST /api/tga', () => {
  const seedFile = () => {
    const file = path.join(tmpRoot, 'api_seeds.txt');
    fs.writeFileSync(file, '2001:db8::1\n');
    return file;
  };

  test('合法请求：202，返回任务 ID；写审计；不启动进程', async () => {
    const file = seedFile();
    installDb({ 'FROM whitelists': () => [[{ file_path: file }]] });
    const res = await request(app).post('/api/tga').set('Authorization', USER).send({ algorithm: 'subnet-walk', seedFile: 'api_seeds.txt', budget: 100 });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, algorithm: 'subnet-walk', budget: 100, seedSource: 'file' });
    expect(typeof res.body.taskId).toBe('number');
    expect(mockSpawn).not.toHaveBeenCalled();
    await flush();
    expect(calls(/INSERT INTO audit_logs/)[0][1]).toEqual(expect.arrayContaining(['task.create', 'tga_task']));
  });

  test('参数不合法 400；别人的种子文件 403；库里没有种子 404', async () => {
    expect((await request(app).post('/api/tga').set('Authorization', USER).send({ algorithm: 'nope', seedFile: 'a.txt' })).status).toBe(400);
    installDb({ 'FROM whitelists': () => [[]] });
    expect((await request(app).post('/api/tga').set('Authorization', USER).send({ algorithm: 'density-expand', seedFile: 'a.txt' })).status).toBe(403);
    installDb({ 'FROM ip_prefixes': () => [[]] });
    expect((await request(app).post('/api/tga').set('Authorization', USER).send({ algorithm: 'density-expand', seedAsn: 1 })).status).toBe(404);
  });

  test('数据库错误：500，不泄露内部信息', async () => {
    const file = seedFile();
    installDb({ 'FROM whitelists': () => [[{ file_path: file }]], 'INSERT INTO tasks': () => { throw new Error('secret-db-detail'); } });
    const res = await request(app).post('/api/tga').set('Authorization', USER).send({ algorithm: 'density-expand', seedFile: 'api_seeds.txt' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret-db-detail');
  });
});

describe('任务查询', () => {
  test('GET /tasks：只查自己的 tga 任务，支持状态过滤与分页', async () => {
    installDb({ 'FROM tasks WHERE user_id': (sql) => (/COUNT/.test(sql) ? [[{ total: 41 }]] : [[{ id: 1, status: 'completed' }]]) });
    const res = await request(app).get('/api/tga/tasks?status=completed&page=2').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ total: 41, page: 2, totalPages: 3 });
    const [sql, params] = calls(/SELECT id, description/)[0];
    expect(sql).toContain("task_type = 'tga'");
    expect(params).toEqual([2, 'completed', 20, 20]);
  });

  test('任务 ID 非法 400；不属于自己 404（查询里限定用户与类型）', async () => {
    expect((await request(app).get('/api/tga/task/abc').set('Authorization', USER)).status).toBe(400);
    installDb({ 'FROM tasks WHERE id = \\?': () => [[]] });
    for (const [method, url] of [['get', '/api/tga/task/9'], ['get', '/api/tga/result/9'], ['post', '/api/tga/cancel/9'], ['delete', '/api/tga/9']]) {
      expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(404);
    }
    for (const [sql, params] of calls(/FROM tasks WHERE id = \?/)) {
      expect(sql).toContain('user_id = ?');
      expect(sql).toContain("task_type = 'tga'");
      expect(params).toEqual([9, 2]);
    }
  });

  test('GET /task/:id：完成的任务带摘要；不返回命令行与服务器路径', async () => {
    const summaryFile = path.join(DIRS.tgaResults, 'detail.json');
    fs.writeFileSync(summaryFile, JSON.stringify({ generated: 12, seeds: 3, exhausted: true, scannable: { allowed: true, reason: null }, fileName: 'whitelist_2_7.txt' }));
    installDb({
      'FROM tasks WHERE id = \\?': () => [[{
        id: 7, status: 'completed', command: 'node /secret/path/generate.js',
        params: JSON.stringify({ algorithm: 'density-expand', budget: 100, summaryFile, outFile: '/secret/out.txt', seedSource: { type: 'file', fileName: 's.txt' } })
      }]]
    });
    const res = await request(app).get('/api/tga/task/7').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ id: 7, algorithm: 'density-expand', budget: 100, seedSource: { type: 'file' }, summary: { generated: 12, fileName: 'whitelist_2_7.txt' } });
    expect(JSON.stringify(res.body)).not.toContain('/secret');
  });

  test('GET /task/:id：未完成任务 summary 为 null；摘要文件缺失也不报错', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 7, status: 'running', params: {} }]] });
    expect((await request(app).get('/api/tga/task/7').set('Authorization', USER)).body.task.summary).toBeNull();
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 7, status: 'completed', params: JSON.stringify({ summaryFile: path.join(tmpRoot, 'nope.json') }) }]] });
    const res = await request(app).get('/api/tga/task/7').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.task.summary).toBeNull();
  });

  test('GET /result/:id：下载地址文件；未完成 409；文件不存在 404', async () => {
    const file = path.join(DIRS.whitelists, 'whitelist_2_3.txt');
    fs.writeFileSync(file, '2001:db8::2\n2001:db8::3\n');
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ status: 'completed', output_path: file }]] });
    const res = await request(app).get('/api/tga/result/3').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('tga_targets_3.txt');
    expect(res.text).toBe('2001:db8::2\n2001:db8::3\n');

    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ status: 'running', output_path: file }]] });
    expect((await request(app).get('/api/tga/result/3').set('Authorization', USER)).status).toBe(409);
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ status: 'completed', output_path: path.join(tmpRoot, 'gone.txt') }]] });
    expect((await request(app).get('/api/tga/result/3').set('Authorization', USER)).status).toBe(404);
  });
});

describe('终止与删除', () => {
  test('终止 running 任务：先置 canceled 再发信号；pending 只改状态；已结束 400', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'running' }]] });
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    expect((await request(app).post('/api/tga/cancel/3').set('Authorization', USER)).status).toBe(200);
    expect(calls(/SET status = \?/)[0][1][0]).toBe('canceled');
    kill.mockRestore();

    db.query.mockClear();
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'pending' }]] });
    expect((await request(app).post('/api/tga/cancel/3').set('Authorization', USER)).status).toBe(200);

    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'completed' }]] });
    expect((await request(app).post('/api/tga/cancel/3').set('Authorization', USER)).status).toBe(400);
  });

  test('删除：运行中拒绝；否则删中间文件和记录，已生成并登记的地址文件保留', async () => {
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'running' }]] });
    expect((await request(app).delete('/api/tga/3').set('Authorization', USER)).status).toBe(400);

    const summary = path.join(DIRS.tgaResults, 'del.json');
    const output = path.join(DIRS.whitelists, 'whitelist_2_kept.txt');
    fs.writeFileSync(summary, '{}');
    fs.writeFileSync(output, '2001:db8::2\n');
    installDb({ 'FROM tasks WHERE id = \\?': () => [[{ id: 3, status: 'completed', params: JSON.stringify({ summaryFile: summary, outFile: output }) }]] });
    const res = await request(app).delete('/api/tga/3').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(fs.existsSync(summary)).toBe(false);
    expect(fs.existsSync(output)).toBe(true);
    expect(calls(/DELETE FROM tasks/)[0][1]).toEqual([3, 2]);
  });
});
