/**
 * 审计服务
 * 记录谁在什么时候做了什么：登录、创建/取消/删除扫描任务、终端命令、Agent 工具执行、
 * 数据库写操作和管理员对策略/配额的修改。写入 audit_logs 表。
 *
 * 约定：
 * - record() 绝不抛出：审计失败只记日志，不能让业务请求因此失败；
 * - detail 先经过 loggerService 的 maskSensitive 脱敏（密码、token 等），再限制长度；
 * - 只记录“发生了什么”，不记录请求/响应的完整内容。
 */

const db = require('../database/db');
const { maskSensitive, createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('audit');

const MAX_DETAIL_BYTES = 4096;
const MAX_STRING = 300;
const MAX_ACTION = 64; // 与 audit_logs 的列宽一致：action 64、resource_type 32、resource_id 64
const MAX_RESOURCE_TYPE = 32;
const MAX_RESOURCE_ID = 64;

const clip = (value, max) => (value === undefined || value === null ? null : String(value).slice(0, max));

const clipStrings = (value, depth = 0) => {
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (depth >= 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => clipStrings(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clipStrings(item, depth + 1)]));
};

/** 脱敏、截断并序列化 detail；超过大小上限时只保留说明。 */
const serializeDetail = (detail) => {
  if (detail === undefined || detail === null) return null;
  const json = JSON.stringify(clipStrings(maskSensitive(detail)));
  if (Buffer.byteLength(json) > MAX_DETAIL_BYTES) return JSON.stringify({ truncated: true });
  return json;
};

/**
 * 写一条审计记录。
 *   action        动作名，点分格式，如 'auth.login'、'task.create'、'admin.allowlist.add'
 *   resourceType  资源类型（'xmap_task'、'allowlist' …），可省略
 *   resourceId    资源标识，可省略
 *   success       该动作是否成功（默认 true）
 */
const record = async ({ userId = null, action, resourceType = null, resourceId = null, success = true, detail = null, ip = null }) => {
  try {
    if (!action) throw new Error('缺少 action');
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, success, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, clip(action, MAX_ACTION), clip(resourceType, MAX_RESOURCE_TYPE), clip(resourceId, MAX_RESOURCE_ID), success ? 1 : 0, serializeDetail(detail), clip(ip, 45)]
    );
    return true;
  } catch (error) {
    logger.error(`写入审计日志失败（${action}）:`, error.message);
    return false;
  }
};

const toPositiveInt = (value, fallback, max) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

/**
 * 查询审计日志（管理员）。filters: { userId, action, success, since, until, page, pageSize }
 * action 支持前缀匹配：'task' 匹配 'task.create'、'task.cancel' …
 */
const list = async (filters = {}) => {
  const where = [];
  const params = [];

  if (filters.userId) { where.push('a.user_id = ?'); params.push(Number(filters.userId)); }
  if (filters.action) {
    where.push('(a.action = ? OR a.action LIKE ?)');
    params.push(String(filters.action), `${String(filters.action).replace(/[%_\\]/g, '\\$&')}.%`);
  }
  if (filters.success === true || filters.success === false) { where.push('a.success = ?'); params.push(filters.success ? 1 : 0); }
  if (filters.since) { where.push('a.created_at >= ?'); params.push(filters.since); }
  if (filters.until) { where.push('a.created_at <= ?'); params.push(filters.until); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = toPositiveInt(filters.pageSize, 50, 200);
  const page = toPositiveInt(filters.page, 1, 100000);

  const [[totalRow]] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a ${clause}`, params);
  const [rows] = await db.query(
    `SELECT a.id, a.user_id, u.username, a.action, a.resource_type, a.resource_id, a.success, a.detail, a.ip, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${clause}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  const parseDetail = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (error) { return null; }
  };

  return {
    total: Number(totalRow.total),
    page,
    pageSize,
    items: rows.map((row) => ({ ...row, success: Boolean(row.success), detail: parseDetail(row.detail) }))
  };
};

module.exports = { record, list, serializeDetail, MAX_DETAIL_BYTES };
