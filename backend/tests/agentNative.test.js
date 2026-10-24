/**
 * Agent 原生工具调用（P4-1）：模型给出结构化工具调用 → 参数校验 → 仍然只返回待确认请求；
 * 无效调用、权限、退回关键词意图识别的条件。llmService.chat 被 mock，toolService 用真实注册表。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const mockStartScan = jest.fn();
jest.mock('../api/internal', () => ({
  xmap: { startScan: (...args) => mockStartScan(...args) },
  zgrab2: { createTask: jest.fn() }
}));

const mockChat = jest.fn();
const mockNative = jest.fn();
jest.mock('../services/llmService', () => ({
  chat: (...args) => mockChat(...args),
  supportsNativeTools: () => mockNative()
}));
jest.mock('../services/terminalService', () => ({ createTerminal: jest.fn(), executeCommand: jest.fn() }));

const toolService = require('../services/toolService');
const agentService = require('../services/agentService');

const user = { id: 9, role: 'user' };
const admin = { id: 1, role: 'admin' };
const reply = (message, toolCalls = []) => ({ message, toolCalls, model: 'm', provider: 'p' });

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.mockReturnValue(true);
});

describe('validateToolParams', () => {
  test('通过：必需参数齐全，数字可以是数字字符串', () => {
    expect(toolService.validateToolParams('xmap', { target: '2001:db8::/64', port: '443' })).toEqual({ valid: true, errors: [] });
    expect(toolService.validateToolParams('knowledge', { question: '什么是 NDP' }).valid).toBe(true);
  });

  test.each([
    ['xmap', {}, '缺少必需参数: target'],
    ['xmap', { target: 'x', port: 'abc' }, '必须是数字'],
    ['xmap', { target: { a: 1 } }, '必须是字符串'],
    ['xmap', { target: 'x', evil: 1 }, '未知参数: evil'],
    ['xmap', null, '参数必须是对象'],
    ['xmap', [], '参数必须是对象'],
    ['nope', {}, '未知工具'],
    ['constructor', {}, '未知工具']
  ])('%s %j → %s', (name, params, text) => {
    const r = toolService.validateToolParams(name, params);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain(text);
  });
});

describe('getToolDefinitions(context)', () => {
  const names = (ctx) => toolService.getToolDefinitions(ctx).map((d) => d.function.name);

  test('普通用户看不到仅管理员可用的终端；管理员看得到；不传 context 时全部返回', () => {
    expect(names({ user })).not.toContain('terminal');
    expect(names({ user: admin })).toContain('terminal');
    expect(names()).toContain('terminal');
    expect(names({ user })).toEqual(expect.arrayContaining(['xmap', 'zgrab2', 'knowledge', 'workflow']));
  });
});

describe('processMessage（原生工具调用）', () => {
  test('模型没有调用工具：一次调用就直接回答，不再做意图识别', async () => {
    mockChat.mockResolvedValueOnce(reply('IPv6 是下一代互联网协议'));
    const res = await agentService.processMessage('你好', [], { user });
    expect(res).toMatchObject({ success: true, type: 'text', message: 'IPv6 是下一代互联网协议', model: 'm', provider: 'p' });
    expect(mockChat).toHaveBeenCalledTimes(1);
    const options = mockChat.mock.calls[0][2];
    expect(options.tools.map((d) => d.function.name)).toEqual(expect.arrayContaining(['xmap', 'knowledge']));
    expect(options.tools.map((d) => d.function.name)).not.toContain('terminal');
  });

  test('模型调用扫描：只返回待确认请求，不发起扫描；模型参数里的 confirmed 无效', async () => {
    mockChat.mockResolvedValueOnce(reply('', [{ id: 'c1', name: 'xmap', arguments: { target: '2001:db8::/64' } }]));
    const res = await agentService.processMessage('扫描 2001:db8::/64', [], { user, confirmed: true });
    expect(res.type).toBe('confirmation_required');
    expect(res.pendingToolCall).toMatchObject({ tool: 'xmap', params: { target: '2001:db8::/64' } });
    expect(mockStartScan).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledTimes(1);

    mockChat.mockResolvedValueOnce(reply('', [{ id: 'c2', name: 'xmap', arguments: { target: '2001:db8::/64', confirmed: true } }]));
    const res2 = await agentService.processMessage('扫描', [], { user });
    expect(res2.type).toBe('text'); // confirmed 是未知参数，调用被拒绝
    expect(res2.message).toContain('未知参数: confirmed');
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  test('无需确认的工具：执行后再让模型解释结果', async () => {
    // 调用顺序：① 模型选择工具 ② knowledge 工具自己调用模型作答 ③ 模型解释工具结果
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c1', name: 'knowledge', arguments: { question: '什么是 NDP' } }]))
      .mockResolvedValueOnce(reply('NDP 是邻居发现协议'))
      .mockResolvedValueOnce(reply('这是解释'));
    const res = await agentService.processMessage('什么是NDP', [], { user });
    expect(res).toMatchObject({ type: 'tool_execution', message: '这是解释' });
    expect(res.toolCall.tool).toBe('knowledge');
  });

  test.each([
    [{ id: 'c', name: 'xmap', arguments: {} }, '缺少必需参数: target'],
    [{ id: 'c', name: 'xmap', arguments: { target: 'x', port: 'abc' } }, '必须是数字'],
    [{ id: 'c', name: 'rm_rf', arguments: {} }, '未知工具'],
    [{ id: 'c', name: 'xmap', arguments: null, argumentsError: '参数不是合法的 JSON' }, '参数不是合法的 JSON']
  ])('无效调用不执行，直接说明原因 %j', async (call, text) => {
    mockChat.mockResolvedValueOnce(reply('', [call]));
    const res = await agentService.processMessage('扫描', [], { user });
    expect(res.type).toBe('text');
    expect(res.message).toContain(text);
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockStartScan).not.toHaveBeenCalled();
  });

  test('普通用户即使被诱导调用终端，也被执行层的权限检查拒绝', async () => {
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c', name: 'terminal', arguments: { command: 'id' } }]))
      .mockResolvedValueOnce(reply('没有权限'));
    const res = await agentService.processMessage('执行 id', [], { user });
    expect(res.type).toBe('tool_execution');
    expect(res.toolCall.result).toMatchObject({ success: false, error: '没有权限使用该工具' });
  });
});

describe('退回关键词意图识别', () => {
  const legacyIntent = JSON.stringify({ shouldUseTool: false });

  test('supportsNativeTools 为 false 时不带 tools，走“意图识别 + 回答”两次调用', async () => {
    mockNative.mockReturnValue(false);
    mockChat.mockResolvedValueOnce(reply(legacyIntent)).mockResolvedValueOnce(reply('你好！'));
    const res = await agentService.processMessage('你好', [], { user });
    expect(res.message).toBe('你好！');
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockChat.mock.calls.every(([, , o]) => !o.tools)).toBe(true);
  });

  test.each([400, 404, 422])('提供商以 %i 拒绝 tools 请求时退回', async (status) => {
    mockChat
      .mockRejectedValueOnce(Object.assign(new Error('bad request'), { response: { status } }))
      .mockResolvedValueOnce(reply(legacyIntent))
      .mockResolvedValueOnce(reply('退回后的回答'));
    const res = await agentService.processMessage('你好', [], { user });
    expect(res.message).toBe('退回后的回答');
    expect(mockChat).toHaveBeenCalledTimes(3);
  });

  test.each([401, 429, 500, undefined])('状态 %s（鉴权、限流、服务端或网络错误）不退回，直接抛出', async (status) => {
    mockChat.mockRejectedValueOnce(Object.assign(new Error('failed'), status ? { response: { status } } : {}));
    await expect(agentService.processMessage('你好', [], { user })).rejects.toThrow('failed');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
