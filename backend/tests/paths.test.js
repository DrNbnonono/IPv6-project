/**
 * 路径统一的回归检查：
 *  - 后端代码不再硬编码部署目录
 *  - 加载 app 不会在磁盘上创建任何数据目录
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../database/db', () => ({
  query: jest.fn().mockResolvedValue([[]]),
  getConnection: jest.fn(),
  end: jest.fn()
}));

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'tests', 'coverage']);
// 允许出现旧部署目录字面量的文件：旧路径兼容与迁移脚本
const ALLOWED_LEGACY_LITERAL = new Set([
  path.join('services', 'storageService.js'),
  path.join('scripts', 'rebaseStoredPaths.js')
]);

const listJsFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : listJsFiles(path.join(dir, entry.name));
    }
    return entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : [];
  });

describe('硬编码路径', () => {
  test('后端代码中没有 /home/ipv6/IPv6-project 字面量（兼容与迁移脚本除外）', () => {
    const offenders = listJsFiles(BACKEND_ROOT)
      .filter((file) => !ALLOWED_LEGACY_LITERAL.has(path.relative(BACKEND_ROOT, file)))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('/home/ipv6/IPv6-project'))
      .map((file) => path.relative(BACKEND_ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe('导入无副作用', () => {
  test('加载 app 不创建数据目录', () => {
    const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-import-')));
    process.env.PROJECT_ROOT = tmpRoot;
    process.env.JWT_SECRET = 'test-secret-for-jest';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.resetModules();
    require('../app');

    const created = fs.readdirSync(tmpRoot).filter((name) => name !== 'backend_logs');
    delete process.env.PROJECT_ROOT;
    fs.rmSync(tmpRoot, { recursive: true, force: true });

    expect(created).toEqual([]);
  });
});
