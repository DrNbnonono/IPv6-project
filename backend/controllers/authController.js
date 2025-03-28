const jwt = require('jsonwebtoken')
const db = require('../database/db')

exports.login = async (req, res) => {
  const { phone, password } = req.body

  try {
    // 查询用户
    const [rows] = await db.query(
      'SELECT id, phone, password_hash, role FROM users WHERE phone = ?',
      [phone]
    )

    // 验证用户存在
    if (rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: '用户不存在' 
      })
    }

    const user = rows[0]

    // 直接比对密码（不加密）
    if (password !== user.password_hash) {
      return res.status(401).json({ 
        success: false, 
        message: '密码错误' 
      })
    }

    // 生成Token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '24h' }
    )

    // 返回成功响应
    res.json({
      success: true,
      token,
      role: user.role,
      message: '登录成功'
    })

  } catch (error) {
    console.error('登录错误:', error)
    res.status(500).json({ 
      success: false, 
      message: '服务器内部错误' 
    })
  }
}