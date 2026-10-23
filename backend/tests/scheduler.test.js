/**
 * schedulerService：并发上限、每用户上限、领取竞争、runner 失败、周期调度。
 * taskService 全部 mock，不访问数据库，也不启动任何进程。
 */

jest.mock('../services/taskService', () => ({
  getTaskCounts: jest.fn(),
  getRunningCountsByUser: jest.fn(),
  listPendingTasks: jest.fn(),
  claimTask: jest.fn(),
  markTaskFinished: jest.fn()
}));

const taskService = require('../services/taskService');
const scheduler = require('../services/schedulerService');

const counts = (o = {}) => ({ pending: 0, running: 0, completed: 0, failed: 0, canceled: 0, ...o });
const task = (id, userId, extra = {}) => ({ id, userId, taskType: 'xmap', params: { args: [] }, ...extra });

let runner;

beforeEach(() => {
  jest.resetAllMocks();
  scheduler.stopScheduler();
  delete process.env.MAX_CONCURRENT_XMAP;
  delete process.env.MAX_CONCURRENT_PER_USER;
  runner = jest.fn().mockResolvedValue(undefined);
  scheduler.registerRunner('xmap', runner);
  taskService.getRunningCountsByUser.mockResolvedValue(new Map());
  taskService.claimTask.mockResolvedValue(true);
  taskService.markTaskFinished.mockResolvedValue(true);
});

afterEach(() => {
  scheduler.stopScheduler();
  jest.useRealTimers();
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
// 其他用例可能已注册别的类型；按类型统计每轮调度的查询次数
const roundsFor = (taskType) => taskService.getTaskCounts.mock.calls.filter(([type]) => type === taskType).length;

describe('getLimits', () => {
  test('默认值与环境变量覆盖', () => {
    expect(scheduler.getLimits('xmap')).toEqual({ global: 2, perUser: 3 });
    expect(scheduler.getLimits('zgrab2').global).toBe(4);
    expect(scheduler.getLimits('apd').global).toBe(2);

    process.env.MAX_CONCURRENT_XMAP = '5';
    process.env.MAX_CONCURRENT_PER_USER = '1';
    expect(scheduler.getLimits('xmap')).toEqual({ global: 5, perUser: 1 });
  });

  test.each(['0', '-3', 'abc', ''])('非法值 %p 回落到默认', (value) => {
    process.env.MAX_CONCURRENT_XMAP = value;
    expect(scheduler.getLimits('xmap').global).toBe(2);
  });
});

describe('registerRunner', () => {
  test('参数不合法时抛出', () => {
    expect(() => scheduler.registerRunner('', jest.fn())).toThrow();
    expect(() => scheduler.registerRunner('xmap', null)).toThrow();
  });
});

describe('tick', () => {
  test('空队列：什么也不启动，也不去查询排队详情', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts());
    expect(await scheduler.tick()).toBe(0);
    expect(taskService.listPendingTasks).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  test('只补满空闲名额，且按队列顺序（队列已按优先级排序）启动', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 4, running: 1 })); // 上限 2 → 空闲 1
    taskService.listPendingTasks.mockResolvedValue([task(1, 1), task(2, 2), task(3, 3)]);

    expect(await scheduler.tick()).toBe(1);
    await flush();

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0].id).toBe(1);
    expect(taskService.claimTask).toHaveBeenCalledTimes(1);
  });

  test('已达并发上限：不领取任务', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 3, running: 2 }));
    expect(await scheduler.tick()).toBe(0);
    expect(taskService.listPendingTasks).not.toHaveBeenCalled();
    expect(taskService.claimTask).not.toHaveBeenCalled();
  });

  test('MAX_CONCURRENT_<TYPE> 生效', async () => {
    process.env.MAX_CONCURRENT_XMAP = '3';
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 5, running: 0 }));
    taskService.listPendingTasks.mockResolvedValue([1, 2, 3, 4, 5].map((id) => task(id, id)));
    expect(await scheduler.tick()).toBe(3);
  });

  test('每用户上限：已满的用户被跳过，让后面的其他用户先运行；同一轮内也会累计', async () => {
    process.env.MAX_CONCURRENT_XMAP = '10';
    process.env.MAX_CONCURRENT_PER_USER = '2';
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 5, running: 2 }));
    taskService.getRunningCountsByUser.mockResolvedValue(new Map([[1, 2]])); // 用户 1 已在跑 2 个
    taskService.listPendingTasks.mockResolvedValue([
      task(10, 1), // 被跳过
      task(11, 2),
      task(12, 2),
      task(13, 2), // 用户 2 本轮已启动 2 个，被跳过
      task(14, 3)
    ]);

    expect(await scheduler.tick()).toBe(3);
    await flush();
    expect(runner.mock.calls.map(([t]) => t.id)).toEqual([11, 12, 14]);
  });

  test('领取失败（排队期间被取消或被别处领取）：跳过且不占名额', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 3, running: 0 }));
    taskService.listPendingTasks.mockResolvedValue([task(1, 1), task(2, 2), task(3, 3)]);
    taskService.claimTask.mockImplementation(async (id) => id !== 1);

    expect(await scheduler.tick()).toBe(2);
    await flush();
    expect(runner.mock.calls.map(([t]) => t.id)).toEqual([2, 3]);
  });

  test('runner 抛出异常：任务标记为 failed，不影响其他任务', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 2, running: 0 }));
    taskService.listPendingTasks.mockResolvedValue([task(1, 1), task(2, 2)]);
    runner.mockImplementationOnce(async () => {
      throw new Error('spawn failed');
    });

    await scheduler.tick();
    await flush();

    expect(runner).toHaveBeenCalledTimes(2);
    expect(taskService.markTaskFinished).toHaveBeenCalledWith(1, { status: 'failed', errorMessage: '任务启动失败: spawn failed' });
    expect(taskService.markTaskFinished).toHaveBeenCalledTimes(1);
  });

  test('runner 同步抛错也被捕获', async () => {
    taskService.getTaskCounts.mockResolvedValue(counts({ pending: 1 }));
    taskService.listPendingTasks.mockResolvedValue([task(1, 1)]);
    runner.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    await scheduler.tick();
    await flush();
    expect(taskService.markTaskFinished.mock.calls[0][1].errorMessage).toMatch(/sync boom/);
  });

  test('多种类型各自独立计算名额', async () => {
    const zgrab2Runner = jest.fn().mockResolvedValue(undefined);
    scheduler.registerRunner('zgrab2', zgrab2Runner);
    taskService.getTaskCounts.mockImplementation(async (type) => (type === 'xmap' ? counts({ pending: 1, running: 2 }) : counts({ pending: 1, running: 0 })));
    taskService.listPendingTasks.mockImplementation(async (type) => (type === 'zgrab2' ? [task(9, 1, { taskType: 'zgrab2' })] : []));

    expect(await scheduler.tick()).toBe(1);
    await flush();
    expect(runner).not.toHaveBeenCalled();
    expect(zgrab2Runner).toHaveBeenCalledTimes(1);
  });

  test('同一时刻只有一轮在执行；执行期间收到的请求会在结束后补跑', async () => {
    let release;
    taskService.getTaskCounts.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(counts()); }));
    taskService.getTaskCounts.mockResolvedValue(counts());

    const first = scheduler.tick();
    expect(await scheduler.tick()).toBe(0); // 第二轮被合并
    release();
    await first;
    await flush();
    await flush();

    // 第一轮 1 次 + 补跑 1 次
    expect(roundsFor('xmap')).toBe(2);
  });
});

describe('startScheduler', () => {
  test('周期调度；重复启动无副作用；停止后不再调度', async () => {
    jest.useFakeTimers();
    taskService.getTaskCounts.mockResolvedValue(counts());

    scheduler.startScheduler({ intervalMs: 1000 });
    scheduler.startScheduler({ intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(0); // 启动时立即补一轮（requestTick）
    const afterStart = roundsFor('xmap');
    expect(afterStart).toBe(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(roundsFor('xmap')).toBe(afterStart + 3);

    scheduler.stopScheduler();
    await jest.advanceTimersByTimeAsync(5000);
    expect(roundsFor('xmap')).toBe(afterStart + 3);
  });

  test('调度器未启动时 requestTick 不做任何事', async () => {
    scheduler.requestTick();
    await flush();
    expect(taskService.getTaskCounts).not.toHaveBeenCalled();
  });

  test('一轮调度出错不会让定时器停止', async () => {
    jest.useFakeTimers();
    taskService.getTaskCounts.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(counts());

    scheduler.startScheduler({ intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(2500);
    expect(roundsFor('xmap')).toBeGreaterThanOrEqual(3);
  });
});
