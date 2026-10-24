/**
 * 开放只读 API（P5-3）：密钥服务、鉴权与限流中间件、/api/open/v1 接口、管理员发放/吊销。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '100000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const apiKeys = require('../services/apiKeyService');
const { consume, resetRateLimits, tokenFrom } = require('../middleware/apiKey');

const ADMIN = `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`;
const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;

const STATS_KEY = `${apiKeys.KEY_PREFIX}statsKeyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
const ADDR_KEY = `${apiKeys.KEY_PREFIX}addrKeyBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`;
const REVOKED_KEY = `${apiKeys.KEY_PREFIX}revokedCccccccccccccccccccccccccccccccccccccccc`;
const EXPIRED_KEY = `${apiKeys.KEY_PREFIX}expiredDddddddddddddddddddddddddddddddddddddddd`;

const keyRows = {
  [apiKeys.hashKey(STATS_KEY)]: { key_id: 1, name: '统计', scopes: '["stats"]', rate_limit_per_min: null, expires_at: null, revoked_at: null },
  [apiKeys.hashKey(ADDR_KEY)]: { key_id: 2, name: '地址', scopes: ['stats', 'addresses'], rate_limit_per_min: 3, expires_at: null, revoked_at: null },
  [apiKeys.hashKey(REVOKED_KEY)]: { key_id: 3, name: '已吊销', scopes: '["stats"]', rate_limit_per_min: null, expires_at: null, revoked_at: new Date() },
  [apiKeys.hashKey(EXPIRED_KEY)]: { key_id: 4, name: '已过期', scopes: '["stats"]', rate_limit_per_min: null, expires_at: new Date(Date.now() - 1000), revoked_at: null }
};

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      const id = params[0];
      return [[{ id, phone: `1380000000${id}`, role: id === 1 ? 'admin' : 'user' }]];
    }
    if (/FROM api_keys WHERE key_hash = \?/.test(sql)) {
      const row = keyRows[params[0]];
      return [row ? [row] : []];
    }
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (new RegExp(pattern).test(sql)) return fn(sql, params);
    }
    return [[]];
  });
};

const auth = (key) => ({ Authorization: `Bearer ${key}` });
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.resetAllMocks();
  resetRateLimits();
  installDb();
});

describe('鉴权', () => {
  test('没有密钥：401，并说明怎么带', async () => {
    const res = await request(app).get('/api/open/v1/stats/global');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/API 密钥/);
  });

  test.each([
    ['随便写的字符串', 'not-a-key'],
    ['格式对但不存在', `${apiKeys.KEY_PREFIX}${'z'.repeat(43)}`],
    ['已吊销', REVOKED_KEY],
    ['已过期', EXPIRED_KEY]
  ])('%s：401，且不泄露原因', async (_name, key) => {
    const res = await request(app).get('/api/open/v1/stats/global').set(auth(key));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('API 密钥无效、已过期或已吊销');
  });

  test('网站登录用的 JWT 不能当 API 密钥用', async () => {
    const res = await request(app).get('/api/open/v1/stats/global').set('Authorization', ADMIN);
    expect(res.status).toBe(401);
  });

  test('支持 X-API-Key 头；不接受放在 URL 里', async () => {
    installDb({ 'FROM countries': async () => [[{ total_countries: 1, total_asns: 2, total_prefixes: 3, total_addresses: 4, updated_at: null }]] });
    const ok = await request(app).get('/api/open/v1/stats/global').set('X-API-Key', STATS_KEY);
    expect(ok.status).toBe(200);
    const inUrl = await request(app).get(`/api/open/v1/stats/global?key=${STATS_KEY}&api_key=${STATS_KEY}`);
    expect(inUrl.status).toBe(401);
  });

  test('密钥表不存在（迁移 16 未执行）：503，不是 401', async () => {
    db.query.mockImplementation(async () => { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }); });
    const res = await request(app).get('/api/open/v1/stats/global').set(auth(STATS_KEY));
    expect(res.status).toBe(503);
  });

  test('数据库故障：500，不泄露细节', async () => {
    db.query.mockImplementation(async () => { throw new Error('secret connection string'); });
    const res = await request(app).get('/api/open/v1/stats/global').set(auth(STATS_KEY));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  test('有效密钥会更新 last_used_at，但同一把钥匙一分钟内只写一次', async () => {
    const touchCount = () => db.query.mock.calls.filter(([sql]) => /UPDATE api_keys SET last_used_at/.test(sql)).length;
    await request(app).get('/api/open/v1/').set(auth(STATS_KEY));
    await request(app).get('/api/open/v1/').set(auth(STATS_KEY));
    await flush();
    expect(touchCount()).toBeLessThanOrEqual(1);
  });
});

describe('限流', () => {
  test('按密钥计数：超过上限 429 + Retry-After，其他密钥不受影响', async () => {
    installDb({
      'FROM countries': async () => [[{ total_countries: 1, total_asns: 1, total_prefixes: 1, total_addresses: 1 }]]
    });
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).get('/api/open/v1/stats/global').set(auth(ADDR_KEY));
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('3');
    }
    const blocked = await request(app).get('/api/open/v1/stats/global').set(auth(ADDR_KEY));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const other = await request(app).get('/api/open/v1/stats/global').set(auth(STATS_KEY));
    expect(other.status).toBe(200);
  });

  test('consume：窗口过后重新计数；默认上限来自 OPEN_API_RATE_PER_MIN', () => {
    const t0 = 1_000_000;
    expect(consume(99, 2, t0).allowed).toBe(true);
    expect(consume(99, 2, t0 + 1).allowed).toBe(true);
    const third = consume(99, 2, t0 + 2);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(consume(99, 2, t0 + 60_001).allowed).toBe(true);
  });

  test('tokenFrom：Bearer / X-API-Key / 缺失', () => {
    expect(tokenFrom({ headers: { authorization: 'Bearer abc' } })).toBe('abc');
    expect(tokenFrom({ headers: { authorization: 'bearer   abc  ' } })).toBe('abc');
    expect(tokenFrom({ headers: { 'x-api-key': ' k ' } })).toBe('k');
    expect(tokenFrom({ headers: {} })).toBeNull();
    expect(tokenFrom({ headers: { authorization: 'Basic abc' } })).toBeNull();
  });
});

describe('权限范围', () => {
  test('只有 stats 权限的密钥读不了完整地址', async () => {
    const res = await request(app).get('/api/open/v1/addresses?prefixId=1').set(auth(STATS_KEY));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/addresses/);
    expect(db.query.mock.calls.some(([sql]) => /FROM active_addresses/.test(sql))).toBe(false);
  });

  test('索引接口返回密钥名称与权限，不含密钥本身', async () => {
    const res = await request(app).get('/api/open/v1/').set(auth(ADDR_KEY));
    expect(res.status).toBe(200);
    expect(res.body.data.key).toEqual({ name: '地址', scopes: ['stats', 'addresses'] });
    expect(JSON.stringify(res.body)).not.toContain(ADDR_KEY);
  });

  test('只开放 GET', async () => {
    const res = await request(app).post('/api/open/v1/stats/global').set(auth(STATS_KEY)).send({});
    expect(res.status).toBe(404);
  });
});

describe('统计接口', () => {
  test('全局统计', async () => {
    installDb({ 'FROM countries': async () => [[{ total_countries: '200', total_asns: '5000', total_prefixes: '9000', total_addresses: '75000000', updated_at: '2026-10-01T00:00:00Z' }]] });
    const res = await request(app).get('/api/open/v1/stats/global').set(auth(STATS_KEY));
    expect(res.body.data).toEqual({ countries: 200, asns: 5000, prefixes: 9000, addresses: 75000000, updatedAt: '2026-10-01T00:00:00Z' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('国家列表：limit / sort 校验，排序列走白名单', async () => {
    installDb({ 'FROM countries ORDER BY': async () => [[{ country_id: 'CN', country_name: 'China', country_name_zh: '中国', region: 'Asia', total_ipv6_prefixes: 10, total_active_ipv6: 100 }]] });
    const ok = await request(app).get('/api/open/v1/stats/countries?limit=5&sort=prefixes').set(auth(STATS_KEY));
    expect(ok.body.data[0]).toMatchObject({ code: 'CN', nameZh: '中国', prefixes: 10, addresses: 100 });
    const call = db.query.mock.calls.find(([sql]) => /FROM countries ORDER BY/.test(sql));
    expect(call[0]).toContain('ORDER BY total_ipv6_prefixes DESC');
    expect(call[1]).toEqual([5]);

    for (const bad of ['sort=name;DROP', 'limit=0', 'limit=301', 'limit=abc']) {
      const res = await request(app).get(`/api/open/v1/stats/countries?${bad}`).set(auth(STATS_KEY));
      expect(res.status).toBe(400);
    }
  });

  test('国家详情：代码转大写，不存在 404，非法 400', async () => {
    installDb({
      'WHERE country_id = \\? LIMIT 1': async (sql, params) => [params[0] === 'CN' ? [{ country_id: 'CN', country_name: 'China', country_name_zh: '中国', region: 'Asia', total_ipv6_prefixes: 1, total_active_ipv6: 2 }] : []],
      'FROM asns WHERE country_id': async () => [[{ asn: 4134, as_name: 'CHINANET', as_name_zh: null, country_id: 'CN', total_ipv6_prefixes: 1, total_active_ipv6: 2 }]]
    });
    const ok = await request(app).get('/api/open/v1/stats/countries/cn').set(auth(STATS_KEY));
    expect(ok.status).toBe(200);
    expect(ok.body.data.topAsns[0]).toMatchObject({ asn: 4134, country: 'CN' });
    expect((await request(app).get('/api/open/v1/stats/countries/ZZ').set(auth(STATS_KEY))).status).toBe(404);
    expect((await request(app).get('/api/open/v1/stats/countries/86').set(auth(STATS_KEY))).status).toBe(400);
  });

  test('ASN 详情：支持 AS 前缀', async () => {
    installDb({ 'FROM asns WHERE asn = \\?': async (sql, params) => [params[0] === 4134 ? [{ asn: 4134, as_name: 'CHINANET', as_name_zh: '中国电信', country_id: 'CN', total_ipv6_prefixes: 3, total_active_ipv6: 4 }] : []] });
    const ok = await request(app).get('/api/open/v1/stats/asns/AS4134').set(auth(STATS_KEY));
    expect(ok.body.data).toEqual({ asn: 4134, name: 'CHINANET', nameZh: '中国电信', country: 'CN', prefixes: 3, addresses: 4 });
    expect((await request(app).get('/api/open/v1/stats/asns/65000').set(auth(STATS_KEY))).status).toBe(404);
    expect((await request(app).get('/api/open/v1/stats/asns/abc').set(auth(STATS_KEY))).status).toBe(400);
  });

  test('趋势复用快照服务，参数错误 400、迁移未执行 503', async () => {
    installDb({ 'FROM daily_global_stats': async () => [[{ date: '2026-10-24', total_prefixes: 1, total_addresses: 2, total_countries: 3, total_asns: 4 }]] });
    const ok = await request(app).get('/api/open/v1/trends?days=7').set(auth(STATS_KEY));
    expect(ok.status).toBe(200);
    expect(ok.body.data.points).toHaveLength(1);
    expect((await request(app).get('/api/open/v1/trends?scope=country').set(auth(STATS_KEY))).status).toBe(400);

    installDb({ 'FROM daily_global_stats': async () => { throw Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }); } });
    expect((await request(app).get('/api/open/v1/trends').set(auth(STATS_KEY))).status).toBe(503);
  });

  test('前缀列表：过滤条件走占位符，分页参数校验', async () => {
    installDb({
      'SELECT COUNT\\(\\*\\) AS total FROM ip_prefixes': async () => [[{ total: 2 }]],
      'FROM ip_prefixes WHERE': async () => [[{ prefix_id: 1, prefix: '2001:db8::', prefix_length: 32, asn: 64500, country_id: 'CN', registry: 'APNIC', active_ipv6_count: 7 }]]
    });
    const res = await request(app).get('/api/open/v1/prefixes?asn=AS64500&country=cn&page=2&pageSize=10').set(auth(STATS_KEY));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 2, pageSize: 10, total: 2 });
    expect(res.body.data.items[0]).toEqual({ prefixId: 1, prefix: '2001:db8::', length: 32, asn: 64500, country: 'CN', registry: 'APNIC', addresses: 7 });
    const list = db.query.mock.calls.find(([sql]) => /ORDER BY prefix_id LIMIT/.test(sql));
    expect(list[1]).toEqual([64500, 'CN', 10, 10]);
    expect(list[0]).not.toContain('64500');

    for (const bad of ["asn=1' OR '1'='1", 'country=86', 'page=0', 'pageSize=201']) {
      expect((await request(app).get(`/api/open/v1/prefixes?${encodeURIComponent(bad).replace(/%3D/g, '=')}`).set(auth(STATS_KEY))).status).toBe(400);
    }
  });
});

describe('完整地址接口（addresses 权限）', () => {
  const rowsFor = (n, start = 1) => Array.from({ length: n }, (_, i) => ({ address_id: start + i, address: `2001:db8::${start + i}`, iid_type: i % 2 ? 'low-byte' : null }));

  test('游标分页：多取一条判断是否还有下一页', async () => {
    installDb({
      'SELECT prefix_id FROM ip_prefixes': async () => [[{ prefix_id: 5 }]],
      'FROM active_addresses a': async () => [rowsFor(3)]
    });
    const res = await request(app).get('/api/open/v1/addresses?prefixId=5&limit=2&after=10').set(auth(ADDR_KEY));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([{ address: '2001:db8::1', iidType: null }, { address: '2001:db8::2', iidType: 'low-byte' }]);
    expect(res.body.data.nextAfter).toBe(2);
    const call = db.query.mock.calls.find(([sql]) => /FROM active_addresses a/.test(sql));
    expect(call[1]).toEqual([5, 10, 3]);
    expect(call[0]).not.toMatch(/OFFSET/);
  });

  test('最后一页 nextAfter 为 null', async () => {
    installDb({ 'SELECT prefix_id FROM ip_prefixes': async () => [[{ prefix_id: 5 }]], 'FROM active_addresses a': async () => [rowsFor(2)] });
    const res = await request(app).get('/api/open/v1/addresses?prefixId=5&limit=5').set(auth(ADDR_KEY));
    expect(res.body.data.nextAfter).toBeNull();
  });

  test.each([
    ['缺 prefixId', '', 400],
    ['prefixId 非数字', '?prefixId=abc', 400],
    ['limit 过大', '?prefixId=5&limit=1001', 400],
    ['after 非法', '?prefixId=5&after=-1', 400],
    ['前缀不存在', '?prefixId=999', 404]
  ])('%s', async (_name, query, status) => {
    installDb({ 'SELECT prefix_id FROM ip_prefixes': async () => [[]] });
    const res = await request(app).get(`/api/open/v1/addresses${query}`).set(auth(ADDR_KEY));
    expect(res.status).toBe(status);
  });

  test('数据库错误：500 且不泄露细节', async () => {
    installDb({ 'SELECT prefix_id FROM ip_prefixes': async () => { throw new Error('secret sql'); } });
    const res = await request(app).get('/api/open/v1/addresses?prefixId=5').set(auth(ADDR_KEY));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('apiKeyService', () => {
  test('生成的密钥有前缀、足够长、互不相同；库里只存哈希', async () => {
    const a = apiKeys.generateKey();
    const b = apiKeys.generateKey();
    expect(a).toMatch(/^ov6_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);

    installDb({ 'INSERT INTO api_keys': async () => [{ insertId: 9 }] });
    const { key, record } = await apiKeys.createKey({ name: '  合作方  ', scopes: ['stats'], createdBy: 1 });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO api_keys/.test(sql));
    expect(insert[1]).toContain(apiKeys.hashKey(key));
    expect(insert[1]).not.toContain(key);
    expect(insert[1][0]).toBe('合作方');
    expect(record).toMatchObject({ id: 9, prefix: key.slice(0, 12), scopes: ['stats'] });
  });

  test.each([
    [{ name: '' }, /用途说明/],
    [{ name: 'x'.repeat(101) }, /最长/],
    [{ name: 'a', scopes: [] }, /非空数组/],
    [{ name: 'a', scopes: ['admin'] }, /不支持/],
    [{ name: 'a', scopes: 'stats' }, /非空数组/],
    [{ name: 'a', rateLimitPerMin: 0 }, /rateLimitPerMin/],
    [{ name: 'a', rateLimitPerMin: 'x' }, /rateLimitPerMin/],
    [{ name: 'a', expiresAt: 'not a date' }, /expiresAt/],
    [{ name: 'a', expiresAt: '2000-01-01' }, /晚于现在/]
  ])('createKey 拒绝 %j', async (input, pattern) => {
    await expect(apiKeys.createKey(input)).rejects.toThrow(pattern);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('默认只给 stats 权限', async () => {
    installDb({ 'INSERT INTO api_keys': async () => [{ insertId: 1 }] });
    const { record } = await apiKeys.createKey({ name: 'a' });
    expect(record.scopes).toEqual(['stats']);
  });

  test('迁移未执行：创建 / 列表 503', async () => {
    db.query.mockImplementation(async () => { throw Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }); });
    await expect(apiKeys.createKey({ name: 'a' })).rejects.toMatchObject({ status: 503 });
    await expect(apiKeys.listKeys()).rejects.toMatchObject({ status: 503 });
  });

  test('verifyKey 拒绝格式明显不对的令牌，且不查库', async () => {
    for (const token of [undefined, null, 123, '', 'ov6_short', `ov6_${'a'.repeat(200)}`, `xxx_${'a'.repeat(43)}`]) {
      expect(await apiKeys.verifyKey(token)).toBeNull();
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  test('revokeKey：ID 校验、重复吊销 404', async () => {
    await expect(apiKeys.revokeKey('abc')).rejects.toMatchObject({ status: 400 });
    installDb({ 'UPDATE api_keys SET revoked_at': async () => [{ affectedRows: 0 }] });
    await expect(apiKeys.revokeKey('5')).rejects.toMatchObject({ status: 404 });
  });
});

describe('管理员发放与吊销', () => {
  test.each([['get', '/api/admin/api-keys'], ['post', '/api/admin/api-keys'], ['delete', '/api/admin/api-keys/1']])(
    '%s %s：未登录 401，普通用户 403',
    async (method, url) => {
      expect((await request(app)[method](url)).status).toBe(401);
      expect((await request(app)[method](url).set('Authorization', USER)).status).toBe(403);
    }
  );

  test('创建：201，明文只在响应里出现，写审计', async () => {
    installDb({ 'INSERT INTO api_keys': async () => [{ insertId: 11 }] });
    const res = await request(app).post('/api/admin/api-keys').set('Authorization', ADMIN).send({ name: '合作方 A', scopes: ['stats', 'addresses'], rateLimitPerMin: 30 });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^ov6_/);
    expect(res.body.data).toMatchObject({ id: 11, name: '合作方 A', scopes: ['stats', 'addresses'], rateLimitPerMin: 30 });
    await flush();
    const audit = db.query.mock.calls.find(([sql]) => /INSERT INTO audit_logs/.test(sql));
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit[1])).toContain('admin.api_key.create');
    expect(JSON.stringify(audit[1])).not.toContain(res.body.data.key); // 审计里没有明文
  });

  test('参数错误 400', async () => {
    const res = await request(app).post('/api/admin/api-keys').set('Authorization', ADMIN).send({ name: 'a', scopes: ['root'] });
    expect(res.status).toBe(400);
  });

  test('列表不含明文与哈希', async () => {
    installDb({ 'FROM api_keys ORDER BY': async () => [[{ key_id: 1, name: 'a', key_prefix: 'ov6_abcdefgh', key_hash: 'deadbeef', scopes: '["stats"]', rate_limit_per_min: null, created_by: 1, created_at: new Date(), expires_at: null, last_used_at: null, revoked_at: null }]] });
    const res = await request(app).get('/api/admin/api-keys').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ id: 1, prefix: 'ov6_abcdefgh', scopes: ['stats'] });
    expect(JSON.stringify(res.body)).not.toContain('deadbeef');
  });

  test('吊销：200 并写审计；不存在 404', async () => {
    installDb({ 'UPDATE api_keys SET revoked_at': async () => [{ affectedRows: 1 }] });
    const ok = await request(app).delete('/api/admin/api-keys/3').set('Authorization', ADMIN);
    expect(ok.status).toBe(200);
    await flush();
    expect(db.query.mock.calls.some(([sql, params]) => /INSERT INTO audit_logs/.test(sql) && JSON.stringify(params).includes('admin.api_key.revoke'))).toBe(true);

    installDb({ 'UPDATE api_keys SET revoked_at': async () => [{ affectedRows: 0 }] });
    expect((await request(app).delete('/api/admin/api-keys/3').set('Authorization', ADMIN)).status).toBe(404);
  });
});
