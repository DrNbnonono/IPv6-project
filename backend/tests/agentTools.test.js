jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const mockStartScan = jest.fn();
const mockCreateZgrab2Task = jest.fn();
jest.mock('../api/internal', () => ({
  xmap: { startScan: (...args) => mockStartScan(...args) },
  zgrab2: { createTask: (...args) => mockCreateZgrab2Task(...args) }
}));

const mockChat = jest.fn();
jest.mock('../services/llmService', () => ({ chat: (...args) => mockChat(...args) }));

const mockTerminalExecute = jest.fn();
const mockTerminalCreate = jest.fn();
jest.mock('../services/terminalService', () => ({
  createTerminal: (...args) => mockTerminalCreate(...args),
  executeCommand: (...args) => mockTerminalExecute(...args)
}));

const toolService = require('../services/toolService');
const agentService = require('../services/agentService');
const agentController = require('../controllers/agentController');

const user = { id: 9, role: 'user' };
const admin = { id: 1, role: 'admin' };

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('确认流程', () => {
  test.each([
    ['xmap', { target: '2001:db8::/64' }],
    ['zgrab2', { inputFile: 'targets.txt', module: 'http' }],
    ['terminal', { command: 'ping6 -c 1 example.com' }]
  ])('%s 未确认时不执行，只返回待确认请求', async (tool, params) => {
    const result = await toolService.executeTool(tool, params, { user: admin });
    expect(result.needsConfirmation).toBe(true);
    expect(result.success).toBe(false);
    expect(mockStartScan).not.toHaveBeenCalled();
    expect(mockCreateZgrab2Task).not.toHaveBeenCalled();
    expect(mockTerminalExecute).not.toHaveBeenCalled();
  });

  test('confirmed 必须严格为 true', async () => {
    const result = await toolService.executeTool(
      'xmap',
      { target: '2001:db8::/64' },
      { user, confirmed: 'true' }
    );
    expect(result.needsConfirmation).toBe(true);
  });

  test('待确认请求里的参数已规范化，补全默认值', async () => {
    const result = await toolService.executeTool('xmap', { target: ' 2001:db8::/64 ' }, { user });
    expect(result.params).toEqual({
      target: '2001:db8::/64',
      protocol: 'ipv6',
      rate: '1M',
      maxResults: 1000
    });
  });

  test('knowledge 与 workflow 不需要确认', () => {
    expect(toolService.getToolByName('knowledge').requiresConfirmation).toBeUndefined();
    expect(toolService.getToolByName('workflow').requiresConfirmation).toBeUndefined();
  });

  test('工具列表对外暴露 requiresConfirmation', () => {
    const tools = toolService.getTools();
    expect(tools.find((t) => t.id === 'xmap').requiresConfirmation).toBe(true);
    expect(tools.find((t) => t.id === 'knowledge').requiresConfirmation).toBe(false);
  });
});

describe('xmap 工具', () => {
  test('确认后调用 internal.xmap.startScan，参数映射到 scan 接口字段', async () => {
    mockStartScan.mockResolvedValueOnce({ success: true, taskId: 1700000000000, statusCode: 202 });
    const result = await toolService.executeTool(
      'xmap',
      { target: '2001:db8::/64', rate: '10M', port: 443, maxResults: 50 },
      { user, confirmed: true }
    );

    expect(result.success).toBe(true);
    expect(result.result.taskId).toBe(1700000000000);
    const [scanParams, userId] = mockStartScan.mock.calls[0];
    expect(userId).toBe(9);
    expect(scanParams).toEqual({
      ipv6: true,
      targetaddress: '2001:db8::/64',
      rate: '10M',
      max_results: '50',
      targetPort: '443',
      description: 'Agent 发起的扫描：2001:db8::/64'
    });
  });

  test('ipv4 协议映射为 ipv4 开关', async () => {
    mockStartScan.mockResolvedValueOnce({ success: true, taskId: 1, statusCode: 202 });
    await toolService.executeTool('xmap', { target: '192.0.2.0/24', protocol: 'ipv4' }, { user, confirmed: true });
    expect(mockStartScan.mock.calls[0][0].ipv4).toBe(true);
    expect(mockStartScan.mock.calls[0][0].ipv6).toBeUndefined();
  });

  test.each([
    ['目标含 shell 字符', { target: '2001:db8::1; rm -rf /' }],
    ['目标为域名', { target: 'example.com' }],
    ['非法协议', { target: '2001:db8::1', protocol: 'icmp' }],
    ['非法带宽', { target: '2001:db8::1', rate: '10M -x 1' }],
    ['端口越界', { target: '2001:db8::1', port: 70000 }],
    ['结果数过大', { target: '2001:db8::1', maxResults: 99999999 }]
  ])('拒绝非法参数：%s', async (_name, params) => {
    const result = await toolService.executeTool('xmap', params, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.needsConfirmation).toBeUndefined();
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  test('内部接口返回失败时，工具返回失败而不是报告成功', async () => {
    mockStartScan.mockResolvedValueOnce({ success: false, message: '非法参数: foo', statusCode: 400 });
    const result = await toolService.executeTool('xmap', { target: '2001:db8::1' }, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('非法参数: foo');
  });
});

describe('zgrab2 工具', () => {
  test('只传输入文件名，忽略调用方塞入的 inputFilePath', async () => {
    mockCreateZgrab2Task.mockResolvedValueOnce({ success: true, taskId: 55, statusCode: 200 });
    const result = await toolService.executeTool(
      'zgrab2',
      { inputFile: 'targets.txt', module: 'HTTP', port: 8080, inputFilePath: '/etc/passwd', fileId: 1 },
      { user, confirmed: true }
    );

    expect(result.success).toBe(true);
    const [taskParams, userId] = mockCreateZgrab2Task.mock.calls[0];
    expect(userId).toBe(9);
    expect(taskParams).toEqual({
      module: 'http',
      inputFile: 'targets.txt',
      port: '8080',
      description: 'Agent 发起的探测：targets.txt (http)'
    });
    expect(taskParams.inputFilePath).toBeUndefined();
  });

  test.each([
    ['路径穿越文件名', { inputFile: '../../etc/passwd', module: 'http' }],
    ['绝对路径', { inputFile: '/etc/passwd', module: 'http' }],
    ['非法模块名', { inputFile: 'a.txt', module: 'http;id' }]
  ])('拒绝：%s', async (_name, params) => {
    const result = await toolService.executeTool('zgrab2', params, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(mockCreateZgrab2Task).not.toHaveBeenCalled();
  });
});

describe('terminal 工具', () => {
  test('非管理员即使确认也不能使用', async () => {
    const result = await toolService.executeTool('terminal', { command: 'uname -a' }, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('没有权限使用该工具');
    expect(mockTerminalExecute).not.toHaveBeenCalled();
  });

  test('管理员确认后执行', async () => {
    mockTerminalCreate.mockReturnValueOnce({ success: true, terminal: { id: 't1' } });
    mockTerminalExecute.mockResolvedValueOnce({
      success: true,
      command: { command: 'uname -a' },
      stdout: 'Linux',
      stderr: '',
      exitCode: 0,
      duration: 3,
      timedOut: false
    });
    const result = await toolService.executeTool('terminal', { command: 'uname -a' }, { user: admin, confirmed: true });
    expect(result.success).toBe(true);
    expect(mockTerminalExecute).toHaveBeenCalledWith('t1', 'uname -a', { timeout: 60000 });
  });
});

describe('工具查找', () => {
  test.each(['constructor', '__proto__', 'toString'])('原型链上的名字 %s 不是工具', async (name) => {
    const result = await toolService.executeTool(name, {}, { user });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/未知工具/);
  });
});

describe('Agent 对话：大模型不能自行确认', () => {
  test('意图识别出扫描时，只返回待确认请求，不发起扫描', async () => {
    mockChat.mockResolvedValueOnce({
      message: JSON.stringify({
        shouldUseTool: true,
        toolName: 'xmap',
        toolParams: { target: '2001:db8::/64', confirmed: true },
        reason: '用户要求扫描'
      })
    });

    const result = await agentService.processMessage('扫描 2001:db8::/64', [], { user, confirmed: true });

    expect(result.type).toBe('confirmation_required');
    expect(result.pendingToolCall.tool).toBe('xmap');
    expect(result.pendingToolCall.params.target).toBe('2001:db8::/64');
    expect(mockStartScan).not.toHaveBeenCalled();
    // 只调用了一次大模型（意图识别），没有再把工具结果送回去解释
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});

describe('POST /agent/tools/execute', () => {
  test('未确认返回 409 并带待确认参数', async () => {
    const res = createRes();
    await agentController.executeTool(
      { user, body: { toolName: 'xmap', params: { target: '2001:db8::/64' } } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].needsConfirmation).toBe(true);
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  test('confirmed:true 时执行', async () => {
    mockStartScan.mockResolvedValueOnce({ success: true, taskId: 7, statusCode: 202 });
    const res = createRes();
    await agentController.executeTool(
      { user, body: { toolName: 'xmap', params: { target: '2001:db8::/64' }, confirmed: true } },
      res
    );
    expect(mockStartScan).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});
