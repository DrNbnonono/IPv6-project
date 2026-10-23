/**
 * 迁移执行器：文件筛选/排序、计划、参数、以及用假的 mysql 客户端走完整流程（无需真实数据库）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listMigrations,
  planMigrations,
  parseArgs,
  parseApplied,
  buildConnArgs,
  checksumOf,
  main
} = require('../scripts/migrate');

let tmp;
let logSpy;
let errSpy;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (name, content = '-- noop\n') => fs.writeFileSync(path.join(tmp, name), content);

describe('listMigrations', () => {
  test('只取 NN >= 08 的 .sql 文件，并按编号与文件名排序', () => {
    ['01-a.sql', '07-agent-memory.sql', '10-late.sql', '08-b.sql', '08-a.sql', '09-c.sql', 'init.sql', 'notes.md', 'README.md'].forEach((f) => write(f));
    expect(listMigrations(tmp).map((m) => m.file)).toEqual(['08-a.sql', '08-b.sql', '09-c.sql', '10-late.sql']);
  });

  test('version 为不含扩展名的文件名；目录为空返回空数组', () => {
    expect(listMigrations(tmp)).toEqual([]);
    write('08-seed.sql');
    expect(listMigrations(tmp)[0].version).toBe('08-seed');
  });

  test('仓库中的真实 sql/ 目录至少包含 08-seed-tools', () => {
    const real = listMigrations();
    expect(real.map((m) => m.version)).toContain('08-seed-tools');
  });
});

describe('planMigrations', () => {
  const files = [
    { version: '08-a', checksum: 'x' },
    { version: '09-b', checksum: 'y' },
    { version: '10-c', checksum: 'z' }
  ];

  test('区分待执行与内容被改动的已应用迁移', () => {
    const applied = new Map([['08-a', 'x'], ['09-b', 'CHANGED']]);
    const { pending, changed } = planMigrations(files, applied);
    expect(pending.map((f) => f.version)).toEqual(['10-c']);
    expect(changed.map((f) => f.version)).toEqual(['09-b']);
  });

  test('全新数据库全部待执行', () => {
    expect(planMigrations(files, new Map()).pending).toHaveLength(3);
  });
});

describe('parseArgs / parseApplied / buildConnArgs', () => {
  test('parseArgs', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, status: false });
    expect(parseArgs(['--dry-run'])).toEqual({ dryRun: true, status: false });
    expect(parseArgs(['--status']).status).toBe(true);
    expect(() => parseArgs(['--force'])).toThrow('未知参数');
  });

  test('parseApplied 解析 mysql --skip-column-names 的制表符输出', () => {
    const map = parseApplied('08-a\taaa\n09-b\tbbb\n\n');
    expect(map.get('08-a')).toBe('aaa');
    expect(map.size).toBe(2);
  });

  test('连接参数来自环境变量，且密码不在命令行参数中', () => {
    const args = buildConnArgs({ DB_HOST: 'db', DB_USER: 'u', DB_PASSWORD: 'secret-pw', DB_NAME: 'n', DB_PORT: '3307' });
    expect(args).toEqual(expect.arrayContaining(['--host=db', '--user=u', '--port=3307', 'n']));
    expect(args.join(' ')).not.toContain('secret-pw');
  });

  test('checksum 稳定', () => {
    expect(checksumOf('a')).toBe(checksumOf('a'));
    expect(checksumOf('a')).not.toBe(checksumOf('b'));
  });
});

describe('main（假的 mysql 客户端）', () => {
  let fake;
  let stateFile;
  let execLog;

  // 假客户端：把收到的 SQL 追加到 execLog；遇到 "SELECT version, checksum" 输出 stateFile 的内容；
  // SQL 里含 FAIL_ME 时以退出码 1 失败；FAIL_CONNECT 环境变量存在时一律失败
  beforeEach(() => {
    stateFile = path.join(tmp, 'state.txt');
    execLog = path.join(tmp, 'exec.log');
    fake = path.join(tmp, 'fake-mysql.sh');
    fs.writeFileSync(stateFile, '');
    fs.writeFileSync(
      fake,
      `#!/bin/bash
if [ -n "$FAIL_CONNECT" ]; then echo "ERROR 2002: cannot connect" >&2; exit 1; fi
sql=$(cat)
printf '%s\\n---\\n' "$sql" >> "${execLog}"
if echo "$sql" | grep -q "SELECT version, checksum"; then cat "${stateFile}"; exit 0; fi
if echo "$sql" | grep -q "FAIL_ME"; then echo "ERROR 1064: syntax" >&2; exit 1; fi
if echo "$sql" | grep -q "INSERT INTO \\\`schema_migrations\\\`"; then
  v=$(echo "$sql" | sed -E "s/.*VALUES \\('([^']+)', '([0-9a-f]+)'\\).*/\\1\\t\\2/")
  printf '%b\\n' "$v" >> "${stateFile}"
fi
exit 0
`,
      { mode: 0o755 }
    );
  });

  const env = () => ({ MYSQL_BIN: fake, DB_PASSWORD: 'pw' });
  const migDir = () => {
    const d = path.join(tmp, 'sql');
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  test('按顺序执行待应用迁移并记录；再次运行不重复执行', async () => {
    const dir = migDir();
    fs.writeFileSync(path.join(dir, '08-a.sql'), 'SELECT 1;\n');
    fs.writeFileSync(path.join(dir, '09-b.sql'), 'SELECT 2;\n');

    expect(await main([], env(), dir)).toBe(0);
    const log = fs.readFileSync(execLog, 'utf8');
    expect(log.indexOf('SELECT 1;')).toBeGreaterThan(-1);
    expect(log.indexOf('SELECT 1;')).toBeLessThan(log.indexOf('SELECT 2;'));
    expect(fs.readFileSync(stateFile, 'utf8')).toContain('08-a');
    expect(fs.readFileSync(stateFile, 'utf8')).toContain('09-b');

    fs.writeFileSync(execLog, '');
    expect(await main([], env(), dir)).toBe(0);
    expect(fs.readFileSync(execLog, 'utf8')).not.toContain('SELECT 1;');
  });

  test('--dry-run 不执行迁移、不写 schema_migrations', async () => {
    const dir = migDir();
    fs.writeFileSync(path.join(dir, '08-a.sql'), 'SELECT 1;\n');
    expect(await main(['--dry-run'], env(), dir)).toBe(0);
    const log = fs.readFileSync(execLog, 'utf8');
    expect(log).not.toContain('SELECT 1;');
    expect(log).not.toContain('CREATE TABLE');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('[dry-run] 将执行 08-a.sql');
  });

  test('迁移失败时返回 1，且不记录该迁移，也不继续后面的', async () => {
    const dir = migDir();
    fs.writeFileSync(path.join(dir, '08-bad.sql'), 'FAIL_ME;\n');
    fs.writeFileSync(path.join(dir, '09-after.sql'), 'SELECT 9;\n');
    expect(await main([], env(), dir)).toBe(1);
    expect(fs.readFileSync(stateFile, 'utf8')).toBe('');
    expect(fs.readFileSync(execLog, 'utf8')).not.toContain('SELECT 9;');
  });

  test('已应用的迁移被改动时返回 1', async () => {
    const dir = migDir();
    fs.writeFileSync(path.join(dir, '08-a.sql'), 'SELECT 1;\n');
    fs.writeFileSync(stateFile, '08-a\tdeadbeef\n');
    expect(await main([], env(), dir)).toBe(1);
    expect(errSpy.mock.calls.flat().join('\n')).toContain('08-a.sql');
  });

  test('无法连接数据库时返回 2', async () => {
    const dir = migDir();
    fs.writeFileSync(path.join(dir, '08-a.sql'), 'SELECT 1;\n');
    process.env.FAIL_CONNECT = '1'; // 假客户端读取子进程环境
    try {
      expect(await main([], env(), dir)).toBe(2);
    } finally {
      delete process.env.FAIL_CONNECT;
    }
  });
});
