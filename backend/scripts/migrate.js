#!/usr/bin/env node
/**
 * 数据库迁移执行器。
 *
 *   node scripts/migrate.js              执行所有未应用的迁移
 *   node scripts/migrate.js --dry-run    只列出将要执行的迁移，不改动数据库
 *   node scripts/migrate.js --status     列出已应用 / 待应用的迁移
 *
 * 约定（详见 sql/README.md）：
 * - 根目录 structure.sql 是最新的全量表结构；
 * - sql/NN-名称.sql 中 NN >= 08 的文件是此后的增量迁移，按文件名顺序执行，
 *   每个文件成功后记入表 schema_migrations（version、checksum、applied_at）；
 * - 已应用的迁移文件内容被改动时（checksum 不一致）会报错并停止，请新增迁移而不是修改旧文件。
 *
 * 为什么调用 mysql 命令行而不用 mysql2：迁移文件里的存储过程/触发器使用 DELIMITER，
 * 这是命令行客户端的语法，驱动不支持。连接信息读取 .env 里的 DB_HOST、DB_PORT、
 * DB_USER、DB_PASSWORD、DB_NAME；密码通过 MYSQL_PWD 环境变量传递，不出现在进程参数里。
 * 可用 MYSQL_BIN 指定客户端程序（默认 mysql）。
 *
 * 这是 CLI 工具，直接输出到控制台。退出码：0 成功；1 迁移失败或校验不一致；2 无法连接数据库。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MIN_VERSION = 8;
const FILE_RE = /^(\d{2,})-(.+)\.sql$/;
const MIGRATIONS_TABLE = 'schema_migrations';

const DEFAULT_DIR = path.resolve(__dirname, '../../sql');

/** 列出 sql/ 下 NN >= minVersion 的迁移文件，按 (NN, 文件名) 排序。 */
function listMigrations(dir = DEFAULT_DIR, minVersion = MIN_VERSION) {
  return fs
    .readdirSync(dir)
    .map((file) => {
      const m = FILE_RE.exec(file);
      return m ? { file, number: parseInt(m[1], 10), version: file.replace(/\.sql$/, '') } : null;
    })
    .filter((item) => item && item.number >= minVersion)
    .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
}

const checksumOf = (content) => crypto.createHash('sha256').update(content).digest('hex');

/**
 * 对比文件与已应用记录：返回待执行列表，以及 checksum 不一致的已应用迁移。
 * applied: Map<version, checksum>
 */
function planMigrations(files, applied) {
  const pending = [];
  const changed = [];
  for (const item of files) {
    const checksum = item.checksum;
    if (!applied.has(item.version)) {
      pending.push(item);
    } else if (applied.get(item.version) !== checksum) {
      changed.push(item);
    }
  }
  return { pending, changed };
}

function parseArgs(argv) {
  const opts = { dryRun: false, status: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--status') opts.status = true;
    else throw new Error(`未知参数: ${arg}`);
  }
  return opts;
}

/** 由环境变量生成 mysql 命令行的连接参数（不含密码）。 */
function buildConnArgs(env = process.env) {
  const args = [
    `--host=${env.DB_HOST || 'localhost'}`,
    `--user=${env.DB_USER || 'linux_db'}`,
    '--default-character-set=utf8mb4',
    '--batch'
  ];
  if (env.DB_PORT) args.push(`--port=${env.DB_PORT}`);
  args.push(env.DB_NAME || 'ipv6_project');
  return args;
}

/** 执行 mysql 客户端；sql 通过 stdin 传入。返回 { code, stdout, stderr }。 */
function runMysql({ sql, extraArgs = [], env = process.env }) {
  return new Promise((resolve, reject) => {
    const bin = env.MYSQL_BIN || 'mysql';
    const child = spawn(bin, [...buildConnArgs(env), ...extraArgs], {
      env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD || '' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => reject(new Error(`无法启动 ${bin}: ${err.message}`)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
  \`version\` VARCHAR(190) NOT NULL COMMENT '迁移文件名（不含 .sql）',
  \`checksum\` CHAR(64) NOT NULL COMMENT '文件内容的 sha256',
  \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`version\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='已应用的数据库迁移';
`;

function parseApplied(stdout) {
  const applied = new Map();
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const [version, checksum] = line.split('\t');
    applied.set(version, checksum);
  }
  return applied;
}

async function loadApplied(env) {
  const create = await runMysql({ sql: CREATE_TABLE_SQL, env });
  if (create.code !== 0) {
    const err = new Error(create.stderr.trim() || '无法连接数据库');
    err.connection = true;
    throw err;
  }
  const res = await runMysql({ sql: `SELECT version, checksum FROM \`${MIGRATIONS_TABLE}\`;`, extraArgs: ['--skip-column-names'], env });
  if (res.code !== 0) throw new Error(res.stderr.trim());
  return parseApplied(res.stdout);
}

async function main(argv = process.argv.slice(2), env = process.env, dir = DEFAULT_DIR) {
  const opts = parseArgs(argv);
  const files = listMigrations(dir).map((item) => {
    const content = fs.readFileSync(path.join(dir, item.file), 'utf8');
    return { ...item, content, checksum: checksumOf(content) };
  });

  // --dry-run 不应改动数据库，也就不创建 schema_migrations：连不上库时仅列出全部文件
  let applied;
  if (opts.dryRun) {
    const probe = await runMysql({ sql: `SELECT version, checksum FROM \`${MIGRATIONS_TABLE}\`;`, extraArgs: ['--skip-column-names'], env });
    applied = probe.code === 0 ? parseApplied(probe.stdout) : new Map();
  } else {
    try {
      applied = await loadApplied(env);
    } catch (err) {
      console.error(`无法连接数据库: ${err.message}`);
      return 2;
    }
  }

  const { pending, changed } = planMigrations(files, applied);

  if (opts.status) {
    for (const item of files) {
      const state = !applied.has(item.version) ? '待应用' : applied.get(item.version) === item.checksum ? '已应用' : '已应用但文件被改动';
      console.log(`${state.padEnd(10)} ${item.file}`);
    }
    if (files.length === 0) console.log('没有迁移文件');
    return changed.length ? 1 : 0;
  }

  if (changed.length) {
    console.error('以下已应用的迁移文件内容与记录不一致，请恢复原内容并新增迁移，而不是修改旧文件：');
    for (const item of changed) console.error(`  ${item.file}`);
    return 1;
  }

  if (pending.length === 0) {
    console.log('数据库已是最新，无需迁移');
    return 0;
  }

  for (const item of pending) {
    if (opts.dryRun) {
      console.log(`[dry-run] 将执行 ${item.file}`);
      continue;
    }
    console.log(`执行 ${item.file} ...`);
    const run = await runMysql({ sql: item.content, env });
    if (run.code !== 0) {
      console.error(`迁移失败: ${item.file}\n${run.stderr.trim()}`);
      console.error('该文件未被记录为已应用；修复后重新运行即可（注意：文件中已执行成功的语句不会自动回滚）。');
      return 1;
    }
    const record = await runMysql({
      sql: `INSERT INTO \`${MIGRATIONS_TABLE}\` (version, checksum) VALUES ('${item.version.replace(/'/g, "''")}', '${item.checksum}');`,
      env
    });
    if (record.code !== 0) {
      console.error(`迁移已执行但记录失败: ${item.file}\n${record.stderr.trim()}`);
      return 1;
    }
    console.log(`完成 ${item.file}`);
  }
  return 0;
}

module.exports = { listMigrations, planMigrations, parseArgs, parseApplied, buildConnArgs, checksumOf, main, MIN_VERSION };

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  require('dotenv').config();
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
