#!/usr/bin/env node
/**
 * 数据库自检：连接是否可用、关键表与存储过程是否存在、各表行数。
 *   node scripts/checkDb.js
 * 退出码：0 = 全部通过；1 = 缺少关键表/存储过程；2 = 无法连接数据库。
 * 这是 CLI 工具，直接输出到控制台（不经过 loggerService）。
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const REQUIRED_TABLES = [
  'users', 'tools', 'tasks', 'whitelists',
  'countries', 'asns', 'ip_prefixes', 'active_addresses',
  'protocols', 'vulnerabilities', 'address_types'
];
const REQUIRED_ROUTINES = ['delete_prefix_with_addresses'];

async function main() {
  // 延迟加载：db.js 在非测试环境导入时会自行做连接测试
  const db = require('../database/db');
  let missing = 0;

  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error(`无法连接数据库: ${err.message}`);
    await db.end().catch(() => {});
    return 2;
  }

  const [tableRows] = await db.query('SHOW TABLES');
  const existing = new Set(tableRows.map((row) => Object.values(row)[0]));

  console.log('关键表:');
  for (const table of REQUIRED_TABLES) {
    if (!existing.has(table)) {
      console.log(`  缺失  ${table}`);
      missing += 1;
      continue;
    }
    const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    console.log(`  正常  ${table.padEnd(18)} ${n} 行`);
  }

  const [routines] = await db.query(
    'SELECT ROUTINE_NAME AS name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()'
  );
  const routineNames = new Set(routines.map((r) => r.name));
  console.log('存储过程:');
  for (const routine of REQUIRED_ROUTINES) {
    const ok = routineNames.has(routine);
    console.log(`  ${ok ? '正常' : '缺失'}  ${routine}`);
    if (!ok) missing += 1;
  }

  await db.end();
  return missing === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('自检失败:', err.message);
  process.exit(2);
});
