/**
 * P4-4：Agent 工具调用的审计与工具历史。
 * db 与 llmService 被 mock，toolService / agentService / auditService / memoryService 用真实实现。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('../api/internal', () => ({ xmap: { startScan: jest.fn() }, zgrab2: { createTask: jest.fn() } }));
jest.mock('../services/terminalService', () => ({ createTerminal: jest.fn(), executeCommand: jest.fn() }));

const mockChat = jest.fn();
const mockNative = jest.fn();
jest.mock('../services/llmService', () => ({
  chat: (...args) => mockChat(...args),
  supportsNativeTools: () => mockNative()
}));

const mockAuthUser = { id: 9, role: 'user' };
jest.mock('../middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = mockAuthUser; next(); },
  requireAdmin: (req, res, next) => next()
}));

const express = require('express');
const request = require('supertest');
const db = require('../database/db');
const agentService = require('../services/agentService');
const agentAudit = require('../services/agentAuditService');
const memoryService = require('../services/memoryService');
const internal = require('../api/internal');

const user = { id: 9, role: 'user' };
const reply = (message, toolCalls = []) => ({ message, toolCalls, model: 'm', provider: 'p' });
const taskRow = (extra = {}) => ({ id: 5, task_type: 'xmap', status: 'completed', description: null, error_message: null, exit_code: 0, created_at: null, started_at: null, completed_at: null, ...extra });

const auditInserts = () => db.query.mock.calls.filter(([sql]) => /INSERT INTO audit_logs/.test(sql)).map(([, args]) => ({
  userId: args[0], action: args[1], resourceType: args[2], resourceId: args[3], success: args[4], detail: args[5] ? JSON.parse(args[5]) : null, ip: args[6]
}));
const historyInserts = () => db.query.mock.calls.filter(([sql]) => /INSERT INTO agent_memory/.test(sql)).map(([, args]) => ({
  userId: args[0], key: args[1], value: JSON.parse(args[2])
}));

beforeEach(() => {
  jest.resetAllMocks();
  mockNative.mockReturnValue(true);
  db.query.mockResolvedValue([[]]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('summarizeResult', () => {
  test('只保留成功与否、任务号、数量、退出码和被截断的错误，不含正文', () => {
    expect(agentAudit.summarizeResult({ success: true, tool: 'x', message: '很长的输出', result: { taskId: 7, count: 3, exitCode: 0, addresses: ['a'], stdout: 'secret' } }))
      .toEqual({ success: true, taskId: 7, count: 3, exitCode: 0 });
    expect(agentAudit.summarizeResult({ success: false, error: 'e'.repeat(500) }).error).toHaveLength(301);
    expect(agentAudit.summarizeResult(null)).toEqual({ success: false });
    expect(agentAudit.summarizeResult({ success: true, result: 'text' })).toEqual({ success: true });
  });
});

describe('recordToolHistory', () => {
  test('写入 tool_history，参数脱敏，用户 ID 用字符串', async () => {
    const ok = await agentAudit.recordToolHistory({
      user, tool: 'zgrab2', params: { module: 'http', apiKey: 'sk-secret' }, result: { success: true, result: { taskId: 3 }, message: 'm' }
    });
    expect(ok).toBe(true);
    const [row] = historyInserts();
    expect(row.userId).toBe('9');
    expect(row.key).toMatch(/^agent:tool:history:zgrab2#/);
    expect(row.value.params.module).toBe('http');
    expect(JSON.stringify(row.value)).not.toContain('sk-secret');
    expect(row.value.result).toEqual({ success: true, taskId: 3 });
  });

  test('失败的结果、没有用户、数据库出错都不记，也不抛异常', async () => {
    expect(await agentAudit.recordToolHistory({ user, tool: 'xmap', params: {}, result: { success: false, error: 'x' } })).toBe(false);
    expect(await agentAudit.recordToolHistory({ user: null, tool: 'xmap', params: {}, result: { success: true } })).toBe(false);
    expect(historyInserts()).toHaveLength(0);
    db.query.mockRejectedValue(new Error('db down'));
    await expect(agentAudit.recordToolHistory({ user, tool: 'xmap', params: {}, result: { success: true } })).resolves.toBe(false);
  });
});

describe('对话里的工具事件', () => {
  test('只读工具执行：写审计和工具历史', async () => {
    db.query.mockImplementation(async (sql) => (/FROM tasks/.test(sql) ? [[taskRow()]] : [[]]));
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c', name: 'task_status', arguments: { taskId: 5 } }]))
      .mockResolvedValueOnce(reply('已完成'));
    await agentService.processMessage('任务 5', [], { user, ip: '203.0.113.9' });

    const audits = auditInserts();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: 9, action: 'agent.chat.tool', resourceType: 'agent_tool', resourceId: 'task_status', success: 1, ip: '203.0.113.9' });
    expect(audits[0].detail).toMatchObject({ tool: 'task_status', params: { taskId: 5 }, success: true });
    expect(historyInserts()).toHaveLength(1);
    expect(historyInserts()[0].key).toMatch(/task_status#/);
  });

  test('需要确认的调用：审计记为 pending，没有工具历史', async () => {
    mockChat.mockResolvedValueOnce(reply('', [{ id: 'c', name: 'xmap', arguments: { target: '2001:db8::/64' } }]));
    const res = await agentService.processMessage('扫描', [], { user });
    expect(res.type).toBe('confirmation_required');
    const audits = auditInserts();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'agent.chat.tool_pending', resourceId: 'xmap', success: 1 });
    expect(audits[0].detail.params.target).toBe('2001:db8::/64');
    expect(historyInserts()).toHaveLength(0);
    expect(internal.xmap.startScan).not.toHaveBeenCalled();
  });

  test('参数无效的调用：审计记为 rejected，带原因', async () => {
    mockChat.mockResolvedValueOnce(reply('', [{ id: 'c', name: 'xmap', arguments: { target: '2001:db8::/64', confirmed: true } }]));
    const res = await agentService.processMessage('扫描', [], { user });
    expect(res.type).toBe('text');
    const audits = auditInserts();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'agent.chat.tool_rejected', success: 0 });
    expect(audits[0].detail.errors.join(' ')).toContain('未知参数: confirmed');
    expect(historyInserts()).toHaveLength(0);
  });

  test('工具执行失败：审计 success=0，不写工具历史', async () => {
    db.query.mockImplementation(async (sql) => { if (/FROM tasks/.test(sql)) throw new Error('boom'); return [[]]; });
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c', name: 'task_status', arguments: {} }]))
      .mockResolvedValueOnce(reply('出错了'));
    await agentService.processMessage('任务', [], { user });
    const audits = auditInserts();
    expect(audits[0]).toMatchObject({ action: 'agent.chat.tool', success: 0 });
    expect(historyInserts()).toHaveLength(0);
  });

  test('审计和历史都写失败时，对话照常返回', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/FROM tasks/.test(sql)) return [[taskRow()]];
      throw new Error('audit table missing');
    });
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c', name: 'task_status', arguments: { taskId: 5 } }]))
      .mockResolvedValueOnce(reply('已完成'));
    const res = await agentService.processMessage('任务 5', [], { user });
    expect(res).toMatchObject({ success: true, type: 'tool_execution', message: '已完成' });
  });

  test('一轮多个调用：每个调用各一条记录', async () => {
    db.query.mockImplementation(async (sql) => (/FROM tasks/.test(sql) ? [[taskRow()]] : [[]]));
    mockChat
      .mockResolvedValueOnce(reply('', [
        { id: 'a', name: 'task_status', arguments: { taskId: 1 } },
        { id: 'b', name: 'task_status', arguments: { taskId: 2 } },
        { id: 'c', name: 'zgrab2', arguments: { targets: '2001:db8::1', module: 'http' } }
      ]));
    await agentService.processMessage('x', [], { user });
    expect(auditInserts().map((a) => a.action)).toEqual(['agent.chat.tool', 'agent.chat.tool', 'agent.chat.tool_pending']);
    expect(historyInserts()).toHaveLength(2);
  });

  test('terminal 命令输出不进入审计详情或历史', async () => {
    const admin = { id: 1, role: 'admin' };
    const toolService = require('../services/toolService');
    jest.spyOn(toolService, 'executeTool').mockResolvedValue({
      success: true, tool: 'terminal', result: { command: 'cat /etc/shadow', exitCode: 0, stdout: 'root:$6$secret' }, message: '命令执行成功 root:$6$secret'
    });
    mockChat
      .mockResolvedValueOnce(reply('', [{ id: 'c', name: 'terminal', arguments: { command: 'cat /etc/shadow' } }]))
      .mockResolvedValueOnce(reply('好'));
    await agentService.processMessage('x', [], { user: admin });
    const everything = JSON.stringify([auditInserts(), historyInserts()]);
    expect(everything).not.toContain('root:$6$secret');
    expect(everything).toContain('cat /etc/shadow'); // 命令本身是要审计的内容
    toolService.executeTool.mockRestore();
  });
});

describe('POST /api/agent/tools/execute', () => {
  const makeApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/agent', require('../routes/agent'));
    return app;
  };

  test('确认执行：审计详情含参数与任务号，成功后写工具历史', async () => {
    internal.xmap.startScan.mockResolvedValue({ success: true, taskId: 123, statusCode: 202 });
    const res = await request(makeApp())
      .post('/api/agent/tools/execute')
      .send({ toolName: 'xmap', params: { target: '2001:db8::/64', password: 'p' }, confirmed: true });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));

    const audits = auditInserts();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'agent.tool', resourceId: 'xmap', success: 1 });
    expect(audits[0].detail).toMatchObject({ toolName: 'xmap', confirmed: true, taskId: 123, status: 200 });
    expect(audits[0].detail.params.target).toBe('2001:db8::/64');
    expect(JSON.stringify(audits[0])).not.toContain('"p"');
    expect(historyInserts()).toHaveLength(1);
    expect(historyInserts()[0].value.result).toEqual({ success: true, taskId: 123 });
  });

  test('未确认：审计记 needsConfirmation，不写工具历史', async () => {
    const res = await request(makeApp())
      .post('/api/agent/tools/execute')
      .send({ toolName: 'xmap', params: { target: '2001:db8::/64' } });
    expect(res.status).toBe(409);
    await new Promise((resolve) => setImmediate(resolve));
    const audits = auditInserts();
    expect(audits[0]).toMatchObject({ success: 0 });
    expect(audits[0].detail).toMatchObject({ needsConfirmation: true, confirmed: false });
    expect(audits[0].detail.error).toBeUndefined();
    expect(historyInserts()).toHaveLength(0);
  });

  test('执行失败：审计带失败原因，不写工具历史', async () => {
    internal.xmap.startScan.mockRejectedValue(new Error('目标不在扫描白名单内'));
    const res = await request(makeApp())
      .post('/api/agent/tools/execute')
      .send({ toolName: 'xmap', params: { target: '2001:db8::/64' }, confirmed: true });
    expect(res.status).toBe(400);
    await new Promise((resolve) => setImmediate(resolve));
    expect(auditInserts()[0].detail.error).toBe('目标不在扫描白名单内');
    expect(historyInserts()).toHaveLength(0);
  });
});

test('memoryService 的工具历史接口仍然可用（与 agentAuditService 共用）', () => {
  expect(typeof memoryService.longTermMemory.addToolHistory).toBe('function');
});
