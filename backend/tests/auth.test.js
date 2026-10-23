/**
 * 认证相关测试：登录、令牌校验、管理员权限
 * 数据库用 mock 替代，不需要真实 MySQL。
 */

jest.mock('../database/db', () => ({
  query: jest.fn(),
  end: jest.fn()
}));

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { login } = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const SECRET = 'test-secret-for-jest';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
  delete process.env.ALLOW_LEGACY_PASSWORDS;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('login', () => {
  test('缺少手机号或密码返回 400', async () => {
    const res = createRes();
    await login({ body: { phone: '13800000000' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('用户不存在返回 401，且提示与密码错误一致', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('手机号或密码错误');
  });

  test('bcrypt 账号密码正确时返回可验证的 token', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    db.query.mockResolvedValueOnce([[{ id: 7, phone: '13800000000', username: 'u', password_hash: hash, role: 'user' }]]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'correct-password' } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.username).toBe('u');
    expect(body.role).toBe('user');
    expect(jwt.verify(body.token, SECRET).id).toBe(7);
    // 已是哈希账号，不应再写库
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('bcrypt 账号密码错误返回 401', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    db.query.mockResolvedValueOnce([[{ id: 7, phone: '13800000000', username: 'u', password_hash: hash, role: 'user' }]]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'wrong' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('明文账号登录成功后自动升级为哈希', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3, phone: '13800000000', username: 'old', password_hash: 'plain-pass', role: 'admin' }]])
      .mockResolvedValueOnce([{}]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'plain-pass' } }, res);

    expect(res.json.mock.calls[0][0].success).toBe(true);
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toMatch(/UPDATE users SET password_hash/);
    expect(params[0]).toMatch(/^\$2[aby]\$/);
    expect(params[1]).toBe(3);
  });

  test('明文账号密码错误返回 401 且不写库', async () => {
    db.query.mockResolvedValueOnce([[{ id: 3, phone: '13800000000', username: 'old', password_hash: 'plain-pass', role: 'admin' }]]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'nope' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('ALLOW_LEGACY_PASSWORDS=false 时拒绝明文账号', async () => {
    process.env.ALLOW_LEGACY_PASSWORDS = 'false';
    db.query.mockResolvedValueOnce([[{ id: 3, phone: '13800000000', username: 'old', password_hash: 'plain-pass', role: 'admin' }]]);
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'plain-pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('日志中不出现密码或哈希', async () => {
    const hash = await bcrypt.hash('secret-pass-123', 4);
    db.query.mockResolvedValueOnce([[{ id: 7, phone: '13800000000', username: 'u', password_hash: hash, role: 'user' }]]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = createRes();
    await login({ body: { phone: '13800000000', password: 'wrong-pass-456' } }, res);

    const logged = JSON.stringify([
      ...logSpy.mock.calls,
      ...console.warn.mock.calls,
      ...console.error.mock.calls
    ]);
    expect(logged).not.toContain('wrong-pass-456');
    expect(logged).not.toContain(hash);
    expect(logged).not.toContain('13800000000');
  });
});

describe('authenticate', () => {
  test('没有 Authorization 头返回 401，且不回显请求头', async () => {
    const res = createRes();
    const next = jest.fn();
    await authenticate({ headers: { cookie: 'a=b' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.receivedHeaders).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test('无效 token 返回 401，且不带 error 字段', async () => {
    const res = createRes();
    await authenticate({ headers: { authorization: 'Bearer not-a-token' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toBeUndefined();
  });

  test('alg=none 的伪造 token 被拒绝', async () => {
    const forged = jwt.sign({ id: 1, role: 'admin' }, '', { algorithm: 'none' });
    const res = createRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${forged}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('使用旧默认密钥签发的 token 被拒绝', async () => {
    const oldToken = jwt.sign({ id: 1, role: 'admin' }, 'default_secret');
    const res = createRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${oldToken}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('有效 token 通过，并以数据库中的角色为准', async () => {
    const token = jwt.sign({ id: 5, role: 'admin' }, SECRET);
    db.query.mockResolvedValueOnce([[{ id: 5, phone: '13800000000', role: 'user' }]]);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    await authenticate(req, createRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe('user');
  });

  test('未配置 JWT_SECRET 时返回 500 而不是放行', async () => {
    delete process.env.JWT_SECRET;
    const res = createRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: 'Bearer abc' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  test('管理员放行', () => {
    const next = jest.fn();
    requireAdmin({ user: { role: 'admin' } }, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('普通用户返回 403', () => {
    const res = createRes();
    const next = jest.fn();
    requireAdmin({ user: { role: 'user' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toBe('仅管理员可执行此操作');
    expect(next).not.toHaveBeenCalled();
  });

  test('未登录（没有 req.user）返回 403', () => {
    const res = createRes();
    requireAdmin({}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
