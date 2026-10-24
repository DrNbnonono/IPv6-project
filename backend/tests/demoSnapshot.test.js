const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const demo = require('../scripts/demoSnapshot');

describe('demoSnapshot 纯函数', () => {
  test('validateName 只接受安全的名称', () => {
    expect(demo.validateName('before-demo_1.0')).toBe('before-demo_1.0');
    for (const bad of ['', '../x', 'a/b', '-lead', '.hidden', 'a b', 'x'.repeat(65), null, undefined]) {
      expect(() => demo.validateName(bad)).toThrow();
    }
  });

  test('parseArgs：命令、名称与选项', () => {
    expect(demo.parseArgs(['list']).command).toBe('list');
    expect(demo.parseArgs(['create', 'a', '--with-files'])).toMatchObject({ command: 'create', name: 'a', withFiles: true });
    expect(demo.parseArgs(['restore', 'a', '--confirm-db', 'db', '--allow-production', '--no-safety-snapshot']))
      .toMatchObject({ confirmDb: 'db', allowProduction: true, safetySnapshot: false });
    expect(() => demo.parseArgs(['nope'])).toThrow('用法');
    expect(() => demo.parseArgs(['create'])).toThrow('名称');
    expect(() => demo.parseArgs(['create', 'a', '--bogus'])).toThrow('未知参数');
    expect(() => demo.parseArgs(['create', 'a', 'b'])).toThrow('多余');
  });

  test('buildDumpArgs 不带密码，可去掉 --routines', () => {
    const env = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'secret', DB_PORT: '3307', DB_NAME: 'd' };
    const args = demo.buildDumpArgs(env);
    expect(args).toEqual(expect.arrayContaining(['--host=h', '--user=u', '--port=3307', '--single-transaction', '--routines', '--triggers', 'd']));
    expect(args.join(' ')).not.toContain('secret');
    expect(demo.buildDumpArgs(env, { routines: false })).not.toContain('--routines');
  });

  test('stripDefinerLine 只处理建对象的行，数据行不动', () => {
    expect(demo.stripDefinerLine('/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER t AFTER INSERT ON x FOR EACH ROW BEGIN'))
      .toBe('/*!50003 CREATE*/ /*!50017*/ /*!50003 TRIGGER t AFTER INSERT ON x FOR EACH ROW BEGIN');
    expect(demo.stripDefinerLine('CREATE DEFINER=`app`@`%` PROCEDURE p()')).toBe('CREATE PROCEDURE p()');
    expect(demo.stripDefinerLine("/*!50013 DEFINER='a'@'b' SQL SECURITY DEFINER */")).toBe('/*!50013 SQL SECURITY DEFINER */');
    expect(demo.stripDefinerLine('/*!50013 SQL SECURITY DEFINER */')).toBe('/*!50013 SQL SECURITY DEFINER */');
    const dataLine = "INSERT INTO t VALUES ('CREATE DEFINER=`x`@`y` PROCEDURE');";
    expect(demo.stripDefinerLine(dataLine)).toBe(dataLine);
  });

  test('evaluateTriggerRestore 的判定', () => {
    expect(demo.evaluateTriggerRestore({ logBin: false, trust: false, grants: '' }).ok).toBe(true);
    expect(demo.evaluateTriggerRestore({ logBin: true, trust: true, grants: '' }).ok).toBe(true);
    expect(demo.evaluateTriggerRestore({ logBin: true, trust: false, grants: 'GRANT SUPER ON *.* TO `u`@`%`' }).ok).toBe(true);
    expect(demo.evaluateTriggerRestore({ logBin: true, trust: false, grants: 'GRANT ALL PRIVILEGES ON *.* TO `root`@`%`' }).ok).toBe(true);
    const denied = demo.evaluateTriggerRestore({ logBin: true, trust: false, grants: 'GRANT ALL PRIVILEGES ON `db`.* TO `u`@`%`' });
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain('log_bin_trust_function_creators');
  });

  test('createDefinerStripper 跨 chunk 边界按行处理', async () => {
    const input = ['/*!50017 DEFI', 'NER=`r`@`l`*/ A\nINSERT x;\nCREATE DEFINER=`a`@`b` V', '\nlast-no-newline'];
    let out = '';
    await pipeline(Readable.from(input), demo.createDefinerStripper(), async function* (src) { for await (const c of src) out += c; });
    expect(out).toBe('/*!50017*/ A\nINSERT x;\nCREATE V\nlast-no-newline');
  });
});

describe('demoSnapshot 创建/列表/还原（用假的 mysqldump / mysql）', () => {
  let tmp; let env; let restoredSql;
  const writeBin = (name, body) => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const silent = () => {};

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-snap-'));
    restoredSql = path.join(tmp, 'restored.sql');
    fs.mkdirSync(path.join(tmp, 'root', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'root', 'reports', 'r1.txt'), 'report');
    const dump = writeBin('fake-mysqldump', `case "$*" in *--routines*) [ -n "$FAKE_ROUTINE_DENY" ] && { echo "mysqldump: u has insufficient privileges to SHOW CREATE PROCEDURE \\\`p\\\`!" >&2; exit 2; };; esac
echo "-- dump routines:$*" | grep -q -- --routines && echo "-- with-routines" || echo "-- no-routines"
echo "/*!50017 DEFINER=\\\`root\\\`@\\\`localhost\\\`*/ trigger-line"
[ -n "$FAKE_TRIGGERS" ] && echo "/*!50003 CREATE*/ /*!50017 DEFINER=\\\`root\\\`@\\\`localhost\\\`*/ /*!50003 TRIGGER trg AFTER INSERT ON t FOR EACH ROW BEGIN"
echo "INSERT INTO t VALUES (1);"`);
    const mysql = writeBin('fake-mysql', `case "$*" in
*"SHOW FULL TABLES"*) printf 't1\\tBASE TABLE\\nt2\\tBASE TABLE\\n';;
*log_bin*) printf '%s\\t%s\\n' "\${FAKE_LOG_BIN:-0}" "\${FAKE_TRUST:-0}";;
*"SHOW GRANTS"*) echo "\${FAKE_GRANTS:-GRANT USAGE ON *.* TO u}";;
*) cat > "${restoredSql}"; if [ -n "$FAKE_RESTORE_FAIL" ]; then echo "ERROR 1419 boom" >&2; exit 1; fi;; esac`);
    env = {
      DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'demo_db', PROJECT_ROOT: path.join(tmp, 'root'),
      DEMO_SNAPSHOT_DIR: path.join(tmp, 'snaps'), MYSQLDUMP_BIN: dump, MYSQL_BIN: mysql
    };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('create：生成 gz、元数据、数据目录包；DEFINER 被去掉；权限 0600', async () => {
    const meta = await demo.createSnapshot('s1', { withFiles: true }, env, silent);
    expect(meta).toMatchObject({ name: 's1', db: 'demo_db', tables: 2, routines: true });
    expect(meta.files.dirs).toEqual(['reports']);
    const dir = demo.getSnapshotDir(env);
    const sql = zlib.gunzipSync(fs.readFileSync(path.join(dir, 's1.sql.gz'))).toString();
    expect(sql).toContain('with-routines');
    expect(sql).toContain('/*!50017*/ trigger-line');
    expect(sql).not.toContain('DEFINER');
    expect(fs.statSync(path.join(dir, 's1.sql.gz')).mode & 0o777).toBe(0o600);
    expect(demo.listSnapshots(env).map((m) => m.name)).toEqual(['s1']);
  });

  test('create：没有权限读存储过程时退为不含存储过程，并记录在元数据里', async () => {
    const logs = [];
    process.env.FAKE_ROUTINE_DENY = '1'; // 假 mysqldump 从进程环境读取
    let meta;
    try {
      meta = await demo.createSnapshot('s2', {}, env, (m) => logs.push(m));
    } finally {
      delete process.env.FAKE_ROUTINE_DENY;
    }
    expect(meta.routines).toBe(false);
    expect(logs.join('\n')).toContain('不含存储过程');
    const sql = zlib.gunzipSync(fs.readFileSync(path.join(demo.getSnapshotDir(env), 's2.sql.gz'))).toString();
    expect(sql).toContain('no-routines');
    expect(fs.readdirSync(demo.getSnapshotDir(env)).some((f) => f.endsWith('.partial'))).toBe(false);
  });

  test('create：同名快照不覆盖；mysqldump 失败不留文件', async () => {
    await demo.createSnapshot('dup', {}, env, silent);
    await expect(demo.createSnapshot('dup', {}, env, silent)).rejects.toThrow('已存在');
    const failing = path.join(tmp, 'fail-dump');
    fs.writeFileSync(failing, '#!/bin/sh\necho boom >&2\nexit 3\n', { mode: 0o755 });
    await expect(demo.createSnapshot('bad', {}, { ...env, MYSQLDUMP_BIN: failing }, silent)).rejects.toThrow('boom');
    expect(fs.readdirSync(demo.getSnapshotDir(env)).filter((f) => f.startsWith('bad'))).toEqual([]);
  });

  test('restore：缺少/写错 --confirm-db、production 无标志都拒绝', async () => {
    await demo.createSnapshot('r1', {}, env, silent);
    await expect(demo.restoreSnapshot('r1', {}, env, silent)).rejects.toThrow('--confirm-db demo_db');
    await expect(demo.restoreSnapshot('r1', { confirmDb: 'other' }, env, silent)).rejects.toThrow('--confirm-db demo_db');
    await expect(demo.restoreSnapshot('r1', { confirmDb: 'demo_db' }, { ...env, NODE_ENV: 'production' }, silent)).rejects.toThrow('--allow-production');
    expect(fs.existsSync(restoredSql)).toBe(false);
  });

  test('restore：校验和不一致、库名不符、快照不存在都拒绝', async () => {
    await demo.createSnapshot('r2', {}, env, silent);
    await expect(demo.restoreSnapshot('nope', { confirmDb: 'demo_db' }, env, silent)).rejects.toThrow('找不到快照');
    await expect(demo.restoreSnapshot('r2', { confirmDb: 'demo_db2' }, { ...env, DB_NAME: 'demo_db2' }, silent)).rejects.toThrow('拒绝还原');
    const gz = path.join(demo.getSnapshotDir(env), 'r2.sql.gz');
    fs.appendFileSync(gz, 'tamper');
    await expect(demo.restoreSnapshot('r2', { confirmDb: 'demo_db', safetySnapshot: false }, env, silent)).rejects.toThrow('校验和不一致');
    expect(fs.existsSync(restoredSql)).toBe(false);
  });

  test('restore：先留安全快照，再把 SQL 灌回，并还原数据目录', async () => {
    await demo.createSnapshot('ok', { withFiles: true }, env, silent);
    fs.rmSync(path.join(env.PROJECT_ROOT, 'reports', 'r1.txt'));
    const logs = [];
    const { safety } = await demo.restoreSnapshot('ok', { confirmDb: 'demo_db' }, env, (m) => logs.push(m));
    expect(safety).toMatch(/^auto-before-restore-ok-\d{14}$/);
    expect(demo.listSnapshots(env).map((m) => m.name)).toEqual(expect.arrayContaining(['ok', safety]));
    expect(fs.readFileSync(restoredSql, 'utf8')).toContain('INSERT INTO t VALUES (1);');
    expect(fs.readFileSync(path.join(env.PROJECT_ROOT, 'reports', 'r1.txt'), 'utf8')).toBe('report');
    expect(logs.join('\n')).toContain(`restore ${safety}`);
  });

  const withEnv = async (vars, fn) => {
    Object.assign(process.env, vars);
    try { return await fn(); } finally { for (const k of Object.keys(vars)) delete process.env[k]; }
  };

  test('create：统计触发器个数写进元数据', async () => {
    const meta = await withEnv({ FAKE_TRIGGERS: '1' }, () => demo.createSnapshot('t1', {}, env, silent));
    expect(meta.triggers).toBe(1);
    expect((await demo.createSnapshot('t0', {}, env, silent)).triggers).toBe(0);
  });

  test('restore：含触发器且服务器开了 binlog、账号无 SUPER 时，动手前拒绝', async () => {
    await withEnv({ FAKE_TRIGGERS: '1' }, () => demo.createSnapshot('tr', {}, env, silent));
    await withEnv({ FAKE_LOG_BIN: '1', FAKE_TRUST: '0' }, async () => {
      await expect(demo.restoreSnapshot('tr', { confirmDb: 'demo_db' }, env, silent)).rejects.toThrow('ERROR 1419');
    });
    expect(fs.existsSync(restoredSql)).toBe(false); // 没有碰数据库
    expect(demo.listSnapshots(env).map((m) => m.name)).toEqual(['tr']); // 连安全快照都没留
  });

  test('restore：有 SUPER 或 trust 开启时放行', async () => {
    await withEnv({ FAKE_TRIGGERS: '1' }, () => demo.createSnapshot('tr2', {}, env, silent));
    await withEnv({ FAKE_LOG_BIN: '1', FAKE_TRUST: '1' }, () => demo.restoreSnapshot('tr2', { confirmDb: 'demo_db', safetySnapshot: false }, env, silent));
    expect(fs.existsSync(restoredSql)).toBe(true);
    fs.rmSync(restoredSql);
    await withEnv({ FAKE_LOG_BIN: '1', FAKE_TRUST: '0', FAKE_GRANTS: 'GRANT SUPER ON *.* TO u' }, () => demo.restoreSnapshot('tr2', { confirmDb: 'demo_db', safetySnapshot: false }, env, silent));
    expect(fs.existsSync(restoredSql)).toBe(true);
  });

  test('restore：中途失败时提示用安全快照退回', async () => {
    await demo.createSnapshot('fl', {}, env, silent);
    await withEnv({ FAKE_RESTORE_FAIL: '1' }, async () => {
      await expect(demo.restoreSnapshot('fl', { confirmDb: 'demo_db' }, env, silent))
        .rejects.toThrow(/不一致状态[\s\S]*auto-before-restore-fl-\d{14}/);
      await expect(demo.restoreSnapshot('fl', { confirmDb: 'demo_db', safetySnapshot: false }, env, silent))
        .rejects.toThrow('没有安全快照');
    });
  });

  test('restore：--no-safety-snapshot 不创建安全快照', async () => {
    await demo.createSnapshot('ns', {}, env, silent);
    const { safety } = await demo.restoreSnapshot('ns', { confirmDb: 'demo_db', safetySnapshot: false }, env, silent);
    expect(safety).toBeNull();
    expect(demo.listSnapshots(env)).toHaveLength(1);
  });
});
