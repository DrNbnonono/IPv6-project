/**
 * 审计：auditService（脱敏、截断、绝不抛出、查询）与 audit 中间件（成功/失败判定、资源 ID、登录取用户）。
 */

jest.mock('../database/db', () => ({ query: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const db = require('../database/db');
const auditService = require('../services/auditService');
const { audit, auditWrites, userIdFromToken, maskPhone } = require('../middleware/audit');

const insertCall = () => db.query.mock.calls.find(([sql]) => /INSERT INTO audit_logs/.test(sql));
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.resetAllMocks();
  db.query.mockResolvedValue([{ affectedRows: 1 }]);
});

describe('auditService.record', () => {
  test('写入 audit_logs，success 转为 0/1，detail 序列化为 JSON', async () => {
    const ok = await auditService.record({
      userId: 3, action: 'task.create', resourceType: 'xmap_task', resourceId: 123, success: false, detail: { target: '2001:db8::/32' }, ip: '::1'
    });
    expect(ok).toBe(true);
    const [sql, params] = insertCall();
    expect(sql).toMatch(/INSERT INTO audit_logs \(user_id, action, resource_type, resource_id, success, detail, ip\)/);
    expect(params.slice(0, 5)).toEqual([3, 'task.create', 'xmap_task', '123', 0]);
    expect(JSON.parse(params[5])).toEqual({ target: '2001:db8::/32' });
    expect(params[6]).toBe('::1');
  });

  test('detail 中的密码、token 等被脱敏', async () => {
    await auditService.record({ action: 'x', detail: { password: 'hunter2', nested: { token: 'abc', ok: 'visible' }, note: 'Bearer abc.def.ghi' } });
    const detail = JSON.parse(insertCall()[1][5]);
    expect(detail.password).toBe('***');
    expect(detail.nested).toEqual({ token: '***', ok: 'visible' });
    expect(detail.note).not.toContain('abc.def.ghi');
  });

  test('过长的字符串被截断，过大的 detail 只保留标记', async () => {
    await auditService.record({ action: 'x', detail: { command: 'a'.repeat(5000) } });
    expect(JSON.parse(insertCall()[1][5]).command.length).toBeLessThan(400);

    db.query.mockClear();
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, 'v'.repeat(200)]));
    await auditService.record({ action: 'x', detail: many });
    expect(JSON.parse(insertCall()[1][5])).toEqual({ truncated: true });
  });

  test('数据库出错时返回 false 而不是抛出', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    await expect(auditService.record({ action: 'x' })).resolves.toBe(false);
  });

  test('缺少 action 时返回 false，不写库', async () => {
    await expect(auditService.record({})).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('没有用户（例如登录失败）时 user_id 为 NULL', async () => {
    await auditService.record({ action: 'auth.login', success: false });
    expect(insertCall()[1][0]).toBeNull();
  });
});

describe('auditService.list', () => {
  const setup = (rows = []) => {
    db.query.mockImplementation(async (sql) => (/COUNT\(\*\)/.test(sql) ? [[{ total: rows.length }]] : [rows]));
  };

  test('按条件拼接 WHERE（全部参数化），分页并限制 pageSize 上限', async () => {
    setup();
    await auditService.list({ userId: '4', action: 'task', success: false, since: '2026-01-01', page: '2', pageSize: '9999' });
    const [sql, params] = db.query.mock.calls.find(([s]) => /ORDER BY/.test(s));
    expect(sql).toMatch(/a\.user_id = \?/);
    expect(sql).toMatch(/a\.action = \? OR a\.action LIKE \?/);
    expect(sql).toMatch(/a\.success = \?/);
    expect(sql).toMatch(/a\.created_at >= \?/);
    expect(params).toEqual([4, 'task', 'task.%', 0, '2026-01-01', 200, 200]);
    expect(sql).not.toMatch(/task|2026/);
  });

  test('action 里的 LIKE 通配符被转义', async () => {
    setup();
    await auditService.list({ action: 'a%b_c' });
    const params = db.query.mock.calls.find(([s]) => /ORDER BY/.test(s))[1];
    expect(params[1]).toBe('a\\%b\\_c.%');
  });

  test('detail 解析为对象，success 转为布尔', async () => {
    setup([{ id: 1, user_id: 2, username: 'u', action: 'a', success: 1, detail: '{"x":1}', created_at: 'now' }, { id: 2, detail: 'not json', success: 0 }]);
    const result = await auditService.list();
    expect(result.items[0]).toMatchObject({ success: true, detail: { x: 1 } });
    expect(result.items[1]).toMatchObject({ success: false, detail: null });
    expect(result.total).toBe(2);
  });
});

describe('audit 中间件', () => {
  const makeApp = (setupRoutes) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 9 }; next(); });
    setupRoutes(app);
    return app;
  };

  test('响应结束后记录：用户、动作、资源 ID、状态码与 IP', async () => {
    const app = makeApp((a) => a.post('/tasks', audit('task.create', {
      resourceType: 'xmap_task',
      resourceId: (req, res, body) => body.taskId,
      detail: (req) => ({ target: req.body.target })
    }), (req, res) => res.status(202).json({ success: true, taskId: 555 })));

    await request(app).post('/tasks').send({ target: '2001:db8::1' }).expect(202);
    await flush();

    const [, params] = insertCall();
    expect(params.slice(0, 5)).toEqual([9, 'task.create', 'xmap_task', '555', 1]);
    expect(JSON.parse(params[5])).toEqual({ target: '2001:db8::1', status: 202 });
    expect(params[6]).toBeTruthy();
  });

  test('状态码 >= 400 记为失败', async () => {
    const app = makeApp((a) => a.post('/x', audit('task.create'), (req, res) => res.status(403).json({ success: false })));
    await request(app).post('/x').expect(403);
    await flush();
    expect(insertCall()[1][4]).toBe(0);
  });

  test('审计写入失败不影响业务响应', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    const app = makeApp((a) => a.post('/x', audit('task.create'), (req, res) => res.json({ ok: true })));
    const res = await request(app).post('/x').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('resourceId / detail 函数抛错时不影响请求，只是少记一项', async () => {
    const app = makeApp((a) => a.post('/x', audit('t', { resourceId: () => { throw new Error('boom'); }, detail: () => { throw new Error('boom'); } }), (req, res) => res.json({})));
    await request(app).post('/x').expect(200);
    await flush();
    expect(insertCall()[1][3]).toBeNull();
  });

  test('登录：从响应里的 JWT 取出用户，手机号脱敏，密码不入库', async () => {
    const token = jwt.sign({ id: 42, role: 'user' }, 'secret');
    // 登录接口前没有 authenticate，所以不用 makeApp（它会模拟 req.user）
    const bare = express();
    bare.use(express.json());
    bare.post('/login', audit('auth.login', { userId: userIdFromToken, detail: (req) => ({ phone: maskPhone(req.body.phone) }) }), (req, res) => res.json({ success: true, token }));
    await request(bare).post('/login').send({ phone: '13800001234', password: 'hunter2' }).expect(200);
    await flush();

    const [, params] = insertCall();
    expect(params[0]).toBe(42);
    expect(JSON.parse(params[5]).phone).toBe('138******34');
    expect(params[5]).not.toContain('hunter2');
  });

  test('登录失败：没有用户 ID，记为失败', async () => {
    const bare = express();
    bare.use(express.json());
    bare.post('/login', audit('auth.login', { userId: userIdFromToken }), (req, res) => res.status(401).json({ success: false }));
    await request(bare).post('/login').send({}).expect(401);
    await flush();
    const [, params] = insertCall();
    expect(params[0]).toBeNull();
    expect(params[4]).toBe(0);
  });

  test('auditWrites：GET 不记录，写操作记录方法与路径（不含查询串和请求体）', async () => {
    const app = makeApp((a) => {
      a.use('/db', auditWrites('db'));
      a.get('/db/stats', (req, res) => res.json({}));
      a.post('/db/advanced-query', (req, res) => res.json({}));
    });
    await request(app).get('/db/stats').expect(200);
    await flush();
    expect(insertCall()).toBeUndefined();

    await request(app).post('/db/advanced-query?x=1').send({ password: 'p' }).expect(200);
    await flush();
    const [, params] = insertCall();
    expect(params[1]).toBe('db.write');
    expect(JSON.parse(params[5])).toEqual({ method: 'POST', path: '/db/advanced-query', status: 200 });
  });

  test('maskPhone 对过短输入不泄露', () => {
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone(undefined)).toBe('***');
  });
});
