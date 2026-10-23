/**
 * 按 IID 类型过滤：服务函数、工作流 iid_filter 节点、POST /api/database/filter-iid。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.API_RATE_MAX = '10000';

jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));
jest.mock('../api/internal', () => ({ xmap: {}, zgrab2: {}, jsonanalysis: {}, tga: {} }));
jest.mock('../services/aliasDetectService', () => ({ readAddressFile: jest.fn(), filterWithKnownAliases: jest.fn() }));
jest.mock('../services/storageService', () => ({
  ...jest.requireActual('../services/storageService'),
  saveTargetsFile: jest.fn()
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../database/db');
const aliasDetect = require('../services/aliasDetectService');
const storage = require('../services/storageService');
const enrich = require('../services/enrichService');
const { executeIidFilterNode } = require('../services/workflowEngine');
const workflowController = require('../controllers/workflowController');
const app = require('../app');

const USER = `Bearer ${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;

const ADDRS = [
  '2001:db8::1', // low-byte
  '2001:db8::53', // service
  '2001:db8:0:1:21a:2bff:fe3c:4d5e', // ieee
  '2001:db8:0:1:9f3a:77c2:1d04:e8b6', // random
  '2001:db8:0:2:1d4f:aa90:73e1:5c28', // random
  '1.2.3.4', // 无效（不是 IPv6）
  'bad'
];
const saved = { fileId: 31, fileName: 'zgrab2_input_2_9.txt', filePath: '/srv/data/zgrab2_inputs/zgrab2_input_2_9.txt', count: 3, tool: 'zgrab2' };

beforeEach(() => {
  jest.clearAllMocks();
  storage.saveTargetsFile.mockResolvedValue(saved);
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT id, phone, role FROM users WHERE id = \?/.test(sql)) return [[{ id: params[0], phone: '13800000002', role: 'user' }]];
    return [{ affectedRows: 1 }];
  });
});

describe('filterByIidType', () => {
  const run = (body) => enrich.filterByIidType({ user: { id: 2 }, body });

  test('drop：剔除所选类型；无效行丢弃并计数；统计各类型数量', async () => {
    const r = await run({ addresses: ADDRS, mode: 'drop', types: ['random'] });
    expect(r).toMatchObject({ total: 7, kept: 3, removed: 2, invalid: 2, savedFile: null });
    expect(r.counts).toEqual({ 'low-byte': 1, service: 1, ieee: 1, random: 2 });
  });

  test('keep：只保留所选类型', async () => {
    const r = await run({ addresses: ADDRS, mode: 'keep', types: ['low-byte', 'ieee'] });
    expect(r).toMatchObject({ kept: 2, removed: 3, invalid: 2 });
  });

  test('地址可以是文本（空白/逗号分隔）或地址文件', async () => {
    expect((await run({ addresses: '2001:db8::1, 2001:db8::2\n2001:db8::3', mode: 'keep', types: ['low-byte'] })).kept).toBe(3);
    aliasDetect.readAddressFile.mockResolvedValue(['2001:db8::1', '2001:db8::53']);
    const r = await run({ addressFile: 'a.txt', mode: 'drop', types: ['service'] });
    expect(aliasDetect.readAddressFile).toHaveBeenCalledWith(2, 'a.txt');
    expect(r.kept).toBe(1);
  });

  test('save：把保留的地址登记为输入文件（默认 zgrab2，可选 xmap），结果里带 fileId', async () => {
    const r = await run({ addresses: ADDRS, mode: 'drop', types: ['random'], save: true });
    expect(storage.saveTargetsFile).toHaveBeenCalledWith(2, ['2001:db8::1', '2001:db8::53', '2001:db8:0:1:21a:2bff:fe3c:4d5e'], 'zgrab2', expect.stringContaining('剔除 random'));
    expect(r.savedFile).toMatchObject({ fileId: 31, fileName: saved.fileName, tool: 'zgrab2' });

    await run({ addresses: ADDRS, mode: 'keep', types: ['ieee'], save: true, tool: 'xmap' });
    expect(storage.saveTargetsFile.mock.calls[1][2]).toBe('xmap');
  });

  test.each([
    [{ addresses: ADDRS, types: ['random'] }, 'mode'],
    [{ addresses: ADDRS, mode: 'maybe', types: ['random'] }, 'mode'],
    [{ addresses: ADDRS, mode: 'keep' }, '至少一个'],
    [{ addresses: ADDRS, mode: 'keep', types: [] }, '至少一个'],
    [{ addresses: ADDRS, mode: 'keep', types: ['nope', 'random'] }, '不支持的 IID 类型: nope'],
    [{ addresses: ADDRS, mode: 'keep', types: ['embed-port-rev'] }, '不支持'],
    [{ mode: 'keep', types: ['random'] }, '请提供'],
    [{ addresses: [], mode: 'keep', types: ['random'] }, '为空'],
    [{ addresses: ['2001:db8::1'], mode: 'drop', types: ['low-byte'], save: true }, '没有剩余地址']
  ])('非法请求 %j', async (body, message) => {
    await expect(run(body)).rejects.toThrow(message);
    await expect(run(body)).rejects.toBeInstanceOf(enrich.EnrichFilterError);
    expect(storage.saveTargetsFile).not.toHaveBeenCalled();
  });

  test('类型名列表与分类器一致：库里的汇总类别不在其中', () => {
    expect(enrich.CLASSIFIER_TYPES).not.toEqual(expect.arrayContaining(['ipv4-all', 'embed-port-all', 'embed-port-rev']));
    expect(enrich.CLASSIFIER_TYPES).toEqual(expect.arrayContaining(['low-byte', 'ieee', 'random', 'service']));
  });
});

describe('executeIidFilterNode', () => {
  const result = { total: 7, kept: 3, removed: 2, invalid: 2, counts: { random: 2 }, savedFile: saved };

  test('默认 drop random；类型字符串按逗号/空白拆分；输出可被下游使用的文件', async () => {
    const spy = jest.spyOn(enrich, 'filterByIidType').mockResolvedValue(result);
    const out = await executeIidFilterNode({ id: 'iid_1', config: {} }, { default: { fileName: 'active.txt' } }, 5);
    expect(spy).toHaveBeenCalledWith({ user: { id: 5 }, body: { addressFile: 'active.txt', mode: 'drop', types: ['random'], save: true, tool: 'zgrab2' } });
    expect(out).toMatchObject({ type: 'file', fileId: 31, fileName: saved.fileName, filePath: saved.filePath, fileType: 'txt' });
    expect(out.iidFilter).toEqual({ total: 7, kept: 3, removed: 2, invalid: 2, counts: { random: 2 } });

    await executeIidFilterNode({ id: 'iid_2', config: { mode: 'keep', types: 'low-byte, ieee;service', outputTool: 'xmap' } }, { file: { fileName: 'b.txt' } }, 5);
    expect(spy.mock.calls[1][0].body).toMatchObject({ mode: 'keep', types: ['low-byte', 'ieee', 'service'], tool: 'xmap' });
    spy.mockRestore();
  });

  test('没有输入文件时报错；过滤错误向上抛出', async () => {
    await expect(executeIidFilterNode({ id: 'x', config: {} }, {}, 5)).rejects.toThrow('缺少输入文件');
    await expect(executeIidFilterNode({ id: 'x', config: { types: 'bogus' } }, { default: { fileName: 'a.txt' } }, 5)).rejects.toThrow('不支持的 IID 类型');
  });

  test('节点类型：file → file，类型名与分类器一致，默认值能通过校验', async () => {
    const res = { json: jest.fn(), status: jest.fn(() => res) };
    await workflowController.getNodeTypes({}, res);
    const type = res.json.mock.calls[0][0].data.iid_filter;
    expect(type).toMatchObject({ category: 'process', inputs: ['file'], outputs: ['file'] });
    expect(type.config.mode.options).toEqual(['drop', 'keep']);
    const listed = type.config.types.description;
    for (const name of enrich.CLASSIFIER_TYPES) expect(listed).toContain(name);
    expect(enrich.CLASSIFIER_TYPES).toContain(type.config.types.default);
  });
});

describe('POST /api/database/filter-iid', () => {
  test('未登录 401；登录用户可用，响应不含服务器路径', async () => {
    expect((await request(app).post('/api/database/filter-iid').send({})).status).toBe(401);

    const res = await request(app).post('/api/database/filter-iid').set('Authorization', USER)
      .send({ addresses: ADDRS, mode: 'drop', types: ['random'], save: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 7, kept: 3, invalid: 2 });
    expect(res.body.data.savedFile).toEqual({ fileId: 31, fileName: saved.fileName, count: 3, tool: 'zgrab2' });
    expect(JSON.stringify(res.body)).not.toContain('/srv/data');
  });

  test('参数错误 400；其他错误 500 且不泄露细节', async () => {
    const bad = await request(app).post('/api/database/filter-iid').set('Authorization', USER).send({ addresses: ADDRS, mode: 'keep', types: ['nope'] });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('不支持');

    storage.saveTargetsFile.mockRejectedValue(new Error('disk secret path /root/x'));
    const err = await request(app).post('/api/database/filter-iid').set('Authorization', USER).send({ addresses: ADDRS, mode: 'drop', types: ['random'], save: true });
    expect(err.status).toBe(500);
    expect(JSON.stringify(err.body)).not.toContain('secret');
  });
});
