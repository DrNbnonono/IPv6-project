/**
 * 探针退出渠道：提交校验与防滥用、待审核请求、管理员审核（通过 → 黑名单）、公开接口与管理员接口。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const optOut = require('../services/optOutService');
const app = require('../app');

const tokenFor = (id) => `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`;
const ADMIN = tokenFor(1);
const USER = tokenFor(2);
const flush = () => new Promise((resolve) => setImmediate(resolve));

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      return [[{ id: params[0], phone: `1380000000${params[0]}`, role: params[0] === 1 ? 'admin' : 'user' }]];
    }
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (new RegExp(pattern).test(sql)) return fn(sql, params);
    }
    return [{ affectedRows: 1, insertId: 1 }];
  });
};
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

const VALID = { cidrs: ['2001:db8:1::/48'], contact: 'noc@example.net', organization: 'Example Net', note: '请排除' };

beforeEach(() => {
  jest.resetAllMocks();
  installDb({
    'COUNT\\(\\*\\) AS count FROM opt_out_requests WHERE source_ip': () => [[{ count: 0 }]],
    'SELECT id FROM opt_out_requests WHERE cidr': () => [[]]
  });
});

describe('validateSubmission', () => {
  test('规范化网段、去重，并接受数组、逗号/空白分隔的字符串', () => {
    const a = optOut.validateSubmission({ ...VALID, cidrs: ['2001:DB8:1:0::/48', '2001:db8:1::/48'] });
    expect(a).toMatchObject({ ok: true, cidrs: ['2001:db8:1::/48'] });
    const b = optOut.validateSubmission({ ...VALID, cidrs: '192.0.2.0/24, 2001:db8::1\n198.51.100.7' });
    expect(b.cidrs).toEqual(['192.0.2.0/24', '2001:db8::1', '198.51.100.7']);
  });

  test.each([
    [{ ...VALID, cidrs: [] }, /至少填写一个/],
    [{ ...VALID, cidrs: undefined }, /至少填写一个/],
    [{ ...VALID, cidrs: ['example.com'] }, /不是有效的/],
    [{ ...VALID, cidrs: Array.from({ length: 11 }, (_, i) => `2001:db8:${i}::/48`) }, /最多提交 10/],
    [{ ...VALID, cidrs: ['::/0'] }, /范围过大/],
    [{ ...VALID, cidrs: ['2001:db8::/16'] }, /不能短于 \/32/],
    [{ ...VALID, cidrs: ['10.0.0.0/8'] }, /不能短于 \/16/],
    [{ ...VALID, contact: '' }, /联系邮箱/],
    [{ ...VALID, contact: 'not-an-email' }, /联系邮箱/],
    [{ ...VALID, contact: `${'a'.repeat(300)}@example.net` }, /联系邮箱/],
    [{ ...VALID, organization: 'x'.repeat(121) }, /单位名称/],
    [{ ...VALID, organization: 42 }, /单位名称/],
    [{ ...VALID, note: 'x'.repeat(501) }, /补充说明/],
    [null, /至少填写一个/]
  ])('拒绝非法提交 %#', (body, message) => {
    const result = optOut.validateSubmission(body);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  test('控制字符被去掉，空白的可选项视为未提供', () => {
    const result = optOut.validateSubmission({ ...VALID, organization: '  \u0007 ', note: 'a\u0000b\nc' });
    expect(result).toMatchObject({ ok: true, organization: null, note: 'ab\nc' });
  });
});

describe('submit', () => {
  test('每个网段一行入库，联系人原样保存', async () => {
    const result = await optOut.submit({ ...VALID, cidrs: ['2001:db8:1::/48', '192.0.2.0/24'] }, '203.0.113.9');
    expect(result).toEqual({ ok: true, received: 2 });
    const inserts = calls(/INSERT INTO opt_out_requests/);
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual(['2001:db8:1::/48', 'noc@example.net', 'Example Net', '请排除', '203.0.113.9']);
  });

  test('已有相同网段的待审核/已通过请求时不重复入库，但仍返回成功', async () => {
    installDb({
      'COUNT\\(\\*\\) AS count FROM opt_out_requests WHERE source_ip': () => [[{ count: 0 }]],
      'SELECT id FROM opt_out_requests WHERE cidr': () => [[{ id: 5 }]]
    });
    expect(await optOut.submit(VALID, '203.0.113.9')).toEqual({ ok: true, received: 1 });
    expect(calls(/INSERT INTO opt_out_requests/)).toHaveLength(0);
  });

  test('同一 IP 待审核请求过多时 429', async () => {
    installDb({ 'COUNT\\(\\*\\) AS count FROM opt_out_requests WHERE source_ip': () => [[{ count: 20 }]] });
    const result = await optOut.submit(VALID, '203.0.113.9');
    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(calls(/INSERT INTO opt_out_requests/)).toHaveLength(0);
  });

  test('校验失败 400，不访问数据库', async () => {
    const result = await optOut.submit({ ...VALID, cidrs: ['::/0'] }, '203.0.113.9');
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('没有来源 IP 时也能提交', async () => {
    expect((await optOut.submit(VALID, undefined)).ok).toBe(true);
  });
});

describe('pendingCidrs', () => {
  test('返回待审核网段；表不存在时返回空数组；其他错误向上抛出', async () => {
    installDb({ 'FROM opt_out_requests WHERE status': () => [[{ cidr: '2001:db8::/48' }]] });
    expect(await optOut.pendingCidrs()).toEqual(['2001:db8::/48']);

    installDb({ 'FROM opt_out_requests WHERE status': () => { throw Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE' }); } });
    expect(await optOut.pendingCidrs()).toEqual([]);

    installDb({ 'FROM opt_out_requests WHERE status': () => { throw new Error('connection lost'); } });
    await expect(optOut.pendingCidrs()).rejects.toThrow('connection lost');
  });
});

describe('list / review', () => {
  const row = { id: 3, cidr: '2001:db8:1::/48', contact: 'noc@example.net', organization: 'Ex', note: null, status: 'pending', source_ip: '203.0.113.9', reviewed_by: null, reviewed_at: null, review_note: null, created_at: '2026-10-01' };

  test('list：按状态过滤并汇总各状态数量', async () => {
    installDb({
      'FROM opt_out_requests (WHERE status = \\? )?ORDER BY': () => [[row]],
      'GROUP BY status': () => [[{ status: 'pending', count: 2 }, { status: 'approved', count: '1' }, { status: 'weird', count: 9 }]]
    });
    const result = await optOut.list({ status: 'pending', limit: 9999, offset: -5 });
    expect(result.items[0]).toMatchObject({ id: 3, contact: 'noc@example.net', sourceIp: '203.0.113.9' });
    expect(result.counts).toEqual({ pending: 2, approved: 1, rejected: 0 });
    const [sql, params] = calls(/ORDER BY id DESC/)[0];
    expect(sql).toMatch(/LIMIT 500 OFFSET 0/);
    expect(params).toEqual(['pending']);
    expect((await optOut.list({ status: 'bogus' })).status).toBe(400);
    await optOut.list();
    expect(calls(/ORDER BY id DESC/)[1][0]).not.toMatch(/WHERE/);
  });

  test('通过：先写黑名单再改状态', async () => {
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: row.cidr, organization: 'Ex', status: 'pending' }]] });
    const result = await optOut.review({ id: 3, decision: 'approve', note: '已核实', adminId: 1 });
    expect(result).toEqual({ ok: true, cidr: row.cidr, status: 'approved' });
    const order = db.query.mock.calls.map(([sql]) => (/INSERT INTO scan_blacklist/.test(sql) ? 'blacklist' : /UPDATE opt_out_requests/.test(sql) ? 'update' : 'other'));
    expect(order.indexOf('blacklist')).toBeLessThan(order.indexOf('update'));
    expect(calls(/INSERT INTO scan_blacklist/)[0][1]).toEqual([row.cidr, '退出请求 #3：Ex', 1]);
  });

  test('驳回：不写黑名单', async () => {
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: row.cidr, organization: null, status: 'pending' }]] });
    expect((await optOut.review({ id: 3, decision: 'reject', adminId: 1 })).status).toBe('rejected');
    expect(calls(/INSERT INTO scan_blacklist/)).toHaveLength(0);
  });

  test.each([
    [{ id: 0, decision: 'approve' }, 400],
    [{ id: 3, decision: 'maybe' }, 400],
    [{ id: 3, decision: 'approve', note: 'x'.repeat(256) }, 400]
  ])('参数错误 %#', async (args, status) => {
    expect((await optOut.review(args)).status).toBe(status);
  });

  test('不存在 404；已处理 409；并发被别人先处理 409', async () => {
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[]] });
    expect((await optOut.review({ id: 9, decision: 'reject' })).status).toBe(404);
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: row.cidr, status: 'approved' }]] });
    expect((await optOut.review({ id: 3, decision: 'reject' })).status).toBe(409);
    installDb({
      'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: row.cidr, status: 'pending' }]],
      'UPDATE opt_out_requests': () => [{ affectedRows: 0 }]
    });
    expect((await optOut.review({ id: 3, decision: 'reject' })).status).toBe(409);
  });
});

describe('publicInfo', () => {
  test('来自环境变量；未配置时为 null/空数组', () => {
    const keys = ['SCAN_ORG_NAME', 'SCAN_CONTACT_EMAIL', 'SCAN_SOURCE_ADDRESSES', 'SCAN_PURPOSE'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    keys.forEach((k) => delete process.env[k]);
    expect(optOut.publicInfo()).toMatchObject({ organization: null, contactEmail: null, sourceAddresses: [], purpose: null });
    Object.assign(process.env, { SCAN_ORG_NAME: ' 某实验室 ', SCAN_CONTACT_EMAIL: 'abuse@lab.example', SCAN_SOURCE_ADDRESSES: '2001:db8:f::1, 192.0.2.1 ,', SCAN_PURPOSE: '互联网测量研究' });
    expect(optOut.publicInfo()).toMatchObject({ organization: '某实验室', contactEmail: 'abuse@lab.example', sourceAddresses: ['2001:db8:f::1', '192.0.2.1'], purpose: '互联网测量研究' });
    keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  });
});

describe('公开接口', () => {
  test('GET /api/opt-out/info 无需登录，且不含任何请求数据', async () => {
    const res = await request(app).get('/api/opt-out/info');
    expect(res.status).toBe(200);
    expect(res.body.data.limits).toEqual({ maxCidrs: 10, minPrefixV4: 16, minPrefixV6: 32 });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST /api/opt-out 无需登录：201，回应里没有联系邮箱，审计里也没有', async () => {
    const res = await request(app).post('/api/opt-out').send(VALID);
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('noc@example.net');
    await flush();
    const audits = calls(/INSERT INTO audit_logs/);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0][1])).toContain('optout.submit');
    expect(JSON.stringify(audits[0][1])).not.toContain('noc@example.net');
  });

  test('校验失败 400；数据库错误 500 且不泄露内部信息', async () => {
    expect((await request(app).post('/api/opt-out').send({ ...VALID, cidrs: ['::/0'] })).status).toBe(400);
    installDb({ 'COUNT\\(\\*\\) AS count FROM opt_out_requests': () => { throw new Error('ER_SECRET table internals'); } });
    const res = await request(app).post('/api/opt-out').send(VALID);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|internals/);
  });

  test('超过限流后 429（每 IP 每小时 5 次）', async () => {
    jest.resetModules();
    process.env.OPT_OUT_RATE_MAX = '2';
    const { createOptOutLimiter } = require('../middleware/rateLimit');
    const express = require('express');
    const small = express();
    small.use(createOptOutLimiter());
    small.post('/', (req, res) => res.json({ ok: true }));
    expect((await request(small).post('/')).status).toBe(200);
    expect((await request(small).post('/')).status).toBe(200);
    const limited = await request(small).post('/');
    expect(limited.status).toBe(429);
    expect(limited.body.success).toBe(false);
    delete process.env.OPT_OUT_RATE_MAX;
  });
});

describe('管理员接口', () => {
  test.each([
    ['get', '/api/admin/opt-out-requests'],
    ['post', '/api/admin/opt-out-requests/1/approve'],
    ['post', '/api/admin/opt-out-requests/1/reject']
  ])('%s %s：未登录 401，普通用户 403', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(403);
  });

  test('列表：非法 status 400，正常返回联系方式（仅管理员）', async () => {
    expect((await request(app).get('/api/admin/opt-out-requests?status=bogus').set('Authorization', ADMIN)).status).toBe(400);
    installDb({
      'ORDER BY id DESC': () => [[{ id: 3, cidr: '2001:db8:1::/48', contact: 'noc@example.net', status: 'pending' }]],
      'GROUP BY status': () => [[{ status: 'pending', count: 1 }]]
    });
    const res = await request(app).get('/api/admin/opt-out-requests?status=pending').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].contact).toBe('noc@example.net');
    expect(res.body.data.counts.pending).toBe(1);
  });

  test('通过：写黑名单、改状态、写审计', async () => {
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: '2001:db8:1::/48', organization: null, status: 'pending' }]] });
    const res = await request(app).post('/api/admin/opt-out-requests/3/approve').set('Authorization', ADMIN).send({ note: '已核实' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 3, status: 'approved' });
    await flush();
    expect(calls(/INSERT INTO scan_blacklist/)).toHaveLength(1);
    expect(JSON.stringify(calls(/INSERT INTO audit_logs/).map((c) => c[1]))).toContain('admin.optout.approve');
  });

  test('驳回、不存在、已处理、非法 ID、数据库错误', async () => {
    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[{ id: 3, cidr: '2001:db8:1::/48', organization: null, status: 'pending' }]] });
    const rejected = await request(app).post('/api/admin/opt-out-requests/3/reject').set('Authorization', ADMIN).send({});
    expect(rejected.body.data.status).toBe('rejected');

    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => [[]] });
    expect((await request(app).post('/api/admin/opt-out-requests/9/reject').set('Authorization', ADMIN)).status).toBe(404);
    expect((await request(app).post('/api/admin/opt-out-requests/abc/reject').set('Authorization', ADMIN)).status).toBe(400);

    installDb({ 'SELECT id, cidr, organization, status FROM opt_out_requests': () => { throw new Error('boom'); } });
    const failed = await request(app).post('/api/admin/opt-out-requests/3/approve').set('Authorization', ADMIN);
    expect(failed.status).toBe(500);
    expect(failed.body.message).not.toMatch(/boom/);

    installDb({ 'ORDER BY id DESC': () => { throw new Error('boom'); } });
    expect((await request(app).get('/api/admin/opt-out-requests').set('Authorization', ADMIN)).status).toBe(500);
  });
});
