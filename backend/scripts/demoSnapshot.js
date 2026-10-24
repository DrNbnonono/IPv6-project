#!/usr/bin/env node
/**
 * 演示数据快照与一键回滚（P6-2）。
 *
 *   node scripts/demoSnapshot.js create before-demo              # 备份整个数据库
 *   node scripts/demoSnapshot.js create before-demo --with-files # 同时备份扫描结果等数据目录
 *   node scripts/demoSnapshot.js list
 *   node scripts/demoSnapshot.js restore before-demo --confirm-db ipv6_project
 *
 * 用途：演示前拍一个快照，演示中创建的任务/数据入库之后，一条命令回到演示前的状态。
 *
 * 行为与安全：
 *  - 复用 .env 的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME；密码通过 MYSQL_PWD 传给客户端，不出现在进程参数里。
 *  - 快照在 DEMO_SNAPSHOT_DIR（默认 <PROJECT_ROOT>/demo_snapshots，已 gitignore）：<名称>.sql.gz + <名称>.json（校验和等元数据）
 *    [+ <名称>.files.tar.gz]。文件权限 0600——快照里有用户表（密码哈希）与 API 密钥哈希，不要提交或外传。
 *  - 还原是破坏性操作：必须带 --confirm-db <当前 DB_NAME>（防止连错库）；NODE_ENV=production 时还需 --allow-production；
 *    还原前校验 sha256；默认先自动创建一个 auto-before-restore-* 安全快照（--no-safety-snapshot 关闭）。
 *  - 当前账号无权读取存储过程定义时（过程由 root 创建而你用的是普通账号），快照会自动退为不含存储过程，并在输出和元数据（routines:false）里说明。
 *  - 含触发器的快照还原需要建触发器：二进制日志开启（MySQL 8 默认）且账号无 SUPER 时服务器会拒绝（ERROR 1419）。
 *    DDL 不能回滚，所以还原前先预检，不满足就拒绝并说明做法，数据库不被改动；真失败时提示用安全快照退回。
 *  - 快照不含视图（视图不是数据；MySQL 8 里普通账号无法替换 root 创建的视图，ERROR 1227）：还原时现有视图保持不动。
 *  - 导出时去掉 DEFINER 子句，否则用权限较低的账号还原触发器/存储过程会失败。
 *  - 还原只覆盖快照里有的表（DROP TABLE + 重建 + 灌数据）；快照之后新建的表（例如之后才执行的迁移）不会被删除。
 *    文件还原是覆盖解压：快照之后新增的结果文件不会被删除。
 *  - 依赖 mysqldump / mysql / tar 命令行（后端镜像里有 default-mysql-client；可用 MYSQLDUMP_BIN / MYSQL_BIN 指定）。
 * 这是 CLI 工具，直接输出到控制台。退出码：0 成功；1 参数或前置检查失败；2 外部命令失败。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Transform, pipeline } = require('stream');

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// 与 storageService.DIRS 对应的一级目录名（任务产物与输入）；只备份其中存在的
const DATA_DIRS = ['xmap_result', 'zgrab2_results', 'apd_results', 'tga_results', 'reports', 'whitelists', 'zgrab2_inputs', 'zgrab2_configs', 'apd_inputs', 'tga_inputs'];

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.exitCode = code;
  }
}

const getRoot = (env = process.env) => path.resolve(env.PROJECT_ROOT || path.join(__dirname, '../..'));
const getSnapshotDir = (env = process.env) => path.resolve(env.DEMO_SNAPSHOT_DIR || path.join(getRoot(env), 'demo_snapshots'));

const validateName = (name) => {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new CliError('快照名称只能包含字母、数字、点、下划线、连字符（1–64 位，且以字母或数字开头）');
  }
  return name;
};

const snapshotPaths = (dir, name) => ({
  sql: path.join(dir, `${name}.sql.gz`),
  meta: path.join(dir, `${name}.json`),
  files: path.join(dir, `${name}.files.tar.gz`)
});

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const opts = { command, name: null, withFiles: false, confirmDb: null, allowProduction: false, safetySnapshot: true };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--with-files') opts.withFiles = true;
    else if (arg === '--confirm-db') opts.confirmDb = rest[++i];
    else if (arg === '--allow-production') opts.allowProduction = true;
    else if (arg === '--no-safety-snapshot') opts.safetySnapshot = false;
    else if (arg.startsWith('--')) throw new CliError(`未知参数：${arg}`);
    else if (opts.name === null) opts.name = arg;
    else throw new CliError(`多余的参数：${arg}`);
  }
  if (!['create', 'list', 'restore'].includes(command)) throw new CliError('用法：demoSnapshot.js create|list|restore <名称> [选项]');
  if (command !== 'list') validateName(opts.name);
  return opts;
};

/** 连接参数（不含密码；密码走 MYSQL_PWD）。 */
const buildConnArgs = (env = process.env) => {
  const args = [`--host=${env.DB_HOST || 'localhost'}`, `--user=${env.DB_USER || 'linux_db'}`];
  if (env.DB_PORT) args.push(`--port=${env.DB_PORT}`);
  return args;
};

const getDbName = (env = process.env) => env.DB_NAME || 'ipv6_project';

const buildDumpArgs = (env = process.env, { routines = true, views = [] } = {}) => [
  ...buildConnArgs(env),
  '--default-character-set=utf8mb4',
  '--single-transaction', // InnoDB 一致性快照，不锁表
  ...(routines ? ['--routines'] : []),
  '--triggers',
  '--no-tablespaces', // MySQL 8 下普通账号没有 PROCESS 权限
  '--hex-blob',
  // 视图不是数据，而且 MySQL 8 里普通账号无法替换别的账号（如导入 structure.sql 的 root）创建的视图（ERROR 1227 需要 SYSTEM_USER），
  // 所以快照不含视图，还原时现有视图保持不动（它们按表名读取，表重建后继续可用）
  ...views.map((v) => `--ignore-table=${getDbName(env)}.${v}`),
  getDbName(env)
];

const buildRestoreArgs = (env = process.env) => [...buildConnArgs(env), '--default-character-set=utf8mb4', getDbName(env)];

/** 去掉 DEFINER 子句的行级转换：只处理建触发器/过程/视图的行，数据行原样放过。 */
const DEFINER_PATTERN = /\s*DEFINER\s*=\s*(`[^`]*`|'[^']*'|"[^"]*"|[^\s*@]+)@(`[^`]*`|'[^']*'|"[^"]*"|[^\s*]+)/g;
const stripDefinerLine = (line) => {
  if (!line.includes('DEFINER')) return line;
  if (!(line.startsWith('/*!') || line.startsWith('CREATE'))) return line;
  return line.replace(DEFINER_PATTERN, '');
};

// mysqldump 建触发器的行形如 /*!50003 CREATE*/ /*!50017 DEFINER=...*/ /*!50003 TRIGGER name ...
const TRIGGER_LINE = /^\/\*!\d+ CREATE\*\/.*\/\*!\d+ TRIGGER /;

const createDefinerStripper = () => {
  let rest = '';
  const handle = (line, self) => {
    if (TRIGGER_LINE.test(line)) self.triggers += 1;
    return stripDefinerLine(line);
  };
  const stream = new Transform({
    transform(chunk, encoding, callback) {
      rest += chunk.toString('utf8');
      const lines = rest.split('\n');
      rest = lines.pop();
      callback(null, lines.map((l) => `${handle(l, stream)}\n`).join(''));
    },
    flush(callback) {
      callback(null, rest ? handle(rest, stream) : '');
    }
  });
  stream.triggers = 0; // 导出里的触发器个数，写进元数据，还原前用来判断权限
  return stream;
};

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => hash.update(d)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
});

const runCommand = (bin, args, { env = process.env, stdin, stdout } = {}) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, {
    env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD || '' },
    stdio: [stdin ? 'pipe' : 'ignore', stdout ? 'pipe' : 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('error', (err) => reject(new CliError(`无法启动 ${bin}：${err.message}`, 2)));
  if (stdin) child.stdin.on('error', () => {});
  child.on('close', (code) => resolve({ code, stderr: stderr.trim() }));
  if (stdin) stdin(child.stdin);
  if (stdout) stdout(child.stdout);
});

const dumpDatabase = async (outFile, env, { routines = true, views = [] } = {}) => {
  const bin = env.MYSQLDUMP_BIN || 'mysqldump';
  const partial = `${outFile}.partial`; // 写完并确认 mysqldump 成功后才改名，失败不会留下半截快照
  const out = fs.createWriteStream(partial, { mode: 0o600 });
  let piped = Promise.resolve();
  const stripper = createDefinerStripper();
  const result = await runCommand(bin, buildDumpArgs(env, { routines, views }), {
    env,
    stdout: (stream) => {
      piped = new Promise((resolve, reject) => {
        pipeline(stream, stripper, zlib.createGzip(), out, (err) => (err ? reject(err) : resolve()));
      });
      piped.catch(() => {});
    }
  });
  if (result.code !== 0) {
    await piped.catch(() => {});
    fs.rmSync(partial, { force: true });
    throw new CliError(`mysqldump 失败（退出码 ${result.code}）：${result.stderr}`, 2);
  }
  await piped;
  fs.renameSync(partial, outFile);
  return { triggers: stripper.triggers };
};

/**
 * 还原含触发器的快照需要创建触发器：二进制日志开启（MySQL 8 默认）且账号没有 SUPER/SET_USER_ID 时，
 * 服务器要求 log_bin_trust_function_creators=1，否则建触发器报 ERROR 1419。
 * 而 DDL 不能回滚——还原是先删表再重建，中途失败会留下半截数据库——所以必须在动手前判断。
 */
const evaluateTriggerRestore = ({ logBin, trust, grants }) => {
  if (!logBin || trust) return { ok: true };
  const privileged = /\b(SUPER|SET_USER_ID)\b/i.test(grants) || /ALL PRIVILEGES ON \*\.\*/i.test(grants);
  if (privileged) return { ok: true };
  return {
    ok: false,
    message: '该快照含触发器，但服务器开启了二进制日志且当前账号没有 SUPER 权限，建触发器会报 ERROR 1419，还原会中途失败。'
      + '请先让 DBA 设置 log_bin_trust_function_creators=1（docker-compose 的 mysql 已默认带 --log-bin-trust-function-creators=1），'
      + '或改用有 SUPER 权限的账号（临时设置 DB_USER/DB_PASSWORD）再还原。数据库没有被改动。'
  };
};

const queryOutput = async (sql, env) => {
  const bin = env.MYSQL_BIN || 'mysql';
  let out = '';
  const result = await runCommand(bin, [...buildConnArgs(env), '--batch', '--skip-column-names', '-e', sql], {
    env, stdout: (s) => s.on('data', (d) => { out += d; })
  });
  return result.code === 0 ? out : null;
};

const preflightTriggerRestore = async (env) => {
  const vars = await queryOutput('SELECT @@global.log_bin, @@global.log_bin_trust_function_creators', env);
  const grants = await queryOutput('SHOW GRANTS FOR CURRENT_USER()', env);
  if (vars === null || grants === null) return { ok: true, unknown: true }; // 查不到就不拦，真失败时会有安全快照兜底
  const [logBin, trust] = vars.trim().split(/\s+/).map((v) => v === '1' || /^ON$/i.test(v));
  return evaluateTriggerRestore({ logBin, trust, grants });
};

const restoreDatabase = async (sqlFile, env) => {
  const bin = env.MYSQL_BIN || 'mysql';
  const result = await runCommand(bin, buildRestoreArgs(env), {
    env,
    stdin: (stream) => pipeline(fs.createReadStream(sqlFile), zlib.createGunzip(), stream, () => {})
  });
  if (result.code !== 0) throw new CliError(`mysql 还原失败（退出码 ${result.code}）：${result.stderr}`, 2);
};

const existingDataDirs = (env) => DATA_DIRS.filter((n) => fs.existsSync(path.join(getRoot(env), n)));

const tarFiles = async (outFile, env) => {
  const dirs = existingDataDirs(env);
  if (dirs.length === 0) return [];
  const result = await runCommand('tar', ['-czf', outFile, '-C', getRoot(env), ...dirs], { env });
  if (result.code !== 0) throw new CliError(`打包数据目录失败：${result.stderr}`, 2);
  fs.chmodSync(outFile, 0o600);
  return dirs;
};

const untarFiles = async (file, env) => {
  const result = await runCommand('tar', ['-xzf', file, '-C', getRoot(env)], { env });
  if (result.code !== 0) throw new CliError(`解压数据目录失败：${result.stderr}`, 2);
};

/** 当前库里的基础表与视图名称。 */
const listObjects = async (env) => {
  const bin = env.MYSQL_BIN || 'mysql';
  let out = '';
  const result = await runCommand(bin, [...buildConnArgs(env), '--batch', '--skip-column-names', '-e', 'SHOW FULL TABLES', getDbName(env)], {
    env, stdout: (s) => s.on('data', (d) => { out += d; })
  });
  if (result.code !== 0) throw new CliError(`无法连接数据库：${result.stderr}`, 2);
  const tables = [];
  const views = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [name, type] = line.split('\t');
    (/VIEW/i.test(type || '') ? views : tables).push(name);
  }
  return { tables, views };
};

const createSnapshot = async (name, { withFiles = false } = {}, env = process.env, log = console.log) => {
  const dir = getSnapshotDir(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = snapshotPaths(dir, name);
  if (fs.existsSync(p.meta) || fs.existsSync(p.sql)) throw new CliError(`快照 ${name} 已存在；换个名字，或先手动删除 ${dir} 下的同名文件`);

  const { tables, views } = await listObjects(env);
  log(`正在备份数据库 ${getDbName(env)}（${tables.length} 张表；${views.length} 个视图不进快照）…`);
  let routines = true;
  let dumped;
  try {
    dumped = await dumpDatabase(p.sql, env, { routines: true, views });
  } catch (err) {
    // 存储过程由别的账号（如 root）创建时，普通账号没有权限读取其定义；过程不是数据，不阻塞快照
    if (!/insufficient privileges/i.test(err.message)) throw err;
    routines = false;
    log('提示：当前账号无权读取部分存储过程的定义，快照不含存储过程（只含表、视图、触发器和数据）。还原时现有存储过程不会被改动。');
    dumped = await dumpDatabase(p.sql, env, { routines: false, views });
  }

  let dirs = [];
  if (withFiles) {
    log('正在打包数据目录…');
    dirs = await tarFiles(p.files, env);
  }

  const meta = {
    name,
    createdAt: new Date().toISOString(),
    db: getDbName(env),
    tables: tables.length,
    views: views.length,
    routines,
    triggers: dumped.triggers,
    sqlFile: path.basename(p.sql),
    sqlBytes: fs.statSync(p.sql).size,
    sha256: await sha256File(p.sql),
    files: dirs.length ? { file: path.basename(p.files), dirs, sha256: await sha256File(p.files) } : null
  };
  fs.writeFileSync(p.meta, JSON.stringify(meta, null, 2), { mode: 0o600 });
  log(`快照已创建：${p.sql}（${meta.sqlBytes} 字节）`);
  return meta;
};

const readMeta = (dir, name) => {
  const p = snapshotPaths(dir, name);
  if (!fs.existsSync(p.meta) || !fs.existsSync(p.sql)) throw new CliError(`找不到快照 ${name}（目录：${dir}）`);
  try {
    return { meta: JSON.parse(fs.readFileSync(p.meta, 'utf8')), paths: p };
  } catch (err) {
    throw new CliError(`快照 ${name} 的元数据无法解析：${err.message}`);
  }
};

const listSnapshots = (env = process.env) => {
  const dir = getSnapshotDir(env);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
};

const restoreSnapshot = async (name, opts, env = process.env, log = console.log) => {
  const dbName = getDbName(env);
  if (opts.confirmDb !== dbName) throw new CliError(`还原会覆盖数据库 ${dbName} 里的数据。确认无误请加 --confirm-db ${dbName}`);
  if (env.NODE_ENV === 'production' && !opts.allowProduction) throw new CliError('NODE_ENV=production：还原生产库需要显式加 --allow-production');

  const dir = getSnapshotDir(env);
  const { meta, paths } = readMeta(dir, name);
  if (meta.db && meta.db !== dbName) throw new CliError(`该快照来自数据库 ${meta.db}，当前连接的是 ${dbName}，拒绝还原`);
  if ((await sha256File(paths.sql)) !== meta.sha256) throw new CliError(`快照 ${name} 的校验和不一致，文件可能已损坏或被改动，拒绝还原`);
  if (meta.files) {
    if (!fs.existsSync(paths.files)) throw new CliError(`快照 ${name} 记录了数据目录备份，但 ${path.basename(paths.files)} 不存在`);
    if ((await sha256File(paths.files)) !== meta.files.sha256) throw new CliError(`快照 ${name} 的数据目录备份校验和不一致，拒绝还原`);
  }

  if (meta.triggers > 0) {
    const check = await preflightTriggerRestore(env);
    if (!check.ok) throw new CliError(check.message);
  }

  let safety = null;
  if (opts.safetySnapshot !== false) {
    safety = `auto-before-restore-${name}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`.slice(0, 64);
    log(`还原前先留一个安全快照：${safety}`);
    await createSnapshot(safety, { withFiles: Boolean(meta.files) }, env, log);
  }

  log(`正在还原 ${name}（${meta.createdAt}）到 ${dbName}…`);
  try {
    await restoreDatabase(paths.sql, env);
    if (meta.files) {
      log('正在还原数据目录…');
      await untarFiles(paths.files, env);
    }
  } catch (err) {
    // 先删表再重建，中途失败数据库会处于不一致状态：必须明确告诉用户怎么退回去
    err.message += safety
      ? `\n还原中途失败，数据库可能处于不一致状态。可用安全快照退回：restore ${safety} --confirm-db ${dbName}（若失败原因没解决，同样的失败会再发生，请先处理原因）`
      : '\n还原中途失败，数据库可能处于不一致状态，且没有安全快照；请从其他备份恢复。';
    throw err;
  }
  log(`还原完成。${safety ? `如需撤销：restore ${safety} --confirm-db ${dbName}` : ''}`);
  return { meta, safety };
};

const main = async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.command === 'list') {
      const items = listSnapshots();
      if (items.length === 0) console.log(`没有快照（目录：${getSnapshotDir()}）`);
      for (const m of items) console.log(`${m.name}\t${m.createdAt}\t${m.db}\t${m.tables} 表\t${m.sqlBytes} 字节${m.files ? '\t含数据目录' : ''}`);
      return;
    }
    if (opts.command === 'create') await createSnapshot(opts.name, { withFiles: opts.withFiles });
    else await restoreSnapshot(opts.name, opts);
  } catch (err) {
    console.error(err.message);
    process.exit(err.exitCode || 1);
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  CliError,
  NAME_PATTERN,
  validateName,
  parseArgs,
  buildDumpArgs,
  buildRestoreArgs,
  stripDefinerLine,
  createDefinerStripper,
  evaluateTriggerRestore,
  snapshotPaths,
  getSnapshotDir,
  createSnapshot,
  restoreSnapshot,
  listSnapshots
};
