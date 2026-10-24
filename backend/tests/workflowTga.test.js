/**
 * 工作流的 tga_generate 节点：执行器行为与节点类型定义；waitForTaskCompletion 支持 tga。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../api/internal', () => ({ xmap: {}, zgrab2: {}, jsonanalysis: {}, tga: { getTaskDetails: jest.fn() } }));
jest.mock('../services/aliasDetectService', () => ({ filterWithKnownAliases: jest.fn() }));
jest.mock('../services/targetGenService', () => ({ enqueueTgaTask: jest.fn() }));

const db = require('../database/db');
const api = require('../api/internal');
const targetGen = require('../services/targetGenService');
const { executeTgaGenerateNode, waitForTaskCompletion } = require('../services/workflowEngine');
const controller = require('../controllers/workflowController');

const FAST = { pollInterval: 5 };
const completed = (summary) => ({ id: 77, status: 'completed', summary });

beforeEach(() => {
  jest.resetAllMocks();
  targetGen.enqueueTgaTask.mockResolvedValue({ taskId: 77 });
  db.query.mockResolvedValue([[{ id: 12, file_path: '/data/whitelists/whitelist_5_77.txt', file_name: 'whitelist_5_77.txt' }]]);
});

describe('executeTgaGenerateNode', () => {
  test('以输入文件为种子创建任务、等待完成，输出已登记的地址文件', async () => {
    api.tga.getTaskDetails
      .mockResolvedValueOnce({ id: 77, status: 'running' })
      .mockResolvedValue(completed({ algorithm: 'subnet-walk', seeds: 5, generated: 40, aliasedSkipped: 2, fileName: 'whitelist_5_77.txt', scannable: { allowed: true, reason: null } }));

    const out = await executeTgaGenerateNode(
      { id: 'tga_1', config: { algorithm: 'subnet-walk', budget: 40, excludeAliased: 'false' } },
      { default: { fileName: 'active.txt' } }, 5, FAST
    );

    expect(targetGen.enqueueTgaTask).toHaveBeenCalledWith({
      user: { id: 5 },
      body: { algorithm: 'subnet-walk', budget: 40, seedFile: 'active.txt', excludeAliased: false, description: '工作流目标生成 - tga_1' }
    });
    expect(db.query.mock.calls[0][1]).toEqual([5, 'whitelist_5_77.txt']);
    expect(out).toMatchObject({
      type: 'file', taskId: 77, fileId: 12, fileName: 'whitelist_5_77.txt', filePath: '/data/whitelists/whitelist_5_77.txt', fileType: 'txt',
      tga: { algorithm: 'subnet-walk', seeds: 5, generated: 40, aliasedSkipped: 2 }
    });
  }, 10000);

  test('默认算法 density-expand、默认排除别名前缀', async () => {
    api.tga.getTaskDetails.mockResolvedValue(completed({ generated: 3, fileName: 'whitelist_5_77.txt' }));
    await executeTgaGenerateNode({ id: 'n', config: {} }, { file: { fileName: 'a.txt' } }, 5);
    expect(targetGen.enqueueTgaTask.mock.calls[0][0].body).toMatchObject({ algorithm: 'density-expand', excludeAliased: true, seedFile: 'a.txt' });
  });

  test('没有输入文件：报错，且不创建任务', async () => {
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, {}, 5)).rejects.toThrow('缺少输入文件');
    expect(targetGen.enqueueTgaTask).not.toHaveBeenCalled();
  });

  test('任务失败 / 被取消：错误向上抛出', async () => {
    api.tga.getTaskDetails.mockResolvedValue({ id: 77, status: 'failed', error_message: '没有可用的种子地址' });
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('任务执行失败: 没有可用的种子地址');
    api.tga.getTaskDetails.mockResolvedValue({ id: 77, status: 'canceled' });
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('任务被取消');
  });

  test('没有生成任何新地址：给出可操作的错误；找不到登记的文件也报错', async () => {
    api.tga.getTaskDetails.mockResolvedValue(completed({ generated: 0, fileName: 'whitelist_5_77.txt' }));
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('没有产生任何新地址');

    db.query.mockResolvedValue([[]]);
    api.tga.getTaskDetails.mockResolvedValue(completed({ generated: 5, fileName: 'whitelist_5_77.txt' }));
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('找不到生成的地址文件');
  });

  test('创建任务时的校验错误（如种子文件不属于自己）向上抛出', async () => {
    targetGen.enqueueTgaTask.mockRejectedValue(new Error('种子文件不存在或不属于你'));
    await expect(executeTgaGenerateNode({ id: 'n', config: {} }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('不属于你');
  });
});

describe('waitForTaskCompletion 支持 tga', () => {
  test('轮询 tga 任务直到完成', async () => {
    api.tga.getTaskDetails.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValue({ status: 'completed' });
    await expect(waitForTaskCompletion(1, 'tga', 5, 1000, FAST)).resolves.toMatchObject({ status: 'completed' });
    expect(api.tga.getTaskDetails).toHaveBeenCalledTimes(2);
  });
});

describe('节点类型定义', () => {
  test('tga_generate 是 file → file 的处理节点，算法选项与后端一致', async () => {
    const res = { json: jest.fn(), status: jest.fn(() => res) };
    await controller.getNodeTypes({}, res);
    const type = res.json.mock.calls[0][0].data.tga_generate;
    expect(type).toMatchObject({ category: 'process', inputs: ['file'], outputs: ['file'] });
    const { listAlgorithms } = jest.requireActual('../services/tgaAlgorithms');
    expect(type.config.algorithm.options).toEqual(listAlgorithms().map((a) => a.id));
    expect(type.config.budget).toMatchObject({ min: 1, max: 1000000 });
  });
});
