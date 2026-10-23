/**
 * 别名前缀检测：纯函数（探测地址生成、分类、过滤）、结果解析、入队、收尾与 runner。
 * 不启动真实进程、不连接数据库。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const handlers = {};
const mockSpawn = jest.fn(() => ({
  pid: 4242,
  unref: jest.fn(),
  on: jest.fn((event, cb) => { handlers[event] = cb; }),
  stderr: { pipe: jest.fn() }
}));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));
jest.mock('../database/db', () => ({ query: jest.fn().mockResolvedValue([{}]), getConnection: jest.fn(), end: jest.fn() }));

let tmpRoot;
let apd;
let db;
let DIRS;
let parseTarget;

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-apd-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  ({ DIRS } = require('../services/storageService'));
  require('../services/storageService').ensureDirs();
  ({ parseTarget } = require('../services/cidrService'));
  apd = require('../services/aliasDetectService');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  delete process.env.SCAN_ALLOWED_TARGETS;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const fixedRng = (byte) => (n) => Buffer.alloc(n, byte);
const USER = { id: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  process.env.SCAN_ALLOWED_TARGETS = '2001:db8::/32';
  db.query.mockImplementation(async () => [{ affectedRows: 1 }]);
  jest.spyOn(fs, 'createWriteStream').mockReturnValue({ write: jest.fn(), end: jest.fn(), on: jest.fn() });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseCandidatePrefix', () => {
  test.each(['2001:db8:1:2::/64', '2001:db8::/32', '2001:db8::/16', '2001:db8::1000/124'])('接受 %s', (text) => {
    expect(apd.parseCandidatePrefix(text)).not.toBeNull();
  });

  test.each([
    ['192.0.2.0/24', 'IPv4'],
    ['2001:db8::/63', '长度不是 4 的倍数'],
    ['2001:db8::/12', '长度小于 16'],
    ['2001:db8::1/128', '长度大于 124'],
    ['2001:db8::1', '没有写长度'],
    ['example.com/64', '域名'],
    [null, '非字符串'],
    ['', '空']
  ])('拒绝 %s（%s）', (text) => {
    expect(apd.parseCandidatePrefix(text)).toBeNull();
  });
});

describe('generateProbeAddresses', () => {
  const nibbleAt = (address, prefixLength) => {
    const range = parseTarget(address);
    return Number((range.start >> BigInt(128 - prefixLength - 4)) & 0xfn);
  };

  test.each([['2001:db8:1:2::/64'], ['2001:db8::/32'], ['2001:db8:1:2:3:4:5:6000/116']])('%s：16 个地址，依次落在 16 个不同的子前缀', (prefix) => {
    const range = apd.parseCandidatePrefix(prefix);
    const addresses = apd.generateProbeAddresses(prefix);
    expect(addresses).toHaveLength(16);
    expect(new Set(addresses).size).toBe(16);
    addresses.forEach((address, index) => {
      const parsed = parseTarget(address);
      expect(parsed.prefix).toBe(128);
      // 仍在候选前缀内
      const hostBits = BigInt(128 - range.prefix);
      expect(parsed.start >> hostBits).toBe(range.start >> hostBits);
      // 第 len+1…len+4 位恰为 0…f
      expect(nibbleAt(address, range.prefix)).toBe(index);
    });
  });

  test('其余位由 rng 决定：固定 rng 可复现，不同 rng 不同', () => {
    const a = apd.generateProbeAddresses('2001:db8:1:2::/64', 16, fixedRng(0x11));
    const b = apd.generateProbeAddresses('2001:db8:1:2::/64', 16, fixedRng(0x11));
    const c = apd.generateProbeAddresses('2001:db8:1:2::/64', 16, fixedRng(0x22));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('默认 rng 下两次生成的地址不同（随机）', () => {
    const a = apd.generateProbeAddresses('2001:db8:1:2::/64');
    const b = apd.generateProbeAddresses('2001:db8:1:2::/64');
    expect(a).not.toEqual(b);
  });

  test('/124 前缀没有随机位也能生成（每个子前缀恰为一个地址）', () => {
    const addresses = apd.generateProbeAddresses('2001:db8::10/124');
    expect(addresses).toHaveLength(16);
    expect(new Set(addresses).size).toBe(16);
  });

  test('count 小于 16 时只取前 count 个取值；越界或前缀无效抛出 ApdError', () => {
    expect(apd.generateProbeAddresses('2001:db8::/64', 4)).toHaveLength(4);
    expect(() => apd.generateProbeAddresses('2001:db8::/64', 0)).toThrow(apd.ApdError);
    expect(() => apd.generateProbeAddresses('2001:db8::/64', 17)).toThrow('1–16');
    expect(() => apd.generateProbeAddresses('2001:db8::/63')).toThrow('无效的候选前缀');
  });
});

describe('buildProbePlan', () => {
  test('去重并规范化；返回前缀、每个前缀的探测地址和全部地址', () => {
    const plan = apd.buildProbePlan(['2001:db8:1:2::/64', '2001:0db8:1:2::/64', '2001:db8:3::/48']);
    expect(plan.prefixes).toEqual(['2001:db8:1:2::/64', '2001:db8:3::/48']);
    expect(plan.addresses).toHaveLength(32);
    expect(plan.probes['2001:db8:3::/48']).toHaveLength(16);
  });

  test('包含无效前缀、空列表、超过上限都抛出 ApdError', () => {
    expect(() => apd.buildProbePlan(['2001:db8::/64', 'bogus'])).toThrow(apd.ApdError);
    expect(() => apd.buildProbePlan([])).toThrow('没有候选前缀');
    expect(() => apd.buildProbePlan('2001:db8::/64')).toThrow('没有候选前缀');
  });

  test('超过单任务前缀上限', () => {
    const many = [];
    for (let i = 0; i <= apd.MAX_PREFIXES_PER_TASK; i += 1) many.push(`2001:db8:${(i >> 16).toString(16)}:${(i & 0xffff).toString(16)}::/64`);
    expect(() => apd.buildProbePlan(many, { rng: fixedRng(1) })).toThrow('超过单个任务上限');
  });
});

describe('classifyResponses', () => {
  let plan;
  beforeAll(() => {
    plan = apd.buildProbePlan(['2001:db8:1::/48', '2001:db8:2::/48', '2001:db8:3::/48'], { rng: fixedRng(7) });
  });

  test('16 个全部应答为 aliased，0 个为 clean，其间为 uncertain', () => {
    const responders = new Set([
      ...plan.probes['2001:db8:1::/48'],
      ...plan.probes['2001:db8:3::/48'].slice(0, 5)
    ]);
    const result = apd.classifyResponses(plan, responders);
    expect(result.aliased).toEqual([{ prefix: '2001:db8:1::/48', sent: 16, answered: 16 }]);
    expect(result.clean).toEqual([{ prefix: '2001:db8:2::/48', sent: 16, answered: 0 }]);
    expect(result.uncertain).toEqual([{ prefix: '2001:db8:3::/48', sent: 16, answered: 5 }]);
  });

  test('应答地址的写法不影响匹配（大写、展开）；不在探测集里的应答被忽略', () => {
    const [first] = plan.probes['2001:db8:1::/48'];
    const expanded = parseTarget(first).start.toString(16).padStart(32, '0').match(/.{4}/g).join(':').toUpperCase();
    const result = apd.classifyResponses(plan, [expanded, '2001:db8:ffff::1', 'not-an-address', '192.0.2.1']);
    expect(result.uncertain).toEqual([{ prefix: '2001:db8:1::/48', sent: 16, answered: 1 }]);
    expect(result.aliased).toEqual([]);
  });

  test('minResponses 可调低阈值', () => {
    const responders = plan.probes['2001:db8:3::/48'].slice(0, 12);
    expect(apd.classifyResponses(plan, responders, { minResponses: 12 }).aliased.map((e) => e.prefix)).toEqual(['2001:db8:3::/48']);
    expect(apd.classifyResponses(plan, responders).aliased).toEqual([]);
  });
});

describe('derivePrefixes', () => {
  test('按长度取前缀并去重；忽略 IPv4 与无效地址', () => {
    const out = apd.derivePrefixes(['2001:db8:1:2::1', '2001:db8:1:2::ffff', '2001:db8:1:3::1', '192.0.2.1', 'junk', ' 2001:db8:1:2:aaaa::9 ']);
    expect(out.sort()).toEqual(['2001:db8:1:2::/64', '2001:db8:1:3::/64']);
    expect(apd.derivePrefixes(['2001:db8:1:2::1', '2001:db8:1:3::1'], 48)).toEqual(['2001:db8:1::/48']);
  });

  test('长度必须是 16–124 之间 4 的倍数', () => {
    expect(() => apd.derivePrefixes(['2001:db8::1'], 63)).toThrow(apd.ApdError);
    expect(() => apd.derivePrefixes(['2001:db8::1'], 128)).toThrow(apd.ApdError);
    expect(() => apd.derivePrefixes(['2001:db8::1'], 'x')).toThrow(apd.ApdError);
  });
});

describe('filterAddresses', () => {
  test('剔除落在别名前缀内的地址，并记录命中的前缀', () => {
    const { kept, removed } = apd.filterAddresses(
      ['2001:db8:1:2::1', '2001:db8:1:2:ffff::9', '2001:db8:1:3::1', '2001:db8:9::1', 'garbage', '192.0.2.1'],
      ['2001:db8:1:2::/64']
    );
    expect(removed).toEqual([
      { address: '2001:db8:1:2::1', prefix: '2001:db8:1:2::/64' },
      { address: '2001:db8:1:2:ffff::9', prefix: '2001:db8:1:2::/64' }
    ]);
    expect(kept).toEqual(['2001:db8:1:3::1', '2001:db8:9::1', 'garbage', '192.0.2.1']);
  });

  test('混合长度：/48 与 /64 同时生效', () => {
    const { kept, removed } = apd.filterAddresses(
      ['2001:db8:5:1::1', '2001:db8:1:2::1', '2001:db8:1:3::1'],
      ['2001:db8:5::/48', '2001:db8:1:2::/64', 'junk', '192.0.2.0/24']
    );
    expect(removed.map((r) => r.prefix)).toEqual(['2001:db8:5::/48', '2001:db8:1:2::/64']);
    expect(kept).toEqual(['2001:db8:1:3::1']);
  });

  test('没有别名前缀时原样保留', () => {
    expect(apd.filterAddresses(['2001:db8::1'], [])).toEqual({ kept: ['2001:db8::1'], removed: [] });
  });
});

describe('parseResponders', () => {
  const write = (name, content) => {
    const file = path.join(tmpRoot, name);
    fs.writeFileSync(file, content);
    return file;
  };

  test('一行一个 JSON 对象', async () => {
    const file = write('r1.json', '{"saddr":"2001:db8::1","success":true}\n{"saddr":"2001:db8::2"}\n');
    expect([...(await apd.parseResponders(file))].sort()).toEqual(['2001:db8::1', '2001:db8::2']);
  });

  test('JSON 数组（方括号与逗号单独成行或附在行尾）', async () => {
    const file = write('r2.json', '[\n{"saddr":"2001:db8::1"},\n{"saddr":"2001:db8::2"}\n]\n');
    expect(await apd.parseResponders(file)).toEqual(new Set(['2001:db8::1', '2001:db8::2']));
  });

  test('success 为假的记录不计入；无法解析的行用正则兜底', async () => {
    const file = write('r3.json', '{"saddr":"2001:db8::1","success":false}\n{"saddr":"2001:db8::2", broken\n\n{"nothing":1}\n');
    expect(await apd.parseResponders(file)).toEqual(new Set(['2001:db8::2']));
  });

  test('文件不存在返回空集合', async () => {
    expect((await apd.parseResponders(path.join(tmpRoot, 'missing.json'))).size).toBe(0);
  });
});

describe('enqueueApdTask', () => {
  const insertCall = () => db.query.mock.calls.find(([sql]) => /INSERT INTO tasks/.test(sql));

  test('合法前缀：写探测文件和计划，创建 apd 任务（不启动进程）', async () => {
    const result = await apd.enqueueApdTask({ user: USER, body: { prefixes: ['2001:db8:1:2::/64', '2001:db8:3::/48'], rate: '5M', description: '测试' } });
    expect(result).toMatchObject({ prefixCount: 2, probeCount: 32, rate: '5M' });
    expect(mockSpawn).not.toHaveBeenCalled();

    const probeFile = path.join(DIRS.apdInputs, `${result.taskId}.txt`);
    expect(fs.readFileSync(probeFile, 'utf8').trim().split('\n')).toHaveLength(32);
    const plan = JSON.parse(fs.readFileSync(path.join(DIRS.apdInputs, `${result.taskId}.json`), 'utf8'));
    expect(plan.prefixes).toEqual(['2001:db8:1:2::/64', '2001:db8:3::/48']);

    const values = insertCall()[1];
    expect(values[1]).toBe(5);
    expect(values[7]).toBe('apd');
    const params = JSON.parse(values[8]);
    expect(params.args).toEqual(expect.arrayContaining(['-6', '-I', probeFile, '-B', '5M', '-M', 'icmp_echo', '-O', 'json']));
    expect(params).toMatchObject({ prefixCount: 2, probeCount: 32 });
    expect(values[3]).toBe('测试');
  });

  test('prefixes 可以是逗号/空白分隔的字符串；未给速率用默认值', async () => {
    const result = await apd.enqueueApdTask({ user: USER, body: { prefixes: '2001:db8:1::/48, 2001:db8:2::/48' } });
    expect(result.prefixCount).toBe(2);
    expect(result.rate).toBe('10M');
  });

  test('没有任何候选 → 400', async () => {
    await expect(apd.enqueueApdTask({ user: USER, body: {} })).rejects.toMatchObject({ status: 400 });
    expect(insertCall()).toBeUndefined();
  });

  test('候选前缀无效 → 400，不入队', async () => {
    await expect(apd.enqueueApdTask({ user: USER, body: { prefixes: ['2001:db8::/63'] } })).rejects.toMatchObject({ status: 400 });
    expect(insertCall()).toBeUndefined();
  });

  test('不在白名单内 → 403，不写文件、不入队', async () => {
    await expect(apd.enqueueApdTask({ user: USER, body: { prefixes: ['2400:cb00::/32'] } })).rejects.toMatchObject({ status: 403, message: expect.stringContaining('默认拒绝') });
    expect(insertCall()).toBeUndefined();
  });

  test('速率超过上限 → 403', async () => {
    await expect(apd.enqueueApdTask({ user: USER, body: { prefixes: ['2001:db8::/48'], rate: '1G' } })).rejects.toMatchObject({ status: 403, message: expect.stringContaining('上限') });
  });

  test('addressFile：属于用户的文件按 prefixLength 推出候选前缀', async () => {
    const file = path.join(tmpRoot, 'addrs.txt');
    fs.writeFileSync(file, '# 注释\n2001:db8:1:2::1\n2001:db8:1:2::2,extra\n\n2001:db8:1:3::1\n');
    db.query.mockImplementation(async (sql) => (/FROM whitelists/.test(sql) ? [[{ file_path: file }]] : [{ affectedRows: 1 }]));
    const result = await apd.enqueueApdTask({ user: USER, body: { addressFile: 'a.txt' } });
    expect(result.prefixCount).toBe(2);
    const ownerQuery = db.query.mock.calls.find(([sql]) => /FROM whitelists/.test(sql));
    expect(ownerQuery[1]).toEqual(['a.txt', 5]);
  });

  test('addressFile 不属于用户 → 403；文件已丢失 → 400', async () => {
    db.query.mockImplementation(async (sql) => (/FROM whitelists/.test(sql) ? [[]] : [{}]));
    await expect(apd.enqueueApdTask({ user: USER, body: { addressFile: 'x.txt' } })).rejects.toMatchObject({ status: 403 });

    db.query.mockImplementation(async (sql) => (/FROM whitelists/.test(sql) ? [[{ file_path: path.join(tmpRoot, 'gone.txt') }]] : [{}]));
    await expect(apd.enqueueApdTask({ user: USER, body: { addressFile: 'x.txt' } })).rejects.toMatchObject({ status: 400 });
  });

  test('写任务记录失败时清理已写的探测文件并抛出原错误', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/INSERT INTO tasks/.test(sql)) throw new Error('db down');
      return [{ affectedRows: 1 }];
    });
    const before = fs.readdirSync(DIRS.apdInputs).length;
    await expect(apd.enqueueApdTask({ user: USER, body: { prefixes: ['2001:db8::/48'] } })).rejects.toThrow('db down');
    expect(fs.readdirSync(DIRS.apdInputs).length).toBe(before);
  });
});

describe('filterWithKnownAliases', () => {
  const known = (rowsList) => async (sql) => {
    if (/FROM aliased_prefixes/.test(sql)) return [rowsList.map((prefix) => ({ prefix }))];
    return [{ affectedRows: 1 }];
  };

  test('统计过滤前后数量与命中最多的前缀', async () => {
    db.query.mockImplementation(known(['2001:db8:1:2::/64', '2001:db8:5::/48']));
    const result = await apd.filterWithKnownAliases({
      user: USER,
      body: { addresses: '2001:db8:1:2::1 2001:db8:1:2::2 2001:db8:5:9::1 2001:db8:7::1' }
    });
    expect(result).toMatchObject({ total: 4, kept: 1, removed: 3, aliasedPrefixesKnown: 2, savedFile: null });
    expect(result.topPrefixes[0]).toEqual({ prefix: '2001:db8:1:2::/64', count: 2 });
  });

  test('缺少输入 / 空列表 → 400', async () => {
    await expect(apd.filterWithKnownAliases({ user: USER, body: {} })).rejects.toMatchObject({ status: 400 });
    await expect(apd.filterWithKnownAliases({ user: USER, body: { addresses: [] } })).rejects.toMatchObject({ status: 400 });
  });

  test('save：把保留的地址存成可被任务引用的文件（默认 zgrab2）', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/FROM aliased_prefixes/.test(sql)) return [[{ prefix: '2001:db8:1:2::/64' }]];
      if (/FROM tools/.test(sql)) return [[{ id: 3 }]];
      return [{ affectedRows: 1 }];
    });
    const result = await apd.filterWithKnownAliases({
      user: USER,
      body: { addresses: ['2001:db8:1:2::1', '2001:db8:7::1', '2001:db8:8::1'], save: true }
    });
    expect(result.savedFile).toMatchObject({ count: 2, tool: 'zgrab2' });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO whitelists/.test(sql));
    expect(insert[1][0]).toBe(5);
    const content = fs.readFileSync(insert[1][3], 'utf8').trim().split('\n');
    expect(content).toEqual(['2001:db8:7::1', '2001:db8:8::1']);
  });

  test('save：全部被剔除时不生成文件', async () => {
    db.query.mockImplementation(known(['2001:db8::/32']));
    await expect(apd.filterWithKnownAliases({ user: USER, body: { addresses: ['2001:db8::1'], save: true } })).rejects.toThrow('没有剩余地址');
  });
});

describe('finishApdTask / runApdTask', () => {
  // 构造一个已入队任务：返回调度器会交给 runner 的对象
  const makeTask = async () => {
    const result = await apd.enqueueApdTask({ user: USER, body: { prefixes: ['2001:db8:1::/48', '2001:db8:2::/48', '2001:db8:3::/48'] } });
    const call = db.query.mock.calls.find(([sql]) => /INSERT INTO tasks/.test(sql));
    const task = { id: result.taskId, userId: 5, params: JSON.parse(call[1][8]) };
    const plan = JSON.parse(fs.readFileSync(task.params.planFile, 'utf8'));
    return { task, plan };
  };

  const writeRaw = (task, addresses) => fs.writeFileSync(task.params.rawResultFile, `${addresses.map((a) => JSON.stringify({ saddr: a })).join('\n')}\n`);
  const sqlsOf = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

  test('finishApdTask：别名前缀 upsert、无应答的前缀从表中移除、写摘要文件', async () => {
    const { task, plan } = await makeTask();
    writeRaw(task, [...plan.probes['2001:db8:1::/48'], ...plan.probes['2001:db8:3::/48'].slice(0, 3)]);
    db.query.mockClear();

    const summary = await apd.finishApdTask(task);
    expect(summary.counts).toEqual({ aliased: 1, uncertain: 1, clean: 1 });
    expect(summary.responders).toBe(19);

    const upserts = sqlsOf(/INSERT INTO aliased_prefixes/);
    expect(upserts).toHaveLength(1);
    expect(upserts[0][1]).toEqual(['2001:db8:1::/48', 48, 16, 16, 'apd-16', task.id, 5]);
    const deletes = sqlsOf(/DELETE FROM aliased_prefixes/);
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toEqual([['2001:db8:2::/48']]); // 只删 clean，不动 uncertain

    expect(summary.clearedFromTable).toBe(1);
    expect(JSON.parse(fs.readFileSync(task.params.summaryFile, 'utf8')).counts.aliased).toBe(1);
  });

  test('runApdTask：以参数数组启动 xmap，进程正常结束后写结果并标记 completed', async () => {
    const { task, plan } = await makeTask();
    writeRaw(task, plan.probes['2001:db8:1::/48']);
    db.query.mockClear();

    await apd.runApdTask(task);
    const [command, args, options] = mockSpawn.mock.calls[0];
    expect(['sudo', 'xmap']).toContain(command);
    expect(args).toEqual(expect.arrayContaining(['-6', '-I', path.join(DIRS.apdInputs, `${task.id}.txt`), '-M', 'icmp_echo']));
    expect(options).toMatchObject({ detached: true });
    expect(sqlsOf(/SET status = 'running'/)).toHaveLength(1);

    db.query.mockImplementation(async (sql) => (/SELECT status FROM tasks/.test(sql) ? [[{ status: 'running' }]] : [{ affectedRows: 1 }]));
    await handlers.close(0, null);
    expect(sqlsOf(/INSERT INTO aliased_prefixes/)).toHaveLength(1);
    const finish = sqlsOf(/SET status = \?/)[0];
    expect(finish[1][0]).toBe('completed');
  });

  test('进程异常退出：标记 failed，附带退出码与错误日志，且不写检测结果', async () => {
    const { task } = await makeTask();
    await apd.runApdTask(task);
    db.query.mockClear();
    await handlers.close(2, null);
    expect(sqlsOf(/INSERT INTO aliased_prefixes/)).toHaveLength(0);
    const finish = sqlsOf(/SET status = \?/)[0];
    expect(finish[1][0]).toBe('failed');
    expect(finish[1][1]).toContain('退出码: 2');
  });

  test('任务在运行期间被取消：进程结束后不写检测结果，也不改写状态', async () => {
    const { task, plan } = await makeTask();
    writeRaw(task, plan.probes['2001:db8:1::/48']);
    await apd.runApdTask(task);
    db.query.mockClear();
    db.query.mockImplementation(async (sql) => (/SELECT status FROM tasks/.test(sql) ? [[{ status: 'canceled' }]] : [{ affectedRows: 1 }]));
    await handlers.close(0, null);
    expect(sqlsOf(/INSERT INTO aliased_prefixes/)).toHaveLength(0);
    expect(sqlsOf(/SET status = \?/)).toHaveLength(0);
  });

  test('收尾处理失败（计划文件损坏）：标记 failed', async () => {
    const { task } = await makeTask();
    fs.writeFileSync(task.params.planFile, 'not json');
    await apd.runApdTask(task);
    db.query.mockClear();
    db.query.mockImplementation(async (sql) => (/SELECT status FROM tasks/.test(sql) ? [[{ status: 'running' }]] : [{ affectedRows: 1 }]));
    await handlers.close(0, null);
    const finish = sqlsOf(/SET status = \?/)[0];
    expect(finish[1][0]).toBe('failed');
    expect(finish[1][1]).toContain('处理检测结果失败');
  });

  test('进程启动失败（error 事件）：标记 failed', async () => {
    const { task } = await makeTask();
    await apd.runApdTask(task);
    db.query.mockClear();
    await handlers.error(new Error('ENOENT'));
    const finish = sqlsOf(/SET status = \?/)[0];
    expect(finish[1][0]).toBe('failed');
    expect(finish[1][1]).toContain('ENOENT');
  });

  test('启动前已被取消（markTaskRunning 返回 false）：终止刚启动的进程', async () => {
    const { task } = await makeTask();
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    db.query.mockImplementation(async (sql) => (/SET status = 'running'/.test(sql) ? [{ affectedRows: 0 }] : [{ affectedRows: 1 }]));
    await apd.runApdTask(task);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  test('任务缺少 APD 参数时抛出', async () => {
    await expect(apd.runApdTask({ id: 1, params: {} })).rejects.toThrow('缺少 APD 参数');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test('terminateApdProcess：对不存在的任务不报错，只尝试 pkill 兜底', () => {
    expect(() => apd.terminateApdProcess(999)).not.toThrow();
    const [, args] = mockSpawn.mock.calls[0];
    expect(args.join(' ')).toContain('pkill');
  });
});
