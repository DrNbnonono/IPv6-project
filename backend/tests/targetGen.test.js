/**
 * 目标生成任务服务：入队校验、种子来源、runner 与收尾。不启动真实进程、不连接数据库。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const handlers = {};
const mockSpawn = jest.fn(() => ({
  pid: 5151,
  unref: jest.fn(),
  on: jest.fn((event, cb) => { handlers[event] = cb; }),
  stderr: { pipe: jest.fn() }
}));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));
jest.mock('../database/db', () => ({ query: jest.fn().mockResolvedValue([{}]), getConnection: jest.fn(), end: jest.fn() }));

let tmpRoot;
let svc;
let db;
let DIRS;

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-tga-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  ({ DIRS } = require('../services/storageService'));
  require('../services/storageService').ensureDirs();
  svc = require('../services/targetGenService');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  delete process.env.SCAN_ALLOWED_TARGETS;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const USER = { id: 5 };
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));
const insertTask = () => {
  const call = calls(/INSERT INTO tasks/)[0];
  const v = call[1];
  return { id: v[0], userId: v[1], command: v[2], description: v[3], logPath: v[5], outputPath: v[6], taskType: v[7], params: JSON.parse(v[8]) };
};

// 默认：库里没有别名前缀；其余查询返回空结果
const installDb = (extra = {}) => {
  db.query.mockImplementation(async (sql, params) => {
    for (const [pattern, fn] of Object.entries(extra)) if (new RegExp(pattern).test(sql)) return fn(sql, params);
    if (/FROM aliased_prefixes/.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  process.env.SCAN_ALLOWED_TARGETS = '2001:db8::/32';
  installDb();
  jest.spyOn(fs, 'createWriteStream').mockReturnValue({ write: jest.fn(), end: jest.fn(), on: jest.fn() });
});

afterEach(() => jest.restoreAllMocks());

const uploaded = (name, content) => {
  const file = path.join(tmpRoot, name);
  fs.writeFileSync(file, content);
  return file;
};

describe('enqueueTgaTask：参数', () => {
  test.each([
    [{}, '未知的算法'],
    [{ algorithm: 'nope', seedFile: 'a.txt' }, '未知的算法'],
    [{ algorithm: 'density-expand' }, '请提供种子'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', seedAsn: 4134 }, '只能选一种'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', budget: 0 }, 'budget'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', budget: 5000000 }, 'budget'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', options: { maxWildcards: 9 } }, '1–4'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', options: { evil: 1 } }, '不支持参数'],
    [{ algorithm: 'density-expand', seedAsn: 1, seedLimit: 999999 }, 'seedLimit'],
    [{ algorithm: 'density-expand', seedFile: 'a.txt', rngSeed: -3 }, 'rngSeed']
  ])('%j → 400', async (body, message) => {
    await expect(svc.enqueueTgaTask({ user: USER, body })).rejects.toMatchObject({ status: 400, message: expect.stringContaining(message) });
    expect(calls(/INSERT INTO tasks/)).toHaveLength(0);
  });
});

describe('enqueueTgaTask：种子文件', () => {
  test('用自己上传的文件：创建 tga 任务，命令行参数由服务端生成，不启动进程', async () => {
    const seeds = uploaded('seeds_a.txt', '2001:db8::1\n2001:db8::2\n');
    installDb({ 'FROM whitelists': () => [[{ file_path: seeds }]] });

    const result = await svc.enqueueTgaTask({
      user: USER,
      body: { algorithm: 'density-expand', seedFile: 'seeds_a.txt', budget: 500, options: { maxWildcards: 3 }, rngSeed: 7, description: '测试' }
    });
    expect(result).toMatchObject({ algorithm: 'density-expand', budget: 500, seedSource: 'file' });
    expect(mockSpawn).not.toHaveBeenCalled();

    const task = insertTask();
    expect(task).toMatchObject({ userId: 5, taskType: 'tga', description: '测试' });
    expect(task.outputPath).toBe(path.join(DIRS.whitelists, `whitelist_5_${result.taskId}.txt`));
    const { args } = task.params;
    expect(args[0]).toMatch(/scripts\/tga\/generate\.js$/);
    expect(args).toEqual(expect.arrayContaining(['--algorithm', 'density-expand', '--seeds', seeds, '--budget', '500', '--rng-seed', '7', '--option', 'maxWildcards=3']));
    expect(args).not.toContain('--aliased');
    expect(calls(/FROM whitelists/)[0][1]).toEqual(['seeds_a.txt', 5]);
  });

  test('不是自己的文件 → 403；文件已丢失 → 400', async () => {
    installDb({ 'FROM whitelists': () => [[]] });
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'subnet-walk', seedFile: 'x.txt' } })).rejects.toMatchObject({ status: 403 });
    installDb({ 'FROM whitelists': () => [[{ file_path: path.join(tmpRoot, 'gone.txt') }]] });
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'subnet-walk', seedFile: 'x.txt' } })).rejects.toMatchObject({ status: 400 });
  });

  test('库里有别名前缀时默认排除：写出别名前缀文件并传 --aliased；excludeAliased=false 则不传', async () => {
    const seeds = uploaded('seeds_b.txt', '2001:db8::1\n');
    installDb({
      'FROM whitelists': () => [[{ file_path: seeds }]],
      'FROM aliased_prefixes': () => [[{ prefix: '2001:db8:a::/48' }, { prefix: '2001:db8:b:1::/64' }]]
    });
    const result = await svc.enqueueTgaTask({ user: USER, body: { algorithm: 'nibble-dist', seedFile: 'seeds_b.txt' } });
    const { args, aliasedFile } = insertTask().params;
    expect(args).toEqual(expect.arrayContaining(['--aliased', aliasedFile]));
    expect(fs.readFileSync(aliasedFile, 'utf8').trim().split('\n')).toEqual(['2001:db8:a::/48', '2001:db8:b:1::/64']);
    expect(aliasedFile).toContain(`${result.taskId}.aliased.txt`);

    db.query.mockClear();
    await svc.enqueueTgaTask({ user: USER, body: { algorithm: 'nibble-dist', seedFile: 'seeds_b.txt', excludeAliased: false } });
    expect(insertTask().params.args).not.toContain('--aliased');
    expect(calls(/FROM aliased_prefixes/)).toHaveLength(0);
  });

  test('写任务记录失败时清理已写的中间文件并抛出原错误', async () => {
    const seeds = uploaded('seeds_c.txt', '2001:db8::1\n');
    installDb({
      'FROM whitelists': () => [[{ file_path: seeds }]],
      'FROM aliased_prefixes': () => [[{ prefix: '2001:db8:a::/48' }]],
      'INSERT INTO tasks': () => { throw new Error('db down'); }
    });
    const before = fs.readdirSync(DIRS.tgaInputs).length;
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'nibble-dist', seedFile: 'seeds_c.txt' } })).rejects.toThrow('db down');
    expect(fs.readdirSync(DIRS.tgaInputs).length).toBe(before);
    expect(fs.existsSync(seeds)).toBe(true); // 用户自己的种子文件不会被清理
  });
});

describe('enqueueTgaTask：库里的种子', () => {
  test('按前缀：精确匹配 prefix 与 prefix_length，再取 active_addresses，写入种子文件', async () => {
    installDb({
      'FROM ip_prefixes': () => [[{ prefix_id: 11 }]],
      'FROM active_addresses': () => [[{ address: '2001:db8::1' }, { address: '2001:db8::2' }]]
    });
    const result = await svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', seedPrefix: '2001:0DB8::/32', seedLimit: 50 } });

    expect(calls(/FROM ip_prefixes/)[0][1]).toEqual(['2001:db8::', 32]);
    const [sql, params] = calls(/FROM active_addresses/)[0];
    expect(sql).toContain("version = '6'");
    expect(params).toEqual([[11], 50]);

    const { args, seedSource } = insertTask().params;
    const seedsFile = path.join(DIRS.tgaInputs, `${result.taskId}.seeds.txt`);
    expect(args).toEqual(expect.arrayContaining(['--seeds', seedsFile]));
    expect(fs.readFileSync(seedsFile, 'utf8')).toBe('2001:db8::1\n2001:db8::2\n');
    expect(seedSource).toEqual({ type: 'database', prefix: '2001:0DB8::/32', asn: null, count: 2 });
  });

  test('按 ASN：取该 ASN 的所有 IPv6 前缀', async () => {
    installDb({
      'FROM ip_prefixes': () => [[{ prefix_id: 1 }, { prefix_id: 2 }]],
      'FROM active_addresses': () => [[{ address: '2400::1' }]]
    });
    await svc.enqueueTgaTask({ user: USER, body: { algorithm: 'subnet-walk', seedAsn: '4134' } });
    expect(calls(/FROM ip_prefixes/)[0][1]).toEqual([4134]);
    expect(calls(/FROM active_addresses/)[0][1]).toEqual([[1, 2], 100000]);
  });

  test.each([
    [{ seedPrefix: '192.0.2.0/24' }, 400, 'IPv6 前缀'],
    [{ seedPrefix: '2001:db8::1' }, 400, 'IPv6 前缀'],
    [{ seedAsn: 'abc' }, 400, 'seedAsn']
  ])('%j → %i', async (body, status, message) => {
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', ...body } })).rejects.toMatchObject({ status, message: expect.stringContaining(message) });
  });

  test('没有匹配的前缀 / 没有活跃地址 / 前缀过多 → 404 或 400，且不入队', async () => {
    installDb({ 'FROM ip_prefixes': () => [[]] });
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', seedAsn: 1 } })).rejects.toMatchObject({ status: 404 });

    installDb({ 'FROM ip_prefixes': () => [[{ prefix_id: 1 }]], 'FROM active_addresses': () => [[]] });
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', seedAsn: 1 } })).rejects.toMatchObject({ status: 404 });

    installDb({ 'FROM ip_prefixes': () => [Array.from({ length: 1001 }, (_, i) => ({ prefix_id: i + 1 }))] });
    await expect(svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', seedAsn: 1 } })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('缩小范围') });
    expect(calls(/INSERT INTO tasks/)).toHaveLength(0);
  });
});

describe('runTgaTask / finishTgaTask', () => {
  const makeTask = async ({ generated = 3, summaryExtra = {} } = {}) => {
    const seeds = uploaded(`seeds_run_${Math.random().toString(36).slice(2)}.txt`, '2001:db8::1\n');
    installDb({ 'FROM whitelists': () => [[{ file_path: seeds }]] });
    await svc.enqueueTgaTask({ user: USER, body: { algorithm: 'density-expand', seedFile: 'x.txt' } });
    const task = insertTask();
    // 模拟生成进程已写好的文件
    fs.writeFileSync(task.params.outFile, '2001:db8::2\n2001:db8::3\n2001:db8::4\n');
    fs.writeFileSync(task.params.summaryFile, JSON.stringify({ algorithm: 'density-expand', generated, ...summaryExtra }));
    db.query.mockClear();
    return { id: task.id, userId: 5, params: task.params };
  };

  test('runTgaTask：以 node 运行生成脚本，参数原样来自任务记录', async () => {
    const task = await makeTask();
    installDb();
    await svc.runTgaTask(task);
    const [command, args, options] = mockSpawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual(task.params.args);
    expect(options).toMatchObject({ detached: true });
    expect(calls(/SET status = 'running'/)).toHaveLength(1);
  });

  test('正常结束：登记到 whitelists（工具 xmap）、预检扫描策略、补全摘要、标记 completed', async () => {
    const task = await makeTask();
    installDb({
      'FROM tools': () => [[{ id: 3 }]],
      'SELECT status FROM tasks': () => [[{ status: 'running' }]]
    });
    await svc.runTgaTask(task);
    await handlers.close(0, null);

    const insert = calls(/INSERT INTO whitelists/)[0];
    expect(insert[1][0]).toBe(5);
    expect(insert[1][1]).toBe(3);
    expect(insert[1][2]).toBe(path.basename(task.params.outFile));
    expect(insert[1][3]).toBe(task.params.outFile);

    const summary = JSON.parse(fs.readFileSync(task.params.summaryFile, 'utf8'));
    expect(summary).toMatchObject({ taskId: task.id, fileName: path.basename(task.params.outFile), generated: 3 });
    expect(summary.scannable).toEqual({ allowed: true, reason: null }); // 地址都在 2001:db8::/32 内
    expect(calls(/SET status = \?/)[0][1][0]).toBe('completed');
  });

  test('生成的地址超出扫描策略：任务仍然成功，摘要里说明原因', async () => {
    const task = await makeTask();
    fs.writeFileSync(task.params.outFile, '2001:db8::2\n2400:cb00::1\n');
    installDb({ 'FROM tools': () => [[{ id: 3 }]], 'SELECT status FROM tasks': () => [[{ status: 'running' }]] });
    await svc.runTgaTask(task);
    await handlers.close(0, null);
    const summary = JSON.parse(fs.readFileSync(task.params.summaryFile, 'utf8'));
    expect(summary.scannable.allowed).toBe(false);
    expect(summary.scannable.reason).toContain('第 2 行');
    expect(calls(/SET status = \?/)[0][1][0]).toBe('completed');
  });

  test('生成 0 个地址：不做策略预检', async () => {
    const task = await makeTask({ generated: 0 });
    installDb({ 'FROM tools': () => [[{ id: 3 }]], 'SELECT status FROM tasks': () => [[{ status: 'running' }]] });
    await svc.runTgaTask(task);
    await handlers.close(0, null);
    expect(JSON.parse(fs.readFileSync(task.params.summaryFile, 'utf8')).scannable).toBeNull();
  });

  test('进程异常退出：标记 failed，附退出码，并删除不完整的输出文件', async () => {
    const task = await makeTask();
    installDb();
    await svc.runTgaTask(task);
    db.query.mockClear();
    await handlers.close(1, null);
    const finish = calls(/SET status = \?/)[0];
    expect(finish[1][0]).toBe('failed');
    expect(finish[1][1]).toContain('退出码: 1');
    expect(fs.existsSync(task.params.outFile)).toBe(false);
    expect(calls(/INSERT INTO whitelists/)).toHaveLength(0);
  });

  test('运行期间被取消：不登记文件、不改状态，并删除输出文件', async () => {
    const task = await makeTask();
    installDb({ 'SELECT status FROM tasks': () => [[{ status: 'canceled' }]] });
    await svc.runTgaTask(task);
    db.query.mockClear();
    installDb({ 'SELECT status FROM tasks': () => [[{ status: 'canceled' }]] });
    await handlers.close(0, null);
    expect(calls(/INSERT INTO whitelists/)).toHaveLength(0);
    expect(calls(/SET status = \?/)).toHaveLength(0);
    expect(fs.existsSync(task.params.outFile)).toBe(false);
  });

  test('收尾失败（摘要文件损坏 / xmap 工具未配置）：标记 failed', async () => {
    const task = await makeTask();
    fs.writeFileSync(task.params.summaryFile, 'not json');
    installDb({ 'SELECT status FROM tasks': () => [[{ status: 'running' }]] });
    await svc.runTgaTask(task);
    await handlers.close(0, null);
    expect(calls(/SET status = \?/)[0][1][1]).toContain('处理生成结果失败');

    const task2 = await makeTask();
    installDb({ 'FROM tools': () => [[]], 'SELECT status FROM tasks': () => [[{ status: 'running' }]] });
    await svc.runTgaTask(task2);
    await handlers.close(0, null);
    expect(calls(/SET status = \?/).pop()[1][1]).toContain('工具未配置');
  });

  test('进程启动失败（error 事件）：标记 failed', async () => {
    const task = await makeTask();
    installDb();
    await svc.runTgaTask(task);
    db.query.mockClear();
    await handlers.error(new Error('EACCES'));
    expect(calls(/SET status = \?/)[0][1][1]).toContain('EACCES');
  });

  test('启动前已被取消（markTaskRunning 返回 false）：终止刚启动的进程', async () => {
    const task = await makeTask();
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    installDb({ "SET status = 'running'": () => [{ affectedRows: 0 }] });
    await svc.runTgaTask(task);
    expect(kill).toHaveBeenCalledWith(-5151, 'SIGTERM');
  });

  test('任务缺少 TGA 参数时抛出；终止不存在的任务不报错', async () => {
    await expect(svc.runTgaTask({ id: 1, params: {} })).rejects.toThrow('缺少 TGA 参数');
    expect(() => svc.terminateTgaProcess(999)).not.toThrow();
  });
});
