const jwt = require('jsonwebtoken');
const db = require('../database/db');

exports.authenticate = async (req, res, next) => {
  console.log('\n=== 请求到达认证中间件 ===');
  console.log('请求方法:', req.method);
  console.log('请求路径:', req.path);
  console.log('原始请求头:', JSON.stringify(req.headers, null, 2));
  
  try {
    // 从头部获取token
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
      console.log('Authorization头不存在');
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
        receivedHeaders: req.headers
      });
    }
    
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    console.log('处理后的Token:', token ? token.slice(0, 10) + '...' : '空');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
        receivedHeaders: req.headers
      });
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    console.log('解码后的Token:', decoded);
    
    // 检查用户是否存在
    const [user] = await db.query(
      'SELECT id, phone, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user.length) {
      console.log('用户不存在，ID:', decoded.id);
      return res.status(401).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    console.log('认证成功，用户:', user[0]);
    // 将用户信息添加到请求对象
    req.user = user[0];
    next();

  } catch (error) {
    console.error('认证失败:', error);
    res.status(401).json({ 
      success: false, 
      message: '认证失败',
      error: error.message 
    });
  }
};