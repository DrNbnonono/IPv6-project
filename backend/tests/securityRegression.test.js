const sr = require('../scripts/securityRegression');

const headers = (obj = {}) => ({ get: (k) => obj[k.toLowerCase()] ?? null });
const res = (status, body = {}, hdrs = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
  return { status, headers: headers(hdrs), text, json, ms: 5 };
};

/** 一个“行为正确”的假服务；vuln 里的开关用来模拟各种漏洞。 */
const makeStub = (vuln = {}) => {
  const state = { revoked: false };
  return async (method, path, init = {}) => {
  const auth = (init.headers && init.headers.Authorization) || '';
  const isUser = auth === 'Bearer user-token';
  const isAdmin = auth === 'Bearer admin-token';
  const base = { 'x-content-type-options': vuln.noSniff ? '' : 'nosniff', 'x-frame-options': 'SAMEORIGIN', ratelimit: 'limit=600' };
  if (path === '/api/health') return res(200, { status: 'ok' });
  if (path === '/api/test') return res(200, 'Hello', { ...base, 'access-control-allow-origin': vuln.openCors ? 'https://evil.example' : '' });
  if (path.startsWith('/api/open/v1')) {
    if (init.headers && init.headers['X-API-Key']) {
      if (state.revoked) return res(401, { success: false });
      return res(path.includes('/addresses') ? 403 : 200, { success: true });
    }
    return res(vuln.openApiNoKey ? 200 : 401, { success: false });
  }
  if (path === '/api/auth/login') {
    if (init.rawBody) return res(vuln.stackLeak ? 400 : 400, vuln.stackLeak ? 'SyntaxError at JSON.parse (/app/node_modules/body-parser/lib/types/json.js:92:19)' : { success: false, message: '请求体不是合法的 JSON' });
    if (init.body && init.body.password && init.body.password.length > 1000000) return res(413, { success: false });
    return res(401, { success: false, message: '手机号或密码错误' });
  }
  if (path.startsWith('/api/addresses/search')) return res(200, { success: true, data: [] });
  if (path.startsWith('/api/docs')) return res(vuln.docTraversal ? 200 : 400, vuln.docTraversal ? 'JWT_SECRET=abc' : { success: false });
  if (path === '/api/this-route-does-not-exist' || path.startsWith('/api/addresses/%E0')) return res(404, { success: false });
  if (path.startsWith('/api/reports/')) return res(vuln.reportTraversal ? 200 : 404, { success: false });
  if (path === '/api/xmap' && method === 'POST') return res(vuln.scanOpen ? 200 : 403, { success: !vuln.scanOpen ? false : true });
  if (path === '/api/agent/tools/execute') return res(vuln.noConfirm ? 200 : 409, vuln.noConfirm ? { success: true } : { success: false, needsConfirmation: true });
  if (path === '/api/database/advanced-query') return res(isUser || isAdmin ? (vuln.rawSql ? 200 : 400) : 401, { success: false });
  if (path.startsWith('/api/admin') || path.startsWith('/api/database/')) {
    if (!isUser && !isAdmin) return res(401, {});
    if (isUser) return res(vuln.userIsAdmin ? 200 : 403, {});
    if (method === 'POST' && path === '/api/admin/api-keys') return res(200, { success: true, data: { key: 'ov6_abcdefghijklmnopqrstuvwxyz0123456789', record: { id: 7 } } });
    if (method === 'GET' && path === '/api/admin/api-keys') return res(200, { data: [{ prefix: 'ov6_abcdefgh' }] });
    if (method === 'DELETE' && path.startsWith('/api/admin/api-keys/')) { state.revoked = !vuln.revokeIgnored; return res(200, { success: true }); }
    return res(200, { data: [] });
  }
  if (path === '/api/agent/terminal' && method === 'POST') return res(200, { success: true, terminal: { id: 't1' } });
  if (path === '/api/agent/terminal/execute') return res(200, { success: Boolean(vuln.terminalOpen) });
  if (path.startsWith('/api/agent/terminal/')) return res(200, { success: true });
  // 其余受保护接口
  return res(vuln.noAuth ? 200 : 401, { success: false });
  };
};

const run = (opts, stub) => sr.runChecks({ includeRateLimit: false, ...opts }, stub);
const full = { userToken: 'user-token', adminToken: 'admin-token', otherUserId: '903' };
const byId = (results, id) => results.find((r) => r.id === id);

describe('securityRegression 脚本', () => {
  test('parseArgs：默认值、环境变量与非法参数', () => {
    expect(sr.parseArgs([], {}).base).toBe('http://127.0.0.1:3000');
    expect(sr.parseArgs([], { SEC_USER_TOKEN: 'u', SEC_ADMIN_TOKEN: 'a' })).toMatchObject({ userToken: 'u', adminToken: 'a' });
    expect(sr.parseArgs(['--strict', '--json', '--include-ratelimit', '--other-user-id', '5'], {})).toMatchObject({ strict: true, json: true, includeRateLimit: true, otherUserId: '5' });
    expect(() => sr.parseArgs(['--bogus'], {})).toThrow('未知参数');
  });

  test('isLocalHost 只认本机', () => {
    expect(sr.isLocalHost('127.0.0.1')).toBe(true);
    expect(sr.isLocalHost('[::1]')).toBe(true);
    expect(sr.isLocalHost('example.com')).toBe(false);
  });

  test('伪造令牌：alg=none 没有签名，错误密钥的是合法 HS256 结构', () => {
    const none = sr.forgeNoneToken(9).split('.');
    expect(none).toHaveLength(3);
    expect(none[2]).toBe('');
    expect(JSON.parse(Buffer.from(none[0], 'base64url'))).toMatchObject({ alg: 'none' });
    const wrong = sr.forgeWrongSecretToken(9).split('.');
    expect(wrong).toHaveLength(3);
    expect(wrong[2].length).toBeGreaterThan(20);
  });

  test('LEAK_PATTERN 识别堆栈、路径、SQL 报错，放过普通文本', () => {
    for (const leaky of ['at JSON.parse (<anonymous>)', '/app/node_modules/x/y.js:92:19', 'You have an error in your SQL syntax', 'ER_BAD_FIELD_ERROR', 'receivedHeaders']) {
      expect(sr.LEAK_PATTERN.test(leaky)).toBe(true);
    }
    for (const clean of ['{"success":false,"message":"认证失败"}', 'Cannot GET /api/x', '请求体不是合法的 JSON']) {
      expect(sr.LEAK_PATTERN.test(clean)).toBe(false);
    }
  });

  test('行为正确的服务：全部通过（SR-12 默认跳过）', async () => {
    const results = await run(full, makeStub());
    const failures = results.filter((r) => r.status === 'fail' || r.status === 'warn');
    expect(failures).toEqual([]);
    expect(byId(results, 'SR-12').status).toBe('skip');
    expect(results.filter((r) => r.status === 'pass').length).toBeGreaterThanOrEqual(18);
  });

  test('没给令牌：需要令牌的项是 skip，不是 pass', async () => {
    const results = await run({}, makeStub());
    for (const id of ['SR-20', 'SR-21', 'SR-22', 'SR-23', 'SR-24', 'SR-30', 'SR-31', 'SR-32']) {
      expect(byId(results, id).status).toBe('skip');
    }
    expect(byId(results, 'SR-01').status).toBe('pass');
  });

  // 每种漏洞对应应当失败（或警告）的检查
  test.each([
    ['noAuth', 'SR-01', 'fail'],
    ['noSniff', 'SR-04', 'fail'],
    ['openCors', 'SR-05', 'warn'],
    ['openApiNoKey', 'SR-07', 'fail'],
    ['stackLeak', 'SR-10', 'fail'],
    ['docTraversal', 'SR-09', 'fail'],
    ['userIsAdmin', 'SR-20', 'fail'],
    ['rawSql', 'SR-21', 'fail'],
    ['scanOpen', 'SR-22', 'fail'],
    ['noConfirm', 'SR-23', 'fail'],
    ['reportTraversal', 'SR-24', 'fail'],
    ['terminalOpen', 'SR-30', 'fail'],
    ['revokeIgnored', 'SR-31', 'fail']
  ])('模拟漏洞 %s → %s 应为 %s', async (vulnerability, checkId, expected) => {
    const results = await run(full, makeStub({ [vulnerability]: true }));
    expect(byId(results, checkId).status).toBe(expected);
  });

  test('检查本身抛异常时记为 fail，不会中断整套', async () => {
    const results = await run(full, async () => { throw new Error('网络断了'); });
    expect(byId(results, 'SR-01')).toMatchObject({ status: 'fail' });
    expect(byId(results, 'SR-01').detail).toContain('网络断了');
    expect(results.length).toBe(sr.buildChecks({}).length);
  });

  test('summarize：warn 默认不算失败，--strict 算失败', () => {
    const results = [{ status: 'pass' }, { status: 'warn' }, { status: 'skip' }];
    expect(sr.summarize(results, false)).toMatchObject({ pass: 1, warn: 1, skip: 1, fail: 0, exitCode: 0 });
    expect(sr.summarize(results, true).exitCode).toBe(1);
    expect(sr.summarize([{ status: 'fail' }], false).exitCode).toBe(1);
  });
});
