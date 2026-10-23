/**
 * 审计中间件：挂在路由上，响应结束后写一条 audit_logs。
 *
 *   router.post('/', audit('task.create', { resourceType: 'xmap_task', resourceId: (req, res, body) => body && body.taskId }), handler)
 *
 * 选项（均可省略，函数形式的参数是 (req, res, body)，body 为处理器通过 res.json 发出的内容）：
 *   resourceType  字符串
 *   resourceId    字符串或函数
 *   userId        函数；默认取 req.user.id（登录接口用它从响应里取出用户）
 *   detail        函数，返回要记录的对象（会被脱敏）；默认记录 HTTP 状态码
 * 成功与否按 HTTP 状态码判断（< 400 为成功）。审计写入失败不影响响应。
 */

const jwt = require('jsonwebtoken');
const auditService = require('../services/auditService');

const evaluate = (value, req, res, body) => {
  if (typeof value !== 'function') return value;
  try {
    return value(req, res, body);
  } catch (error) {
    return null;
  }
};

const audit = (action, options = {}) => (req, res, next) => {
  let body;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    body = payload;
    return originalJson(payload);
  };

  const finish = () => {
    const userId = options.userId ? evaluate(options.userId, req, res, body) : (req.user && req.user.id);
    const detail = options.detail ? evaluate(options.detail, req, res, body) : null;
    auditService.record({
      userId: userId || null,
      action,
      resourceType: options.resourceType || null,
      resourceId: evaluate(options.resourceId, req, res, body),
      success: res.statusCode < 400,
      detail: { ...(detail || {}), status: res.statusCode },
      ip: req.ip
    });
  };

  // 只在响应正常结束时记录；客户端中途断开（没有 finish）不产生记录
  res.on('finish', finish);
  next();
};

/** 从登录响应里的 JWT 取出用户 ID（令牌是刚刚签发的，只解码不验证）。 */
const userIdFromToken = (req, res, body) => {
  const decoded = body && typeof body.token === 'string' ? jwt.decode(body.token) : null;
  return decoded && decoded.id ? decoded.id : null;
};

/** 数据库管理路由：所有非 GET 请求（写操作与 advanced-query）记为 db.write，detail 只含方法与路径。 */
const auditWrites = (prefix) => (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return audit(`${prefix}.write`, {
    resourceType: prefix,
    detail: () => ({ method: req.method, path: req.originalUrl.split('?')[0] })
  })(req, res, next);
};

/** 手机号只保留前 3 位和后 2 位。 */
const maskPhone = (phone) => {
  const text = String(phone || '');
  return text.length > 5 ? `${text.slice(0, 3)}${'*'.repeat(text.length - 5)}${text.slice(-2)}` : '***';
};

module.exports = { audit, auditWrites, userIdFromToken, maskPhone };
