/**
 * workflowEngine.waitForTaskCompletion：任务可能在调度器队列里排队，
 * 排队时间不能被算进“运行超时”。
 */

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../api/internal', () => ({
  xmap: { getTaskDetails: jest.fn() },
  zgrab2: { getTaskDetails: jest.fn() },
  jsonanalysis: {}
}));

const api = require('../api/internal');
const { waitForTaskCompletion } = require('../services/workflowEngine');

const sequence = (statuses, extra = {}) => {
  let i = 0;
  api.xmap.getTaskDetails.mockImplementation(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    return { status, ...extra };
  });
};

const FAST = { pollInterval: 5 };

beforeEach(() => jest.resetAllMocks());

describe('waitForTaskCompletion', () => {
  test('完成时返回任务详情', async () => {
    sequence(['completed'], { id: 1 });
    await expect(waitForTaskCompletion(1, 'xmap', 5, 1000, FAST)).resolves.toMatchObject({ status: 'completed' });
  });

  test('pending → running → completed', async () => {
    sequence(['pending', 'pending', 'running', 'completed']);
    await expect(waitForTaskCompletion(1, 'xmap', 5, 1000, FAST)).resolves.toMatchObject({ status: 'completed' });
    expect(api.xmap.getTaskDetails).toHaveBeenCalledTimes(4);
  });

  test('排队时间超过运行超时也不会被误判：超时只从开始运行起算', async () => {
    // 先排队约 120ms（远大于 maxWaitTime=60ms），再运行很短时间后完成
    const started = Date.now();
    api.xmap.getTaskDetails.mockImplementation(async () => {
      const elapsed = Date.now() - started;
      if (elapsed < 120) return { status: 'pending' };
      if (elapsed < 135) return { status: 'running' };
      return { status: 'completed' };
    });
    await expect(waitForTaskCompletion(1, 'xmap', 5, 60, FAST)).resolves.toMatchObject({ status: 'completed' });
  });

  test('运行时间超过上限：任务执行超时', async () => {
    sequence(['running']);
    await expect(waitForTaskCompletion(1, 'xmap', 5, 40, FAST)).rejects.toThrow('任务执行超时');
  });

  test('排队时间超过排队上限：任务排队超时', async () => {
    sequence(['pending']);
    await expect(waitForTaskCompletion(1, 'xmap', 5, 1000, { ...FAST, maxQueueTime: 40 })).rejects.toThrow('任务排队超时');
  });

  test('失败 / 取消 / 不支持的类型', async () => {
    sequence(['failed'], { error_message: 'boom' });
    await expect(waitForTaskCompletion(1, 'xmap', 5, 1000, FAST)).rejects.toThrow('任务执行失败: boom');

    sequence(['canceled']);
    await expect(waitForTaskCompletion(1, 'xmap', 5, 1000, FAST)).rejects.toThrow('任务被取消');

    await expect(waitForTaskCompletion(1, 'nmap', 5, 1000, FAST)).rejects.toThrow('不支持的任务类型');
  });

  test('zgrab2 任务走 zgrab2 接口', async () => {
    api.zgrab2.getTaskDetails.mockResolvedValue({ status: 'completed' });
    await waitForTaskCompletion(2, 'zgrab2', 5, 1000, FAST);
    expect(api.zgrab2.getTaskDetails).toHaveBeenCalledWith(2, 5);
    expect(api.xmap.getTaskDetails).not.toHaveBeenCalled();
  });
});
