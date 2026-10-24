/**
 * scanPolicyService：默认拒绝的白名单、内置/黑名单拒绝、速率与每日配额、目标文件逐行检查。
 */

jest.mock('../database/db', () => ({ query: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('../database/db');
const policy = require('../services/scanPolicyService');

const USER = { id: 7 };

/** 按 SQL 内容返回策略数据：{ allow, block, quota, used } */
const setPolicy = ({ allow = [], block = [], optOut = [], quota = null, used = 0 } = {}) => {
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM scan_allowlist')) return [allow.map((cidr) => ({ cidr }))];
    if (sql.includes('FROM scan_blacklist')) return [block.map((cidr) => ({ cidr }))];
    if (sql.includes('FROM opt_out_requests')) return [optOut.map((cidr) => ({ cidr }))];
    if (sql.includes('FROM user_quotas')) return [quota ? [quota] : []];
    if (sql.includes('FROM tasks')) return [[{ count: used }]];
    throw new Error(`未预期的 SQL: ${sql}`);
  });
};

const ENV_KEYS = ['SCAN_ALLOWED_TARGETS', 'SCAN_MAX_RATE', 'SCAN_DEFAULT_RATE', 'SCAN_DAILY_LIMIT'];
let savedEnv;

beforeEach(() => {
  jest.resetAllMocks();
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  ENV_KEYS.forEach((key) => delete process.env[key]);
  setPolicy();
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
});

const xmap = (targets, rate) => policy.validateScanRequest({ user: USER, taskType: 'xmap', targets, rate });

describe('速率解析', () => {
  test('parseRate 支持 K/M/G 后缀与纯数字', () => {
    expect(policy.parseRate('10M')).toBe(10e6);
    expect(policy.parseRate('1.5G')).toBe(1.5e9);
    expect(policy.parseRate('500k')).toBe(500e3);
    expect(policy.parseRate('1000')).toBe(1000);
  });

  test.each(['', 'abc', '-5M', '0', '10MB', '1e3', '10 M x'])('拒绝非法速率 %p', (value) => {
    expect(policy.parseRate(value)).toBeNull();
  });

  test('formatRate 能整除时使用后缀', () => {
    expect(policy.formatRate(10e6)).toBe('10M');
    expect(policy.formatRate(2e9)).toBe('2G');
    expect(policy.formatRate(500e3)).toBe('500K');
    expect(policy.formatRate(1234)).toBe('1234');
  });
});

describe('目标：默认拒绝', () => {
  test('白名单为空时一律拒绝', async () => {
    const result = await xmap('2001:db8::/64');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/默认拒绝/);
  });

  test('目标完整落在表白名单内才通过，并返回规范化文本', async () => {
    setPolicy({ allow: ['2001:db8::/32'] });
    const result = await xmap('2001:0DB8:0:0::1');
    expect(result.allowed).toBe(true);
    expect(result.normalized.targets).toEqual(['2001:db8::1']);
  });

  test('环境变量白名单与表白名单取并集', async () => {
    process.env.SCAN_ALLOWED_TARGETS = '2001:db8:1::/48, 198.51.100.0/24';
    setPolicy({ allow: ['2001:db8:2::/48'] });
    expect((await xmap('2001:db8:1::5')).allowed).toBe(true);
    expect((await xmap('2001:db8:2::5')).allowed).toBe(true);
    expect((await xmap('198.51.100.9')).allowed).toBe(true);
    expect((await xmap('2001:db8:3::5')).allowed).toBe(false);
  });

  test('目标只与白名单部分重叠（比白名单更大）时拒绝', async () => {
    setPolicy({ allow: ['2001:db8:1::/48'] });
    const result = await xmap('2001:db8::/32');
    expect(result.allowed).toBe(false);
  });

  test('没有目标时拒绝', async () => {
    setPolicy({ allow: ['::/0'] });
    expect((await xmap([])).allowed).toBe(false);
    expect((await xmap('')).allowed).toBe(false);
    expect((await xmap(undefined)).allowed).toBe(false);
  });

  test('域名与非法地址被拒绝', async () => {
    setPolicy({ allow: ['::/0'] });
    expect((await xmap('example.com')).reason).toMatch(/不接受域名/);
    expect((await xmap('2001:db8::/129')).allowed).toBe(false);
    expect((await xmap('10.0.0.256')).allowed).toBe(false);
  });

  test('逗号分隔与数组形式的多个目标，任何一个违规则整体拒绝', async () => {
    setPolicy({ allow: ['2001:db8::/32'] });
    expect((await xmap('2001:db8::1,2001:db8::2')).allowed).toBe(true);
    expect((await xmap(['2001:db8::1', '2001:db9::1'])).allowed).toBe(false);
  });
});

describe('目标：内置与黑名单拒绝优先于白名单', () => {
  beforeEach(() => setPolicy({ allow: ['::/0', '0.0.0.0/0'] }));

  test.each([
    ['::1', '回环'],
    ['::', '未指定'],
    ['ff02::1', '组播'],
    ['fe80::1', '链路本地'],
    ['::ffff:10.0.0.1', 'IPv4 映射'],
    ['64:ff9b::1.2.3.4', 'NAT64'],
    ['127.0.0.1', '回环'],
    ['169.254.169.254', '元数据'],
    ['224.0.0.1', '组播'],
    ['255.255.255.255', '保留']
  ])('拒绝 %s（%s）', async (target) => {
    const result = await xmap(target);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/不允许扫描/);
  });

  test('包含内置禁止范围的大网段也被拒绝（::/0 本身不能被扫描）', async () => {
    expect((await xmap('::/0')).allowed).toBe(false);
    expect((await xmap('0.0.0.0/0')).allowed).toBe(false);
  });

  test('黑名单与目标有任何交集即拒绝，哪怕目标在白名单内', async () => {
    setPolicy({ allow: ['2001:db8::/32'], block: ['2001:db8:ffff::/48'] });
    expect((await xmap('2001:db8:1::/48')).allowed).toBe(true);
    const inside = await xmap('2001:db8:ffff::5');
    expect(inside.allowed).toBe(false);
    expect(inside.reason).toMatch(/黑名单/);
    const covering = await xmap('2001:db8::/32'); // 目标包含黑名单
    expect(covering.allowed).toBe(false);
  });

  test('待审核的退出请求与黑名单同样生效，原因里能看出来', async () => {
    setPolicy({ allow: ['2001:db8::/32'], optOut: ['2001:db8:abcd::/48'] });
    expect((await xmap('2001:db8:1::/48')).allowed).toBe(true);
    const verdict = await xmap('2001:db8:abcd::1');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/待审核的退出请求 2001:db8:abcd::\/48/);
  });

  test('退出请求表还不存在（迁移 17 未执行）时不影响扫描策略', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM opt_out_requests')) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
      if (sql.includes('FROM scan_allowlist')) return [[{ cidr: '2001:db8::/32' }]];
      if (sql.includes('FROM scan_blacklist')) return [[]];
      if (sql.includes('FROM user_quotas')) return [[]];
      if (sql.includes('FROM tasks')) return [[{ count: 0 }]];
      throw new Error(sql);
    });
    expect((await xmap('2001:db8::1')).allowed).toBe(true);
  });

  test('黑名单或白名单里有无法解析的条目时忽略该条，不抛出', async () => {
    setPolicy({ allow: ['2001:db8::/32', 'garbage'], block: ['also-bad'] });
    expect((await xmap('2001:db8::1')).allowed).toBe(true);
  });
});

describe('速率', () => {
  beforeEach(() => setPolicy({ allow: ['2001:db8::/32'] }));

  test('未指定速率时使用默认值 10M', async () => {
    const result = await xmap('2001:db8::1');
    expect(result.normalized.rate).toBe('10M');
    expect(result.normalized.rateBps).toBe(10e6);
  });

  test('SCAN_DEFAULT_RATE 不会超过上限', async () => {
    process.env.SCAN_DEFAULT_RATE = '500M';
    process.env.SCAN_MAX_RATE = '50M';
    const result = await xmap('2001:db8::1');
    expect(result.normalized.rate).toBe('50M');
  });

  test('请求速率在上限内原样保留，超过上限拒绝', async () => {
    expect((await xmap('2001:db8::1', '100M')).normalized.rate).toBe('100M');
    const over = await xmap('2001:db8::1', '101M');
    expect(over.allowed).toBe(false);
    expect(over.reason).toMatch(/超过你的上限 100M/);
  });

  test('格式非法的速率被拒绝', async () => {
    const result = await xmap('2001:db8::1', 'fast');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/格式无效/);
  });

  test('用户配额覆盖环境变量上限', async () => {
    setPolicy({ allow: ['2001:db8::/32'], quota: { max_rate_bps: 2e6, daily_scan_limit: null } });
    expect((await xmap('2001:db8::1', '2M')).allowed).toBe(true);
    expect((await xmap('2001:db8::1', '3M')).allowed).toBe(false);
    expect((await xmap('2001:db8::1')).normalized.rate).toBe('2M'); // 默认值被压到上限
  });

  test('zgrab2 不检查速率', async () => {
    const result = await policy.validateScanRequest({ user: USER, taskType: 'zgrab2', targets: '2001:db8::1', rate: 'bogus' });
    expect(result.allowed).toBe(true);
    expect(result.normalized.rate).toBeUndefined();
  });
});

describe('每日配额', () => {
  test('已达上限时拒绝（默认 100）', async () => {
    setPolicy({ allow: ['2001:db8::/32'], used: 100 });
    const result = await xmap('2001:db8::1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/每日上限 100/);
  });

  test('未达上限时通过', async () => {
    setPolicy({ allow: ['2001:db8::/32'], used: 99 });
    expect((await xmap('2001:db8::1')).allowed).toBe(true);
  });

  test('SCAN_DAILY_LIMIT 与用户配额的优先级：用户配额 > 环境变量', async () => {
    process.env.SCAN_DAILY_LIMIT = '5';
    setPolicy({ allow: ['2001:db8::/32'], used: 5 });
    expect((await xmap('2001:db8::1')).allowed).toBe(false);

    setPolicy({ allow: ['2001:db8::/32'], used: 5, quota: { max_rate_bps: null, daily_scan_limit: 10 } });
    expect((await xmap('2001:db8::1')).allowed).toBe(true);
  });

  test('统计只看 xmap、zgrab2 与 apd 任务、今天创建的', async () => {
    setPolicy({ allow: ['2001:db8::/32'] });
    await xmap('2001:db8::1');
    const countSql = db.query.mock.calls.map(([sql]) => sql).find((sql) => sql.includes('FROM tasks'));
    expect(countSql).toMatch(/task_type IN \('xmap', 'zgrab2', 'apd'\)/);
    expect(countSql).toMatch(/created_at >= CURDATE\(\)/);
  });

  test('目标违规时不会去统计配额（先便宜后昂贵）', async () => {
    setPolicy();
    await xmap('2001:db8::1');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM tasks'))).toBe(false);
  });
});

describe('validateTargetFile', () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanpolicy-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (name, content) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  };
  const check = (filePath) => policy.validateTargetFile({ user: USER, filePath });

  beforeEach(() => setPolicy({ allow: ['2001:db8::/32'] }));

  test('全部合规：返回目标行数，空行/注释行/CRLF/ip,domain 行都被正确处理', async () => {
    const file = write('ok.txt', '# 目标\r\n2001:db8::1\r\n\r\n2001:db8:1::/48\r\n2001:db8::2,example.com\r\n');
    expect(await check(file)).toMatchObject({ allowed: true, count: 3 });
  });

  test('出现越界地址时停止，并指出行号', async () => {
    const file = write('bad.txt', '2001:db8::1\n# c\n2001:db9::1\n2001:db8::2\n');
    const result = await check(file);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/^文件第 3 行/);
    expect(result.count).toBe(1);
  });

  test('域名行被拒绝（即使 ip,domain 的第二列才是域名，第一列必须是地址）', async () => {
    const file = write('domain.txt', 'example.com\n');
    const result = await check(file);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/不接受域名/);
  });

  test('空文件与只有注释的文件被拒绝', async () => {
    expect((await check(write('empty.txt', ''))).allowed).toBe(false);
    expect((await check(write('comments.txt', '# a\n\n# b\n'))).reason).toMatch(/没有任何扫描目标/);
  });

  test('超长行不会把完整内容放进错误信息', async () => {
    const file = write('long.txt', `${'x'.repeat(5000)}\n`);
    const result = await check(file);
    expect(result.allowed).toBe(false);
    expect(result.reason.length).toBeLessThan(300);
  });

  test('文件不存在时抛出（由调用方处理）', async () => {
    await expect(check(path.join(dir, 'missing.txt'))).rejects.toThrow();
  });
});

describe('describePolicy', () => {
  test('返回默认值与内置禁止范围', () => {
    process.env.SCAN_ALLOWED_TARGETS = '2001:db8::/32';
    const info = policy.describePolicy();
    expect(info.envAllowedTargets).toEqual(['2001:db8::/32']);
    expect(info.defaults).toEqual({ maxRate: '100M', defaultRate: '10M', dailyScanLimit: 100 });
    expect(info.builtinBlocked.map((item) => item.cidr)).toContain('::1/128');
  });
});
