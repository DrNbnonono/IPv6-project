/**
 * agentService：意图识别、参数提取、消息处理编排。
 * llmService 与 toolService 全部 mock，不发起网络请求，也不执行任何工具。
 */

jest.mock('../services/llmService', () => ({ chat: jest.fn() }));
jest.mock('../services/toolService', () => ({ executeTool: jest.fn() }));

const llmService = require('../services/llmService');
const toolService = require('../services/toolService');
const agent = require('../services/agentService');

beforeEach(() => {
  jest.resetAllMocks();
});

const llmReplies = (...messages) => {
  messages.forEach((message) => llmService.chat.mockResolvedValueOnce({ message, model: 'm', provider: 'p' }));
};

describe('getWelcomeMessage', () => {
  test('返回欢迎语', () => {
    expect(agent.getWelcomeMessage()).toEqual({ success: true, message: agent.WELCOME_MESSAGE, type: 'welcome' });
  });
});

describe('extractParams', () => {
  test('xmap：优先取网段，识别带宽，默认 ipv6', () => {
    const p = agent.extractParams('请扫描 2001:db8::1 和 2001:db8::/32，带宽 10M', 'xmap');
    expect(p).toMatchObject({ target: '2001:db8::/32', rate: '10M', protocol: 'ipv6' });
  });

  test('xmap：IPv4 目标切换为 ipv4 协议', () => {
    const p = agent.extractParams('扫描 192.0.2.0/24', 'xmap');
    expect(p).toMatchObject({ target: '192.0.2.0/24', protocol: 'ipv4' });
  });

  test('xmap：消息显式提到 IPv4 时使用 ipv4', () => {
    expect(agent.extractParams('用 IPv4 扫描', 'xmap').protocol).toBe('ipv4');
  });

  test('zgrab2：消息里的地址放入 targets，并删除 LLM 给的 target', () => {
    const p = agent.extractParams('探测 2001:db8::1 的 ssh 端口: 22', 'zgrab2', { target: 'x' });
    expect(p.target).toBeUndefined();
    expect(p).toMatchObject({ targets: '2001:db8::1', module: 'ssh', port: 22 });
  });

  test('zgrab2：没有地址时识别输入文件名，默认模块 http', () => {
    const p = agent.extractParams('对 hosts.txt 做探测', 'zgrab2');
    expect(p).toMatchObject({ inputFile: 'hosts.txt', module: 'http' });
  });

  test('zgrab2：LLM 已给出 targets 时不覆盖', () => {
    const p = agent.extractParams('探测 2001:db8::2', 'zgrab2', { targets: '2001:db8::9' });
    expect(p.targets).toBe('2001:db8::9');
  });

  test('knowledge：去掉疑问前缀并提取主题', () => {
    const p = agent.extractParams('什么是NDP协议', 'knowledge');
    expect(p).toMatchObject({ question: 'NDP协议', topic: '协议' });
  });

  test('knowledge：无前缀时整句作为问题', () => {
    expect(agent.extractParams('IPv6 头部有多长', 'knowledge').question).toBe('IPv6 头部有多长');
  });

  test('workflow：去掉动词并提取约束', () => {
    const p = agent.extractParams('设计工作流 扫描校园网，限制: 每天一次.', 'workflow');
    expect(p.goal).toContain('扫描校园网');
    expect(p.goal).not.toContain('设计');
    expect(p.constraints).toBe('每天一次');
  });

  test('未知工具原样返回传入参数的副本', () => {
    const input = { a: 1 };
    const p = agent.extractParams('随便', 'other', input);
    expect(p).toEqual({ a: 1 });
    expect(p).not.toBe(input);
  });
});

describe('extractTargets 边界', () => {
  test('句末标点不进入地址，重复项去重', () => {
    expect(agent.extractTargets('扫 2001:db8::1。再扫 2001:db8::1.')).toEqual(['2001:db8::1']);
  });

  test('拒绝非法形态', () => {
    expect(agent.extractTargets('999.1.1.1 2001:db8::/200 12:34 1:2:3')).toEqual([]);
  });

  test('接受完整 8 段和以 :: 结尾的写法', () => {
    expect(agent.extractTargets('2001:db8:0:0:0:0:0:1 fe80::')).toEqual(['2001:db8:0:0:0:0:0:1', 'fe80::']);
  });
});

describe('detectIntent', () => {
  test('解析 LLM 返回的 JSON，并用消息内容补全参数', async () => {
    llmReplies('好的 {"shouldUseTool": true, "toolName": "xmap", "toolParams": {}, "reason": "扫描"}');
    const intent = await agent.detectIntent('扫描 2001:db8::/48', []);
    expect(intent.shouldUseTool).toBe(true);
    expect(intent.toolName).toBe('xmap');
    expect(intent.toolParams.target).toBe('2001:db8::/48');
  });

  test('没有 JSON 时默认不用工具', async () => {
    llmReplies('我不知道');
    const intent = await agent.detectIntent('你好');
    expect(intent).toMatchObject({ shouldUseTool: false, toolName: null, reason: '无法解析意图' });
  });

  test('JSON 损坏时默认不用工具', async () => {
    llmReplies('{not json}');
    const intent = await agent.detectIntent('你好');
    expect(intent).toMatchObject({ shouldUseTool: false, reason: '解析错误' });
  });

  test('LLM 调用失败时不抛出，降级为不用工具', async () => {
    llmService.chat.mockRejectedValueOnce(new Error('network down'));
    const intent = await agent.detectIntent('你好');
    expect(intent).toMatchObject({ shouldUseTool: false, toolName: null, reason: 'network down' });
  });
});

describe('processMessage', () => {
  test('不需要工具：直接回答', async () => {
    llmReplies('{"shouldUseTool": false}', '你好！');
    const res = await agent.processMessage('你好');
    expect(res).toMatchObject({ success: true, type: 'text', message: '你好！', model: 'm', provider: 'p' });
    expect(toolService.executeTool).not.toHaveBeenCalled();
  });

  test('工具调用永远以 confirmed:false 发出，且保留 context', async () => {
    llmReplies('{"shouldUseTool": true, "toolName": "xmap", "toolParams": {"confirmed": true}}');
    toolService.executeTool.mockResolvedValueOnce({ needsConfirmation: true, tool: 'xmap', params: { target: '2001:db8::1' } });

    const res = await agent.processMessage('扫描 2001:db8::1', [], { userId: 7, confirmed: true });

    const [name, , ctx] = toolService.executeTool.mock.calls[0];
    expect(name).toBe('xmap');
    expect(ctx).toMatchObject({ userId: 7, confirmed: false });
    expect(res.type).toBe('confirmation_required');
    expect(res.pendingToolCall).toEqual({ tool: 'xmap', params: { target: '2001:db8::1' } });
    // 只有意图识别这一次 LLM 调用，没有解释阶段
    expect(llmService.chat).toHaveBeenCalledTimes(1);
  });

  test('无需确认的工具：执行后让 LLM 解释结果并给出建议', async () => {
    llmReplies('{"shouldUseTool": true, "toolName": "knowledge", "toolParams": {}}', '这是解释');
    toolService.executeTool.mockResolvedValueOnce({ success: true, answer: 'x' });

    const res = await agent.processMessage('什么是NDP');

    expect(res).toMatchObject({ success: true, type: 'tool_execution', message: '这是解释' });
    expect(res.toolCall.tool).toBe('knowledge');
    expect(res.toolCall.result).toEqual({ success: true, answer: 'x' });
    expect(res.suggestions.length).toBeGreaterThan(0);
  });

  test('下游抛错时向上抛出', async () => {
    llmReplies('{"shouldUseTool": false}');
    llmService.chat.mockRejectedValueOnce(new Error('boom'));
    await expect(agent.processMessage('你好')).rejects.toThrow('boom');
  });
});

describe('generateWorkflow', () => {
  test('解析 JSON 工作流', async () => {
    llmReplies('这是方案 {"name":"w","steps":[{"order":1}]}');
    const res = await agent.generateWorkflow('扫校园网', '每天一次');
    expect(res.success).toBe(true);
    expect(res.workflow.name).toBe('w');
    expect(llmService.chat.mock.calls[0][0]).toContain('每天一次');
  });

  test('没有 JSON 时保留原文', async () => {
    llmReplies('纯文本');
    expect((await agent.generateWorkflow('目标')).workflow).toEqual({ raw: '纯文本' });
    expect(llmService.chat.mock.calls[0][0]).toContain('约束：无');
  });

  test('JSON 损坏时保留原文', async () => {
    llmReplies('{oops}');
    expect((await agent.generateWorkflow('目标')).workflow).toEqual({ raw: '{oops}' });
  });

  test('LLM 失败时返回 success:false 而不是抛出', async () => {
    llmService.chat.mockRejectedValueOnce(new Error('x'));
    expect(await agent.generateWorkflow('目标')).toEqual({ success: false, error: 'x' });
  });
});
