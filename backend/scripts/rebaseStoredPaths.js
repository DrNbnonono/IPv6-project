/**
 * 数据库中保存的文件路径改写脚本
 * 旧版本把绝对路径（如 /home/ipv6/IPv6-project/zgrab2_inputs/x.txt）写进了
 * whitelists.file_path、tasks.log_path、tasks.output_path。换部署目录或容器化时，
 * 用本脚本把旧前缀改写到新的 PROJECT_ROOT，可重复执行。
 *
 * 用法（在 backend 目录下）：
 *   node scripts/rebaseStoredPaths.js --dry-run
 *   node scripts/rebaseStoredPaths.js
 *   node scripts/rebaseStoredPaths.js --from /old/root --to /new/root
 *
 * 默认 --from 为 /home/ipv6/IPv6-project，--to 为当前 PROJECT_ROOT。
 */

const db = require('../database/db');
const { PROJECT_ROOT } = require('../services/storageService');

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const dryRun = process.argv.includes('--dry-run');
const from = argValue('--from', '/home/ipv6/IPv6-project').replace(/\/+$/, '');
const to = argValue('--to', PROJECT_ROOT).replace(/\/+$/, '');

const TARGETS = [
  { table: 'whitelists', column: 'file_path' },
  { table: 'tasks', column: 'log_path' },
  { table: 'tasks', column: 'output_path' }
];

const main = async () => {
  if (from === to) {
    console.log('源前缀与目标前缀相同，无需改写');
    return;
  }

  const likePattern = `${from.replace(/[\\%_]/g, '\\$&')}/%`;

  for (const { table, column } of TARGETS) {
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
      [likePattern]
    );
    console.log(`${table}.${column}: ${total} 条记录以 ${from}/ 开头`);

    if (!dryRun && total > 0) {
      const [result] = await db.query(
        `UPDATE \`${table}\`
         SET \`${column}\` = CONCAT(?, SUBSTRING(\`${column}\`, ?))
         WHERE \`${column}\` LIKE ?`,
        [to, from.length + 1, likePattern]
      );
      console.log(`  已改写 ${result.affectedRows} 条 -> ${to}/`);
    }
  }

  console.log(dryRun ? '[dry-run] 未做任何修改' : '改写完成');
};

main()
  .catch((error) => {
    console.error('改写失败:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
