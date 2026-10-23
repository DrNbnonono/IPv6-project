/**
 * 地址时间维度与批次差异（P3-4）。
 *
 * 数据模型（迁移 sql/12-address-history.sql）：
 *   scan_batches                      每次导入一个批次（任务、前缀、起止时间、新增/再次观察/跳过数量）
 *   active_addresses.first_batch_id   地址首次被批次观察到（NULL = 追踪开始前就存在）
 *   active_addresses.last_batch_id    地址最近一次被批次观察到
 *
 * 两个批次 A < B（必须属于同一前缀）之间的差异定义——只依据 first/last 两个端点，
 * 把一个地址的观察历史当作 [first, last] 的连续区间，所以“中间某批漏掉、后来又出现”的地址不会被识别为消失：
 *   新增  first_batch_id 在 (A, B]            A 之后首次出现、截至 B 已存在
 *   消失  A 时已存在，last_batch_id 在 [A, B)   最近一次观察早于 B；之后又被观察到（last >= B）的不算消失
 *   保留  A 时已存在，last_batch_id >= B
 * “A 时已存在” = first_batch_id <= A，或 first_batch_id 为 NULL（追踪前就有，只在 last 有值时才能判断去向）。
 * 追踪前就有、且从未被再次观察到的地址（两列都是 NULL）无法判断，不出现在任何一类里。
 */

const db = require('../database/db');

class HistoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'HistoryError';
    this.status = status;
  }
}

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const KINDS = ['new', 'gone', 'persisted'];

// 迁移是否已应用：true 可以长期缓存，false 只缓存很短时间（管理员刚执行完迁移不必重启服务）
let availability = { value: null, at: 0 };
const AVAILABLE_RECHECK_MS = 15000;

const historyAvailable = async () => {
  if (availability.value === true) return true;
  if (availability.value === false && Date.now() - availability.at < AVAILABLE_RECHECK_MS) return false;
  let ok = false;
  try {
    const found = rows(await db.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'active_addresses' AND COLUMN_NAME IN ('first_batch_id', 'last_batch_id'))
           OR (TABLE_NAME = 'scan_batches' AND COLUMN_NAME = 'batch_id'))`
    ));
    ok = found.length === 3;
  } catch (error) {
    ok = false;
  }
  availability = { value: ok, at: Date.now() };
  return ok;
};

const resetAvailabilityCache = () => {
  availability = { value: null, at: 0 };
};

const requireHistory = async () => {
  if (!(await historyAvailable())) {
    throw new HistoryError('历史功能尚未启用：请先执行数据库迁移 12-address-history.sql（node scripts/migrate.js）', 503);
  }
};

const toId = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) throw new HistoryError(`${label} 必须是正整数`);
  return n;
};

/** 批次列表（新到旧）。prefixId 可选。 */
const listBatches = async ({ prefixId, page = 1, limit = 20 } = {}) => {
  await requireHistory();
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const where = [];
  const args = [];
  if (prefixId !== undefined && prefixId !== null && prefixId !== '') {
    where.push('b.prefix_id = ?');
    args.push(toId(prefixId, 'prefixId'));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = rows(await db.query(`SELECT COUNT(*) AS total FROM scan_batches b ${clause}`, args));
  const batches = rows(await db.query(
    `SELECT b.batch_id, b.task_id, b.task_type, b.prefix_id, b.target_scope, b.started_at, b.finished_at,
            b.new_count, b.seen_count, b.skipped_count, b.addr_count
     FROM scan_batches b ${clause}
     ORDER BY b.batch_id DESC LIMIT ? OFFSET ?`,
    [...args, perPage, (current - 1) * perPage]
  ));
  return {
    batches,
    pagination: { total: Number(total), page: current, perPage, totalPages: Math.max(Math.ceil(Number(total) / perPage), 1) }
  };
};

const loadBatch = async (id) => {
  const [batch] = rows(await db.query(
    'SELECT batch_id, task_id, task_type, prefix_id, target_scope, started_at, finished_at, new_count, seen_count, skipped_count, addr_count FROM scan_batches WHERE batch_id = ?',
    [id]
  ));
  if (!batch) throw new HistoryError(`批次 ${id} 不存在`, 404);
  return batch;
};

// 三类的 WHERE 条件（prefix_id 之外），参数顺序与条件中的 ? 一致
const conditionFor = (kind, a, b) => {
  switch (kind) {
    case 'new':
      return { sql: 'first_batch_id > ? AND first_batch_id <= ?', args: [a, b] };
    case 'gone':
      return { sql: 'last_batch_id >= ? AND last_batch_id < ? AND (first_batch_id IS NULL OR first_batch_id <= ?)', args: [a, b, a] };
    case 'persisted':
      return { sql: 'last_batch_id >= ? AND (first_batch_id IS NULL OR first_batch_id <= ?)', args: [b, a] };
    default:
      throw new HistoryError(`kind 只能是 ${KINDS.join(' / ')}`);
  }
};

/**
 * 两个批次的差异：三类数量 + 指定类别的地址（按 address_id 键集分页）。
 * kind 省略时只返回数量。after 为上一页最后一个 address_id。
 */
const diffBatches = async ({ batchA, batchB, kind, after, pageSize } = {}) => {
  await requireHistory();
  const a = toId(batchA, 'batchA');
  const b = toId(batchB, 'batchB');
  if (a >= b) throw new HistoryError('batchA 必须早于 batchB（batchA < batchB）');
  if (kind !== undefined && kind !== '' && !KINDS.includes(kind)) throw new HistoryError(`kind 只能是 ${KINDS.join(' / ')}`);

  const [first, second] = await Promise.all([loadBatch(a), loadBatch(b)]);
  if (first.prefix_id === null || first.prefix_id === undefined || String(first.prefix_id) !== String(second.prefix_id)) {
    throw new HistoryError('两个批次不属于同一个前缀，无法比较');
  }
  const prefixId = first.prefix_id;

  const counts = {};
  for (const k of KINDS) {
    const cond = conditionFor(k, a, b);
    const [{ n }] = rows(await db.query(`SELECT COUNT(*) AS n FROM active_addresses WHERE prefix_id = ? AND ${cond.sql}`, [prefixId, ...cond.args]));
    counts[k] = Number(n);
  }

  const result = { prefixId: Number(prefixId), batchA: first, batchB: second, counts };
  if (kind) {
    const size = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = after === undefined || after === '' ? 0 : toId(after, 'after');
    const cond = conditionFor(kind, a, b);
    const list = rows(await db.query(
      `SELECT address_id, address, first_batch_id, last_batch_id FROM active_addresses
       WHERE prefix_id = ? AND ${cond.sql} AND address_id > ?
       ORDER BY address_id LIMIT ?`,
      [prefixId, ...cond.args, afterId, size + 1]
    ));
    const hasMore = list.length > size;
    const items = hasMore ? list.slice(0, size) : list;
    Object.assign(result, {
      kind,
      addresses: items,
      hasMore,
      next: hasMore ? Number(items[items.length - 1].address_id) : null
    });
  }
  return result;
};

module.exports = { HistoryError, KINDS, historyAvailable, resetAvailabilityCache, listBatches, diffBatches };
