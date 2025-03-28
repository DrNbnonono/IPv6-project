const jwt = require('jsonwebtoken')
const db = require('../database/db')

exports.login = async (req, res) => {
  const { phone, password } = req.body
  console.log('收到登录请求:', { phone }) // 添加请求日志

  try {
    // 1. 检查数据库连接
    const [rows, fields] = await db.query(
      'SELECT id, phone, password_hash, role FROM users WHERE phone = ? LIMIT 1',
      [phone]
    ).catch(err => {
      console.error('数据库查询失败:', err)
      throw new Error('数据库查询异常')
    })

    // 2. 用户不存在
    if (rows.length === 0) {
      console.log('用户不存在:', phone)
      return res.status(401).json({ 
        success: false, 
        message: '用户不存在' 
      })
    }

    const user = rows[0]
    console.log('查询到的用户:', { 
      id: user.id, 
      storedHash: user.password_hash 
    })

    // 3. 密码验证（明文比对，根据你的代码是直接比较）
    if (password !== user.password_hash) {
      console.log('密码不匹配:', { 
        input: password, 
        stored: user.password_hash 
      })
      return res.status(401).json({ 
        success: false, 
        message: '密码错误' 
      })
    }

    // 4. 生成Token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '24h' }
    )

    console.log('登录成功:', { userId: user.id })
    res.json({
      success: true,
      token,
      role: user.role,
      message: '登录成功'
    })

  } catch (error) {
    console.error('登录过程错误:', error.stack) // 打印完整错误堆栈
    res.status(500).json({ 
      success: false, 
      message: error.message || '服务器内部错误' 
    })
  }
}