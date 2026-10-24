const fs = require('fs');
const os = require('os');
const path = require('path');

const mockExecFile = jest.fn(() => ({ pid: 4321 }));
jest.mock('child_process', () => ({
  execFile: (...args) => mockExecFile(...args),
  spawn: jest.fn(),
  exec: jest.fn()
}));

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

let tmpRoot;
let controller;
let service;
let db;
let inputPath;
let otherUsersPath;

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

// 按 SQL 内容模拟数据库
const installDb = ({ ownedPaths = [], byName = null } = {}) => {
  db.query.mockImplementation(async (sql, params) => {
    if (/FROM tools/.test(sql)) return [[{ id: 2 }]];
    if (/UNION/.test(sql)) {
      const candidates = params[1];
      return [candidates.some((c) => ownedPaths.includes(c)) ? [{ ok: 1 }] : []];
    }
    if (/FROM whitelists WHERE user_id = \? AND file_name = \?/.test(sql)) {
      return [byName ? [{ file_path: byName }] : []];
    }
    if (/INSERT INTO tasks/.test(sql)) return [{ insertId: 1 }];
    if (/UPDATE tasks/.test(sql)) return [{}];
    return [[]];
  });
};

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-zgrab2-')));
  process.env.PROJECT_ROOT = tmpRoot;
  process.env.ZGRAB2_BIN = process.execPath; // 任意存在的可执行文件
  jest.resetModules();
  db = require('../database/db');
  service = require('../services/zgrab2CommandService');
  controller = require('../controllers/zgrab2Controller');

  const { DIRS, ensureDirs } = require('../services/storageService');
  ensureDirs();
  inputPath = path.join(DIRS.zgrab2Inputs, 'zgrab2_input_5_1.txt');
  otherUsersPath = path.join(DIRS.zgrab2Inputs, 'zgrab2_input_9_1.txt');
  fs.writeFileSync(inputPath, '2001:db8::1\n');
  fs.writeFileSync(otherUsersPath, '2001:db8::2\n');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  delete process.env.ZGRAB2_BIN;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const request = (body) => ({ user: { id: 5 }, body: { module: 'http', inputFile: 'zgrab2_input_5_1.txt', ...body } });
const insertCalls = () => db.query.mock.calls.filter(([sql]) => /INSERT INTO tasks/.test(sql));

describe('zgrab2CommandService', () => {
  test('validatePort', () => {
    expect(service.validatePort(undefined)).toBeUndefined();
    expect(service.validatePort('8080')).toBe(8080);
    ['0', '65536', '80; id', '-1', '8o', '1e3'].forEach((bad) => {
      expect(() => service.validatePort(bad)).toThrow();
    });
  });

  test('buildExtraArgs：合法选项变成单个参数，值里的空格和 shell 字符不会拆分', () => {
    expect(service.buildExtraArgs({ timeout: '10s', 'user-agent': 'a b; id $(x)', 'use-https': true, empty: '' }))
      .toEqual(['--timeout=10s', '--user-agent=a b; id $(x)', '--use-https']);
  });

  test.each([
    ['改写输出文件', { 'output-file': '/etc/cron.d/x' }],
    ['改写日志文件', { 'log-file': '/tmp/x' }],
    ['带前缀的保留选项', { '--input-file': '/etc/passwd' }],
    ['选项名含空格', { 'a b': '1' }],
    ['选项名含分号', { 'a;id': '1' }],
    ['值含换行', { timeout: '1\n--output-file=/x' }],
    ['值为对象', { timeout: { a: 1 } }],
    ['整体为数组', ['--x']]
  ])('buildExtraArgs 拒绝：%s', (_name, input) => {
    expect(() => service.buildExtraArgs(input)).toThrow(service.Zgrab2ArgsError);
  });

  test('单模块与多模块参数顺序', () => {
    expect(service.buildSingleModuleArgs({ module: 'ssh', port: 22, inputFile: 'i', outputFile: 'o', logFile: 'l' }))
      .toEqual(['ssh', '--port', '22', '-f', 'i', '-o', 'o', '-l', 'l']);
    expect(service.buildMultipleArgs({ configFile: 'c', inputFile: 'i', outputFile: 'o', logFile: 'l' }))
      .toEqual(['multiple', '-c', 'c', '-f', 'i', '-o', 'o', '-l', 'l']);
  });
});

describe('createTask 命令注入', () => {
  test.each([
    ['端口注入', { port: '80; touch /tmp/pwned' }],
    ['端口越界', { port: 70000 }],
    ['额外参数改写输出文件', { additionalParams: { 'output-file': '/etc/x' } }],
    ['额外参数值含换行', { additionalParams: { timeout: '1\n2' } }],
    ['原型链模块名', { module: 'constructor' }],
    ['非字符串模块名', { module: ['http'] }]
  ])('%s 返回 400，不执行命令也不写任务', async (_name, override) => {
    installDb({ byName: inputPath });
    const res = createRes();
    await controller.createTask(request(override), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(insertCalls()).toHaveLength(0);
  });

  test('合法请求：以参数数组调用 execFile，不经过 shell', async () => {
    installDb({ byName: inputPath });
    const res = createRes();
    await controller.createTask(
      request({ port: '8080', additionalParams: { timeout: '5s', 'user-agent': 'x; y' } }),
      res
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [bin, args] = mockExecFile.mock.calls[0];
    expect(bin).toBe(process.execPath);
    expect(Array.isArray(args)).toBe(true);
    expect(args.slice(0, 7)).toEqual(['http', '--port', '8080', '-f', inputPath, '-o', expect.stringContaining('zgrab2_results')]);
    expect(args).toEqual(expect.arrayContaining(['--timeout=5s', '--user-agent=x; y']));

    const [, params] = insertCalls()[0];
    expect(params[2]).toContain('--port 8080');
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('未给端口时使用模块默认端口', async () => {
    installDb({ byName: inputPath });
    await controller.createTask(request({ module: 'ssh' }), createRes());
    expect(mockExecFile.mock.calls[0][1].slice(0, 3)).toEqual(['ssh', '--port', '22']);
  });
});

describe('createTask 输入文件路径', () => {
  test('inputFilePath 指向系统文件时被忽略，回退到按文件名查找（找不到则 400）', async () => {
    installDb({ ownedPaths: [], byName: null });
    const res = createRes();
    await controller.createTask(request({ inputFilePath: '/etc/passwd' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  test('inputFilePath 在项目目录内但不属于当前用户时被忽略', async () => {
    installDb({ ownedPaths: [], byName: null });
    const res = createRes();
    await controller.createTask(request({ inputFile: 'x.txt', inputFilePath: otherUsersPath }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  test('inputFilePath 路径穿越被忽略', async () => {
    installDb({ ownedPaths: ['/etc/passwd'], byName: null });
    const res = createRes();
    await controller.createTask(request({ inputFile: 'x.txt', inputFilePath: `${tmpRoot}/zgrab2_inputs/../../../etc/passwd` }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  test('当前用户名下的文件路径可以使用（工作流场景）', async () => {
    installDb({ ownedPaths: [inputPath] });
    const res = createRes();
    await controller.createTask(request({ inputFile: 'other-name.txt', inputFilePath: inputPath }), res);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile.mock.calls[0][1]).toEqual(expect.arrayContaining(['-f', inputPath]));
  });

  test('数据库里的旧部署目录路径会被改写到当前 PROJECT_ROOT', async () => {
    installDb({ byName: '/home/ipv6/IPv6-project/zgrab2_inputs/zgrab2_input_5_1.txt' });
    await controller.createTask(request({}), createRes());
    expect(mockExecFile.mock.calls[0][1]).toEqual(expect.arrayContaining(['-f', inputPath]));
  });
});

describe('createTask 可执行文件缺失', () => {
  test('zgrab2 不存在时返回 500，且不留下 running 任务', async () => {
    jest.resetModules();
    const saved = process.env.ZGRAB2_BIN;
    process.env.ZGRAB2_BIN = path.join(tmpRoot, 'no-such-zgrab2');
    const freshDb = require('../database/db');
    const freshController = require('../controllers/zgrab2Controller');
    freshDb.query.mockImplementation(async (sql) => {
      if (/FROM tools/.test(sql)) return [[{ id: 2 }]];
      if (/file_name = \?/.test(sql)) return [[{ file_path: inputPath }]];
      return [[]];
    });

    const res = createRes();
    await freshController.createTask(request({}), res);
    process.env.ZGRAB2_BIN = saved;

    expect(res.status).toHaveBeenCalledWith(500);
    expect(freshDb.query.mock.calls.filter(([sql]) => /INSERT INTO tasks/.test(sql))).toHaveLength(0);
  });
});

const sqlCalls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

describe('任务生命周期（taskService）', () => {
  test('先写 pending 记录，execFile 返回后记录 pid 并置为 running', async () => {
    installDb({ byName: inputPath });
    await controller.createTask(request({}), createRes());

    expect(insertCalls()[0][1][4]).toBe('pending');
    const running = sqlCalls(/SET status = 'running'/);
    expect(running).toHaveLength(1);
    expect(running[0][1][0]).toBe(4321); // mockExecFile 返回的 pid
  });

  test('进程结束回调：成功 → completed；失败 → failed 并带退出码', async () => {
    installDb({ byName: inputPath });
    await controller.createTask(request({}), createRes());
    const callback = mockExecFile.mock.calls[0][2];

    db.query.mockClear();
    callback(null, '', '');
    await new Promise(setImmediate);
    expect(sqlCalls(/UPDATE tasks/)[0][1].slice(0, 4)).toEqual(['completed', null, 0, null]);

    db.query.mockClear();
    callback(Object.assign(new Error('Command failed'), { code: 1 }), '', '');
    await new Promise(setImmediate);
    expect(sqlCalls(/UPDATE tasks/)[0][1].slice(0, 4)).toEqual(['failed', 'Command failed', 1, null]);
  });
});

describe('取消任务', () => {
  const cancel = async (taskId = '777') => {
    const res = createRes();
    await controller.cancelTask({ user: { id: 5 }, params: { taskId } }, res);
    return res;
  };

  test('状态写成 canceled（单个 l，匹配数据库枚举），并终止本进程持有的子进程', async () => {
    const kill = jest.fn();
    global.zgrab2Processes = new Map([['777', { kill }]]);
    db.query.mockImplementation(async (sql) => (/SELECT status, pid/.test(sql) ? [[{ status: 'running', pid: 4321 }]] : [{ affectedRows: 1 }]));

    const res = await cancel('777');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(kill).toHaveBeenCalledWith('SIGTERM');
    const update = sqlCalls(/UPDATE tasks/)[0];
    expect(update[1].slice(0, 2)).toEqual(['canceled', '用户手动终止']);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('cancelled');
  });

  test('pending 的任务也可以取消', async () => {
    global.zgrab2Processes = new Map();
    db.query.mockImplementation(async (sql) => (/SELECT status, pid/.test(sql) ? [[{ status: 'pending', pid: null }]] : [{ affectedRows: 1 }]));
    const res = await cancel('778');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('服务重启后没有句柄：按数据库里的 pid 终止真实进程（命令行含任务 ID 才会发信号）', async () => {
    // 模块被 mock 了 child_process，这里取真实的 spawn；GNU sleep 接受多个时长参数，这里只是让命令行带上任务 ID
    const { spawn: realSpawn } = jest.requireActual('child_process');
    const child = realSpawn('sleep', ['60', '779']);
    const closed = new Promise((resolve) => child.on('close', (code, signal) => resolve(signal)));
    global.zgrab2Processes = new Map();
    db.query.mockImplementation(async (sql) => (/SELECT status, pid/.test(sql) ? [[{ status: 'running', pid: child.pid }]] : [{ affectedRows: 1 }]));

    try {
      await cancel('779');
      expect(await closed).toBe('SIGTERM');
    } finally {
      child.kill('SIGKILL');
    }
  });

  test('pid 被复用（命令行不含任务 ID）时不会误杀其他进程', async () => {
    const { spawn: realSpawn } = jest.requireActual('child_process');
    const child = realSpawn('sleep', ['60']);
    global.zgrab2Processes = new Map();
    db.query.mockImplementation(async (sql) => (/SELECT status, pid/.test(sql) ? [[{ status: 'running', pid: child.pid }]] : [{ affectedRows: 1 }]));

    try {
      await cancel('781');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
    } finally {
      child.kill('SIGKILL');
    }
  });

  test('已结束的任务不能取消', async () => {
    db.query.mockImplementation(async () => [[{ status: 'completed', pid: null }]]);
    const res = await cancel('780');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
