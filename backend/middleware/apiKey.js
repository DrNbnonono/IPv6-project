/**
 * 开放 API 的鉴权与限流（P5-3）
 *
 *   router.use(authenticateApiKey);                  // 校验密钥 + 按密钥限流；通过后 req.apiKey = { id, name, scopes, rateLimitPerMin }
 *   router.get('/x', requireScope('addresses'), h);  // 需要某个权限范围
 *
 * 密钥从 Authorization: Bearer <key> 或 X-API-Key 头读取，不接受放在 URL 里（会进访问日志）。
 * 限流：按密钥的固定窗口计数（一分钟），默认 OPEN_API_RATE_PER_MIN（60），密钥上可单独设置；
 * 超限返回 429 并带 Retry-After。计数在内存里，单实例部署足够；多实例时每个实例各自计数。
 */

const apiKeys = require('../services/apiKeyService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('open-api');

const WINDOW_MS = 60 * 1000;
const MAX_TRACKED = 10000;

const windows = new Map(); // key_id -> { start, count }

const defaultLimit = () => {
  const n = parseInt(process.env.OPEN_API_RATE_PER_MIN, 10);
  return Number.isInteger(n) && n >= 1 ? n : 60;
};

const tokenFrom = (req) => {
  const auth = req.headers && req.headers.authorization;
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (match) return match[1];
  }
  const header = req.headers && req.headers['x-api-key'];
  return typeof header === 'string' ? header.trim() : null;
};

const reject = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** 记一次请求；返回 { allowed, limit, remaining, resetSeconds }。 */
const consume = (keyId, limit, now = Date.now()) => {
  let entry = windows.get(keyId);
  if (!entry || now - entry.start >= WINDOW_MS) {
    if (windows.size >= MAX_TRACKED) {
      for (const [id, e] of windows) {
        if (now - e.start >= WINDOW_MS) windows.delete(id);
      }
    }
    entry = { start: now, count: 0 };
    windows.set(keyId, entry);
  }
  entry.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((entry.start + WINDOW_MS - now) / 1000));
  return { allowed: entry.count <= limit, limit, remaining: Math.max(0, limit - entry.count), resetSeconds };
};

const authenticateApiKey = async (req, res, next) => {
  const token = tokenFrom(req);
  if (!token) return reject(res, 401, '需要 API 密钥：请在 Authorization: Bearer <key> 或 X-API-Key 头中提供');

  let key;
  try {
    key = await apiKeys.verifyKey(token);
  } catch (error) {
    if (error instanceof apiKeys.ApiKeyError) return reject(res, error.status, error.message);
    logger.error('校验 API 密钥失败:', error.message);
    return reject(res, 500, '服务暂时不可用');
  }
  if (!key) return reject(res, 401, 'API 密钥无效、已过期或已吊销');

  const verdict = consume(key.id, key.rateLimitPerMin || defaultLimit());
  res.setHeader('X-RateLimit-Limit', String(verdict.limit));
  res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
  if (!verdict.allowed) {
    res.setHeader('Retry-After', String(verdict.resetSeconds));
    return reject(res, 429, '请求过于频繁，请稍后再试', { retryAfterSeconds: verdict.resetSeconds });
  }

  req.apiKey = key;
  return next();
};

const requireScope = (scope) => (req, res, next) => {
  if (!req.apiKey || !req.apiKey.scopes.includes(scope)) {
    return reject(res, 403, `该密钥没有 ${scope} 权限`);
  }
  return next();
};

const resetRateLimits = () => windows.clear(); // 测试用

module.exports = { authenticateApiKey, requireScope, consume, tokenFrom, resetRateLimits, WINDOW_MS };
