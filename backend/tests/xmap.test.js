const fs = require('fs');
const os = require('os');
const path = require('path');

const mockSpawn = jest.fn(() => ({
  pid: 99,
  unref: jest.fn(),
  on: jest.fn(),
  stderr: { pipe: jest.fn() }
}));
jest.mock('child_process', () => ({ spawn: (...args) => mockSpawn(...args), exec: jest.fn(), execFile: jest.fn() }));
jest.mock('../database/db', () => ({ query: jest.fn().mockResolvedValue([{}]), getConnection: jest.fn(), end: jest.fn() }));

let tmpRoot;
let controller;
let db;

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-xmap-')));
  process.env.PROJECT_ROOT = tmpRoot;
  jest.resetModules();
  db = require('../database/db');
  const { ensureDirs, DIRS } = require('../services/storageService');
  ensureDirs();
  fs.writeFileSync(path.join(DIRS.whitelists, 'whitelist_5_1.txt'), '2001:db8::/32\n');
  fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'secret\n');
  controller = require('../controllers/xmapController');
});

afterAll(() => {
  delete process.env.PROJECT_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue([{}]);
  // 不真正打开日志文件，避免测试目录清理后异步报错
  jest.spyOn(fs, 'createWriteStream').mockReturnValue({ write: jest.fn(), end: jest.fn(), on: jest.fn() });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const scan = async (body) => {
  const res = createRes();
  await controller.scan({ user: { id: 5 }, body }, res);
  return res;
};

describe('xmap 参数校验', () => {
  test('合法参数：以参数数组调用 sudo xmap', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', rate: '10M', maxlen: '64', targetPort: '80,443', max_results: '1000', description: 't' });
    expect(res.status).toHaveBeenCalledWith(202);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('sudo');
    expect(args.slice(0, 2)).toEqual(['xmap', '-6']);
    expect(args).toEqual(expect.arrayContaining(['-B', '10M', '-x', '64', '-p', '80,443', '2001:db8::/32']));
  });

  test.each([
    ['目标以 - 开头（选项注入）', { targetaddress: '--output-file=/etc/cron.d/x' }],
    ['目标含空格', { targetaddress: '2001:db8::1 -o /tmp/x' }],
    ['速率含选项', { rate: '10M --foo' }],
    ['速率为负数', { rate: '-5' }],
    ['端口含字母', { targetPort: '80,abc' }],
    ['端口以 - 开头', { targetPort: '-80' }],
    ['扫描长度非数字', { maxlen: '64;id' }],
    ['最大结果数非数字', { max_results: '1e9' }],
    ['扫描模式含符号', { probeModule: 'icmp_echoscan --x' }],
    ['未知参数', { output: '/tmp/x' }]
  ])('%s 被拒绝，不启动进程', async (_name, override) => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', ...override });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test.each([
    ['../secret.txt'],
    ['../../etc/passwd'],
    ['/etc/passwd'],
    ['sub/whitelist.txt']
  ])('whitelistFile=%s 被拒绝', async (whitelistFile) => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test('白名单目录下的文件可以使用', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile: 'whitelist_5_1.txt' });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(mockSpawn.mock.calls[0][1]).toEqual(expect.arrayContaining(['-w', path.join(tmpRoot, 'whitelists', 'whitelist_5_1.txt')]));
  });

  test('白名单文件不存在时返回 400', async () => {
    const res = await scan({ ipv6: true, targetaddress: '2001:db8::/32', whitelistFile: 'nope.txt' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
