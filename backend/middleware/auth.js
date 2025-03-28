// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../database/db');

exports.authenticate = async (req, res, next) => {
  try {
    // 从头部获取token
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: '未提供认证令牌' 
      });
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    
    // 检查用户是否存在
    const [user] = await db.query(
      'SELECT id, role FROM users WHERE id = ?',
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
    console.error('认证失败:', error);
    res.status(401).json({ 
      success: false, 
      message: '认证失败' 
    });
  }
};