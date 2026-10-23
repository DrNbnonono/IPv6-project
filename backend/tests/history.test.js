/**
 * 批次历史与差异（P3-4）：迁移可用性检测、批次列表、差异计数/列表/分页与各类校验，
 * 以及 /api/addresses/batches、/diff 的登录要求和错误映射。
 * 数据库用 mock，SQL 语义（新增/消失/保留）由真实 MariaDB 的端到端脚本验证。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const history = require('../services/historyService');

const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;

const BATCHES = {
  1: { batch_id: 1, task_id: 10, task_type: 'import', prefix_id: 7, target_scope: '2001:db8::/48', new_count: 4, seen_count: 0, skipped_count: 0, addr_count: 4 },
  3: { batch_id: 3, task_id: 12, task_type: 'import', prefix_id: 7, target_scope: '2001:db8::/48', new_count: 1, seen_count: 2, skipped_count: 0, addr_count: 3 },
  4: { batch_id: 4, task_id: 13, task_type: 'import', prefix_id: 9, target_scope: '2001:db9::/48', new_count: 1, seen_count: 0, skipped_count: 0, addr_count: 1 },
  5: { batch_id: 5, task_id: 14, task_type: 'import', prefix_id: null, target_scope: null, new_count: 0, seen_count: 0, skipped_count: 0, addr_count: 0 }
};

let available;
let procAvailable;
let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      return [[{ id: params[0], phone: `1380000000${params[0]}`, role: 'user' }]];
    }
    if (/information_schema\.COLUMNS/.test(sql)) {
      if (available instanceof Error) throw available;
      return [available ? [{}, {}, {}] : [{}]];
    }
    if (/information_schema\.ROUTINES/.test(sql)) return [procAvailable ? [{ ROUTINE_NAME: params[0] }] : []];
    for (const [pattern, fn] of Object.entries(handlers)) if (new RegExp(pattern).test(sql)) return fn(sql, params);
    if (/FROM scan_batches WHERE batch_id = \?/.test(sql)) return [BATCHES[params[0]] ? [BATCHES[params[0]]] : []];
    return [[]];
  });
};
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  history.resetAvailabilityCache();
  available = true;
  procAvailable = true;
  installDb();
});

describe('historyAvailable', () => {
  test('三列都存在才算可用；可用后不再重复查询', async () => {
    expect(await history.historyAvailable()).toBe(true);
    expect(await history.historyAvailable()).toBe(true);
    expect(calls(/information_schema/)).toHaveLength(2); // 列表检查 + 存储过程检查各一次
  });

  test('缺列返回 false，短时间内缓存；重置缓存后重新检测', async () => {
    available = false;
    expect(await history.historyAvailable()).toBe(false);
    expect(await history.historyAvailable()).toBe(false);
    expect(calls(/information_schema/)).toHaveLength(1);
    available = true;
    history.resetAvailabilityCache();
    expect(await history.historyAvailable()).toBe(true);
  });

  test('列和表都在但存储过程 v2 缺失 → 不可用（回退到原过程）', async () => {
    procAvailable = false;
    expect(await history.historyAvailable()).toBe(false);
    expect(await history.importProcedure()).toBe('batch_import_ipv6_addresses');
  });

  test('importProcedure：可用时用 v2', async () => {
    expect(await history.importProcedure()).toBe('batch_import_ipv6_addresses_v2');
  });

  test('查询出错按不可用处理', async () => {
    available = new Error('denied');
    expect(await history.historyAvailable()).toBe(false);
  });
});

describe('listBatches', () => {
  test('分页与总数；可按前缀过滤', async () => {
    installDb({
      'COUNT\\(\\*\\) AS total FROM scan_batches': () => [[{ total: 45 }]],
      'FROM scan_batches b': () => [[BATCHES[3], BATCHES[1]]]
    });
    const r = await history.listBatches({ prefixId: '7', page: '2', limit: '20' });
    expect(r.batches).toHaveLength(2);
    expect(r.pagination).toEqual({ total: 45, page: 2, perPage: 20, totalPages: 3 });
    const [sql, params] = calls(/ORDER BY b\.batch_id DESC/)[0];
    expect(sql).toMatch(/WHERE b\.prefix_id = \?/);
    expect(params).toEqual([7, 20, 20]);
  });

  test('不过滤时没有 WHERE；limit 被限制在 1–100', async () => {
    installDb({ 'COUNT\\(\\*\\) AS total': () => [[{ total: 0 }]] });
    const r = await history.listBatches({ limit: '9999' });
    expect(r.pagination.perPage).toBe(100);
    expect(r.pagination.totalPages).toBe(1);
    expect(calls(/FROM scan_batches b\s+WHERE/)).toHaveLength(0);
  });

  test('prefixId 非法 → 400；迁移未应用 → 503', async () => {
    await expect(history.listBatches({ prefixId: 'abc' })).rejects.toMatchObject({ status: 400 });
    history.resetAvailabilityCache();
    available = false;
    await expect(history.listBatches()).rejects.toMatchObject({ status: 503 });
  });
});

describe('diffBatches', () => {
  const countInstall = (counts, list = []) => installDb({
    'SELECT COUNT\\(\\*\\) AS n FROM active_addresses': (sql) => {
      if (/first_batch_id > \?/.test(sql)) return [[{ n: counts.new }]];
      if (/last_batch_id < \?/.test(sql)) return [[{ n: counts.gone }]];
      return [[{ n: counts.persisted }]];
    },
    'SELECT address_id, address, first_batch_id': () => [list]
  });

  test('只返回三类数量，且使用批次所属前缀与各自的条件', async () => {
    countInstall({ new: 3, gone: 2, persisted: 5 });
    const r = await history.diffBatches({ batchA: '1', batchB: '3' });
    expect(r.counts).toEqual({ new: 3, gone: 2, persisted: 5 });
    expect(r.prefixId).toBe(7);
    expect(r.addresses).toBeUndefined();
    const counting = calls(/COUNT\(\*\) AS n FROM active_addresses/);
    expect(counting).toHaveLength(3);
    expect(counting[0][1]).toEqual([7, 1, 3]); // new：first > A AND first <= B
    expect(counting[1][1]).toEqual([7, 1, 3, 1]); // gone：last >= A AND last < B AND (first NULL OR first <= A)
    expect(counting[2][1]).toEqual([7, 3, 1]); // persisted：last >= B AND (first NULL OR first <= A)
  });

  test('列表按 address_id 键集分页：多取一条判断是否还有下一页', async () => {
    const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ address_id: 100 + i, address: `2001:db8::${i}`, first_batch_id: 3, last_batch_id: 3 }));
    countInstall({ new: 3, gone: 0, persisted: 0 }, rowsOf(3));
    const r = await history.diffBatches({ batchA: 1, batchB: 3, kind: 'new', pageSize: 2, after: '99' });
    expect(r.addresses).toHaveLength(2);
    expect(r.hasMore).toBe(true);
    expect(r.next).toBe(101);
    const [sql, params] = calls(/SELECT address_id, address/)[0];
    expect(sql).toMatch(/address_id > \?/);
    expect(params.slice(-2)).toEqual([99, 3]); // after, size+1
    // 翻页请求不重算数量
    expect(r.counts).toBeNull();
    expect(calls(/COUNT\(\*\) AS n FROM active_addresses/)).toHaveLength(0);
  });

  test('最后一页 next 为 null；pageSize 上限 200', async () => {
    countInstall({ new: 1, gone: 0, persisted: 0 }, [{ address_id: 5, address: 'a', first_batch_id: 3, last_batch_id: 3 }]);
    const r = await history.diffBatches({ batchA: 1, batchB: 3, kind: 'new', pageSize: '100000' });
    expect(r.hasMore).toBe(false);
    expect(r.next).toBeNull();
    expect(calls(/SELECT address_id, address/)[0][1].slice(-1)[0]).toBe(201);
  });

  test.each([
    [{ batchA: 3, batchB: 1 }, 400, '早于'],
    [{ batchA: 1, batchB: 1 }, 400, '早于'],
    [{ batchA: 'x', batchB: 3 }, 400, 'batchA'],
    [{ batchA: 1, batchB: 3, kind: 'zzz' }, 400, 'kind'],
    [{ batchA: 1, batchB: 99 }, 404, '99'],
    [{ batchA: 1, batchB: 4 }, 400, '同一个前缀'],
    [{ batchA: 4, batchB: 5 }, 400, '同一个前缀'],
    [{ batchA: 1, batchB: 3, kind: 'new', after: '-1' }, 400, 'after']
  ])('校验 %j → %i', async (input, status, text) => {
    countInstall({ new: 0, gone: 0, persisted: 0 });
    await expect(history.diffBatches(input)).rejects.toMatchObject({ status, message: expect.stringContaining(text) });
  });

  test('迁移未应用 → 503', async () => {
    available = false;
    await expect(history.diffBatches({ batchA: 1, batchB: 3 })).rejects.toMatchObject({ status: 503 });
  });
});

describe('HTTP 接口', () => {
  test('未登录 401', async () => {
    expect((await request(app).get('/api/addresses/batches')).status).toBe(401);
    expect((await request(app).get('/api/addresses/diff?batchA=1&batchB=3')).status).toBe(401);
  });

  test('GET /batches 返回 data.batches 与分页', async () => {
    installDb({
      'COUNT\\(\\*\\) AS total': () => [[{ total: 1 }]],
      'FROM scan_batches b': () => [[BATCHES[1]]]
    });
    const res = await request(app).get('/api/addresses/batches?prefixId=7').set('Authorization', USER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batches[0].batch_id).toBe(1);
    expect(res.body.data.pagination.total).toBe(1);
  });

  test('GET /diff 参数错误 400、批次不存在 404、迁移未应用 503', async () => {
    installDb();
    expect((await request(app).get('/api/addresses/diff?batchA=3&batchB=1').set('Authorization', USER)).status).toBe(400);
    expect((await request(app).get('/api/addresses/diff?batchA=1&batchB=99').set('Authorization', USER)).status).toBe(404);
    history.resetAvailabilityCache();
    available = false;
    const off = await request(app).get('/api/addresses/diff?batchA=1&batchB=3').set('Authorization', USER);
    expect(off.status).toBe(503);
    expect(off.body.success).toBe(false);
  });

  test('未预期的数据库错误 → 500，不泄露内部信息', async () => {
    installDb({ 'COUNT\\(\\*\\) AS total': () => { throw new Error('boom: secret'); } });
    const res = await request(app).get('/api/addresses/batches').set('Authorization', USER);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});
