const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const db = require('../database/db')
const { getJwtSecret } = require('../middleware/auth')

// bcrypt 只处理前 72 字节，过长的密码直接拒绝
const MAX_PASSWORD_LENGTH = 128

// 用于"用户不存在"分支的占位哈希，让两种失败路径耗时接近，避免通过响应时间枚举账号
const DUMMY_HASH = bcrypt.hashSync('observ6-dummy-password', 10)

const getBcryptRounds = () => parseInt(process.env.BCRYPT_ROUNDS, 10) || 10

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$/.test(value)

// 手机号脱敏，日志里不出现完整号码
const maskPhone = (phone) => {
  const text = String(phone || '')
  return text.length > 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : '***'
}

// 定长安全比较（仅用于兼容尚未迁移的明文密码）
const safeEqual = (a, b) => {
  const bufferA = Buffer.from(String(a))
  const bufferB = Buffer.from(String(b))
  if (bufferA.length !== bufferB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufferA, bufferB)
}

/**
 * 校验密码
 * 已迁移的账号走 bcrypt；尚未迁移的明文账号在 ALLOW_LEGACY_PASSWORDS 不为 false 时兼容，
 * 登录成功后会自动升级为 bcrypt 哈希。执行 scripts/migratePasswords.js 后可设为 false。
 */
const verifyPassword = async (plainPassword, storedValue) => {
  if (isBcryptHash(storedValue)) {
    return { ok: await bcrypt.compare(plainPassword, storedValue), legacy: false }
  }

  if (process.env.ALLOW_LEGACY_PASSWORDS === 'false') {
    return { ok: false, legacy: true }
  }

  return { ok: safeEqual(plainPassword, storedValue), legacy: true }
}

/**
 * 用户登录
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const { phone, password } = req.body || {}

  if (typeof phone !== 'string' || typeof password !== 'string' || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: '请输入手机号和密码'
    })
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return res.status(401).json({
      success: false,
      message: '手机号或密码错误'
    })
  }

  try {
    const [rows] = await db.query(
      'SELECT id, phone, username, password_hash, role FROM users WHERE phone = ? LIMIT 1',
      [phone]
    )

    // 用户不存在：做一次占位比较后返回与密码错误相同的提示
    if (rows.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH)
      console.warn('登录失败: 账号不存在', maskPhone(phone))
      return res.status(401).json({
        success: false,
        message: '手机号或密码错误'
      })
    }

    const user = rows[0]
    const { ok, legacy } = await verifyPassword(password, user.password_hash)

    if (!ok) {
      console.warn('登录失败: 密码错误', maskPhone(phone))
      return res.status(401).json({
        success: false,
        message: '手机号或密码错误'
      })
    }

    // 明文账号登录成功后自动升级为 bcrypt 哈希，升级失败不影响本次登录
    if (legacy) {
      try {
        const newHash = await bcrypt.hash(password, getBcryptRounds())
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id])
        console.warn('已将明文密码升级为哈希，用户ID:', user.id)
      } catch (upgradeError) {
        console.error('密码哈希升级失败，用户ID:', user.id, upgradeError.message)
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      token,
      username: user.username,
      role: user.role,
      message: '登录成功'
    })

  } catch (error) {
    console.error('登录过程错误:', error.message)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
}
