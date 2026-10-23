/**
 * /api/admin：必须是管理员；白名单/黑名单增删、用户配额、审计日志查询；所有修改都写审计。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');

const tokenFor = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`;
const ADMIN = tokenFor(1);
const USER = tokenFor(2);

// 用户 1 是管理员，2 是普通用户；其余 SQL 由各用例通过 handlers 提供
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

const auditInserts = () => db.query.mock.calls.filter(([sql]) => /INSERT INTO audit_logs/.test(sql));
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.resetAllMocks();
  installDb();
});

describe('权限', () => {
  test.each([
    ['get', '/api/admin/scan-policy'],
    ['post', '/api/admin/scan-allowlist'],
    ['get', '/api/admin/quotas'],
    ['put', '/api/admin/quotas/2'],
    ['get', '/api/admin/audit-logs'],
    ['get', '/api/admin/users']
  ])('%s %s：未登录 401，普通用户 403', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(403);
  });
});

describe('白名单 / 黑名单', () => {
  test('GET /scan-policy 返回内置规则、默认值和两张名单', async () => {
    installDb({
      'FROM scan_allowlist': async () => [[{ id: 1, cidr: '2001:db8::/32', note: 'lab' }]],
      'FROM scan_blacklist': async () => [[]]
    });
    const res = await request(app).get('/api/admin/scan-policy').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.allowlist).toHaveLength(1);
    expect(res.body.data.defaults.maxRate).toBe('100M');
    expect(res.body.data.builtinBlocked.length).toBeGreaterThan(5);
  });

  test('添加白名单：存规范化后的 CIDR，写审计', async () => {
    installDb({ 'INSERT INTO scan_allowlist': async () => [{ insertId: 7 }] });
    const res = await request(app).post('/api/admin/scan-allowlist').set('Authorization', ADMIN).send({ cidr: '2001:0DB8:0::/32', note: '实验网段' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 7, cidr: '2001:db8::/32' });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO scan_allowlist/.test(sql));
    expect(insert[1]).toEqual(['2001:db8::/32', '实验网段', 1]);

    await flush();
    const [, params] = auditInserts()[0];
    expect(params.slice(0, 5)).toEqual([1, 'admin.allowlist.add', 'allowlist', '2001:db8::/32', 1]);
  });

  test.each([['example.com'], ['2001:db8::/129'], [''], [123], [undefined]])('添加非法条目 %p：400，不写库', async (cidr) => {
    const res = await request(app).post('/api/admin/scan-allowlist').set('Authorization', ADMIN).send({ cidr });
    expect(res.status).toBe(400);
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO scan_/.test(sql))).toBe(false);
  });

  test('说明过长：400', async () => {
    const res = await request(app).post('/api/admin/scan-allowlist').set('Authorization', ADMIN).send({ cidr: '2001:db8::/32', note: 'x'.repeat(256) });
    expect(res.status).toBe(400);
  });

  test('重复添加：409', async () => {
    installDb({ 'INSERT INTO scan_blacklist': async () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); } });
    const res = await request(app).post('/api/admin/scan-blacklist').set('Authorization', ADMIN).send({ cidr: '2001:db8:bad::/48', note: '对方要求退出' });
    expect(res.status).toBe(409);
  });

  test('黑名单使用 reason 列', async () => {
    installDb({ 'INSERT INTO scan_blacklist': async () => [{ insertId: 1 }] });
    await request(app).post('/api/admin/scan-blacklist').set('Authorization', ADMIN).send({ cidr: '198.51.100.0/24', note: '敏感' });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO scan_blacklist/.test(sql));
    expect(insert[0]).toMatch(/\(cidr, reason, created_by\)/);
  });

  test('移除条目：不存在 404；存在则删除并审计', async () => {
    installDb({ 'SELECT cidr FROM scan_allowlist': async () => [[]] });
    expect((await request(app).delete('/api/admin/scan-allowlist/9').set('Authorization', ADMIN)).status).toBe(404);

    installDb({ 'SELECT cidr FROM scan_allowlist': async () => [[{ cidr: '2001:db8::/32' }]] });
    const res = await request(app).delete('/api/admin/scan-allowlist/9').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    await flush();
    expect(auditInserts().some(([, p]) => p[1] === 'admin.allowlist.remove' && p[3] === '2001:db8::/32')).toBe(true);
  });

  test('移除条目：非法 ID 400', async () => {
    expect((await request(app).delete('/api/admin/scan-allowlist/abc').set('Authorization', ADMIN)).status).toBe(400);
    expect((await request(app).delete('/api/admin/scan-allowlist/0').set('Authorization', ADMIN)).status).toBe(400);
  });
});

describe('用户配额', () => {
  test('设置速率与每日上限（upsert），写审计', async () => {
    installDb({
      'SELECT id FROM users': async () => [[{ id: 2 }]],
      'FROM user_quotas': async () => [[]]
    });
    const res = await request(app).put('/api/admin/quotas/2').set('Authorization', ADMIN).send({ maxRate: '20M', dailyScanLimit: 30 });
    expect(res.status).toBe(200);
    const upsert = db.query.mock.calls.find(([sql]) => /INSERT INTO user_quotas/.test(sql));
    expect(upsert[1]).toEqual([2, 20e6, 30, 1]);
    await flush();
    const detail = JSON.parse(auditInserts()[0][1][5]);
    expect(detail).toMatchObject({ maxRate: '20M', dailyScanLimit: 30 });
  });

  test('只提供一个字段时，另一个字段沿用现有值；null 表示恢复默认', async () => {
    installDb({
      'SELECT id FROM users': async () => [[{ id: 2 }]],
      'FROM user_quotas': async () => [[{ max_rate_bps: 5e6, daily_scan_limit: 10 }]]
    });
    await request(app).put('/api/admin/quotas/2').set('Authorization', ADMIN).send({ dailyScanLimit: 20 });
    expect(db.query.mock.calls.find(([sql]) => /INSERT INTO user_quotas/.test(sql))[1]).toEqual([2, 5e6, 20, 1]);

    db.query.mockClear();
    await request(app).put('/api/admin/quotas/2').set('Authorization', ADMIN).send({ maxRate: null });
    expect(db.query.mock.calls.find(([sql]) => /INSERT INTO user_quotas/.test(sql))[1]).toEqual([2, null, 10, 1]);
  });

  test.each([
    [{ maxRate: 'fast' }],
    [{ maxRate: '-1M' }],
    [{ dailyScanLimit: -1 }],
    [{ dailyScanLimit: 1.5 }],
    [{ dailyScanLimit: 1e9 }],
    [{}]
  ])('非法请求体 %p：400', async (body) => {
    const res = await request(app).put('/api/admin/quotas/2').set('Authorization', ADMIN).send(body);
    expect(res.status).toBe(400);
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO user_quotas/.test(sql))).toBe(false);
  });

  test('用户不存在：404', async () => {
    installDb({ 'SELECT id FROM users': async () => [[]] });
    const res = await request(app).put('/api/admin/quotas/99').set('Authorization', ADMIN).send({ maxRate: '1M' });
    expect(res.status).toBe(404);
  });

  test('列表：速率格式化为 M/G 写法，并带默认值', async () => {
    installDb({ 'FROM user_quotas q': async () => [[{ user_id: 2, username: 'bob', max_rate_bps: '20000000', daily_scan_limit: 30, updated_at: 't' }]] });
    const res = await request(app).get('/api/admin/quotas').set('Authorization', ADMIN);
    expect(res.body.data.items).toEqual([{ userId: 2, username: 'bob', maxRate: '20M', dailyScanLimit: 30, updatedAt: 't' }]);
    expect(res.body.data.defaults.dailyScanLimit).toBe(100);
  });

  test('恢复默认：没有自定义配额时 404', async () => {
    installDb({ 'DELETE FROM user_quotas': async () => [{ affectedRows: 0 }] });
    expect((await request(app).delete('/api/admin/quotas/2').set('Authorization', ADMIN)).status).toBe(404);
    installDb({ 'DELETE FROM user_quotas': async () => [{ affectedRows: 1 }] });
    expect((await request(app).delete('/api/admin/quotas/2').set('Authorization', ADMIN)).status).toBe(200);
  });
});

describe('审计日志查询', () => {
  const setup = () => installDb({
    'COUNT\\(\\*\\)': async () => [[{ total: 1 }]],
    'FROM audit_logs a': async () => [[{ id: 5, user_id: 2, username: 'bob', action: 'task.create', success: 1, detail: '{"a":1}' }]]
  });

  test('返回分页结果', async () => {
    setup();
    const res = await request(app).get('/api/admin/audit-logs?action=task&success=false&page=1&pageSize=10').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(res.body.data.items[0].detail).toEqual({ a: 1 });
  });

  test.each([
    ['since=not-a-date'],
    ['userId=1;drop'],
    [`action=${'a'.repeat(65)}`]
  ])('非法过滤条件 %s：400', async (query) => {
    setup();
    const res = await request(app).get(`/api/admin/audit-logs?${query}`).set('Authorization', ADMIN);
    expect(res.status).toBe(400);
  });
});

describe('用户列表', () => {
  test('只返回 id / username / role', async () => {
    installDb({ 'SELECT id, username, role FROM users ORDER BY id': async () => [[{ id: 1, username: 'a', role: 'admin' }]] });
    const res = await request(app).get('/api/admin/users').set('Authorization', ADMIN);
    expect(res.body.data).toEqual([{ id: 1, username: 'a', role: 'admin' }]);
    const sql = db.query.mock.calls.find(([s]) => /ORDER BY id/.test(s))[0];
    expect(sql).not.toMatch(/password|phone/);
  });
});
