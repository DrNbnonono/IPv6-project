jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const mockStartScan = jest.fn();
const mockCreateZgrab2Task = jest.fn();
jest.mock('../api/internal', () => ({
  xmap: { startScan: (...args) => mockStartScan(...args) },
  zgrab2: { createTask: (...args) => mockCreateZgrab2Task(...args) }
}));

const mockSaveTargetsFile = jest.fn();
jest.mock('../services/storageService', () => ({
  ...jest.requireActual('../services/storageService'),
  saveTargetsFile: (...args) => mockSaveTargetsFile(...args)
}));

const mockChat = jest.fn();
const mockNative = jest.fn(() => false);
jest.mock('../services/llmService', () => ({ chat: (...args) => mockChat(...args), supportsNativeTools: () => mockNative() }));

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

describe('zgrab2 工具：地址列表', () => {
  test('targets 先保存为当前用户的输入文件，再以文件名创建任务', async () => {
    mockSaveTargetsFile.mockResolvedValueOnce({ fileName: 'zgrab2_input_9_1.txt', filePath: '/x/zgrab2_input_9_1.txt', count: 2 });
    mockCreateZgrab2Task.mockResolvedValueOnce({ success: true, taskId: 77, statusCode: 200 });

    const result = await toolService.executeTool(
      'zgrab2',
      { targets: '2001:db8::1, 2001:db8::2', module: 'ssh' },
      { user, confirmed: true }
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ taskId: 77, inputFile: 'zgrab2_input_9_1.txt', module: 'ssh', targetCount: 2 });
    expect(mockSaveTargetsFile).toHaveBeenCalledWith(9, ['2001:db8::1', '2001:db8::2'], 'zgrab2');
    const [taskParams] = mockCreateZgrab2Task.mock.calls[0];
    expect(taskParams.inputFile).toBe('zgrab2_input_9_1.txt');
    expect(taskParams.targets).toBeUndefined();
  });

  test('未确认时不写任何文件', async () => {
    const result = await toolService.executeTool('zgrab2', { targets: ['2001:db8::1'], module: 'http' }, { user });
    expect(result.needsConfirmation).toBe(true);
    expect(result.params.targets).toEqual(['2001:db8::1']);
    expect(mockSaveTargetsFile).not.toHaveBeenCalled();
    expect(mockCreateZgrab2Task).not.toHaveBeenCalled();
  });

  test.each([
    ['targets 与 inputFile 同时给出', { targets: '2001:db8::1', inputFile: 'a.txt', module: 'http' }],
    ['两者都没给', { module: 'http' }],
    ['目标含 shell 字符', { targets: '2001:db8::1; id', module: 'http' }],
    ['目标为域名', { targets: 'example.com', module: 'http' }],
    ['目标数量超过 Agent 上限', { targets: Array.from({ length: 1001 }, (_, i) => `10.0.${i >> 8}.${i & 255}`), module: 'http' }]
  ])('拒绝：%s', async (_name, params) => {
    const result = await toolService.executeTool('zgrab2', params, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.needsConfirmation).toBeUndefined();
    expect(mockSaveTargetsFile).not.toHaveBeenCalled();
    expect(mockCreateZgrab2Task).not.toHaveBeenCalled();
  });

  test('保存文件失败时不创建任务', async () => {
    mockSaveTargetsFile.mockRejectedValueOnce(new Error('磁盘已满'));
    const result = await toolService.executeTool('zgrab2', { targets: '2001:db8::1', module: 'http' }, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('磁盘已满');
    expect(mockCreateZgrab2Task).not.toHaveBeenCalled();
  });
});

describe('对话中提取 zgrab2 目标', () => {
  test('消息里的地址和网段变成 targets 待确认，不会执行', async () => {
    mockChat.mockResolvedValueOnce({
      message: JSON.stringify({ shouldUseTool: true, toolName: 'zgrab2', toolParams: {}, reason: '探测服务' })
    });

    const result = await agentService.processMessage('探测 2001:db8::/48 和 2001:db8:1::5 的 ssh 服务', [], { user });

    expect(result.type).toBe('confirmation_required');
    expect(result.pendingToolCall.tool).toBe('zgrab2');
    expect(result.pendingToolCall.params.module).toBe('ssh');
    expect(result.pendingToolCall.params.targets).toEqual(['2001:db8::/48', '2001:db8:1::5']);
    expect(mockSaveTargetsFile).not.toHaveBeenCalled();
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

describe('extractTargets', () => {
  const { extractTargets } = agentService;

  test.each([
    ['扫描 2001:db8::1', ['2001:db8::1']],
    ['扫描2001:db8::/32这个网段', ['2001:db8::/32']],
    ['探测 2001:db8:1::5 和 2001:db8:2::6。', ['2001:db8:1::5', '2001:db8:2::6']],
    ['地址 2001:0db8:0000:0000:0000:0000:0000:0001 在线吗', ['2001:0db8:0000:0000:0000:0000:0000:0001']],
    ['检查 192.0.2.10 和 198.51.100.0/24', ['192.0.2.10', '198.51.100.0/24']],
    ['2001:db8::1 2001:db8::1', ['2001:db8::1']],
    ['以 2001:db8:: 开头', ['2001:db8::']]
  ])('%s', (message, expected) => {
    expect(extractTargets(message)).toEqual(expected);
  });

  test.each([
    ['现在 12:30 开会'],
    ['版本 1.2.3'],
    ['999.1.1.1'],
    ['2001:db8::1::2'],
    ['2001:db8::/200'],
    ['fffff::1'],
    ['没有地址']
  ])('不是目标：%s', (message) => {
    expect(extractTargets(message)).toEqual([]);
  });

  test('xmap 提取：优先网段；IPv4 自动设置协议', () => {
    expect(agentService.extractParams('扫描 2001:db8::1 以及 2001:db8::/48', 'xmap').target).toBe('2001:db8::/48');
    const v4 = agentService.extractParams('扫描 192.0.2.0/24', 'xmap');
    expect(v4).toMatchObject({ target: '192.0.2.0/24', protocol: 'ipv4' });
    expect(agentService.extractParams('扫描 2001:db8::1，速率 10M', 'xmap')).toMatchObject({ target: '2001:db8::1', protocol: 'ipv6', rate: '10M' });
  });
});
