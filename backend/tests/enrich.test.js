/**
 * 富化任务与接口：参数校验、入队、分批扫描（范围/默认过滤/limit/取消）、runner 收尾、
 * /api/database/classify-iid 与 /enrich-iid/* 的权限与行为。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';
process.env.ENRICH_BATCH_SIZE = '100';
process.env.ENRICH_BATCH_PAUSE_MS = '0';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const enrichTasks = require('../services/enrichTaskService');

const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;
const ADMIN = `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`;

const TYPES = ['ieee', 'isatap', 'ipv4-32', 'ipv4-64', 'embed-port', 'low-byte', 'byte-pattern', 'random', 'service'];
const typeRows = TYPES.map((name, i) => ({ type_id: i + 1, type_name: name, description: `${name} 说明`, is_risky: name === 'low-byte' ? 1 : 0 }));
const ID = Object.fromEntries(typeRows.map((r) => [r.type_name, r.type_id]));

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      return [[{ id: params[0], phone: `1380000000${params[0]}`, role: params[0] === 1 ? 'admin' : 'user' }]];
    }
    for (const [pattern, fn] of Object.entries(handlers)) if (new RegExp(pattern).test(sql)) return fn(sql, params);
    if (/FROM address_types/.test(sql)) return [typeRows];
    if (/FROM ip_prefixes/.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  });
};
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  jest.clearAllMocks();
  installDb();
});

describe('resolveParams', () => {
  const { resolveParams, EnrichError } = enrichTasks;

  test('范围三选一或明确 all=true；默认 overwrite=false、fillPrefix=true', () => {
    expect(resolveParams({ asn: '4134' })).toEqual({ scope: { asn: 4134 }, overwrite: false, fillPrefix: true, limit: null });
    expect(resolveParams({ countryId: 'cn', overwrite: 'true', fillPrefix: false, limit: 50 })).toEqual({ scope: { countryId: 'CN' }, overwrite: true, fillPrefix: false, limit: 50 });
    expect(resolveParams({ prefixId: 3 }).scope).toEqual({ prefixId: 3 });
    expect(resolveParams({ all: true }).scope).toEqual({});
  });

  test.each([
    [{}, '请指定范围'],
    [{ all: false }, '请指定范围'],
    [{ asn: 1, all: true }, '不能与'],
    [{ asn: 0 }, 'asn'],
    [{ asn: 'x' }, 'asn'],
    [{ countryId: 86 }, 'countryId'],
    [{ prefixId: 1.5 }, 'prefixId'],
    [{ all: true, limit: 0 }, 'limit'],
    [{ all: true, overwrite: 'maybe' }, '布尔']
  ])('非法参数 %j', (body, message) => {
    expect(() => resolveParams(body)).toThrow(EnrichError);
    expect(() => resolveParams(body)).toThrow(message);
  });
});

describe('scanAndEnrich', () => {
  const task = (params, id = 11) => ({ id, userId: 1, params });
  const addr = (id, a, extra = {}) => ({ address_id: id, address: a, prefix_id: 5, iid_type: ID.random, ...extra });
  const selects = () => calls(/FROM active_addresses/);
  const typeUpdates = () => calls(/SET iid_type/);

  test('按 address_id 分批推进；每批 SQL 带范围与“只取待处理行”条件；摘要汇总', async () => {
    let served = 0;
    installDb({
      'FROM tasks WHERE id': () => [[{ status: 'running' }]],
      'FROM active_addresses': (sql, params) => {
        const after = params[0];
        const size = params[params.length - 1];
        const all = Array.from({ length: 250 }, (_, i) => addr(i + 1, `2001:db8::${(i % 9) + 1}`));
        const batch = all.filter((r) => r.address_id > after).slice(0, size);
        served += batch.length;
        return [batch];
      }
    });

    const summary = await enrichTasks.scanAndEnrich(task({ scope: { asn: 4134 }, overwrite: false, fillPrefix: false }));
    expect(summary).toMatchObject({ scanned: 250, classified: 250, updated: 250, lastAddressId: 250, prefixesLoaded: 0 });
    expect(selects()).toHaveLength(3); // 100 + 100 + 50
    const [sql, params] = selects()[0];
    expect(sql).toMatch(/prefix_id IN \(SELECT prefix_id FROM ip_prefixes WHERE asn = \?\)/);
    expect(sql).toMatch(/iid_type IS NULL OR iid_type = \?\)/);
    expect(sql).not.toMatch(/prefix_id IS NULL/);
    expect(params).toEqual([0, 4134, ID.random, 100]);
    expect(selects()[1][1][0]).toBe(100); // 从上一批的最后一个 address_id 之后继续
    expect(served).toBe(250);
  });

  test('countryId / prefixId / 全表 的范围条件；overwrite 时不加“待处理”过滤；fillPrefix 时载入前缀并加 prefix_id IS NULL', async () => {
    installDb({ 'FROM tasks WHERE id': () => [[{ status: 'running' }]], 'FROM active_addresses': () => [[]] });

    await enrichTasks.scanAndEnrich(task({ scope: { countryId: 'CN' }, overwrite: true, fillPrefix: false }));
    expect(selects()[0][0]).toMatch(/WHERE country_id = \?\)|ip_prefixes WHERE country_id = \?/);
    expect(selects()[0][0]).not.toMatch(/iid_type IS NULL/);

    db.query.mockClear();
    installDb({ 'FROM tasks WHERE id': () => [[{ status: 'running' }]], 'FROM active_addresses': () => [[]] });
    await enrichTasks.scanAndEnrich(task({ scope: { prefixId: 9 }, fillPrefix: true }));
    expect(selects()[0][0]).toMatch(/AND prefix_id = \?/);
    expect(selects()[0][0]).toMatch(/OR prefix_id IS NULL/);
    expect(calls(/FROM ip_prefixes WHERE version/)).toHaveLength(1);

    db.query.mockClear();
    installDb({ 'FROM tasks WHERE id': () => [[{ status: 'running' }]], 'FROM active_addresses': () => [[]] });
    await enrichTasks.scanAndEnrich(task({ scope: {}, fillPrefix: false }));
    expect(selects()[0][0]).not.toMatch(/prefix_id IN|prefix_id = /);
  });

  test('limit：最多扫描这么多行，最后一批按剩余数量取', async () => {
    installDb({
      'FROM tasks WHERE id': () => [[{ status: 'running' }]],
      'FROM active_addresses': (sql, params) => [Array.from({ length: params[params.length - 1] }, (_, i) => addr(params[0] + i + 1, '2001:db8::1'))]
    });
    const summary = await enrichTasks.scanAndEnrich(task({ scope: {}, fillPrefix: false, limit: 130 }));
    expect(summary.scanned).toBe(130);
    expect(selects().map(([, p]) => p[p.length - 1])).toEqual([100, 30]);
  });

  test('运行中的进度可查询', async () => {
    let seen = null;
    installDb({
      'FROM tasks WHERE id': () => [[{ status: 'running' }]],
      'FROM active_addresses': (sql, params) => {
        if (params[0] > 0) seen = enrichTasks.getProgress(12);
        return [params[0] === 0 ? Array.from({ length: 100 }, (_, i) => addr(i + 1, '2001:db8::1')) : []];
      }
    });
    await enrichTasks.scanAndEnrich(task({ scope: {}, fillPrefix: false }, 12));
    expect(seen).toMatchObject({ scanned: 100, updated: 100, lastAddressId: 100 });
    expect(enrichTasks.getProgress('nope')).toBeNull();
  });

  test('任务被取消：在批与批之间停止，返回 null，不再继续扫描', async () => {
    let checks = 0;
    installDb({
      'FROM tasks WHERE id': () => [[{ status: ++checks >= 2 ? 'canceled' : 'running' }]],
      'FROM active_addresses': (sql, params) => [Array.from({ length: 100 }, (_, i) => addr(params[0] + i + 1, '2001:db8::1'))]
    });
    expect(await enrichTasks.scanAndEnrich(task({ scope: {}, fillPrefix: false }, 13))).toBeNull();
    expect(selects()).toHaveLength(1);
  });

  test('任务行已不存在也视为取消；address_types 缺少 random 时报错', async () => {
    installDb({ 'FROM tasks WHERE id': () => [[]] });
    expect(await enrichTasks.scanAndEnrich(task({ scope: {}, fillPrefix: false }, 14))).toBeNull();

    installDb({ 'FROM address_types': () => [typeRows.filter((r) => r.type_name !== 'random')] });
    await expect(enrichTasks.scanAndEnrich(task({ scope: {} }, 15))).rejects.toThrow('random');
  });
});

describe('runEnrichTask（调度器调用）', () => {
  test('完成：写摘要到 params，再标记 completed', async () => {
    installDb({
      'FROM tasks WHERE id': () => [[{ status: 'running' }]],
      'FROM active_addresses': (sql, params) => [params[0] === 0 ? [{ address_id: 1, address: '2001:db8::1', prefix_id: 5, iid_type: ID.random }] : []]
    });
    await enrichTasks.runEnrichTask({ id: 21, userId: 1, params: { scope: { asn: 1 }, fillPrefix: false } });
    await flush();
    const paramsWrite = calls(/UPDATE tasks SET params/)[0];
    expect(JSON.parse(paramsWrite[1][0])).toMatchObject({ scope: { asn: 1 }, summary: { scanned: 1, updated: 1 } });
    const finished = calls(/UPDATE tasks\s+SET status/)[0];
    expect(finished[1][0]).toBe('completed');
  });

  test('出错：标记 failed 并带上原因', async () => {
    installDb({ 'FROM active_addresses': () => { throw new Error('lock wait timeout'); }, 'FROM tasks WHERE id': () => [[{ status: 'running' }]] });
    await enrichTasks.runEnrichTask({ id: 22, userId: 1, params: { scope: {}, fillPrefix: false } });
    await flush();
    const finished = calls(/UPDATE tasks\s+SET status/)[0];
    expect(finished[1].slice(0, 2)).toEqual(['failed', 'lock wait timeout']);
  });

  test('被取消：不写摘要、不改状态', async () => {
    installDb({ 'FROM tasks WHERE id': () => [[{ status: 'canceled' }]] });
    await enrichTasks.runEnrichTask({ id: 23, userId: 1, params: { scope: {}, fillPrefix: false } });
    await flush();
    expect(calls(/UPDATE tasks/)).toHaveLength(0);
  });
});

describe('接口', () => {
  test.each([
    ['post', '/api/database/classify-iid'], ['post', '/api/database/enrich-iid'], ['get', '/api/database/enrich-iid/tasks'],
    ['get', '/api/database/enrich-iid/task/1'], ['post', '/api/database/enrich-iid/cancel/1']
  ])('%s %s 未登录返回 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  test.each([
    ['post', '/api/database/enrich-iid'], ['get', '/api/database/enrich-iid/tasks'],
    ['get', '/api/database/enrich-iid/task/1'], ['post', '/api/database/enrich-iid/cancel/1']
  ])('%s %s 普通用户返回 403', async (method, url) => {
    expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(403);
  });

  describe('POST /classify-iid（普通用户可用）', () => {
    test('分类、MAC、风险标记、计数与无效数量', async () => {
      const res = await request(app).post('/api/database/classify-iid').set('Authorization', USER)
        .send({ addresses: ['2001:db8::1', '2001:db8:0:1:21a:2bff:fe3c:4d5e', ' 2001:db8::53 ', '1.2.3.4', 'bad'] });
      expect(res.status).toBe(200);
      const { items, counts, invalid } = res.body.data;
      expect(items[0]).toMatchObject({ address: '2001:db8::1', valid: true, type: 'low-byte', isRisky: true, mac: null, description: 'low-byte 说明' });
      expect(items[1]).toMatchObject({ type: 'ieee', mac: '00:1a:2b:3c:4d:5e', isRisky: false });
      expect(items[2]).toMatchObject({ address: '2001:db8::53', type: 'service' });
      expect(items[3]).toEqual({ address: '1.2.3.4', valid: false, type: null });
      expect(counts).toEqual({ 'low-byte': 1, ieee: 1, service: 1 });
      expect(invalid).toBe(2);
    });

    test('参数校验：缺少/为空/超过 1000 个；不记入 db.write 审计', async () => {
      const auth = { Authorization: USER };
      expect((await request(app).post('/api/database/classify-iid').set(auth).send({})).status).toBe(400);
      expect((await request(app).post('/api/database/classify-iid').set(auth).send({ addresses: [] })).status).toBe(400);
      expect((await request(app).post('/api/database/classify-iid').set(auth).send({ addresses: new Array(1001).fill('2001:db8::1') })).status).toBe(400);
      await request(app).post('/api/database/classify-iid').set(auth).send({ addresses: ['2001:db8::1'] });
      await flush();
      expect(calls(/INSERT INTO audit_logs/)).toHaveLength(0);
    });

    test('库里没有对应类型描述时仍返回分类结果', async () => {
      installDb({ 'FROM address_types': () => [[]] });
      const res = await request(app).post('/api/database/classify-iid').set('Authorization', USER).send({ addresses: ['2001:db8::1'] });
      expect(res.body.data.items[0]).toMatchObject({ type: 'low-byte', description: null, isRisky: null });
    });
  });

  describe('POST /enrich-iid（管理员）', () => {
    test('入队返回 202；记录任务参数并写审计', async () => {
      const res = await request(app).post('/api/database/enrich-iid').set('Authorization', ADMIN).send({ asn: 4134, overwrite: true });
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ success: true, scope: { asn: 4134 }, overwrite: true, fillPrefix: true });
      expect(Number.isInteger(res.body.taskId)).toBe(true);
      const insert = calls(/INSERT INTO tasks/)[0];
      expect(insert[1]).toEqual(expect.arrayContaining([1, 'enrich-iid', 'enrich']));
      expect(JSON.parse(insert[1][8])).toEqual({ scope: { asn: 4134 }, overwrite: true, fillPrefix: true, limit: null });
      await flush();
      expect(calls(/INSERT INTO audit_logs/).length).toBeGreaterThan(0);
    });

    test('缺少范围返回 400，不创建任务', async () => {
      const res = await request(app).post('/api/database/enrich-iid').set('Authorization', ADMIN).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('请指定范围');
      expect(calls(/INSERT INTO tasks/)).toHaveLength(0);
    });

    test('address_types 缺少 random 返回 500', async () => {
      installDb({ 'FROM address_types': () => [typeRows.filter((r) => r.type_name !== 'random')] });
      const res = await request(app).post('/api/database/enrich-iid').set('Authorization', ADMIN).send({ all: true });
      expect(res.status).toBe(500);
      expect(res.body.message).toContain('random');
    });

    test('数据库错误返回 500 且不泄露细节', async () => {
      installDb({ 'FROM address_types': () => { throw new Error('secret table detail'); } });
      const res = await request(app).post('/api/database/enrich-iid').set('Authorization', ADMIN).send({ all: true });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });
  });

  describe('任务查询与终止（管理员）', () => {
    test('列表：分页、状态过滤', async () => {
      installDb({
        'SELECT COUNT': () => [[{ total: 45 }]],
        'FROM tasks WHERE task_type': () => [[{ id: 5, description: 'd', status: 'completed' }]]
      });
      const res = await request(app).get('/api/database/enrich-iid/tasks?page=2&status=completed').set('Authorization', ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({ total: 45, page: 2, perPage: 20, totalPages: 3 });
      const list = calls(/SELECT id, description, status/)[0];
      expect(list[0]).toMatch(/status = \?/);
      expect(list[1]).toEqual(['completed', 20, 20]);

      await request(app).get('/api/database/enrich-iid/tasks?status=bogus').set('Authorization', ADMIN);
      expect(calls(/SELECT id, description, status/)[1][0]).not.toMatch(/status = \?/);
    });

    test('详情：参数与摘要分开；运行中带进度；不存在 404；ID 非法 400', async () => {
      installDb({
        'FROM tasks WHERE id = \\? AND task_type': () => [[{ id: 7, status: 'completed', error_message: null, params: JSON.stringify({ scope: { asn: 1 }, overwrite: false, summary: { scanned: 9, updated: 4 } }) }]]
      });
      const done = await request(app).get('/api/database/enrich-iid/task/7').set('Authorization', ADMIN);
      expect(done.status).toBe(200);
      expect(done.body.task).toMatchObject({ id: 7, params: { scope: { asn: 1 }, overwrite: false }, summary: { scanned: 9, updated: 4 }, progress: null });
      expect(done.body.task.params.summary).toBeUndefined();

      installDb({ 'FROM tasks WHERE id = \\? AND task_type': () => [[{ id: 8, status: 'running', params: '{broken' }]] });
      const running = await request(app).get('/api/database/enrich-iid/task/8').set('Authorization', ADMIN);
      expect(running.body.task).toMatchObject({ status: 'running', params: {}, summary: null });

      installDb({ 'FROM tasks WHERE id = \\? AND task_type': () => [[]] });
      expect((await request(app).get('/api/database/enrich-iid/task/9').set('Authorization', ADMIN)).status).toBe(404);
      expect((await request(app).get('/api/database/enrich-iid/task/abc').set('Authorization', ADMIN)).status).toBe(400);
    });

    test('终止：pending/running 可终止；已结束 400；不存在 404', async () => {
      installDb({ 'SELECT id, status FROM tasks': () => [[{ id: 3, status: 'running' }]] });
      const ok = await request(app).post('/api/database/enrich-iid/cancel/3').set('Authorization', ADMIN);
      expect(ok.status).toBe(200);
      expect(calls(/UPDATE tasks\s+SET status/)[0][1][0]).toBe('canceled');

      installDb({ 'SELECT id, status FROM tasks': () => [[{ id: 3, status: 'completed' }]] });
      const done = await request(app).post('/api/database/enrich-iid/cancel/3').set('Authorization', ADMIN);
      expect(done.status).toBe(400);

      installDb({ 'SELECT id, status FROM tasks': () => [[]] });
      expect((await request(app).post('/api/database/enrich-iid/cancel/3').set('Authorization', ADMIN)).status).toBe(404);
      expect((await request(app).post('/api/database/enrich-iid/cancel/0').set('Authorization', ADMIN)).status).toBe(400);
    });

    test('数据库错误返回 500', async () => {
      installDb({ 'FROM tasks WHERE task_type': () => { throw new Error('boom'); }, 'SELECT COUNT': () => { throw new Error('boom'); } });
      expect((await request(app).get('/api/database/enrich-iid/tasks').set('Authorization', ADMIN)).status).toBe(500);
    });
  });
});
