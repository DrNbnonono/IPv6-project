jest.mock('../database/db', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn()
}));

const db = require('../database/db');
const {
  buildAdvancedQuery,
  QueryValidationError,
  FIELD_SELECTS,
  ORDER_COLUMNS
} = require('../services/queryBuilderService');
const { isReadOnlySelect } = require('../services/sqlGuardService');
const { advancedQuery } = require('../controllers/databaseController');

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('buildAdvancedQuery 基本行为', () => {
  test('默认只查地址，limit 1000', () => {
    const { sql, params } = buildAdvancedQuery({});
    expect(sql).toMatch(/^SELECT aa\.address FROM active_addresses aa/);
    expect(sql).toMatch(/GROUP BY aa\.address_id LIMIT \?$/);
    expect(params).toEqual([1000]);
  });

  test('条件通过占位符传参，取值不进入 SQL 文本', () => {
    const { sql, params } = buildAdvancedQuery({
      fields: ['address', 'prefix'],
      country: '86',
      asn: 4134,
      prefix: '2001:db8::/32',
      minUptime: '50.5',
      firstSeenAfter: '2026-01-01',
      lastSeenBefore: '2026-06-30',
      orderBy: 'last_seen',
      orderDirection: 'desc',
      limit: 50
    });
    expect(sql).toContain('c.country_id = ?');
    expect(sql).toContain('ORDER BY aa.last_seen DESC');
    expect(sql).not.toContain('2001:db8');
    expect(params).toEqual([86, 4134, '2001:db8::/32', 50.5, '2026-01-01', '2026-06-30 23:59:59', 50]);
  });

  test('漏洞筛选会 JOIN 漏洞表并带修复状态', () => {
    const { sql, params } = buildAdvancedQuery({
      hasVulnerability: 'true',
      vulnerabilityFixed: 'false',
      vulnerabilityType: 3
    });
    expect(sql).toContain('LEFT JOIN address_vulnerabilities av');
    expect(sql).toContain('av.is_fixed = 0');
    expect(params).toEqual([3, 1000]);
  });

  test('协议筛选需要协议类型', () => {
    expect(() => buildAdvancedQuery({ protocolSupport: 'true' })).toThrow('必须指定协议类型');
    const { sql, params } = buildAdvancedQuery({ protocolSupport: 'false', protocolType: 7 });
    expect(sql).toContain('(ap.protocol_id != ? OR ap.address_id IS NULL)');
    expect(params).toEqual([7, 1000]);
  });

  test('选择协议/漏洞输出字段时自动 JOIN', () => {
    const { sql } = buildAdvancedQuery({ fields: ['protocols', 'vulnerabilities'] });
    expect(sql).toContain('LEFT JOIN address_protocols ap');
    expect(sql).toContain('LEFT JOIN address_vulnerabilities av');
  });
});

describe('buildAdvancedQuery 拒绝非法输入', () => {
  const bad = [
    ['未知输出字段', { fields: ['address; DROP TABLE x'] }],
    ['未知排序字段', { orderBy: 'aa.address; DROP TABLE x' }],
    ['非法排序方向', { orderDirection: 'asc; DROP' }],
    ['country 注入', { country: '1 OR 1=1' }],
    ['asn 注入', { asn: "1' OR '1'='1" }],
    ['前缀注入', { prefix: "2001::' OR 1=1 --" }],
    ['limit 过大', { limit: 100000 }],
    ['limit 为 0', { limit: 0 }],
    ['日期格式错误', { firstSeenAfter: "2026-01-01' OR 1=1" }],
    ['在线率越界', { minUptime: 101 }],
    ['三态非法值', { hasVulnerability: 'maybe' }],
    ['filters 非对象', 'SELECT 1'],
    ['filters 为数组', []],
    ['filters 缺失', undefined]
  ];
  test.each(bad)('%s', (_name, filters) => {
    expect(() => buildAdvancedQuery(filters)).toThrow(QueryValidationError);
  });
});

describe('生成的 SQL 恒为只读', () => {
  test('所有输出字段与排序字段组合都能通过只读校验', () => {
    const allFields = Object.keys(FIELD_SELECTS);
    Object.keys(ORDER_COLUMNS).forEach((orderBy) => {
      const { sql } = buildAdvancedQuery({
        fields: allFields,
        orderBy,
        hasVulnerability: 'true',
        vulnerabilityFixed: 'true',
        protocolSupport: 'true',
        protocolType: 1,
        country: 1,
        asn: 1,
        prefix: '2001:db8::/32',
        minUptime: 1,
        firstSeenAfter: '2026-01-01',
        firstSeenBefore: '2026-02-01',
        lastSeenAfter: '2026-01-01',
        lastSeenBefore: '2026-02-01'
      });
      expect(isReadOnlySelect(sql)).toBe(true);
    });
  });
});

describe('advancedQuery 控制器', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('直接提交 SQL 被拒绝，且不会执行', async () => {
    const res = createRes();
    await advancedQuery({ body: { query: 'SELECT * FROM users', params: [] } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('sql 字段同样被拒绝', async () => {
    const res = createRes();
    await advancedQuery({ body: { sql: 'SELECT 1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('非法条件返回 400', async () => {
    const res = createRes();
    await advancedQuery({ body: { filters: { fields: ['password_hash'] } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('合法条件执行查询并返回数据与 SQL 文本', async () => {
    db.query.mockResolvedValueOnce([[{ address: '2001:db8::1' }]]);
    const res = createRes();
    await advancedQuery({ body: { filters: { fields: ['address'], country: 86, limit: 10 } } }, res);

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual([86, 10]);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ address: '2001:db8::1' }]);
    expect(body.sql).toBe(sql);
  });

  test('数据库错误返回 500 且不泄露细节', async () => {
    db.query.mockRejectedValueOnce(new Error("Table 'ipv6_db.secret' doesn't exist"));
    const res = createRes();
    await advancedQuery({ body: { filters: {} } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
  });
});
