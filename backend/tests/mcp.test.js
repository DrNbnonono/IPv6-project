/**
 * MCP 入口（P4-8）：认证与限流、按权限范围注册工具、工具调用结果与审计、只读保证、stdio 入口的参数解析。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '100000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const apiKeys = require('../services/apiKeyService');
const mcp = require('../services/mcpService');
const { resetRateLimits } = require('../middleware/apiKey');
const { parseScopes } = require('../scripts/mcpStdio');

const STATS_KEY = `${apiKeys.KEY_PREFIX}mcpStatsAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
const ADDR_KEY = `${apiKeys.KEY_PREFIX}mcpAddrBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`;
const keyRows = {
  [apiKeys.hashKey(STATS_KEY)]: { key_id: 11, name: '统计', scopes: '["stats"]', rate_limit_per_min: null, expires_at: null, revoked_at: null },
  [apiKeys.hashKey(ADDR_KEY)]: { key_id: 12, name: '地址', scopes: ['stats', 'addresses'], rate_limit_per_min: 5, expires_at: null, revoked_at: null }
};

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
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
const flush = () => new Promise((resolve) => setImmediate(resolve));
const audits = () => db.query.mock.calls.filter(([sql]) => /INSERT INTO audit_logs/.test(sql)).map(([, params]) => params);

let rpcId = 0;
const rpc = (key, method, params) =>
  request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${key}`)
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: ++rpcId, method, params });
const call = (key, name, args) => rpc(key, 'tools/call', { name, arguments: args });
const text = (res) => res.body.result.content[0].text;

beforeEach(() => {
  jest.resetAllMocks();
  resetRateLimits();
  installDb();
});

describe('认证与限流', () => {
  test('没有密钥 401；无效密钥 401', async () => {
    const none = await request(app).post('/api/mcp').set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(none.status).toBe(401);
    expect((await rpc('ov6_wrongwrongwrongwrongwrongwrongwrongwrongwrong', 'tools/list')).status).toBe(401);
  });

  test('X-API-Key 头同样可用', async () => {
    const res = await request(app).post('/api/mcp').set('X-API-Key', STATS_KEY).set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(200);
  });

  test('超过密钥的每分钟上限后 429，与开放 API 共用计数', async () => {
    for (let i = 0; i < 5; i++) expect((await rpc(ADDR_KEY, 'tools/list')).status).toBe(200);
    const limited = await rpc(ADDR_KEY, 'tools/list');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  test('GET 与 DELETE 返回 405（无状态服务）', async () => {
    for (const method of ['get', 'delete']) {
      const res = await request(app)[method]('/api/mcp').set('Authorization', `Bearer ${STATS_KEY}`);
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST');
      expect(res.body.error.code).toBe(-32000);
    }
  });
});

describe('工具注册', () => {
  test('stats 密钥看不到 list_addresses；addresses 权限的密钥可以', async () => {
    const statsTools = (await rpc(STATS_KEY, 'tools/list')).body.result.tools.map((t) => t.name);
    expect(statsTools).toEqual(expect.arrayContaining(['get_global_stats', 'list_countries', 'get_country', 'get_asn', 'get_trends', 'list_prefixes', 'search_knowledge', 'get_probe_info']));
    expect(statsTools).not.toContain('list_addresses');
    const addrTools = (await rpc(ADDR_KEY, 'tools/list')).body.result.tools.map((t) => t.name);
    expect(addrTools).toContain('list_addresses');
  });

  test('所有工具都标注只读，且没有任何写/扫描类工具', async () => {
    const tools = (await rpc(ADDR_KEY, 'tools/list')).body.result.tools;
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.name).not.toMatch(/scan|create|delete|update|write|start|cancel|exec|command/i);
    }
    expect(tools).toHaveLength(mcp.TOOLS.length);
  });

  test('没有权限的工具无法调用', async () => {
    const res = await call(STATS_KEY, 'list_addresses', { prefixId: 1 });
    // SDK 对未注册的工具返回错误（JSON-RPC error 或 isError 结果），都不应带来数据
    const failed = res.body.error || (res.body.result && res.body.result.isError);
    expect(failed).toBeTruthy();
    expect(db.query.mock.calls.some(([sql]) => /FROM active_addresses/.test(sql))).toBe(false);
  });

  test('toolScopes 列出每个工具所需权限', () => {
    expect(mcp.toolScopes().list_addresses).toBe('addresses');
    expect(mcp.toolScopes().get_global_stats).toBe('stats');
  });
});

describe('工具调用', () => {
  test('get_global_stats 返回汇总数据并写审计（不含返回内容）', async () => {
    installDb({ 'total_countries': () => [[{ total_countries: 200, total_asns: 5000, total_prefixes: 80000, total_addresses: 123456789, updated_at: '2026-10-23' }]] });
    const res = await call(STATS_KEY, 'get_global_stats', {});
    expect(res.status).toBe(200);
    expect(JSON.parse(text(res))).toMatchObject({ countries: 200, asns: 5000, addresses: 123456789 });
    await flush();
    const [row] = audits();
    expect(row[1]).toBe('mcp.tool');
    expect(row[3]).toBe('11');
    expect(row[4]).toBe(1);
    expect(row[5]).toContain('get_global_stats');
    expect(row[5]).not.toContain('123456789');
  });

  test('get_country：国家代码走与 REST 相同的校验', async () => {
    installDb({
      'FROM countries WHERE country_id': () => [[{ country_id: 'CN', country_name: 'China', country_name_zh: '中国', region: 'Asia', total_ipv6_prefixes: 10, total_active_ipv6: 99 }]],
      'FROM asns WHERE country_id': () => [[{ asn: 4134, as_name: 'CHINANET', country_id: 'CN', total_ipv6_prefixes: 3, total_active_ipv6: 50 }]]
    });
    const ok = JSON.parse(text(await call(STATS_KEY, 'get_country', { code: 'cn' })));
    expect(ok).toMatchObject({ code: 'CN', addresses: 99 });
    expect(ok.topAsns[0].asn).toBe(4134);

    const bad = await call(STATS_KEY, 'get_country', { code: "C'N" });
    expect(bad.body.result.isError).toBe(true);
    expect(text(bad)).toMatch(/两位国家代码/);
  });

  test('不存在的国家：isError 且带原因；审计记为失败', async () => {
    installDb({ 'FROM countries WHERE country_id': () => [[]] });
    const res = await call(STATS_KEY, 'get_country', { code: 'ZZ' });
    expect(res.body.result.isError).toBe(true);
    expect(text(res)).toBe('国家不存在');
    await flush();
    expect(audits()[0][4]).toBe(0);
  });

  test('list_countries / get_asn / list_prefixes / get_trends 复用开放 API 逻辑', async () => {
    installDb({
      'FROM countries ORDER BY': () => [[{ country_id: 'US', country_name: 'United States', total_ipv6_prefixes: 5, total_active_ipv6: 9 }]],
      'FROM asns WHERE asn': () => [[{ asn: 15169, as_name: 'GOOGLE', country_id: 'US', total_ipv6_prefixes: 2, total_active_ipv6: 7 }]],
      'COUNT\\(\\*\\) AS total FROM ip_prefixes': () => [[{ total: 1 }]],
      'FROM ip_prefixes WHERE': () => [[{ prefix_id: 1, prefix: '2001:db8::/32', prefix_length: 32, asn: 15169, country_id: 'US', registry: 'arin', active_ipv6_count: 7 }]],
      'FROM stats_daily|stats_snapshots|snapshot': () => [[{ date: '2026-10-23', total_prefixes: 1, total_addresses: 2, total_countries: 3, total_asns: 4 }]]
    });
    expect(JSON.parse(text(await call(STATS_KEY, 'list_countries', { limit: 5, sort: 'prefixes' })))[0].code).toBe('US');
    expect(JSON.parse(text(await call(STATS_KEY, 'get_asn', { asn: 'AS15169' }))).asn).toBe(15169);
    expect(JSON.parse(text(await call(STATS_KEY, 'list_prefixes', { asn: 15169 }))).items[0].prefixId).toBe(1);
    const trend = await call(STATS_KEY, 'get_trends', { scope: 'global', days: 7 });
    expect(trend.body.result.isError).toBeFalsy();
  });

  test('参数类型不符由 SDK 拒绝（不会触达数据库）', async () => {
    const res = await call(STATS_KEY, 'list_countries', { limit: 'lots' });
    const failed = res.body.error || res.body.result.isError;
    expect(failed).toBeTruthy();
    expect(db.query.mock.calls.some(([sql]) => /FROM countries/.test(sql))).toBe(false);
  });

  test('list_addresses：需要权限，限制单次条数，返回游标', async () => {
    installDb({
      'SELECT prefix_id FROM ip_prefixes WHERE prefix_id': () => [[{ prefix_id: 7 }]],
      'FROM active_addresses a': () => [[{ address_id: 1, address: '2001:db8::1', iid_type: 'low-byte' }, { address_id: 2, address: '2001:db8::2', iid_type: null }]]
    });
    const res = JSON.parse(text(await call(ADDR_KEY, 'list_addresses', { prefixId: 7, limit: 1 })));
    expect(res.items).toEqual([{ address: '2001:db8::1', iidType: 'low-byte' }]);
    expect(res.nextAfter).toBe(1);

    const tooMany = await call(ADDR_KEY, 'list_addresses', { prefixId: 7, limit: mcp.MAX_ADDRESSES_PER_CALL + 1 });
    expect(tooMany.body.error || tooMany.body.result.isError).toBeTruthy();
  });

  test('search_knowledge：返回片段与出处；知识库未启用时给出原因', async () => {
    installDb({ 'FROM knowledge_chunks': () => [[{ chunk_id: 1, source: 'ipv6/rfc4291.md', title: '地址结构', content: '128 位', score: 1.23456 }]] });
    const ok = JSON.parse(text(await call(STATS_KEY, 'search_knowledge', { query: '地址结构' })));
    expect(ok.results[0]).toEqual({ source: 'ipv6/rfc4291.md', title: '地址结构', content: '128 位', score: 1.235 });

    installDb({ 'FROM knowledge_chunks': () => { throw Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE' }); } });
    const off = await call(STATS_KEY, 'search_knowledge', { query: '地址结构' });
    expect(off.body.result.isError).toBe(true);
    expect(text(off)).toMatch(/迁移 14/);

    const short = await call(STATS_KEY, 'search_knowledge', { query: 'a' });
    expect(short.body.error || short.body.result.isError).toBeTruthy();
  });

  test('get_probe_info 只含公开信息', async () => {
    process.env.SCAN_CONTACT_EMAIL = 'abuse@lab.example';
    const info = JSON.parse(text(await call(STATS_KEY, 'get_probe_info', {})));
    delete process.env.SCAN_CONTACT_EMAIL;
    expect(info).toMatchObject({ contactEmail: 'abuse@lab.example', optOutPage: '/about-scanning' });
    expect(db.query.mock.calls.some(([sql]) => /opt_out_requests|scan_blacklist/.test(sql))).toBe(false);
  });

  test('数据库错误：只返回通用提示，不泄露内部信息', async () => {
    installDb({ 'total_countries': () => { throw new Error('ER_SECRET internals'); } });
    const res = await call(STATS_KEY, 'get_global_stats', {});
    expect(res.body.result.isError).toBe(true);
    expect(text(res)).toBe('服务暂时不可用');
  });

  test('超长输出会被截断', async () => {
    const big = 'x'.repeat(70000);
    installDb({ 'FROM knowledge_chunks': () => [[{ chunk_id: 1, source: 's', title: 't', content: big, score: 1 }]] });
    const out = text(await call(STATS_KEY, 'search_knowledge', { query: '地址结构' }));
    expect(out.length).toBeLessThan(61000);
    expect(out).toMatch(/已截断/);
  });
});

describe('协议基础', () => {
  test('initialize 返回服务名与使用说明', async () => {
    const res = await rpc(STATS_KEY, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'jest', version: '1' } });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe('observ6');
    expect(res.body.result.instructions).toMatch(/只读/);
  });

  test('非法 JSON-RPC 返回协议错误而不是 500', async () => {
    const res = await request(app).post('/api/mcp').set('Authorization', `Bearer ${STATS_KEY}`).set('Accept', 'application/json, text/event-stream').send({ not: 'jsonrpc' });
    expect(res.status).toBeLessThan(500);
  });
});

describe('stdio 入口', () => {
  test('parseScopes：默认 stats；支持多个；非法值报错', () => {
    expect(parseScopes(undefined)).toEqual(['stats']);
    expect(parseScopes('')).toEqual(['stats']);
    expect(parseScopes('stats, addresses,stats')).toEqual(['stats', 'addresses']);
    expect(() => parseScopes('admin')).toThrow(/MCP_STDIO_SCOPES 无效/);
    expect(() => parseScopes(',')).toThrow(/MCP_STDIO_SCOPES 无效/);
  });
});
