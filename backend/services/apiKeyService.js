/**
 * 开放 API 密钥（P5-3）
 *
 *   createKey({ name, scopes, rateLimitPerMin, expiresAt, createdBy })  → { key（明文，只此一次）, record }
 *   listKeys() / revokeKey(id)
 *   verifyKey(token)  → 有效则返回 { id, name, scopes, rateLimitPerMin }，否则 null
 *
 * 密钥格式：ov6_ + 32 字节随机数的 base64url。库里只存 SHA-256。
 * last_used_at 同一把钥匙最多每分钟写一次，避免每个请求都产生一次写库。
 */

const crypto = require('crypto');
const db = require('../database/db');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('api-key');

const KEY_PREFIX = 'ov6_';
const SCOPES = ['stats', 'addresses'];
const TOUCH_INTERVAL_MS = 60 * 1000;
const MAX_NAME = 100;

class ApiKeyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiKeyError';
    this.status = status;
  }
}

const hashKey = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const generateKey = () => `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);

const normalizeScopes = (scopes) => {
  const list = scopes === undefined || scopes === null ? ['stats'] : scopes;
  if (!Array.isArray(list) || list.length === 0) throw new ApiKeyError('scopes 必须是非空数组');
  const unique = [...new Set(list.map(String))];
  const bad = unique.filter((s) => !SCOPES.includes(s));
  if (bad.length > 0) throw new ApiKeyError(`不支持的权限范围: ${bad.join(', ').slice(0, 60)}（可选: ${SCOPES.join(', ')}）`);
  return unique;
};

const parseScopes = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((s) => SCOPES.includes(s)) : [];
  } catch (error) {
    return [];
  }
};

const view = (row) => ({
  id: row.key_id,
  name: row.name,
  prefix: row.key_prefix,
  scopes: parseScopes(row.scopes),
  rateLimitPerMin: row.rate_limit_per_min === null || row.rate_limit_per_min === undefined ? null : Number(row.rate_limit_per_min),
  createdBy: row.created_by,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at
});

const createKey = async ({ name, scopes, rateLimitPerMin, expiresAt, createdBy }) => {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new ApiKeyError('请填写用途说明（name）');
  if (cleanName.length > MAX_NAME) throw new ApiKeyError(`name 最长 ${MAX_NAME} 个字符`);
  const cleanScopes = normalizeScopes(scopes);

  let limit = null;
  if (rateLimitPerMin !== undefined && rateLimitPerMin !== null && rateLimitPerMin !== '') {
    limit = Number(rateLimitPerMin);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw new ApiKeyError('rateLimitPerMin 必须是 1–100000 的整数');
  }

  let expires = null;
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    expires = new Date(expiresAt);
    if (Number.isNaN(expires.getTime())) throw new ApiKeyError('expiresAt 不是有效的日期时间');
    if (expires.getTime() <= Date.now()) throw new ApiKeyError('expiresAt 必须晚于现在');
  }

  const key = generateKey();
  try {
    const [result] = await db.query(
      `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, rate_limit_per_min, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cleanName, key.slice(0, 12), hashKey(key), JSON.stringify(cleanScopes), limit, createdBy ?? null, expires]
    );
    return {
      key,
      record: {
        id: result.insertId,
        name: cleanName,
        prefix: key.slice(0, 12),
        scopes: cleanScopes,
        rateLimitPerMin: limit,
        expiresAt: expires
      }
    };
  } catch (error) {
    if (isMissingTable(error)) throw new ApiKeyError('尚未启用开放 API，请先执行数据库迁移（迁移 16）', 503);
    throw error;
  }
};

const listKeys = async () => {
  try {
    const [rows] = await db.query(
      `SELECT key_id, name, key_prefix, scopes, rate_limit_per_min, created_by, created_at, expires_at, last_used_at, revoked_at
       FROM api_keys ORDER BY key_id DESC LIMIT 500`
    );
    return (Array.isArray(rows) ? rows : []).map(view);
  } catch (error) {
    if (isMissingTable(error)) throw new ApiKeyError('尚未启用开放 API，请先执行数据库迁移（迁移 16）', 503);
    throw error;
  }
};

const revokeKey = async (id) => {
  if (!/^\d{1,10}$/.test(String(id ?? ''))) throw new ApiKeyError('无效的密钥 ID');
  const [result] = await db.query('UPDATE api_keys SET revoked_at = NOW() WHERE key_id = ? AND revoked_at IS NULL', [Number(id)]);
  if (!result || result.affectedRows === 0) throw new ApiKeyError('密钥不存在或已吊销', 404);
  touched.delete(Number(id));
  return true;
};

const touched = new Map(); // key_id -> 上次写 last_used_at 的时间

const touch = (id, now) => {
  const last = touched.get(id);
  if (last !== undefined && now - last < TOUCH_INTERVAL_MS) return;
  touched.set(id, now);
  db.query('UPDATE api_keys SET last_used_at = NOW() WHERE key_id = ?', [id]).catch((error) => {
    logger.warn(`更新密钥 ${id} 使用时间失败: ${error.message}`);
  });
};

/**
 * 校验请求带来的密钥。格式不对、不存在、已吊销、已过期都返回 null。
 * 数据库故障 / 迁移未执行时抛出（由中间件转成 503），而不是当作“密钥无效”。
 */
const verifyKey = async (token, { now = Date.now() } = {}) => {
  if (typeof token !== 'string' || !token.startsWith(KEY_PREFIX) || token.length < 20 || token.length > 128) return null;
  let rows;
  try {
    [rows] = await db.query(
      'SELECT key_id, name, scopes, rate_limit_per_min, expires_at, revoked_at FROM api_keys WHERE key_hash = ? LIMIT 1',
      [hashKey(token)]
    );
  } catch (error) {
    if (isMissingTable(error)) throw new ApiKeyError('开放 API 尚未启用', 503);
    throw error;
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return null;

  touch(row.key_id, now);
  return {
    id: row.key_id,
    name: row.name,
    scopes: parseScopes(row.scopes),
    rateLimitPerMin: row.rate_limit_per_min === null || row.rate_limit_per_min === undefined ? null : Number(row.rate_limit_per_min)
  };
};

module.exports = {
  ApiKeyError,
  SCOPES,
  KEY_PREFIX,
  hashKey,
  generateKey,
  createKey,
  listKeys,
  revokeKey,
  verifyKey
};
