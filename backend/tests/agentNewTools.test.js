/**
 * P4-2：Agent 新工具 query_database / apd_detect / generate_targets / enrich / task_status
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const mockEnqueueApd = jest.fn();
jest.mock('../services/aliasDetectService', () => ({ enqueueApdTask: (...args) => mockEnqueueApd(...args) }));
const mockEnqueueTga = jest.fn();
jest.mock('../services/targetGenService', () => ({ enqueueTgaTask: (...args) => mockEnqueueTga(...args) }));
const mockEnqueueEnrich = jest.fn();
jest.mock('../services/enrichTaskService', () => ({ enqueueEnrichTask: (...args) => mockEnqueueEnrich(...args) }));

const db = require('../database/db');
const toolService = require('../services/toolService');

const user = { id: 9, role: 'user' };
const admin = { id: 1, role: 'admin' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('工具注册', () => {
  test('新工具出现在工具定义里，仅管理员可用的 enrich 对普通用户隐藏', () => {
    const names = (context) => toolService.getToolDefinitions(context).map((item) => item.function.name);
    for (const name of ['query_database', 'apd_detect', 'generate_targets', 'task_status']) {
      expect(names({ user })).toContain(name);
    }
    expect(names({ user })).not.toContain('enrich');
    expect(names({ user: admin })).toContain('enrich');
  });

  test('参数类型都是 JSON Schema 能表示的类型', () => {
    for (const definition of toolService.getToolDefinitions()) {
      for (const property of Object.values(definition.function.parameters.properties)) {
        expect(['string', 'number', 'boolean']).toContain(property.type);
      }
    }
  });

  test('会创建任务的工具都需要确认，只读工具不需要', () => {
    const flags = Object.fromEntries(toolService.getTools().map((tool) => [tool.id, tool.requiresConfirmation]));
    expect(flags).toMatchObject({ apd_detect: true, generate_targets: true, enrich: true, query_database: false, task_status: false });
  });
});

describe('query_database', () => {
  test('按条件生成只读查询，返回精简的地址列表', async () => {
    db.query.mockResolvedValue([[
      { address: '2001:db8::1', prefix: '2001:db8::/32', asn: 64500, as_name_zh: '示例网络', as_name: 'Example', iid_type: 'low-byte' },
      { address: '2001:db8::2', prefix: '2001:db8::/32', asn: 64500, as_name_zh: null, as_name: 'Example', iid_type: null }
    ]]);
    const result = await toolService.executeTool('query_database', { asn: 64500, firstSeenAfter: '2026-01-01', limit: 10 }, { user });
    expect(result.success).toBe(true);
    expect(result.result.count).toBe(2);
    expect(result.result.truncated).toBe(false);
    expect(result.result.addresses[0]).toEqual({ address: '2001:db8::1', prefix: '2001:db8::/32', asn: 64500, asName: '示例网络', iidType: 'low-byte' });
    expect(result.result.addresses[1].asName).toBe('Example');
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).toMatch(/^SELECT /);
    expect(sql).toMatch(/LIMIT \?$/);
    expect(args).toEqual([64500, '2026-01-01', 10]);
  });

  test('库中没有在线率数据：minUptime 已不是该工具的参数，会被参数校验拒绝', () => {
    const check = toolService.validateToolParams('query_database', { asn: 64500, minUptime: 50 });
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/minUptime/);
  });

  test('默认 limit 为 100，结果数达到 limit 时标记可能被截断', async () => {
    db.query.mockResolvedValue([[{ address: 'a', prefix: 'p', asn: 1 }, { address: 'b', prefix: 'p', asn: 1 }]]);
    await toolService.executeTool('query_database', { asn: 1 }, { user });
    expect(db.query.mock.calls[0][1].slice(-1)[0]).toBe(100);

    const result = await toolService.executeTool('query_database', { asn: 1, limit: 2 }, { user });
    expect(result.result.truncated).toBe(true);
    expect(result.message).toContain('已达到上限');
  });

  test('消息里只预览前 20 个，结构化结果里是全部', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ address: `2001:db8::${i + 1}`, prefix: 'p', asn: 1 }));
    db.query.mockResolvedValue([rows]);
    const result = await toolService.executeTool('query_database', { asn: 1 }, { user });
    expect(result.result.addresses).toHaveLength(30);
    expect(result.message.split('\n')).toHaveLength(21);
  });

  test('没有结果', async () => {
    db.query.mockResolvedValue([[]]);
    const result = await toolService.executeTool('query_database', { country: 1 }, { user });
    expect(result.success).toBe(true);
    expect(result.message).toBe('没有符合条件的地址');
  });

  test('指定协议时按“支持该协议”筛选', async () => {
    db.query.mockResolvedValue([[]]);
    await toolService.executeTool('query_database', { protocolType: 3 }, { user });
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).toContain('ap.protocol_id = ?');
    expect(args).toContain(3);
  });

  test.each([
    [{ limit: 1001 }, /limit/],
    [{ limit: 0 }, /limit/],
    [{ limit: 'abc' }, /limit/],
    [{ asn: 'abc' }, /asn/],
    [{ prefix: "x'; DROP TABLE users;--" }, /前缀/],
    [{ hasVulnerability: 'maybe' }, /hasVulnerability/],
    [{ firstSeenAfter: '昨天' }, /firstSeenAfter/]
  ])('非法参数 %j 被拒绝，不查询数据库', async (params, pattern) => {
    const result = await toolService.executeTool('query_database', params, { user });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('数据库出错时不泄露内部信息', async () => {
    db.query.mockRejectedValue(new Error("Table 'ipv6_project.secret' doesn't exist"));
    const result = await toolService.executeTool('query_database', { asn: 1 }, { user });
    expect(result).toEqual({ success: false, tool: 'query_database', error: '查询失败' });
  });
});

describe('apd_detect', () => {
  test('未确认时只返回待确认请求', async () => {
    const result = await toolService.executeTool('apd_detect', { prefixes: '2001:db8:1::/64' }, { user });
    expect(result.needsConfirmation).toBe(true);
    expect(result.params).toEqual({ prefixes: ['2001:db8:1::/64'], rate: '100K' });
    expect(mockEnqueueApd).not.toHaveBeenCalled();
  });

  test('确认后以当前用户入队', async () => {
    mockEnqueueApd.mockResolvedValue({ taskId: 77, prefixCount: 2, probeCount: 32, rate: '100K' });
    const result = await toolService.executeTool('apd_detect', { prefixes: '2001:db8:1::/64, 2001:db8:2::/64\n', rate: '1M' }, { user, confirmed: true });
    expect(result.success).toBe(true);
    expect(result.result.taskId).toBe(77);
    expect(mockEnqueueApd).toHaveBeenCalledWith({
      user,
      body: expect.objectContaining({ prefixes: ['2001:db8:1::/64', '2001:db8:2::/64'], rate: '1M' })
    });
  });

  test('扫描策略拒绝（不在白名单）时原样返回原因', async () => {
    mockEnqueueApd.mockRejectedValue(new Error('目标不在扫描白名单内'));
    const result = await toolService.executeTool('apd_detect', { prefixes: '2001:db8:1::/64' }, { user, confirmed: true });
    expect(result).toEqual({ success: false, tool: 'apd_detect', error: '目标不在扫描白名单内' });
  });

  test.each([
    [{ prefixes: '2001:db8::1' }, /前缀格式无效/],
    [{ prefixes: 'abc/64!' }, /前缀格式无效/],
    [{ prefixes: '2001:db8::/64', rate: '1; rm -rf /' }, /rate/]
  ])('非法参数 %j 被拒绝', async (params, pattern) => {
    const result = await toolService.executeTool('apd_detect', params, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(mockEnqueueApd).not.toHaveBeenCalled();
  });

  test('前缀数量超过上限', async () => {
    const prefixes = Array.from({ length: 201 }, (_, i) => `2001:db8:${i.toString(16)}::/64`).join(',');
    const result = await toolService.executeTool('apd_detect', { prefixes }, { user, confirmed: true });
    expect(result.error).toMatch(/超过 200/);
  });
});

describe('generate_targets', () => {
  const algorithm = 'density-expand';

  test('未确认只返回待确认请求，参数被规范化', async () => {
    const result = await toolService.executeTool('generate_targets', { algorithm, seedAsn: '64500' }, { user });
    expect(result.needsConfirmation).toBe(true);
    expect(result.params).toEqual({ algorithm, seedAsn: 64500, budget: 10000 });
    expect(mockEnqueueTga).not.toHaveBeenCalled();
  });

  test('确认后入队', async () => {
    mockEnqueueTga.mockResolvedValue({ taskId: 5, algorithm, budget: 500, seedSource: 'file' });
    const result = await toolService.executeTool('generate_targets', { algorithm, seedFile: 'seeds.txt', budget: 500 }, { user, confirmed: true });
    expect(result.success).toBe(true);
    expect(result.result.taskId).toBe(5);
    expect(mockEnqueueTga).toHaveBeenCalledWith({
      user,
      body: expect.objectContaining({ algorithm, seedFile: 'seeds.txt', budget: 500 })
    });
  });

  test('服务层校验失败时返回其消息', async () => {
    mockEnqueueTga.mockRejectedValue(new Error('文件不存在'));
    const result = await toolService.executeTool('generate_targets', { algorithm, seedFile: 'nope.txt' }, { user, confirmed: true });
    expect(result).toEqual({ success: false, tool: 'generate_targets', error: '文件不存在' });
  });

  test.each([
    [{ algorithm: 'no-such' }, /未知算法/],
    [{ algorithm }, /必须且只能提供一个/],
    [{ algorithm, seedFile: 'a.txt', seedAsn: 1 }, /必须且只能提供一个/],
    [{ algorithm, seedFile: '../etc/passwd' }, /种子文件名无效/],
    [{ algorithm, seedPrefix: 'zzz' }, /种子前缀/],
    [{ algorithm, seedAsn: 1, budget: 100001 }, /budget/],
    [{ algorithm, seedAsn: 1, budget: 0 }, /budget/]
  ])('非法参数 %j 被拒绝', async (params, pattern) => {
    const result = await toolService.executeTool('generate_targets', params, { user, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(mockEnqueueTga).not.toHaveBeenCalled();
  });

  test('工具描述里列出全部可用算法', () => {
    const { ALGORITHMS } = require('../services/tgaAlgorithms');
    const description = toolService.TOOL_REGISTRY.generate_targets.description;
    for (const id of Object.keys(ALGORITHMS)) expect(description).toContain(id);
  });
});

describe('enrich', () => {
  test('普通用户不能使用', async () => {
    const result = await toolService.executeTool('enrich', { asn: 1 }, { user, confirmed: true });
    expect(result).toEqual({ success: false, tool: 'enrich', error: '没有权限使用该工具' });
    expect(mockEnqueueEnrich).not.toHaveBeenCalled();
  });

  test('管理员：未确认不入队，确认后入队', async () => {
    const pending = await toolService.executeTool('enrich', { asn: '64500' }, { user: admin });
    expect(pending.needsConfirmation).toBe(true);
    expect(pending.params).toEqual({ asn: 64500 });
    expect(mockEnqueueEnrich).not.toHaveBeenCalled();

    mockEnqueueEnrich.mockResolvedValue({ taskId: 3, scope: { asn: 64500 } });
    const done = await toolService.executeTool('enrich', { asn: 64500, limit: 1000 }, { user: admin, confirmed: true });
    expect(done.success).toBe(true);
    expect(mockEnqueueEnrich).toHaveBeenCalledWith({ user: admin, body: expect.objectContaining({ asn: 64500, limit: 1000 }) });
  });

  test.each([
    [{}, /必须且只能提供一个/],
    [{ asn: 1, countryId: 2 }, /必须且只能提供一个/],
    [{ asn: 'x' }, /asn/],
    [{ prefixId: 1, limit: 0 }, /limit/]
  ])('非法参数 %j 被拒绝', async (params, pattern) => {
    const result = await toolService.executeTool('enrich', params, { user: admin, confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(mockEnqueueEnrich).not.toHaveBeenCalled();
  });

  test('服务层拒绝时返回其消息', async () => {
    mockEnqueueEnrich.mockRejectedValue(new Error('缺少 random 类型'));
    const result = await toolService.executeTool('enrich', { asn: 1 }, { user: admin, confirmed: true });
    expect(result.error).toBe('缺少 random 类型');
  });
});

describe('task_status', () => {
  const row = (extra = {}) => ({
    id: 1700000000001, task_type: 'xmap', status: 'completed', description: '扫描', error_message: null,
    exit_code: 0, created_at: 'c', started_at: 's', completed_at: 'e', ...extra
  });

  test('普通用户只查自己的任务，且不返回服务器路径', async () => {
    db.query.mockResolvedValue([[row()]]);
    const result = await toolService.executeTool('task_status', { taskId: 1700000000001 }, { user });
    expect(result.success).toBe(true);
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).toContain('user_id = ?');
    expect(sql).not.toMatch(/output_path|log_path|command|params/);
    expect(args).toEqual([1700000000001, 9, 1]);
    expect(result.result.tasks[0]).toMatchObject({ taskId: 1700000000001, type: 'xmap', status: 'completed' });
    expect(result.message).toBe('1700000000001：xmap 已完成');
  });

  test('管理员可以查任何任务', async () => {
    db.query.mockResolvedValue([[row()]]);
    await toolService.executeTool('task_status', { taskId: 5 }, { user: admin });
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).not.toContain('user_id');
    expect(args).toEqual([5, 1]);
  });

  test('任务不存在或不属于自己：同样的“没有找到”', async () => {
    db.query.mockResolvedValue([[]]);
    const result = await toolService.executeTool('task_status', { taskId: 5 }, { user });
    expect(result).toEqual({ success: false, tool: 'task_status', error: '没有找到任务 5' });
  });

  test('不给 taskId 时列出最近的任务，错误信息被截断', async () => {
    db.query.mockResolvedValue([[row({ id: 2, status: 'failed', error_message: 'x'.repeat(1000) }), row({ id: 1, status: 'running' })]]);
    const result = await toolService.executeTool('task_status', {}, { user });
    expect(db.query.mock.calls[0][1]).toEqual([9, 5]);
    expect(result.result.tasks).toHaveLength(2);
    expect(result.result.tasks[0].error).toHaveLength(300);
    expect(result.message).toContain('2：xmap 失败');
    expect(result.message).toContain('1：xmap 运行中');
  });

  test('没有任务', async () => {
    db.query.mockResolvedValue([[]]);
    const result = await toolService.executeTool('task_status', { limit: 3 }, { user });
    expect(result.message).toBe('还没有任务');
  });

  test.each([[{ taskId: 'abc' }], [{ taskId: 0 }], [{ limit: 21 }]])('非法参数 %j 被拒绝', async (params) => {
    const result = await toolService.executeTool('task_status', params, { user });
    expect(result.success).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('没有登录用户或数据库出错', async () => {
    expect((await toolService.executeTool('task_status', {}, {})).error).toBe('未登录');
    db.query.mockRejectedValue(new Error('boom'));
    expect(await toolService.executeTool('task_status', {}, { user })).toEqual({ success: false, tool: 'task_status', error: '查询任务状态失败' });
  });
});

describe('模型调用参数校验（validateToolParams）', () => {
  test('新工具的必需参数与类型', () => {
    expect(toolService.validateToolParams('apd_detect', {}).errors).toContain('缺少必需参数: prefixes');
    expect(toolService.validateToolParams('generate_targets', { seedAsn: 'abc' }).errors).toEqual(
      expect.arrayContaining(['缺少必需参数: algorithm', '参数 seedAsn 必须是数字'])
    );
    expect(toolService.validateToolParams('task_status', { taskId: 5, confirmed: true }).errors).toEqual(['未知参数: confirmed']);
    expect(toolService.validateToolParams('query_database', {}).valid).toBe(true);
  });
});
