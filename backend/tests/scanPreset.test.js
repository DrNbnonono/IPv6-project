/**
 * 扫描预设（P3-6）：条目校验、INI 生成（含注入防护）、内置/自有预设的可见性与删除限制、
 * 套用时写入配置文件并登记、HTTP 接口的登录要求与错误映射。数据库用 mock。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-'));
process.env.PROJECT_ROOT = root;
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const app = require('../app');
const presets = require('../services/scanPresetService');

const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;
const entries = (list) => JSON.stringify(list);
const BUILTIN = { id: 1, user_id: null, name: '邮件服务套件', description: 'd', entries: entries([{ module: 'smtp', port: 25 }, { module: 'tls', port: 993 }]), created_at: null };
const MINE = { id: 7, user_id: 2, name: '我的', description: null, entries: entries([{ module: 'http', port: 80 }, { module: 'http', port: 8080, params: { endpoint: '/x', retry: 2 } }]), created_at: null };
const OTHERS = { id: 9, user_id: 3, name: '别人的', description: null, entries: entries([{ module: 'ssh', port: 22 }]), created_at: null };

let handlers;
const installDb = (extra = {}) => {
  handlers = extra;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) {
      return [[{ id: params[0], phone: `1380000000${params[0]}`, role: 'user' }]];
    }
    for (const [pattern, fn] of Object.entries(handlers)) if (new RegExp(pattern).test(sql)) return fn(sql, params);
    if (/FROM scan_presets WHERE id = \?/.test(sql)) {
      const row = [BUILTIN, MINE, OTHERS].find((r) => r.id === params[0] && (r.user_id === null || r.user_id === params[1]));
      return [row ? [row] : []];
    }
    if (/FROM scan_presets WHERE user_id IS NULL OR/.test(sql)) return [[BUILTIN, MINE]];
    if (/FROM tools WHERE name = 'zgrab2'/.test(sql)) return [[{ id: 12 }]];
    if (/INSERT INTO whitelists/.test(sql)) return [{ insertId: 55 }];
    if (/INSERT INTO scan_presets/.test(sql)) return [{ insertId: 70 }];
    if (/COUNT\(\*\) AS n FROM scan_presets/.test(sql)) return [[{ n: 1 }]];
    return [[]];
  });
};
const calls = (pattern) => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  installDb();
});

describe('validateEntries', () => {
  test('规范化：缺省端口用模块默认端口，params 去掉空值', () => {
    expect(presets.validateEntries([{ module: 'smtp' }, { module: 'http', port: '8080', params: { endpoint: '/', empty: '', n: null } }])).toEqual([
      { module: 'smtp', port: 25, params: {} },
      { module: 'http', port: 8080, params: { endpoint: '/' } }
    ]);
  });

  test.each([
    [[], '非空数组'],
    ['x', '非空数组'],
    [Array.from({ length: 21 }, (_, i) => ({ module: 'http', port: 1000 + i })), '最多'],
    [[null], '格式无效'],
    [[{ module: 'nope' }], '不支持的模块'],
    [[{ module: 'toString' }], '不支持的模块'],
    [[{ module: 'http', port: 70000 }], '端口'],
    [[{ module: 'http', port: 80 }, { module: 'http', port: 80 }], '重复'],
    [[{ module: 'http', params: 'x' }], 'params'],
    [[{ module: 'http', params: { 'bad key': 1 } }], '参数名无效'],
    [[{ module: 'http', params: { port: 1 } }], '不允许'],
    [[{ module: 'http', params: { name: 'x' } }], '不允许'],
    [[{ module: 'http', params: { trigger: 'x' } }], '不允许'],
    [[{ module: 'http', params: { endpoint: 'a"b' } }], '参数值无效'],
    [[{ module: 'http', params: { endpoint: 'a\nb' } }], '参数值无效'],
    [[{ module: 'http', params: { endpoint: 'a\\b' } }], '参数值无效'],
    [[{ module: 'http', params: { endpoint: { a: 1 } } }], '参数值无效']
  ])('非法条目 %j', (input, text) => {
    expect(() => presets.validateEntries(input)).toThrow(text);
  });
});

describe('buildIni', () => {
  test('同一模块多次出现时用 module-port 作标签；数字和布尔不加引号，字符串加引号', () => {
    const ini = presets.buildIni(
      presets.validateEntries(JSON.parse(MINE.entries)),
      '我的\n[evil]'
    );
    expect(ini).toBe(
      '; 由 ObserV6 扫描预设生成：我的 [evil]\n\n[http]\nname="http-80"\nport=80\n\n[http]\nname="http-8080"\nport=8080\nendpoint="/x"\nretry=2\n'
    );
  });

  test('模块只出现一次时 name 就是模块名', () => {
    expect(presets.buildIni([{ module: 'smtp', port: 25, params: {} }])).toContain('name="smtp"');
  });

  test('参数值里的段标记无法逃出引号', () => {
    const ini = presets.buildIni(presets.validateEntries([{ module: 'http', params: { endpoint: '/a]\n[x' .replace('\n', ' ') } }]));
    expect(ini.split('\n').filter((line) => line.startsWith('['))).toEqual(['[http]']);
  });
});

describe('服务', () => {
  test('listPresets：内置标记 builtin，条目已解析', async () => {
    const list = await presets.listPresets(2);
    expect(list.map((p) => [p.id, p.builtin])).toEqual([[1, true], [7, false]]);
    expect(list[0].entries).toHaveLength(2);
    expect(calls(/scan_presets/)[0][1]).toEqual([2]);
  });

  test('createPreset：写入规范化后的条目', async () => {
    const created = await presets.createPreset(2, { name: ' 新套件 ', description: '说明', entries: [{ module: 'ssh' }] });
    expect(created).toMatchObject({ id: 70, name: '新套件', builtin: false });
    const insert = calls(/INSERT INTO scan_presets/)[0];
    expect(insert[1].slice(0, 3)).toEqual([2, '新套件', '说明']);
    expect(JSON.parse(insert[1][3])).toEqual([{ module: 'ssh', port: 22, params: {} }]);
  });

  test.each([
    [{ entries: [{ module: 'ssh' }] }, '名称不能为空'],
    [{ name: 'x'.repeat(65), entries: [{ module: 'ssh' }] }, '最长'],
    [{ name: 'a\nb', entries: [{ module: 'ssh' }] }, '非法字符'],
    [{ name: 5, entries: [{ module: 'ssh' }] }, '字符串'],
    [{ name: 'ok', entries: [] }, '非空数组']
  ])('createPreset 校验 %j', async (body, text) => {
    await expect(presets.createPreset(2, body)).rejects.toMatchObject({ status: 400, message: expect.stringContaining(text) });
  });

  test('createPreset：数量上限与同名冲突 → 409', async () => {
    installDb({ 'COUNT\\(\\*\\) AS n FROM scan_presets': () => [[{ n: 50 }]] });
    await expect(presets.createPreset(2, { name: 'a', entries: [{ module: 'ssh' }] })).rejects.toMatchObject({ status: 409 });
    installDb({ 'SELECT id FROM scan_presets WHERE name': () => [[{ id: 1 }]] });
    await expect(presets.createPreset(2, { name: '邮件服务套件', entries: [{ module: 'ssh' }] })).rejects.toMatchObject({ status: 409, message: '已有同名预设' });
  });

  test('deletePreset：自己的可删；内置 403；别人的和不存在的 404', async () => {
    await presets.deletePreset(2, 7);
    expect(calls(/DELETE FROM scan_presets/)[0][1]).toEqual([7, 2]);
    await expect(presets.deletePreset(2, 1)).rejects.toMatchObject({ status: 403 });
    await expect(presets.deletePreset(2, 9)).rejects.toMatchObject({ status: 404 });
    await expect(presets.deletePreset(2, 'x')).rejects.toMatchObject({ status: 400 });
  });

  test('applyPreset：写 INI 到 zgrab2_configs 并登记到 whitelists', async () => {
    const r = await presets.applyPreset(2, 7);
    expect(r).toMatchObject({ fileId: 55, presetId: 7 });
    expect(r.fileName).toMatch(/^zgrab2_config_preset7_2_\d+\.ini$/);
    const written = fs.readFileSync(path.join(root, 'zgrab2_configs', r.fileName), 'utf8');
    expect(written).toContain('[http]\nname="http-80"');
    const insert = calls(/INSERT INTO whitelists/)[0];
    expect(insert[1].slice(0, 3)).toEqual([2, 12, r.fileName]);
    expect(insert[1][4]).toBe('扫描预设：我的');
  });

  test('applyPreset：别人的预设 404；库里被改坏的条目被挡住；工具未配置 400；登记失败时删除文件', async () => {
    await expect(presets.applyPreset(2, 9)).rejects.toMatchObject({ status: 404 });

    installDb({ 'FROM scan_presets WHERE id': () => [[{ ...MINE, entries: entries([{ module: 'rm -rf', port: 1 }]) }]] });
    await expect(presets.applyPreset(2, 7)).rejects.toMatchObject({ status: 400 });

    installDb({ "FROM tools WHERE name = 'zgrab2'": () => [[]] });
    await expect(presets.applyPreset(2, 7)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('未配置') });

    const before = fs.readdirSync(path.join(root, 'zgrab2_configs')).length;
    installDb({ 'INSERT INTO whitelists': () => { throw new Error('db down'); } });
    await expect(presets.applyPreset(2, 7)).rejects.toThrow('db down');
    expect(fs.readdirSync(path.join(root, 'zgrab2_configs')).length).toBe(before);
  });
});

describe('HTTP 接口', () => {
  test('未登录 401', async () => {
    expect((await request(app).get('/api/zgrab2/presets')).status).toBe(401);
    expect((await request(app).post('/api/zgrab2/presets/1/apply')).status).toBe(401);
  });

  test('GET / POST / DELETE / apply', async () => {
    const list = await request(app).get('/api/zgrab2/presets').set('Authorization', USER);
    expect(list.status).toBe(200);
    expect(list.body.data.map((p) => p.id)).toEqual([1, 7]);

    const created = await request(app).post('/api/zgrab2/presets').set('Authorization', USER).send({ name: 'n', entries: [{ module: 'ssh' }] });
    expect(created.status).toBe(201);
    expect(created.body.data.id).toBe(70);

    const bad = await request(app).post('/api/zgrab2/presets').set('Authorization', USER).send({ name: 'n', entries: [{ module: 'zzz' }] });
    expect(bad.status).toBe(400);

    expect((await request(app).delete('/api/zgrab2/presets/1').set('Authorization', USER)).status).toBe(403);
    expect((await request(app).delete('/api/zgrab2/presets/7').set('Authorization', USER)).status).toBe(200);

    const applied = await request(app).post('/api/zgrab2/presets/1/apply').set('Authorization', USER);
    expect(applied.status).toBe(200);
    expect(applied.body.data.fileName).toMatch(/\.ini$/);
  });

  test('数据库错误 → 500，不泄露内部信息', async () => {
    installDb({ 'FROM scan_presets WHERE user_id IS NULL OR': () => { throw new Error('boom: secret'); } });
    const res = await request(app).get('/api/zgrab2/presets').set('Authorization', USER);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});
