/**
 * memoryService：短期记忆（内存）与长期记忆（agent_memory 表，db 用 mock）。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), end: jest.fn() }));

const db = require('../database/db');
const memory = require('../services/memoryService');

const { ShortTermMemory, getOrCreateSession, deleteSession, cleanupExpiredSessions, longTermMemory, buildContextualPrompt, MEMORY_CONFIG, MAX_TOOL_HISTORY } = memory;

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue([[]]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ShortTermMemory', () => {
  test('添加消息并按条数上限修剪', () => {
    const stm = new ShortTermMemory('s1');
    for (let i = 0; i < MEMORY_CONFIG.shortTerm.maxMessages + 10; i++) stm.addMessage('user', `m${i}`);
    expect(stm.getAllMessages()).toHaveLength(MEMORY_CONFIG.shortTerm.maxMessages);
    expect(stm.getAllMessages()[0].content).toBe('m10');
  });

  test('超过 token 上限时从最旧的开始丢弃，至少保留 2 条', () => {
    const stm = new ShortTermMemory('s2');
    const big = 'x'.repeat(MEMORY_CONFIG.shortTerm.maxTokens * 4); // 单条就达到上限
    stm.addMessage('user', big);
    stm.addMessage('assistant', big);
    stm.addMessage('user', big);
    expect(stm.getAllMessages().length).toBeGreaterThanOrEqual(2);
    expect(stm.getAllMessages().length).toBeLessThan(3);
  });

  test('getRecentMessages 返回最近 N 条；estimateTokens 约为字符数 / 4', () => {
    const stm = new ShortTermMemory('s3');
    ['aaaa', 'bbbb', 'cccc'].forEach((c) => stm.addMessage('user', c));
    expect(stm.getRecentMessages(2).map((m) => m.content)).toEqual(['bbbb', 'cccc']);
    expect(stm.estimateTokens()).toBe(3);
  });

  test('超时判断、clear、摘要', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const stm = new ShortTermMemory('s4');
    stm.addMessage('user', 'hi');
    expect(stm.isExpired()).toBe(false);
    jest.setSystemTime(Date.now() + MEMORY_CONFIG.shortTerm.sessionTimeout + 1);
    expect(stm.isExpired()).toBe(true);
    expect(stm.getSummary()).toMatchObject({ sessionId: 's4', messageCount: 1, isExpired: true });
    stm.clear();
    expect(stm.getAllMessages()).toEqual([]);
  });
});

describe('会话存储', () => {
  test('getOrCreateSession 复用同一会话；超时则清空内容', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const a = getOrCreateSession('sess-a');
    a.addMessage('user', 'hello');
    expect(getOrCreateSession('sess-a')).toBe(a);

    jest.setSystemTime(Date.now() + MEMORY_CONFIG.shortTerm.sessionTimeout + 1);
    const again = getOrCreateSession('sess-a');
    expect(again).toBe(a);
    expect(again.getAllMessages()).toEqual([]);
    deleteSession('sess-a');
  });

  test('deleteSession 与 cleanupExpiredSessions', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const keep = getOrCreateSession('keep');
    const old = getOrCreateSession('old');
    old.addMessage('user', 'x');
    jest.setSystemTime(Date.now() + MEMORY_CONFIG.shortTerm.sessionTimeout + 1);
    keep.addMessage('user', 'refresh'); // 刷新 lastAccessedAt
    cleanupExpiredSessions();
    expect(getOrCreateSession('keep')).toBe(keep);
    expect(getOrCreateSession('old')).not.toBe(old);
    deleteSession('keep');
    deleteSession('old');
  });
});

describe('长期记忆', () => {
  test('saveUserPreference：每个用户一个 key，重复保存走 ON DUPLICATE KEY UPDATE', async () => {
    const r = await longTermMemory.saveUserPreference('7', { theme: 'dark' });
    expect(r).toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(params[1]).toBe('agent:user:preferences:7');
    expect(JSON.parse(params[2])).toEqual({ theme: 'dark' });
  });

  test('getUserPreference：有记录与无记录', async () => {
    db.query.mockResolvedValueOnce([[{ memory_value: '{"lang":"zh"}' }]]);
    expect(await longTermMemory.getUserPreference('7')).toEqual({ success: true, data: { lang: 'zh' } });
    db.query.mockResolvedValueOnce([[]]);
    expect(await longTermMemory.getUserPreference('7')).toEqual({ success: true, data: null });
  });

  test('数据库出错时返回 success:false 而不是抛出', async () => {
    db.query.mockRejectedValueOnce(new Error('db down'));
    const r = await longTermMemory.getUserPreference('7');
    expect(r).toEqual({ success: false, error: 'db down' });
  });

  test('addToolHistory：key 带唯一后缀（同一工具连续记录不会撞唯一索引），并裁剪旧记录', async () => {
    await longTermMemory.addToolHistory('7', 'xmap_scan', { a: 1 }, { ok: true });
    await longTermMemory.addToolHistory('7', 'xmap_scan', { a: 2 }, { ok: true });
    const inserts = db.query.mock.calls.filter(([sql]) => /INSERT INTO agent_memory/.test(sql));
    expect(inserts).toHaveLength(2);
    const keys = inserts.map(([, p]) => p[1]);
    expect(keys[0]).toMatch(/^agent:tool:history:xmap_scan#/);
    expect(keys[0]).not.toBe(keys[1]);

    const prune = db.query.mock.calls.find(([sql]) => /DELETE FROM agent_memory/.test(sql));
    expect(prune[1]).toEqual(['7', '7', MAX_TOOL_HISTORY]);
  });

  test('addToolHistory：过大的结果只保存预览，不超过字段上限', async () => {
    await longTermMemory.addToolHistory('7', 'big', {}, { data: 'y'.repeat(100000) });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO agent_memory/.test(sql));
    const stored = insert[1][2];
    expect(stored.length).toBeLessThanOrEqual(16 * 1024 + 50);
    expect(JSON.parse(stored).truncated).toBe(true);
  });

  test('getToolHistory：按工具精确匹配，LIKE 中的通配符被转义，toolName 去掉前缀和后缀', async () => {
    db.query.mockResolvedValueOnce([[
      { memory_key: 'agent:tool:history:xmap_scan#1700000000000_ab12cd', memory_value: '{"params":{"a":1},"result":{"ok":1},"timestamp":1}' },
      { memory_key: 'agent:tool:history:xmap_scan', memory_value: '{"params":{},"result":{},"timestamp":2}' } // 旧数据，无后缀
    ]]);
    const r = await longTermMemory.getToolHistory('7', 'xmap_scan', 5);
    expect(r.data.map((h) => h.toolName)).toEqual(['xmap_scan', 'xmap_scan']);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/memory_key = \? OR memory_key LIKE \?/);
    expect(params).toEqual(['7', 'tool_history', 'agent:tool:history:xmap_scan', 'agent:tool:history:xmap\\_scan#%', 5]);

    await longTermMemory.getToolHistory('7', '100%');
    expect(db.query.mock.calls[1][1][3]).toBe('agent:tool:history:100\\%#%');
  });

  test('saveKnowledge：同一分类可保存多条（key 唯一）', async () => {
    await longTermMemory.saveKnowledge('7', 'ipv6', 'a');
    await longTermMemory.saveKnowledge('7', 'ipv6', 'b');
    const keys = db.query.mock.calls.map(([, p]) => p[1]);
    expect(keys[0]).toMatch(/^agent:knowledge:ipv6#/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('searchKnowledge：关键词匹配并按得分排序，分类名去掉后缀', async () => {
    db.query.mockResolvedValueOnce([[
      { memory_key: 'agent:knowledge:ipv6#1_a', memory_value: JSON.stringify({ content: 'IPv6 scanning with xmap is fast and efficient', metadata: { src: 'doc' } }) },
      { memory_key: 'agent:knowledge:ipv6#2_b', memory_value: JSON.stringify({ content: 'xmap' }) },
      { memory_key: 'agent:knowledge:dns#3_c', memory_value: JSON.stringify('nothing relevant') }
    ]]);
    const r = await longTermMemory.searchKnowledge('7', 'XMAP', 'ipv6');
    expect(r.data.map((x) => x.content)).toEqual(['xmap', 'IPv6 scanning with xmap is fast and efficient']);
    expect(r.data[0].category).toBe('ipv6');
    expect(r.data[1].metadata).toEqual({ src: 'doc' });
    expect(db.query.mock.calls[0][1]).toEqual(['7', 'agent:knowledge:ipv6%']);
  });

  test('getMemorySummary 与 clearAllMemory', async () => {
    db.query.mockResolvedValueOnce([[{ memory_type: 'preference', count: 1 }, { memory_type: 'tool_history', count: 4 }]]);
    expect(await longTermMemory.getMemorySummary('7')).toEqual({ success: true, data: { preferences: 1, toolHistory: 4, knowledge: 0 } });

    expect(await longTermMemory.clearAllMemory('7')).toEqual({ success: true });
    expect(db.query).toHaveBeenLastCalledWith('DELETE FROM agent_memory WHERE user_id = ?', ['7']);
  });
});

describe('buildContextualPrompt', () => {
  test('没有任何上下文时原样返回', async () => {
    expect(await buildContextualPrompt('7', '你好')).toBe('你好');
  });

  test('加入用户偏好与最近使用的工具', async () => {
    db.query
      .mockResolvedValueOnce([[{ memory_value: '{"lang":"zh"}' }]])
      .mockResolvedValueOnce([[{ memory_key: 'agent:tool:history:xmap_scan#1_a', memory_value: '{}' }, { memory_key: 'agent:tool:history:zgrab2_scan#2_b', memory_value: '{}' }]]);
    const prompt = await buildContextualPrompt('7', '扫描一下', { includeToolHistory: true });
    expect(prompt).toContain('[上下文]');
    expect(prompt).toContain('用户偏好：{"lang":"zh"}');
    expect(prompt).toContain('最近使用的工具：xmap_scan, zgrab2_scan');
    expect(prompt.endsWith('[用户请求]\n扫描一下')).toBe(true);
  });
});
