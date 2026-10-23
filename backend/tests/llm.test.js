/**
 * llmService：提供商选择、消息构造、两种 API 格式的请求与响应解析（axios 用 mock）。
 */
const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

const ENV_KEYS = [
  'AI_PROVIDER', 'AI_API_KEY', 'AI_API_BASE_URL', 'AI_MODEL',
  'MINIMAX_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_MODEL',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'OPENAI_API_KEY', 'SILICONFLOW_API_KEY', 'AGENT_NATIVE_TOOLS'
];
const saved = {};
ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; });

// 提供商配置在模块加载时读取环境变量，所以每个用例设置好环境后重新加载模块
const load = (env = {}) => {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  jest.resetModules();
  return require('../services/llmService');
};

beforeEach(() => {
  mockPost.mockReset();
});

afterAll(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe('提供商选择与状态', () => {
  test('默认使用 MiniMax（Anthropic 格式）', () => {
    const llm = load({ MINIMAX_API_KEY: 'mm-key' });
    const config = llm.getProviderConfig();
    expect(config).toMatchObject({ type: 'anthropic', name: 'MiniMax', endpoint: '/messages' });
    expect(config.headers['anthropic-version']).toBeDefined();
  });

  test.each([
    ['deepseek', 'DeepSeek'],
    ['openai', 'OpenAI'],
    ['siliconflow', 'SiliconFlow'],
    ['custom', 'Custom'],
    ['DeepSeek', 'DeepSeek'] // 不区分大小写
  ])('AI_PROVIDER=%s → %s（OpenAI 格式）', (provider, name) => {
    const llm = load({ AI_PROVIDER: provider, AI_API_KEY: 'k' });
    expect(llm.getProviderConfig()).toMatchObject({ type: 'openai', name, endpoint: '/chat/completions' });
  });

  test('未知提供商回退到 MiniMax', () => {
    const llm = load({ AI_PROVIDER: 'nope' });
    expect(llm.getProviderConfig().name).toBe('MiniMax');
  });

  test('可通过环境变量改基址与模型', () => {
    const llm = load({ AI_PROVIDER: 'deepseek', DEEPSEEK_BASE_URL: 'http://llm.local/v1', DEEPSEEK_MODEL: 'm1', DEEPSEEK_API_KEY: 'k' });
    expect(llm.getProviderConfig()).toMatchObject({ baseURL: 'http://llm.local/v1', model: 'm1' });
  });

  test('getStatus 报告是否已配置密钥，且不泄露密钥本身', () => {
    const configured = load({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-secret-value' }).getStatus();
    expect(configured.data.configured).toBe(true);
    expect(JSON.stringify(configured)).not.toContain('sk-secret-value');

    const missing = load({ AI_PROVIDER: 'openai' }).getStatus();
    expect(missing.data.configured).toBe(false);
  });
});

describe('buildMessages', () => {
  const { buildMessages, AGENT_SYSTEM_PROMPT } = load();

  test('系统提示词在最前，当前消息在最后并去掉首尾空白', () => {
    const msgs = buildMessages('  你好  ', []);
    expect(msgs[0]).toEqual({ role: 'system', content: AGENT_SYSTEM_PROMPT });
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: '你好' });
  });

  test('历史只保留最近 20 条，过滤无效角色与空内容', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    history.push({ role: 'system', content: '不应出现' }, { role: 'user', content: '   ' }, null, { role: 'user', content: 123 });
    const msgs = buildMessages('q', history, null);
    // 没有系统提示词：只有历史（有效的）+ 当前消息
    expect(msgs.some((m) => m.content === '不应出现')).toBe(false);
    expect(msgs.length).toBeLessThanOrEqual(21);
    expect(msgs[msgs.length - 1].content).toBe('q');
  });

  test('空的用户消息不会加入', () => {
    expect(buildMessages('   ', [], null)).toEqual([]);
  });
});

describe('chat（Anthropic 格式）', () => {
  test('请求带 Bearer 密钥与版本头，system 单独传递，响应被解析', async () => {
    const llm = load({ MINIMAX_API_KEY: 'mm-key' });
    mockPost.mockResolvedValue({ data: { content: [{ text: '回答' }], usage: { input_tokens: 3, output_tokens: 5 } } });

    const result = await llm.chat('你好', [{ role: 'user', content: '之前' }]);

    const [url, body, opts] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.minimaxi.com/anthropic/messages');
    expect(opts.headers.Authorization).toBe('Bearer mm-key');
    expect(opts.headers['anthropic-version']).toBeDefined();
    expect(body.system).toContain('ObserV6 Agent');
    expect(body.messages.every((m) => m.role !== 'system')).toBe(true);
    expect(body.stream).toBe(false);
    expect(result).toMatchObject({ success: true, message: '回答', provider: 'MiniMax', usage: { input_tokens: 3, output_tokens: 5 } });
  });

  test('未配置密钥时直接抛错，不发请求', async () => {
    const llm = load({});
    await expect(llm.chat('hi')).rejects.toThrow('API密钥未配置');
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('接口报错时原样抛出', async () => {
    const llm = load({ MINIMAX_API_KEY: 'k' });
    mockPost.mockRejectedValue(Object.assign(new Error('boom'), { response: { data: { error: 'rate limited' } } }));
    await expect(llm.chat('hi')).rejects.toThrow('boom');
  });
});

describe('chat（OpenAI 格式）', () => {
  test('请求体与响应解析', async () => {
    const llm = load({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'ds-key' });
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: '你好呀' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }
    });

    const result = await llm.chat('hi', [], { temperature: 0.2, max_tokens: 100 });

    const [url, body, opts] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer ds-key');
    expect(body).toMatchObject({ model: 'deepseek-chat', temperature: 0.2, max_tokens: 100, stream: false });
    expect(body.messages[0].role).toBe('system');
    expect(result).toMatchObject({ success: true, message: '你好呀', provider: 'DeepSeek', usage: { total_tokens: 3 } });
  });

  test('响应缺少 choices 时返回空字符串而不是崩溃', async () => {
    const llm = load({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    mockPost.mockResolvedValue({ data: {} });
    const result = await llm.chat('hi');
    expect(result.message).toBe('');
    expect(result.usage).toBeNull();
  });

  test('未配置密钥时抛错', async () => {
    const llm = load({ AI_PROVIDER: 'openai' });
    await expect(llm.chat('hi')).rejects.toThrow('API密钥未配置');
  });
});

describe('getToolDefinitions', () => {
  test('返回 OpenAI function calling 格式，包含扫描工具', () => {
    const defs = load().getToolDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.every((d) => d.type === 'function' && d.function.name && d.function.parameters)).toBe(true);
    expect(defs.map((d) => d.function.name)).toContain('xmap_scan');
  });
});

describe('原生工具调用', () => {
  const tools = [{
    type: 'function',
    function: { name: 'xmap', description: '扫描', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } }
  }];

  test('Anthropic：工具定义转成 input_schema；tool_use 块被整理成 toolCalls，文本只取 text 块', async () => {
    const llm = load({ MINIMAX_API_KEY: 'mm-key' });
    mockPost.mockResolvedValue({
      data: {
        content: [
          { type: 'thinking', thinking: '...' },
          { type: 'text', text: '好的，' },
          { type: 'text', text: '我来扫描' },
          { type: 'tool_use', id: 'tu_1', name: 'xmap', input: { target: '2001:db8::/64' } }
        ]
      }
    });
    const result = await llm.chat('扫描', [], { tools });
    const body = mockPost.mock.calls[0][1];
    expect(body.tools).toEqual([{ name: 'xmap', description: '扫描', input_schema: tools[0].function.parameters }]);
    expect(result.message).toBe('好的，我来扫描');
    expect(result.toolCalls).toEqual([{ id: 'tu_1', name: 'xmap', arguments: { target: '2001:db8::/64' } }]);
  });

  test('Anthropic：不传 tools 时请求里没有 tools，toolCalls 为空数组', async () => {
    const llm = load({ MINIMAX_API_KEY: 'mm-key' });
    mockPost.mockResolvedValue({ data: { content: [{ type: 'text', text: 'hi' }] } });
    const result = await llm.chat('你好');
    expect(mockPost.mock.calls[0][1].tools).toBeUndefined();
    expect(result.toolCalls).toEqual([]);
  });

  test('OpenAI：请求带 tools 与 tool_choice=auto；arguments 字符串被解析成对象', async () => {
    const llm = load({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'ds-key' });
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'xmap', arguments: '{"target":"2001:db8::1"}' } }] } }] }
    });
    const result = await llm.chat('扫描', [], { tools });
    const body = mockPost.mock.calls[0][1];
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
    expect(result.message).toBe('');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'xmap', arguments: { target: '2001:db8::1' } }]);
  });

  test.each([
    ['不是合法 JSON', '{bad'],
    ['不是对象', '[1,2]'],
    ['不是对象', '"x"']
  ])('OpenAI：arguments %s → arguments 为 null 并带 argumentsError', async (_label, raw) => {
    const llm = load({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'ds-key' });
    mockPost.mockResolvedValue({ data: { choices: [{ message: { tool_calls: [{ id: 'c', function: { name: 'xmap', arguments: raw } }] } }] } });
    const result = await llm.chat('扫描', [], { tools });
    expect(result.toolCalls[0].arguments).toBeNull();
    expect(result.toolCalls[0].argumentsError).toMatch(/JSON/);
  });

  test('OpenAI：空 arguments 视为空对象；缺 function 的项被忽略', async () => {
    const llm = load({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'ds-key' });
    mockPost.mockResolvedValue({ data: { choices: [{ message: { tool_calls: [{ id: 'a', function: { name: 'workflow', arguments: '' } }, { id: 'b' }, null] } }] } });
    const result = await llm.chat('x', [], { tools });
    expect(result.toolCalls).toEqual([{ id: 'a', name: 'workflow', arguments: {} }]);
  });

  test('supportsNativeTools：有密钥且未被 AGENT_NATIVE_TOOLS=false 关闭', () => {
    expect(load({ MINIMAX_API_KEY: 'k' }).supportsNativeTools()).toBe(true);
    expect(load({ MINIMAX_API_KEY: 'k', AGENT_NATIVE_TOOLS: 'false' }).supportsNativeTools()).toBe(false);
    expect(load({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k' }).supportsNativeTools()).toBe(true);
    expect(load({}).supportsNativeTools()).toBe(false);
  });
});
