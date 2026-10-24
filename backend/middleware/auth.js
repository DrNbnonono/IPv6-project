const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('auth-middleware');

/**
 * 获取JWT密钥
 * 必须通过环境变量 JWT_SECRET 配置，不再提供默认值
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 未配置');
  }
  return secret;
};

exports.getJwtSecret = getJwtSecret;

/**
 * 认证中间件
 * 校验 Authorization: Bearer <token>，并把用户信息放入 req.user
 */
exports.authenticate = async (req, res, next) => {
  try {
    // 从头部获取token（Node 会把请求头名称统一转成小写）
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    // 验证token（固定算法，避免算法混淆）
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });

    // 检查用户是否存在，并以数据库中的角色为准
    const [user] = await db.query(
      'SELECT id, phone, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user.length) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 将用户信息添加到请求对象
    req.user = user[0];
    next();

  } catch (error) {
    // 服务端配置错误与令牌错误分开处理，且都不向客户端回传内部错误信息
    if (error.message === 'JWT_SECRET 未配置') {
      logger.error('认证失败: JWT_SECRET 未配置');
      return res.status(500).json({
        success: false,
        message: '服务器配置错误'
      });
    }

    logger.error('认证失败:', error.name);
    res.status(401).json({
      success: false,
      message: '认证失败'
    });
  }
};

/**
 * 管理员权限中间件
 * 必须放在 authenticate 之后使用
 */
exports.requireAdmin = (req, res, next) => {
  if (req.user?.role === 'admin') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: '仅管理员可执行此操作'
  });
};
