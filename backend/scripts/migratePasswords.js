/**
 * 密码哈希迁移脚本
 * 把 users 表中仍为明文的 password_hash 就地改为 bcrypt 哈希，可重复执行。
 *
 * 用法（在 backend 目录下）：
 *   node scripts/migratePasswords.js --dry-run   # 只统计，不修改
 *   node scripts/migratePasswords.js             # 执行迁移
 *
 * 迁移完成后，建议在 .env 中设置 ALLOW_LEGACY_PASSWORDS=false 关闭明文兼容。
 */

const bcrypt = require('bcrypt');
const db = require('../database/db');

const dryRun = process.argv.includes('--dry-run');
const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$/.test(value);

const main = async () => {
  const [users] = await db.query('SELECT id, password_hash FROM users');
  const pending = users.filter((user) => !isBcryptHash(user.password_hash));

  console.log(`共 ${users.length} 个用户，其中 ${pending.length} 个需要迁移`);

  if (dryRun || pending.length === 0) {
    console.log(dryRun ? '[dry-run] 未做任何修改' : '无需迁移');
    return;
  }

  for (const user of pending) {
    const hash = await bcrypt.hash(String(user.password_hash), rounds);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    console.log(`已迁移用户ID: ${user.id}`);
  }

  console.log('迁移完成');
};

main()
  .catch((error) => {
    console.error('迁移失败:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
