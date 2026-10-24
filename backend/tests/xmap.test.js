const fs = require('fs');
const os = require('os');
const path = require('path');

const mockSpawn = jest.fn(() => ({
  pid: 99,
  unref: jest.fn(),
  on: jest.fn(),
  stderr: { pipe: jest.fn() }
}));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));
jest.mock('../database/db', () => ({ query: jest.fn().mockResolvedValue([{}]), getConnection: jest.fn(), end: jest.fn() }));

let tmpRoot;
let controller;
let db;

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-xmap-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  const { ensureDirs, DIRS } = require('../services/storageService');
  ensureDirs();
  fs.writeFileSync(path.join(DIRS.whitelists, 'whitelist_5_1.txt'), '2001:db8::/32\n');
  fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'secret\n');
  controller = require('../controllers/xmapController');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue([{}]);
  // 不真正打开日志文件，避免测试目录清理后异步报错
  jest.spyOn(fs, 'createWriteStream').mockReturnValue({ write: jest.fn(), end: jest.fn(), on: jest.fn() });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const scan = async (body) => {
  const res = createRes();
  await controller.scan({ user: { id: 5 }, body }, res);
  return res;
};

describe('xmap 参数校验', () => {
  test('合法参数：以参数数组调用 sudo xmap', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', rate: '10M', maxlen: '64', targetPort: '80,443', max_results: '1000', description: 't' });
    expect(res.status).toHaveBeenCalledWith(202);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('sudo');
    expect(args.slice(0, 2)).toEqual(['xmap', '-6']);
    expect(args).toEqual(expect.arrayContaining(['-B', '10M', '-x', '64', '-p', '80,443', '2001:db8::/32']));
  });

  test('XMAP_USE_SUDO=false 且指定 XMAP_BIN：直接执行该程序，任务记录里也不含 sudo', async () => {
    process.env.XMAP_USE_SUDO = 'false';
    process.env.XMAP_BIN = '/usr/local/sbin/xmap';
    try {
      const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', rate: '10M' });
      expect(res.status).toHaveBeenCalledWith(202);
      const [cmd, args] = mockSpawn.mock.calls[0];
      expect(cmd).toBe('/usr/local/sbin/xmap');
      expect(args[0]).toBe('-6');
      const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO tasks/.test(sql));
      expect(insert[1][2]).toMatch(/^\/usr\/local\/sbin\/xmap -6/);
      expect(insert[1][2]).not.toContain('sudo');
    } finally {
      delete process.env.XMAP_USE_SUDO;
      delete process.env.XMAP_BIN;
    }
  });

  test.each([
    ['目标以 - 开头（选项注入）', { targetaddress: '--output-file=/etc/cron.d/x' }],
    ['目标含空格', { targetaddress: '2001:db8::1 -o /tmp/x' }],
    ['速率含选项', { rate: '10M --foo' }],
    ['速率为负数', { rate: '-5' }],
    ['端口含字母', { targetPort: '80,abc' }],
    ['端口以 - 开头', { targetPort: '-80' }],
    ['扫描长度非数字', { maxlen: '64;id' }],
    ['最大结果数非数字', { max_results: '1e9' }],
    ['扫描模式含符号', { probeModule: 'icmp_echoscan --x' }],
    ['未知参数', { output: '/tmp/x' }]
  ])('%s 被拒绝，不启动进程', async (_name, override) => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', ...override });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test.each([
    ['../secret.txt'],
    ['../../etc/passwd'],
    ['/etc/passwd'],
    ['sub/whitelist.txt']
  ])('whitelistFile=%s 被拒绝', async (whitelistFile) => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test('白名单目录下的文件可以使用', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile: 'whitelist_5_1.txt' });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(mockSpawn.mock.calls[0][1]).toEqual(expect.arrayContaining(['-w', path.join(tmpRoot, 'whitelists', 'whitelist_5_1.txt')]));
  });

  test('白名单文件不存在时返回 400', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile: 'nope.txt' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('任务生命周期（taskService）', () => {
  const taskSqls = () => db.query.mock.calls.filter(([sql]) => /tasks/.test(sql));
  const handlersOf = (child) => Object.fromEntries(child.on.mock.calls.map(([event, fn]) => [event, fn]));

  test('先写 pending 记录，再启动进程，随后记录 pid 并置为 running', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', rate: '1M', description: 'd' });
    expect(res.status).toHaveBeenCalledWith(202);

    const sqls = taskSqls().map(([sql]) => sql.replace(/\s+/g, ' '));
    expect(sqls[0]).toMatch(/^INSERT INTO tasks/);
    expect(sqls[1]).toMatch(/SET status = 'running', pid = \?/);
    expect(db.query.mock.calls.find(([sql]) => /INSERT INTO tasks/.test(sql))[1][4]).toBe('pending');
    expect(taskSqls()[1][1][0]).toBe(99); // mockSpawn 返回的 pid
  });

  test('启动失败（error 事件，例如容器里没有 sudo/xmap）标记任务失败，而不是让进程崩溃', async () => {
    await scan({ ipv6: true, targetaddress: '2001:db8::/32' });
    const child = mockSpawn.mock.results[0].value;
    const { error } = handlersOf(child);
    expect(typeof error).toBe('function');

    db.query.mockClear();
    await error(Object.assign(new Error('spawn sudo ENOENT'), { code: 'ENOENT' }));

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tasks/);
    expect(values[0]).toBe('failed');
    expect(values[1]).toMatch(/无法启动 sudo: spawn sudo ENOENT/);
  });

  test('退出码 0 → completed；非 0 → failed 并带退出码', async () => {
    await scan({ ipv6: true, targetaddress: '2001:db8::/32' });
    const { close } = handlersOf(mockSpawn.mock.results[0].value);

    db.query.mockClear();
    await close(0, null);
    expect(db.query.mock.calls[0][1].slice(0, 4)).toEqual(['completed', null, 0, null]);

    db.query.mockClear();
    await close(2, null);
    expect(db.query.mock.calls[0][1][0]).toBe('failed');
    expect(db.query.mock.calls[0][1][2]).toBe(2);
  });
});

describe('取消任务', () => {
  const cancel = async (taskId = 123) => {
    const res = createRes();
    await controller.cancelTask({ user: { id: 5 }, params: { taskId: String(taskId) } }, res);
    return res;
  };

  test('先置为 canceled，再终止进程；没有子进程句柄（服务重启后）时按命令行系统级终止', async () => {
    db.query.mockResolvedValueOnce([[{ id: 123, status: 'running' }]]); // SELECT 任务
    const res = await cancel(123);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const update = db.query.mock.calls.find(([sql]) => /UPDATE tasks/.test(sql));
    expect(update[1].slice(0, 2)).toEqual(['canceled', '用户手动终止']);

    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('sudo');
    expect(args).toEqual(['pkill', '-f', 'xmap.*123']);
  });

  test('已结束的任务不能取消', async () => {
    db.query.mockResolvedValueOnce([[{ id: 123, status: 'completed' }]]);
    const res = await cancel(123);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test('任务不存在或不属于当前用户', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await cancel(123);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('启动失败的竞态', () => {
  test('error 监听器在任何 await 之前就已挂上（error 事件在 spawn 后的下一个 tick 触发）', async () => {
    let releaseRunningUpdate;
    db.query.mockImplementation((sql) => {
      if (/SET status = 'running'/.test(sql)) {
        return new Promise((resolve) => { releaseRunningUpdate = () => resolve([{ affectedRows: 1 }]); });
      }
      return Promise.resolve([{}]);
    });

    const pending = scan({ ipv6: true, targetaddress: '2001:db8::/32' });
    // 让 INSERT 完成、spawn 被调用，而 running 的 UPDATE 仍悬而未决
    for (let i = 0; i < 20 && !releaseRunningUpdate; i += 1) await new Promise(setImmediate);

    const child = mockSpawn.mock.results[0].value;
    const events = child.on.mock.calls.map(([event]) => event);
    expect(events).toEqual(expect.arrayContaining(['error', 'close']));

    releaseRunningUpdate();
    await pending;
  });
});
