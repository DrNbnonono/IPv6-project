/**
 * 管理员接口：扫描白名单/黑名单、用户配额、审计日志查询、开放 API 密钥。
 * 路由挂在 /api/admin，需要 authenticate + requireAdmin。
 * 所有修改都会写审计日志（action 以 admin. 开头）。
 */

const db = require('../database/db');
const { parseTarget } = require('../services/cidrService');
const scanPolicy = require('../services/scanPolicyService');
const auditService = require('../services/auditService');
const apiKeys = require('../services/apiKeyService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('admin');

const LIST_TABLES = {
  allowlist: { table: 'scan_allowlist', noteColumn: 'description', label: '白名单' },
  blacklist: { table: 'scan_blacklist', noteColumn: 'reason', label: '黑名单' }
};

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const serverError = (res, label, error) => {
  logger.error(`${label}失败:`, error.message);
  return fail(res, 500, `${label}失败`);
};

const audited = (req, action, resourceType, resourceId, detail, success = true) =>
  auditService.record({ userId: req.user.id, action, resourceType, resourceId, success, detail, ip: req.ip });

// ---------- 策略总览 ----------

/** GET /api/admin/scan-policy：内置规则、默认值与两张名单 */
exports.getScanPolicy = async (req, res) => {
  try {
    const [allowlist] = await db.query('SELECT id, cidr, description AS note, created_by, created_at FROM scan_allowlist ORDER BY id');
    const [blacklist] = await db.query('SELECT id, cidr, reason AS note, created_by, created_at FROM scan_blacklist ORDER BY id');
    res.json({ success: true, data: { ...scanPolicy.describePolicy(), allowlist, blacklist } });
  } catch (error) {
    serverError(res, '获取扫描策略', error);
  }
};

// ---------- 白名单 / 黑名单 ----------

const makeAddEntry = (kind) => async (req, res) => {
  const { table, noteColumn, label } = LIST_TABLES[kind];
  const { cidr, note } = req.body || {};

  const range = typeof cidr === 'string' ? parseTarget(cidr.trim()) : null;
  if (!range) return fail(res, 400, '请输入有效的 IP 地址或 CIDR（不接受域名）');
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 255)) {
    return fail(res, 400, '说明必须是不超过 255 个字符的文本');
  }

  try {
    const [result] = await db.query(
      `INSERT INTO ${table} (cidr, ${noteColumn}, created_by) VALUES (?, ?, ?)`,
      [range.text, note || null, req.user.id]
    );
    await audited(req, `admin.${kind}.add`, kind, range.text, { cidr: range.text, note: note || null });
    res.status(201).json({ success: true, message: `已添加到${label}`, data: { id: result.insertId, cidr: range.text } });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') return fail(res, 409, `${range.text} 已在${label}中`);
    serverError(res, `添加${label}`, error);
  }
};

const makeRemoveEntry = (kind) => async (req, res) => {
  const { table, label } = LIST_TABLES[kind];
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return fail(res, 400, '无效的条目 ID');

  try {
    const [rows] = await db.query(`SELECT cidr FROM ${table} WHERE id = ?`, [id]);
    if (!rows || rows.length === 0) return fail(res, 404, '条目不存在');
    await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await audited(req, `admin.${kind}.remove`, kind, rows[0].cidr, { cidr: rows[0].cidr });
    res.json({ success: true, message: `已从${label}移除` });
  } catch (error) {
    serverError(res, `移除${label}条目`, error);
  }
};

exports.addAllowlistEntry = makeAddEntry('allowlist');
exports.removeAllowlistEntry = makeRemoveEntry('allowlist');
exports.addBlacklistEntry = makeAddEntry('blacklist');
exports.removeBlacklistEntry = makeRemoveEntry('blacklist');

// ---------- 用户配额 ----------

const quotaView = (row) => ({
  userId: row.user_id,
  username: row.username,
  maxRate: row.max_rate_bps ? scanPolicy.formatRate(Number(row.max_rate_bps)) : null,
  dailyScanLimit: row.daily_scan_limit === null || row.daily_scan_limit === undefined ? null : Number(row.daily_scan_limit),
  updatedAt: row.updated_at
});

/** GET /api/admin/quotas：已设置自定义配额的用户（其余用户使用 SCAN_* 默认值） */
exports.listQuotas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT q.user_id, u.username, q.max_rate_bps, q.daily_scan_limit, q.updated_at
       FROM user_quotas q JOIN users u ON u.id = q.user_id ORDER BY q.user_id`
    );
    res.json({ success: true, data: { defaults: scanPolicy.describePolicy().defaults, items: rows.map(quotaView) } });
  } catch (error) {
    serverError(res, '获取用户配额', error);
  }
};

/**
 * PUT /api/admin/quotas/:userId  body: { maxRate?: '20M' | null, dailyScanLimit?: 50 | null }
 * 缺省的字段保持不变；传 null 表示恢复默认值。
 */
exports.setQuota = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) return fail(res, 400, '无效的用户 ID');

  const body = req.body || {};
  const hasRate = Object.prototype.hasOwnProperty.call(body, 'maxRate');
  const hasLimit = Object.prototype.hasOwnProperty.call(body, 'dailyScanLimit');
  if (!hasRate && !hasLimit) return fail(res, 400, '请提供 maxRate 或 dailyScanLimit');

  let rateBps = null;
  if (hasRate && body.maxRate !== null) {
    rateBps = scanPolicy.parseRate(body.maxRate);
    if (rateBps === null) return fail(res, 400, '速率格式无效，示例: 10M、500K、1G');
  }
  let limit = null;
  if (hasLimit && body.dailyScanLimit !== null) {
    limit = Number(body.dailyScanLimit);
    if (!Number.isInteger(limit) || limit < 0 || limit > 100000) return fail(res, 400, '每日上限必须是 0~100000 的整数');
  }

  try {
    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!users || users.length === 0) return fail(res, 404, '用户不存在');

    // 未提供的字段沿用现有值
    const [existing] = await db.query('SELECT max_rate_bps, daily_scan_limit FROM user_quotas WHERE user_id = ?', [userId]);
    const current = (existing && existing[0]) || { max_rate_bps: null, daily_scan_limit: null };
    const nextRate = hasRate ? rateBps : current.max_rate_bps;
    const nextLimit = hasLimit ? limit : current.daily_scan_limit;

    await db.query(
      `INSERT INTO user_quotas (user_id, max_rate_bps, daily_scan_limit, updated_by) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE max_rate_bps = VALUES(max_rate_bps), daily_scan_limit = VALUES(daily_scan_limit), updated_by = VALUES(updated_by)`,
      [userId, nextRate, nextLimit, req.user.id]
    );
    await audited(req, 'admin.quota.set', 'user', userId, {
      maxRate: nextRate ? scanPolicy.formatRate(Number(nextRate)) : null,
      dailyScanLimit: nextLimit === undefined ? null : nextLimit
    });
    res.json({ success: true, message: '配额已更新' });
  } catch (error) {
    serverError(res, '设置用户配额', error);
  }
};

/** DELETE /api/admin/quotas/:userId：恢复默认配额 */
exports.clearQuota = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) return fail(res, 400, '无效的用户 ID');
  try {
    const [result] = await db.query('DELETE FROM user_quotas WHERE user_id = ?', [userId]);
    if (!result || result.affectedRows === 0) return fail(res, 404, '该用户没有自定义配额');
    await audited(req, 'admin.quota.clear', 'user', userId, {});
    res.json({ success: true, message: '已恢复默认配额' });
  } catch (error) {
    serverError(res, '恢复默认配额', error);
  }
};

// ---------- 审计日志 / 用户 ----------

/** GET /api/admin/audit-logs?userId=&action=&success=&since=&until=&page=&pageSize= */
exports.getAuditLogs = async (req, res) => {
  const { userId, action, success, since, until, page, pageSize } = req.query;
  const filters = { userId, action, page, pageSize };
  if (success === 'true' || success === 'false') filters.success = success === 'true';
  for (const [key, value] of [['since', since], ['until', until]]) {
    if (value === undefined) continue;
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return fail(res, 400, `${key} 不是有效的日期时间`);
    filters[key] = new Date(value);
  }
  if (action !== undefined && (typeof action !== 'string' || action.length > 64)) return fail(res, 400, 'action 无效');
  if (userId !== undefined && !/^\d{1,10}$/.test(String(userId))) return fail(res, 400, 'userId 无效');

  try {
    res.json({ success: true, data: await auditService.list(filters) });
  } catch (error) {
    serverError(res, '获取审计日志', error);
  }
};

/** GET /api/admin/users：供配额页选择用户（不含密码哈希） */
exports.listUsers = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, role FROM users ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (error) {
    serverError(res, '获取用户列表', error);
  }
};

// ---------- 开放 API 密钥（P5-3）----------

const keyFail = (res, label, error) => {
  if (error instanceof apiKeys.ApiKeyError) return fail(res, error.status, error.message);
  return serverError(res, label, error);
};

/** GET /api/admin/api-keys：所有密钥（只含前缀，不含明文） */
exports.listApiKeys = async (req, res) => {
  try {
    res.json({ success: true, data: { scopes: apiKeys.SCOPES, items: await apiKeys.listKeys() } });
  } catch (error) {
    keyFail(res, '获取 API 密钥', error);
  }
};

/**
 * POST /api/admin/api-keys  body: { name, scopes?: ['stats'], rateLimitPerMin?, expiresAt? }
 * 明文密钥只在这个响应里出现一次。
 */
exports.createApiKey = async (req, res) => {
  const body = req.body || {};
  try {
    const { key, record } = await apiKeys.createKey({
      name: body.name,
      scopes: body.scopes,
      rateLimitPerMin: body.rateLimitPerMin,
      expiresAt: body.expiresAt,
      createdBy: req.user.id
    });
    await audited(req, 'admin.api_key.create', 'api_key', record.id, { name: record.name, scopes: record.scopes, rateLimitPerMin: record.rateLimitPerMin });
    res.status(201).json({ success: true, message: '密钥已创建，明文只显示这一次，请妥善保存', data: { key, ...record } });
  } catch (error) {
    keyFail(res, '创建 API 密钥', error);
  }
};

/** DELETE /api/admin/api-keys/:id：吊销（不可恢复） */
exports.revokeApiKey = async (req, res) => {
  try {
    await apiKeys.revokeKey(req.params.id);
    await audited(req, 'admin.api_key.revoke', 'api_key', req.params.id, {});
    res.json({ success: true, message: '密钥已吊销' });
  } catch (error) {
    keyFail(res, '吊销 API 密钥', error);
  }
};
