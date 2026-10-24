/**
 * taskService：任务 ID、状态流转（终态不可覆盖）、进程探测、启动对账。
 */

jest.mock('../database/db', () => ({ query: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const db = require('../database/db');
const taskService = require('../services/taskService');

beforeEach(() => {
  jest.resetAllMocks();
  db.query.mockResolvedValue([{ affectedRows: 1 }]);
});

afterEach(() => {
  taskService.stopWatchers();
  jest.useRealTimers();
});

describe('nextTaskId', () => {
  test('严格递增，即使同一毫秒内连续调用', () => {
    const ids = Array.from({ length: 200 }, () => taskService.nextTaskId());
    for (let i = 1; i < ids.length; i += 1) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
  });

  test('时钟回拨时仍保持递增', () => {
    const first = taskService.nextTaskId();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(first - 10000);
    try {
      expect(taskService.nextTaskId()).toBe(first + 1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('createTaskRecord', () => {
  test('写入全部字段，默认 pending、优先级 0，params 序列化为 JSON', async () => {
    const id = await taskService.createTaskRecord({
      userId: 5,
      taskType: 'xmap',
      command: 'xmap -6 2001:db8::/32',
      description: '测试',
      logPath: '/data/xmap_log/1.csv',
      outputPath: '/data/xmap_result/1.json',
      params: { rate: '10M' }
    });

    expect(typeof id).toBe('number');
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO tasks/);
    // 参数顺序：id, user_id, command, description, status, log_path, output_path, task_type, params, priority
    expect(values).toEqual([id, 5, 'xmap -6 2001:db8::/32', '测试', 'pending', '/data/xmap_log/1.csv', '/data/xmap_result/1.json', 'xmap', '{"rate":"10M"}', 0]);
  });

  test('可指定 taskId 与优先级；未提供的可选字段写 NULL', async () => {
    const id = await taskService.createTaskRecord({ taskId: 42, userId: 1, taskType: 'zgrab2', command: 'c', priority: 3 });
    expect(id).toBe(42);
    const values = db.query.mock.calls[0][1];
    expect(values[3]).toBeNull();
    expect(values[8]).toBeNull();
    expect(values[9]).toBe(3);
  });

  test.each([
    ['缺少 userId', { taskType: 'xmap', command: 'c' }],
    ['缺少 taskType', { userId: 1, command: 'c' }],
    ['无效状态', { userId: 1, taskType: 'xmap', command: 'c', status: 'cancelled' }]
  ])('%s 时抛出且不写库', async (_name, input) => {
    await expect(taskService.createTaskRecord(input)).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('数据库错误向上抛出', async () => {
    db.query.mockRejectedValueOnce(new Error('db down'));
    await expect(taskService.createTaskRecord({ userId: 1, taskType: 'xmap', command: 'c' })).rejects.toThrow('db down');
  });
});

describe('状态流转', () => {
  test('markTaskRunning 只作用于 pending/running，并记录 pid', async () => {
    expect(await taskService.markTaskRunning(7, 1234)).toBe(true);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toMatch(/status IN \('pending', 'running'\)/);
    expect(values).toEqual([1234, 7]);
  });

  test('任务已是终态时 markTaskRunning / markTaskFinished 返回 false', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await taskService.markTaskRunning(7, 1)).toBe(false);
    expect(await taskService.markTaskFinished(7, { status: 'failed' })).toBe(false);
  });

  test('markTaskFinished 写入结果并清空 pid，且带终态保护条件', async () => {
    const ok = await taskService.markTaskFinished(7, { status: 'failed', errorMessage: 'boom', exitCode: 2, signal: 'SIGTERM' });
    expect(ok).toBe(true);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toMatch(/pid = NULL/);
    expect(sql).toMatch(/WHERE id = \? AND status IN \('pending', 'running'\)/);
    expect(values).toEqual(['failed', 'boom', 2, 'SIGTERM', 7]);
  });

  test('省略可选项时写 NULL', async () => {
    await taskService.markTaskFinished(7, { status: 'completed', exitCode: 0 });
    expect(db.query.mock.calls[0][1]).toEqual(['completed', null, 0, null, 7]);
  });

  test.each(['running', 'pending', 'cancelled', undefined])('拒绝无效的结束状态 %s', async (status) => {
    await expect(taskService.markTaskFinished(7, { status })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('markTaskCanceled 使用 canceled（单个 l）并带默认说明', async () => {
    await taskService.markTaskCanceled(7);
    expect(db.query.mock.calls[0][1]).toEqual(['canceled', '用户手动终止', null, null, 7]);
  });
});

describe('getTaskCounts', () => {
  test('按状态统计，缺失的状态补 0', async () => {
    db.query.mockResolvedValueOnce([[{ status: 'running', count: 2 }, { status: 'pending', count: '5' }]]);
    expect(await taskService.getTaskCounts('xmap')).toEqual({ pending: 5, running: 2, completed: 0, failed: 0, canceled: 0 });
    expect(db.query.mock.calls[0][1]).toEqual(['xmap']);
  });

  test('没有任务时全部为 0', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect(Object.values(await taskService.getTaskCounts('zgrab2'))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('isTaskProcessAlive', () => {
  let procRoot;
  beforeAll(() => {
    procRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-proc-'));
  });
  afterAll(() => fs.rmSync(procRoot, { recursive: true, force: true }));

  const fakeCmdline = (pid, ...args) => {
    fs.mkdirSync(path.join(procRoot, String(pid)), { recursive: true });
    fs.writeFileSync(path.join(procRoot, String(pid), 'cmdline'), `${args.join('\0')}\0`);
  };

  test.each([[0], [-1], [null], [undefined], [1.5], ['12']])('无效 pid %p 返回 false', (pid) => {
    expect(taskService.isTaskProcessAlive(pid, 1)).toBe(false);
  });

  test('进程存在且命令行包含任务 ID：true', () => {
    fakeCmdline(process.pid, 'sudo', 'xmap', '-u', '/data/xmap_log/1751989268046.csv');
    expect(taskService.isTaskProcessAlive(process.pid, 1751989268046, procRoot)).toBe(true);
  });

  test('PID 被其他进程复用（命令行不含任务 ID）：false', () => {
    fakeCmdline(process.pid, 'nginx', '-g', 'daemon off;');
    expect(taskService.isTaskProcessAlive(process.pid, 1751989268046, procRoot)).toBe(false);
  });

  test('/proc 存在但没有该 pid 目录：false', () => {
    fs.rmSync(path.join(procRoot, String(process.pid)), { recursive: true, force: true });
    expect(taskService.isTaskProcessAlive(process.pid, 1, procRoot)).toBe(false);
  });

  test('没有 /proc（无法核对）时按存活处理', () => {
    expect(taskService.isTaskProcessAlive(process.pid, 1, path.join(procRoot, 'missing'))).toBe(true);
  });

  test('进程不存在：false', async () => {
    const child = spawn(process.execPath, ['-e', '0']);
    await new Promise((resolve) => child.on('close', resolve));
    expect(taskService.isTaskProcessAlive(child.pid, 1)).toBe(false);
  });
});

describe('signalTaskProcess', () => {
  test('命令行含任务 ID 的真实进程可被终止；ID 不匹配则不动它', async () => {
    const taskId = 1751989268046;
    // GNU sleep 接受多个时长参数并累加；这里只是让命令行里带上任务 ID
    const child = spawn('sleep', ['60', String(taskId)]);
    const closed = new Promise((resolve) => child.on('close', (code, signal) => resolve(signal)));
    try {
      expect(taskService.signalTaskProcess(child.pid, taskId + 1)).toBe(false);
      expect(taskService.isTaskProcessAlive(child.pid, taskId)).toBe(true);

      expect(taskService.signalTaskProcess(child.pid, taskId, 'SIGTERM')).toBe(true);
      expect(await closed).toBe('SIGTERM');
    } finally {
      child.kill('SIGKILL');
    }
  });
});

describe('reconcileTasksOnStartup', () => {
  const rows = [
    { id: 1, pid: null, task_type: 'database' },
    { id: 2, pid: 111, task_type: 'xmap' },
    { id: 3, pid: 222, task_type: 'zgrab2' }
  ];

  test('无 pid 或进程已不在 → failed；进程仍在 → 继续监听', async () => {
    db.query.mockResolvedValueOnce([rows]);
    const alive = jest.fn((pid) => pid === 222);

    const result = await taskService.reconcileTasksOnStartup({ alive, watch: false });

    expect(result).toEqual({ failed: 2, watching: 1 });
    const updates = db.query.mock.calls.slice(1);
    expect(updates).toHaveLength(2);
    expect(updates.map(([, values]) => values[4])).toEqual([1, 2]);
    expect(updates.every(([, values]) => values[0] === 'failed' && /服务重启/.test(values[1]))).toBe(true);
    // 没有 pid 的任务不会去探测进程
    expect(alive).not.toHaveBeenCalledWith(null, 1);
  });

  test('被监听的进程结束后补写 failed（退出状态未知）', async () => {
    jest.useFakeTimers();
    let running = true;
    db.query.mockResolvedValueOnce([[rows[2]]]);

    const result = await taskService.reconcileTasksOnStartup({ pollMs: 1000, alive: () => running });
    expect(result).toEqual({ failed: 0, watching: 1 });

    await jest.advanceTimersByTimeAsync(3000);
    expect(db.query).toHaveBeenCalledTimes(1); // 进程仍在，没有任何更新

    running = false;
    await jest.advanceTimersByTimeAsync(1000);
    const update = db.query.mock.calls[1];
    expect(update[1][0]).toBe('failed');
    expect(update[1][1]).toMatch(/无法获知退出状态/);
    expect(update[1][4]).toBe(3);

    // 只补写一次
    await jest.advanceTimersByTimeAsync(5000);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('没有 running 任务时什么也不做', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect(await taskService.reconcileTasksOnStartup()).toEqual({ failed: 0, watching: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('任务在对账期间已被别处改为终态时不重复计数', async () => {
    db.query.mockResolvedValueOnce([[rows[0]]]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect(await taskService.reconcileTasksOnStartup({ watch: false })).toEqual({ failed: 0, watching: 0 });
  });
});
