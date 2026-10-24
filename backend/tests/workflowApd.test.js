/**
 * 工作流的 apd_filter 节点：节点类型与模板的定义、执行器行为。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../api/internal', () => ({ xmap: {}, zgrab2: {}, jsonanalysis: {} }));
jest.mock('../services/aliasDetectService', () => ({ filterWithKnownAliases: jest.fn() }));

const aliasDetect = require('../services/aliasDetectService');
const { executeApdFilterNode } = require('../services/workflowEngine');
const controller = require('../controllers/workflowController');

const call = async (handler) => {
  const res = { json: jest.fn(), status: jest.fn(() => res) };
  await handler({}, res);
  return res.json.mock.calls[0][0];
};

beforeEach(() => jest.clearAllMocks());

describe('executeApdFilterNode', () => {
  const saved = { fileId: 12, fileName: 'zgrab2_input_5_1.txt', filePath: '/data/zgrab2_inputs/zgrab2_input_5_1.txt', count: 3, tool: 'zgrab2' };

  test('以输入文件名调用过滤并保存，输出一个可被下游节点使用的文件', async () => {
    aliasDetect.filterWithKnownAliases.mockResolvedValue({ total: 5, kept: 3, removed: 2, aliasedPrefixesKnown: 4, savedFile: saved });
    const out = await executeApdFilterNode({ id: 'apd_1', config: {} }, { default: { fileName: 'active.txt' } }, 5);

    expect(aliasDetect.filterWithKnownAliases).toHaveBeenCalledWith({
      user: { id: 5 },
      body: { addressFile: 'active.txt', save: true, tool: 'zgrab2' }
    });
    expect(out).toMatchObject({ type: 'file', fileId: 12, fileName: saved.fileName, filePath: saved.filePath, fileType: 'txt' });
    expect(out.apdFilter).toEqual({ total: 5, kept: 3, removed: 2, aliasedPrefixesKnown: 4 });
  });

  test('outputTool 可选 xmap；输入也可来自 file 端口', async () => {
    aliasDetect.filterWithKnownAliases.mockResolvedValue({ total: 1, kept: 1, removed: 0, aliasedPrefixesKnown: 0, savedFile: saved });
    await executeApdFilterNode({ id: 'a', config: { outputTool: 'xmap' } }, { file: { fileName: 'x.txt' } }, 9);
    expect(aliasDetect.filterWithKnownAliases.mock.calls[0][0].body.tool).toBe('xmap');
  });

  test('没有输入文件时报错，且不调用过滤', async () => {
    await expect(executeApdFilterNode({ id: 'a', config: {} }, {}, 5)).rejects.toThrow('缺少输入文件');
    await expect(executeApdFilterNode({ id: 'a', config: {} }, { default: { filePath: '/x' } }, 5)).rejects.toThrow('缺少输入文件');
    expect(aliasDetect.filterWithKnownAliases).not.toHaveBeenCalled();
  });

  test('过滤失败（如全部被剔除）的错误向上抛出，由引擎标记节点失败', async () => {
    aliasDetect.filterWithKnownAliases.mockRejectedValue(new Error('过滤后没有剩余地址，不生成文件'));
    await expect(executeApdFilterNode({ id: 'a', config: {} }, { default: { fileName: 'x.txt' } }, 5)).rejects.toThrow('没有剩余地址');
  });
});

describe('节点类型与模板定义', () => {
  test('apd_filter 是一个 file → file 的处理节点', async () => {
    const { data } = await call(controller.getNodeTypes);
    expect(data.apd_filter).toMatchObject({ category: 'process', inputs: ['file'], outputs: ['file'] });
    expect(data.apd_filter.config.outputTool.options).toEqual(['zgrab2', 'xmap']);
  });

  test('所有模板里的节点类型都存在、连接都指向已有节点，且不再使用无效的探测模块（N19）', async () => {
    const types = (await call(controller.getNodeTypes)).data;
    const templates = (await call(controller.getWorkflowTemplates)).data;
    expect(templates.map((t) => t.id)).toContain('xmap_apd_zgrab2');

    for (const template of templates) {
      const { nodes, connections } = template.definition;
      const ids = new Set(nodes.map((n) => n.id));
      for (const node of nodes) {
        expect(types[node.type]).toBeDefined();
        if (node.type === 'xmap_scan') {
          expect(types.xmap_scan.config.probeModule.options).toContain(node.config.probeModule);
        }
      }
      for (const conn of connections) {
        expect(ids.has(conn.from)).toBe(true);
        expect(ids.has(conn.to)).toBe(true);
      }
    }
  });
});
