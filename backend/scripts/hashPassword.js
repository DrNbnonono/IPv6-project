/**
 * 生成 bcrypt 密码哈希，用于手工插入管理员账号
 *
 * 用法（在 backend 目录下）：
 *   node scripts/hashPassword.js '你的密码'
 */

const bcrypt = require('bcrypt');
const saltRounds = 10; // 加密强度

const plainPassword = process.argv[2];

if (!plainPassword) {
  console.error('用法: node scripts/hashPassword.js <明文密码>');
  process.exit(1);
}

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) {
    console.error('加密失败:', err);
    return;
  }
  console.log('加密后的密码:', hash);
  // 复制此 hash 用于后续插入数据库
});
