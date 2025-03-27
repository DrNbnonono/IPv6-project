const jwt = require('jsonwebtoken');
const db = require('../database/db');

exports.login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    // 查询用户是否存在
    const [rows] = await db.query(
      'SELECT id, phone, password_hash, role FROM users WHERE phone = ?',
      [phone]
    );

    // 验证密码
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    const user = rows[0];

    // 直接进行密码比较，不加密
    if (password !== user.password_hash) { // 这里直接比较用户输入的密码和数据库中存储的密码
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    // 生成 Token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '24h' }
    );

    res.json({ 
      success: true,
      token, 
      role: user.role,
      message: '登录成功' 
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
};
