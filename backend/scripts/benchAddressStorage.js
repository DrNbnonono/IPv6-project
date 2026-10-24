#!/usr/bin/env node
/**
 * 地址存储方案对比（P3-5 的评估工具）：varchar(45) 与 BINARY(16) 两种存法的
 * 写入速度、数据/索引体积、点查与前缀范围查询耗时。
 *
 *   node scripts/benchAddressStorage.js --yes [--rows 1000000] [--prefixes 2000] [--keep] [--json]
 *
 * 它会在 .env 配置的库里创建并（结束时）删除两张测试表 bench_addr_text、bench_addr_bin，不碰任何业务表。
 * 因为会写入大量数据，必须显式传 --yes；请在测试库或副本库上运行，不要对生产库跑。
 *
 * 重要：合成数据只能说明机制，不能替代真实数据——真实地址的分布（前缀聚集度、压缩写法的平均长度、
 * 已有索引与缓冲池大小）会明显改变结论。P3-5 的决策应该用有真实数据的副本库，用这个脚本的数字作参考，
 * 并另外实测一次从 varchar 迁移到 BINARY(16) 的耗时与锁表时间。
 * 文本列存的是展开形式（8 组、不省略 0），比真实的压缩写法略长，所以文本侧的体积会偏大一些。
 *
 * 这是 CLI 工具，直接输出到控制台。退出码：0 成功；1 参数错误；2 无法连接数据库。
 */

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const BATCH = 2000;
const TEXT_TABLE = 'bench_addr_text';
const BIN_TABLE = 'bench_addr_bin';

const parseArgs = (argv) => {
  const opts = { rows: 1000000, prefixes: 2000, keep: false, json: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes') opts.yes = true;
    else if (arg === '--keep') opts.keep = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--rows' || arg === '--prefixes') {
      const n = Number(argv[++i]);
      const min = arg === '--rows' ? 1000 : 1;
      const max = arg === '--prefixes' ? 65535 : 200000000; // 前缀编号用 16 位
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${arg} 必须是 ${min}–${max} 之间的整数`);
      opts[arg.slice(2)] = n;
    } else throw new Error(`未知参数 ${arg}`);
  }
  if (opts.prefixes > opts.rows) throw new Error('--prefixes 不能大于 --rows');
  return opts;
};

/** 第 index 个 /48 前缀（2001:db8 之后的 16 位 + 16 位），返回 6 字节。 */
const prefixBytes = (index) => Buffer.from([0x20, 0x01, 0x0d, 0xb8, (index >> 8) & 0xff, index & 0xff]);

/** 随机地址：前 6 字节是前缀，后 10 字节随机。 */
const randomAddress = (prefixIndex) => Buffer.concat([prefixBytes(prefixIndex), crypto.randomBytes(10)]);

const expand = (buf) => {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(buf.readUInt16BE(i).toString(16).padStart(4, '0'));
  return groups.join(':');
};
const prefixText = (index) => expand(Buffer.concat([prefixBytes(index), Buffer.alloc(10)])).split(':').slice(0, 3).join(':') + ':';

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function tableSize(conn, table) {
  await conn.query(`ANALYZE TABLE ${table}`);
  const [[row]] = await conn.query(
    'SELECT DATA_LENGTH AS data, INDEX_LENGTH AS idx, TABLE_ROWS AS tableRows FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return { dataBytes: Number(row.data), indexBytes: Number(row.idx), estimatedRows: Number(row.tableRows) };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (!opts.yes) {
    console.error('这个脚本会在当前数据库里创建并写入两张测试表。确认是测试库或副本库后，加 --yes 重新运行。');
    return 1;
  }

  const mysql = require('mysql2/promise');
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  } catch (error) {
    console.error(`无法连接数据库: ${error.message}`);
    return 2;
  }

  const result = { rows: opts.rows, prefixes: opts.prefixes, text: {}, binary: {} };
  try {
    await conn.query(`DROP TABLE IF EXISTS ${TEXT_TABLE}, ${BIN_TABLE}`);
    await conn.query(`CREATE TABLE ${TEXT_TABLE} (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, address VARCHAR(45) NOT NULL, prefix_id INT NOT NULL, UNIQUE KEY uk_address (address), KEY idx_prefix (prefix_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`CREATE TABLE ${BIN_TABLE} (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, address BINARY(16) NOT NULL, prefix_id INT NOT NULL, UNIQUE KEY uk_address (address), KEY idx_prefix (prefix_id)) ENGINE=InnoDB`);

    // 同一批地址分别写入两张表，按前缀聚集（真实导入也是按前缀一批一批进来的）
    const perPrefix = Math.ceil(opts.rows / opts.prefixes);
    const sample = [];
    const timers = { text: 0, binary: 0 };
    let written = 0;
    for (let p = 0; p < opts.prefixes && written < opts.rows; p++) {
      let remaining = Math.min(perPrefix, opts.rows - written);
      while (remaining > 0) {
        const n = Math.min(BATCH, remaining);
        const seen = new Set();
        const addrs = [];
        while (addrs.length < n) {
          const a = randomAddress(p);
          const key = a.toString('hex');
          if (!seen.has(key)) { seen.add(key); addrs.push(a); }
        }
        let start = process.hrtime.bigint();
        await conn.query(`INSERT IGNORE INTO ${TEXT_TABLE} (address, prefix_id) VALUES ?`, [addrs.map((a) => [expand(a), p])]);
        timers.text += ms(start);
        start = process.hrtime.bigint();
        await conn.query(`INSERT IGNORE INTO ${BIN_TABLE} (address, prefix_id) VALUES ?`, [addrs.map((a) => [a, p])]);
        timers.binary += ms(start);
        if (sample.length < 2000 && Math.random() < 0.05) sample.push(addrs[0]);
        written += n;
        remaining -= n;
      }
    }
    result.text.insertMs = Math.round(timers.text);
    result.binary.insertMs = Math.round(timers.binary);
    result.text.insertRowsPerSec = Math.round(written / (timers.text / 1000));
    result.binary.insertRowsPerSec = Math.round(written / (timers.binary / 1000));

    Object.assign(result.text, await tableSize(conn, TEXT_TABLE));
    Object.assign(result.binary, await tableSize(conn, BIN_TABLE));

    // 点查：随机取已有地址
    const lookups = sample.slice(0, 1000);
    let start = process.hrtime.bigint();
    for (const a of lookups) await conn.query(`SELECT id FROM ${TEXT_TABLE} WHERE address = ?`, [expand(a)]);
    result.text.pointLookupMsPer1000 = Math.round(ms(start));
    start = process.hrtime.bigint();
    for (const a of lookups) await conn.query(`SELECT id FROM ${BIN_TABLE} WHERE address = ?`, [a]);
    result.binary.pointLookupMsPer1000 = Math.round(ms(start));

    // 前缀范围：随机 20 个 /48，数其中的地址
    const picks = Array.from({ length: Math.min(20, opts.prefixes) }, () => Math.floor(Math.random() * opts.prefixes));
    start = process.hrtime.bigint();
    let textCount = 0;
    for (const p of picks) {
      const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${TEXT_TABLE} WHERE address LIKE ?`, [`${prefixText(p)}%`]);
      textCount += Number(row.n);
    }
    result.text.prefixRangeMsPer20 = Math.round(ms(start));
    start = process.hrtime.bigint();
    let binCount = 0;
    for (const p of picks) {
      const lo = Buffer.concat([prefixBytes(p), Buffer.alloc(10, 0x00)]);
      const hi = Buffer.concat([prefixBytes(p), Buffer.alloc(10, 0xff)]);
      const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${BIN_TABLE} WHERE address BETWEEN ? AND ?`, [lo, hi]);
      binCount += Number(row.n);
    }
    result.binary.prefixRangeMsPer20 = Math.round(ms(start));
    result.countsMatch = textCount === binCount;
    result.writtenRows = written;
  } finally {
    if (!opts.keep) await conn.query(`DROP TABLE IF EXISTS ${TEXT_TABLE}, ${BIN_TABLE}`).catch(() => {});
    await conn.end().catch(() => {});
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  const mb = (n) => (n / 1048576).toFixed(1);
  const line = (label, t, b) => console.log(`${label.padEnd(22)}${String(t).padStart(16)}${String(b).padStart(16)}`);
  console.log(`\n写入 ${result.writtenRows} 行，${opts.prefixes} 个 /48 前缀；前缀范围查询两种写法结果${result.countsMatch ? '一致' : '不一致（请检查）'}\n`);
  line('', 'varchar(45)', 'BINARY(16)');
  line('数据 (MB)', mb(result.text.dataBytes), mb(result.binary.dataBytes));
  line('索引 (MB)', mb(result.text.indexBytes), mb(result.binary.indexBytes));
  line('写入 (行/秒)', result.text.insertRowsPerSec, result.binary.insertRowsPerSec);
  line('点查 1000 次 (ms)', result.text.pointLookupMsPer1000, result.binary.pointLookupMsPer1000);
  line('前缀范围 20 次 (ms)', result.text.prefixRangeMsPer20, result.binary.prefixRangeMsPer20);
  console.log('\n提示：合成数据只能说明机制，结论请在有真实数据的副本库上确认（见文件头注释）。');
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

module.exports = { parseArgs, prefixBytes, expand, prefixText };
