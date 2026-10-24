jest.mock('../database/db', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn()
}));

const db = require('../database/db');
const stats = require('../services/statsSnapshotService');
const { getTrends } = require('../controllers/addressController');

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const missingTable = () => Object.assign(new Error("Table 'x' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.STATS_SNAPSHOT_HOUR;
  delete process.env.STATS_SNAPSHOT_ENABLED;
});

describe('takeSnapshot', () => {
  test('依次写全局 / 国家 / ASN 三张表，日期走占位符，重复写同一天用 ON DUPLICATE KEY 覆盖', async () => {
    db.query.mockResolvedValue([{}]);
    const result = await stats.takeSnapshot({ date: '2026-10-01' });
    expect(result).toEqual({ date: '2026-10-01' });
    expect(db.query).toHaveBeenCalledTimes(3);
    const sqls = db.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toMatch(/INSERT INTO daily_global_stats/);
    expect(sqls[1]).toMatch(/INSERT INTO daily_country_stats/);
    expect(sqls[2]).toMatch(/INSERT INTO daily_asn_stats/);
    sqls.forEach((sql) => {
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
      expect(sql).not.toContain('2026-10-01');
      expect(sql).not.toMatch(/active_addresses/); // 只读汇总计数，不扫大表
    });
    db.query.mock.calls.forEach((c) => expect(c[1]).toEqual(['2026-10-01']));
  });

  test('日期格式错误直接拒绝，不写库', async () => {
    await expect(stats.takeSnapshot({ date: "2026-10-01'; DROP" })).rejects.toThrow(stats.StatsError);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('不传日期用今天', async () => {
    db.query.mockResolvedValue([{}]);
    const { date } = await stats.takeSnapshot();
    expect(date).toBe(stats.formatDate(new Date()));
  });
});

describe('ensureDailySnapshot', () => {
  const at = (h) => new Date(2026, 9, 24, h, 30);

  test('还没到快照时间：什么都不做', async () => {
    const result = await stats.ensureDailySnapshot({ now: at(1) });
    expect(result).toEqual({ taken: false, date: '2026-10-24', reason: 'too-early' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('STATS_SNAPSHOT_HOUR 可调整', async () => {
    process.env.STATS_SNAPSHOT_HOUR = '9';
    expect((await stats.ensureDailySnapshot({ now: at(8) })).reason).toBe('too-early');
    db.query.mockResolvedValueOnce([[]]).mockResolvedValue([{}]);
    expect((await stats.ensureDailySnapshot({ now: at(9) })).taken).toBe(true);
  });

  test('今天已有快照：不重复写', async () => {
    db.query.mockResolvedValueOnce([[{ 1: 1 }]]);
    const result = await stats.ensureDailySnapshot({ now: at(5) });
    expect(result.reason).toBe('exists');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('今天没有快照：写一份', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValue([{}]);
    const result = await stats.ensureDailySnapshot({ now: at(5) });
    expect(result).toEqual({ taken: true, date: '2026-10-24' });
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  test('迁移未执行：不抛出，返回 no-table', async () => {
    db.query.mockRejectedValue(missingTable());
    expect(await stats.ensureDailySnapshot({ now: at(5) })).toMatchObject({ taken: false, reason: 'no-table' });
  });

  test('其他数据库错误：不抛出，返回 error', async () => {
    db.query.mockRejectedValue(new Error('boom'));
    expect(await stats.ensureDailySnapshot({ now: at(5) })).toMatchObject({ taken: false, reason: 'error' });
  });
});

describe('startDailySnapshot', () => {
  afterEach(() => stats.stopDailySnapshot());

  test('启动后立即检查一次，重复启动无效果', () => {
    db.query.mockResolvedValue([[{ 1: 1 }]]);
    expect(stats.startDailySnapshot({ intervalMs: 60000 })).toBe(true);
    expect(stats.startDailySnapshot({ intervalMs: 60000 })).toBe(false);
  });

  test('STATS_SNAPSHOT_ENABLED=false 时不启动', () => {
    process.env.STATS_SNAPSHOT_ENABLED = 'false';
    expect(stats.startDailySnapshot()).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('normalizeTrendQuery', () => {
  test('默认全局、30 天', () => {
    expect(stats.normalizeTrendQuery({})).toEqual({ scope: 'global', id: null, days: 30 });
  });

  test('country：两位代码转大写；asn：支持 AS 前缀', () => {
    expect(stats.normalizeTrendQuery({ scope: 'country', id: 'cn', days: '90' })).toEqual({ scope: 'country', id: 'CN', days: 90 });
    expect(stats.normalizeTrendQuery({ scope: 'asn', id: 'AS4134' })).toEqual({ scope: 'asn', id: 4134, days: 30 });
    expect(stats.normalizeTrendQuery({ scope: 'asn', id: 4134 }).id).toBe(4134);
  });

  test.each([
    ['未知 scope', { scope: 'prefix' }],
    ['country 缺 id', { scope: 'country' }],
    ['country 非两位字母', { scope: 'country', id: '86' }],
    ['country 注入', { scope: 'country', id: "CN' OR 1=1" }],
    ['asn 缺 id', { scope: 'asn' }],
    ['asn 非数字', { scope: 'asn', id: '4134; DROP' }],
    ['asn 为 0', { scope: 'asn', id: 0 }],
    ['asn 过大', { scope: 'asn', id: '99999999999' }],
    ['days 为 0', { days: 0 }],
    ['days 过大', { days: 731 }],
    ['days 非整数', { days: '7.5' }],
    ['days 非数字', { days: 'abc' }]
  ])('%s 被拒绝', (_name, query) => {
    expect(() => stats.normalizeTrendQuery(query)).toThrow(stats.StatsError);
  });
});

describe('getTrend', () => {
  const now = new Date(2026, 9, 24, 12);

  test('global：按窗口起点查询，数值转为数字，附带变化摘要', async () => {
    db.query.mockResolvedValue([[
      { date: '2026-10-22', total_prefixes: '100', total_addresses: '1000', total_countries: 50, total_asns: 70 },
      { date: '2026-10-24', total_prefixes: '110', total_addresses: '1500', total_countries: 51, total_asns: 72 }
    ]]);
    const data = await stats.getTrend({ days: 3 }, { now });
    expect(db.query.mock.calls[0][1]).toEqual(['2026-10-22']);
    expect(data.from).toBe('2026-10-22');
    expect(data.points[1]).toEqual({ date: '2026-10-24', prefixes: 110, addresses: 1500, countries: 51, asns: 72 });
    expect(data.summary).toEqual({
      from: '2026-10-22',
      to: '2026-10-24',
      addresses: { first: 1000, last: 1500, change: 500, changePct: 50 },
      prefixes: { first: 100, last: 110, change: 10, changePct: 10 }
    });
  });

  test('country / asn：id 作为查询参数，不拼进 SQL', async () => {
    db.query.mockResolvedValue([[]]);
    await stats.getTrend({ scope: 'country', id: 'cn', days: 1 }, { now });
    expect(db.query.mock.calls[0][0]).toMatch(/FROM daily_country_stats WHERE country_id = \?/);
    expect(db.query.mock.calls[0][1]).toEqual(['CN', '2026-10-24']);
    await stats.getTrend({ scope: 'asn', id: '4134', days: 1 }, { now });
    expect(db.query.mock.calls[1][0]).toMatch(/FROM daily_asn_stats WHERE asn = \?/);
    expect(db.query.mock.calls[1][1]).toEqual([4134, '2026-10-24']);
  });

  test('没有数据：points 为空，summary 为 null', async () => {
    db.query.mockResolvedValue([[]]);
    const data = await stats.getTrend({}, { now });
    expect(data.points).toEqual([]);
    expect(data.summary).toBeNull();
  });

  test('起点值为 0 时变化百分比为 null；只有一个点时变化为 0', async () => {
    db.query.mockResolvedValue([[{ date: '2026-10-24', total_prefixes: 0, total_addresses: 0, total_countries: 0, total_asns: 0 }]]);
    const data = await stats.getTrend({}, { now });
    expect(data.summary.addresses).toEqual({ first: 0, last: 0, change: 0, changePct: null });
  });

  test('跨月跨年的窗口起点', async () => {
    db.query.mockResolvedValue([[]]);
    const data = await stats.getTrend({ days: 30 }, { now: new Date(2027, 0, 5) });
    expect(data.from).toBe('2026-12-07');
  });

  test('迁移未执行：503', async () => {
    db.query.mockRejectedValue(missingTable());
    await expect(stats.getTrend({}, { now })).rejects.toMatchObject({ status: 503 });
  });

  test('其他数据库错误原样抛出', async () => {
    db.query.mockRejectedValue(new Error('boom'));
    await expect(stats.getTrend({}, { now })).rejects.toThrow('boom');
  });
});

describe('GET /api/addresses/trends 控制器', () => {
  test('成功返回数据', async () => {
    db.query.mockResolvedValue([[{ date: '2026-10-24', total_prefixes: 1, total_addresses: 2, total_countries: 3, total_asns: 4 }]]);
    const res = createRes();
    await getTrends({ query: { scope: 'global', days: '7' } }, res);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.points).toHaveLength(1);
  });

  test('参数错误 400，迁移未执行 503，其他错误 500 且不泄露细节', async () => {
    let res = createRes();
    await getTrends({ query: { scope: 'nope' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    db.query.mockRejectedValueOnce(missingTable());
    res = createRes();
    await getTrends({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);

    db.query.mockRejectedValueOnce(new Error('secret sql detail'));
    res = createRes();
    await getTrends({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
  });
});
