const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../database/db', () => ({ query: jest.fn(), end: jest.fn() }));

let tmpRoot;
let storage;
let db;

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-storage-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  storage = require('../services/storageService');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  db.query.mockReset();
});

describe('目录配置', () => {
  test('PROJECT_ROOT 可由环境变量指定，所有目录都在其下', () => {
    expect(storage.PROJECT_ROOT).toBe(tmpRoot);
    Object.values(storage.DIRS).forEach((dir) => {
      expect(storage.isInside(tmpRoot, dir)).toBe(true);
    });
  });

  test('加载模块不会创建目录', () => {
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  test('ensureDirs 创建可写目录，但不创建随仓库提供的 docs 目录', () => {
    storage.ensureDirs();
    expect(fs.existsSync(storage.DIRS.zgrab2Inputs)).toBe(true);
    expect(fs.existsSync(storage.DIRS.jsonanalysisTemp)).toBe(true);
    expect(fs.existsSync(storage.DIRS.docsXmap)).toBe(false);
  });

  test('ensureDirs 拒绝未知目录名', () => {
    expect(() => storage.ensureDirs(['nope'])).toThrow('未知目录');
  });
});

describe('safeJoin', () => {
  const base = () => storage.DIRS.whitelists;

  test('正常文件名', () => {
    expect(storage.safeJoin(base(), 'a_1.txt')).toBe(path.join(base(), 'a_1.txt'));
  });

  test.each([
    ['..', '..'],
    ['路径穿越', '../secret.txt'],
    ['深层穿越', 'a/../../b'],
    ['绝对路径', '/etc/passwd'],
    ['子目录', 'sub/a.txt'],
    ['反斜杠', 'a\\b.txt'],
    ['空字节', 'a\0.txt'],
    ['空字符串', ''],
    ['点', '.'],
    ['非字符串', null],
    ['超长', 'a'.repeat(300)]
  ])('拒绝%s', (_name, input) => {
    expect(() => storage.safeJoin(base(), input)).toThrow();
  });
});

describe('resolveStoredPath', () => {
  test('相对路径按 PROJECT_ROOT 解析', () => {
    expect(storage.resolveStoredPath('zgrab2_results/1.jsonl')).toBe(path.join(tmpRoot, 'zgrab2_results', '1.jsonl'));
  });

  test('旧部署目录前缀被改写到当前根目录', () => {
    const resolved = storage.resolveStoredPath('/home/ipv6/IPv6-project/zgrab2_inputs/a.txt', storage.DIRS.zgrab2Inputs);
    expect(resolved).toBe(path.join(storage.DIRS.zgrab2Inputs, 'a.txt'));
  });

  test('当前根目录下的绝对路径可用', () => {
    const p = path.join(storage.DIRS.zgrab2Inputs, 'a.txt');
    expect(storage.resolveStoredPath(p, storage.DIRS.zgrab2Inputs)).toBe(p);
  });

  test.each([
    ['系统文件', '/etc/passwd'],
    ['穿越', 'zgrab2_inputs/../../etc/passwd'],
    ['旧前缀穿越', '/home/ipv6/IPv6-project/../../etc/passwd'],
    ['其他目录', '/tmp/other.txt'],
    ['空字节', 'a\0b'],
    ['空值', '']
  ])('限定目录时拒绝%s', (_name, input) => {
    expect(() => storage.resolveStoredPath(input, storage.DIRS.zgrab2Inputs)).toThrow();
  });

  test('目录限制：根目录内但不在指定目录也拒绝', () => {
    expect(() => storage.resolveStoredPath('whitelists/a.txt', storage.DIRS.zgrab2Inputs)).toThrow('超出允许范围');
  });
});

describe('normalizeTargets', () => {
  test('字符串按空白/逗号/分号拆分并去重', () => {
    expect(storage.normalizeTargets('2001:db8::1, 2001:db8::2\n2001:db8::1;192.0.2.0/24'))
      .toEqual(['2001:db8::1', '2001:db8::2', '192.0.2.0/24']);
  });

  test.each([
    ['含 shell 字符', ['2001:db8::1; rm -rf /']],
    ['域名', ['example.com']],
    ['空列表', []],
    ['非数组非字符串', 123]
  ])('拒绝%s', (_name, input) => {
    expect(() => storage.normalizeTargets(input)).toThrow();
  });

  test('超过上限', () => {
    const many = Array.from({ length: storage.MAX_TARGETS + 1 }, (_, i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`);
    expect(() => storage.normalizeTargets(many)).toThrow('超过上限');
  });
});

describe('saveTargetsFile', () => {
  test('写入文件并登记到 whitelists 表', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([{ insertId: 11 }]);

    const result = await storage.saveTargetsFile(7, ['2001:db8::1', '2001:db8::2'], 'zgrab2');

    expect(result.count).toBe(2);
    expect(result.fileName).toMatch(/^zgrab2_input_7_\d+\.txt$/);
    expect(path.dirname(result.filePath)).toBe(storage.DIRS.zgrab2Inputs);
    expect(fs.readFileSync(result.filePath, 'utf8')).toBe('2001:db8::1\n2001:db8::2\n');

    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO whitelists/);
    expect(params.slice(0, 4)).toEqual([7, 3, result.fileName, result.filePath]);
  });

  test('数据库写入失败时删除已写的文件', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockRejectedValueOnce(new Error('db down'));

    const before = fs.readdirSync(storage.DIRS.zgrab2Inputs).length;
    await expect(storage.saveTargetsFile(7, ['2001:db8::1'], 'zgrab2')).rejects.toThrow('db down');
    expect(fs.readdirSync(storage.DIRS.zgrab2Inputs).length).toBe(before);
  });

  test('工具未配置时不写文件', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const before = fs.readdirSync(storage.DIRS.zgrab2Inputs).length;
    await expect(storage.saveTargetsFile(7, ['2001:db8::1'], 'zgrab2')).rejects.toThrow('工具未配置');
    expect(fs.readdirSync(storage.DIRS.zgrab2Inputs).length).toBe(before);
  });

  test('非法目标、未知工具、非法用户ID 被拒绝', async () => {
    await expect(storage.saveTargetsFile(7, ['bad;target'], 'zgrab2')).rejects.toThrow('目标格式无效');
    await expect(storage.saveTargetsFile(7, ['2001:db8::1'], 'nmap')).rejects.toThrow('不支持的工具');
    await expect(storage.saveTargetsFile('7', ['2001:db8::1'], 'zgrab2')).rejects.toThrow('用户ID无效');
  });
});
