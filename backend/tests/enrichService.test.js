/**
 * enrichService：IID 分类规则与优先级、EUI-64 MAC、来源前缀最长匹配、批量写回规则。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), getConnection: jest.fn(), end: jest.fn() }));

const db = require('../database/db');
const enrich = require('../services/enrichService');

const TYPES = ['ieee', 'isatap', 'ipv4-32', 'ipv4-64', 'ipv4-all', 'embed-port', 'embed-port-rev', 'embed-port-all', 'low-byte', 'byte-pattern', 'random', 'service'];
const typeRows = TYPES.map((name, i) => ({ type_id: i + 1, type_name: name }));
const ID = Object.fromEntries(typeRows.map((r) => [r.type_name, r.type_id]));

beforeEach(() => jest.resetAllMocks());

describe('classifyIid', () => {
  test.each([
    // 低字节、端口、服务
    ['2001:db8::1', 'low-byte'],
    ['2001:db8::', 'low-byte'],
    ['2001:db8::100', 'low-byte'],
    ['2001:db8:0:1::ff', 'low-byte'],
    ['2001:db8::53', 'service'],
    ['2001:db8::80', 'service'],
    ['2001:db8::443', 'service'],
    ['2001:db8::8080', 'embed-port'],
    ['2001:db8::3306', 'embed-port'],
    // EUI-64 与 ISATAP
    ['2001:db8::21a:2bff:fe3c:4d5e', 'ieee'],
    ['2001:db8::200:5eff:fe12:3456', 'ieee'],
    ['2001:db8::5efe:c0a8:101', 'isatap'],
    ['2001:db8::200:5efe:c0a8:101', 'isatap'],
    ['fe80::5efe:c0a8:101', 'isatap'],
    // 字节模式
    ['2001:db8::1234:5678', 'byte-pattern'],
    ['2001:db8::fedc:ba98', 'byte-pattern'],
    ['2001:db8:0:1:1111:1111:1111:1111', 'byte-pattern'],
    ['2001:db8:0:1:abcd:ef01:abcd:ef01', 'byte-pattern'],
    // 嵌入 IPv4
    ['2001:db8::c0a8:101', 'ipv4-32'],
    ['2001:db8::ffff:c0a8:101', 'ipv4-64'],
    ['2001:db8::192:168:1:1', 'ipv4-64'],
    // 其余
    ['2001:db8:0:1:9f3a:77c2:1d04:e8b6', 'random']
  ])('%s → %s', (address, expected) => {
    expect(enrich.classifyIid(address)).toBe(expected);
  });

  test('不是 IPv6 单地址返回 null（IPv4、CIDR、乱码、非字符串）', () => {
    for (const value of ['1.2.3.4', '2001:db8::1/64', 'nonsense', '', null, undefined, 42, '::ffff:1.2.3.4/96']) {
      expect(enrich.classifyIid(value)).toBeNull();
    }
  });

  test('书写形式不影响结果：大小写、展开写法', () => {
    expect(enrich.classifyIid('2001:DB8:0:0:0:0:0:53')).toBe('service');
    expect(enrich.classifyIid('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('low-byte');
  });

  test('产出的类型名都在库里已有的类型中，且从不产出汇总类别', () => {
    const produced = new Set();
    for (let i = 0; i < 300; i += 1) {
      const hex = () => Math.floor(Math.random() * 65536).toString(16);
      produced.add(enrich.classifyIid(`2001:db8:0:1:${hex()}:${hex()}:${hex()}:${hex()}`));
    }
    for (const name of produced) expect(TYPES).toContain(name);
    for (const name of ['ipv4-all', 'embed-port-all', 'embed-port-rev']) expect(produced.has(name)).toBe(false);
  });
});

describe('extractEui64Mac', () => {
  test('还原 MAC：翻转 U/L 位，去掉 ff:fe', () => {
    expect(enrich.extractEui64Mac('2001:db8:0:1:21a:2bff:fe3c:4d5e')).toBe('00:1a:2b:3c:4d:5e');
    expect(enrich.extractEui64Mac('2001:db8::200:5eff:fe12:3456')).toBe('00:00:5e:12:34:56');
    expect(enrich.extractEui64Mac('2001:db8::dead:beff:fe00:1')).toBe('dc:ad:be:00:00:01');
  });

  test('不是 EUI-64 或不是 IPv6 返回 null', () => {
    expect(enrich.extractEui64Mac('2001:db8::1')).toBeNull();
    expect(enrich.extractEui64Mac('2001:db8::5efe:c0a8:101')).toBeNull();
    expect(enrich.extractEui64Mac('1.2.3.4')).toBeNull();
    expect(enrich.extractEui64Mac('bad')).toBeNull();
  });
});

describe('loadOriginIndex / lookupOrigin', () => {
  const prefixRows = [
    { prefix_id: 1, prefix: '2400:3200::', prefix_length: 32, asn: 4134, country_id: 86 },
    { prefix_id: 2, prefix: '2400:3200:1::/48', prefix_length: 48, asn: 64500, country_id: 1 },
    { prefix_id: 3, prefix: '2400:3200:0001:0002:0:0:0:0', prefix_length: 64, asn: 64501, country_id: 2 }, // 非规范写法
    { prefix_id: 4, prefix: 'not-a-prefix', prefix_length: 48, asn: 1, country_id: 1 }
  ];

  test('最长前缀匹配；前缀文本没有 /长度 时用 prefix_length 补全；非规范写法与无法解析的行', async () => {
    db.query.mockResolvedValue([prefixRows]);
    const index = await enrich.loadOriginIndex();
    expect(index.size).toBe(4);
    expect(index.lengths).toEqual([64, 48, 32]);

    expect(index.lookup('2400:3200:1:2::9')).toMatchObject({ prefixId: 3, asn: 64501, prefixLength: 64 });
    expect(index.lookup('2400:3200:1:3::9')).toMatchObject({ prefixId: 2, asn: 64500, prefix: '2400:3200:1::/48' });
    expect(index.lookup('2400:3200:ffff::1')).toMatchObject({ prefixId: 1, countryId: 86 });
    expect(index.lookup('2400:3201::1')).toBeNull();
    expect(index.lookup('1.2.3.4')).toBeNull();
    expect(index.lookup('bad')).toBeNull();
  });

  test('同一前缀重复登记时保留第一条；lookupOrigin 单地址封装', async () => {
    db.query.mockResolvedValue([[prefixRows[0], { ...prefixRows[0], prefix_id: 99 }]]);
    expect(await enrich.lookupOrigin('2400:3200::1')).toMatchObject({ prefixId: 1 });
  });

  test('前缀数量超过上限时报错，而不是悄悄截断', async () => {
    db.query.mockResolvedValue([new Array(2000001).fill(prefixRows[0])]);
    await expect(enrich.loadOriginIndex()).rejects.toThrow('超过');
  });
});

describe('enrichRows / enrichAddresses', () => {
  const ctxBase = () => ({ typeIds: new Map(typeRows.map((r) => [r.type_name, r.type_id])), randomTypeId: ID.random, overwrite: false, fillPrefix: false, originIndex: null });
  const updates = () => db.query.mock.calls.filter(([sql]) => /^UPDATE/.test(sql));

  test('默认只改 NULL 与 random；已有的外部分类结果不动', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const rows = [
      { address_id: 1, address: '2001:db8::1', prefix_id: 5, iid_type: ID.random }, // random → low-byte
      { address_id: 2, address: '2001:db8::2', prefix_id: 5, iid_type: null }, // NULL → low-byte
      { address_id: 3, address: '2001:db8::3', prefix_id: 5, iid_type: ID['byte-pattern'] }, // 已有其他类型：保留
      { address_id: 4, address: '2001:db8::53', prefix_id: 5, iid_type: ID.service }, // 已是正确类型
      { address_id: 5, address: '2001:db8:0:1:9f3a:77c2:1d04:e8b6', prefix_id: 5, iid_type: ID.random } // 仍是 random
    ];
    const stats = await enrich.enrichRows(rows, ctxBase());
    expect(stats).toMatchObject({ scanned: 5, classified: 5, updated: 2, unchanged: 3, byType: { 'low-byte': 2 } });
    expect(updates()).toHaveLength(1);
    expect(updates()[0][1]).toEqual([ID['low-byte'], [1, 2]]);
  });

  test('overwrite=true 覆盖已有类型', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const stats = await enrich.enrichRows([{ address_id: 3, address: '2001:db8::3', prefix_id: 5, iid_type: ID['byte-pattern'] }], { ...ctxBase(), overwrite: true });
    expect(stats.updated).toBe(1);
    expect(updates()[0][1]).toEqual([ID['low-byte'], [3]]);
  });

  test('类型名在库里不存在时计入 unknownType，不写入；非 IPv6 地址跳过', async () => {
    const ctx = ctxBase();
    ctx.typeIds.delete('low-byte');
    const stats = await enrich.enrichRows([
      { address_id: 1, address: '2001:db8::1', prefix_id: 5, iid_type: null },
      { address_id: 2, address: '1.2.3.4', prefix_id: 5, iid_type: null }
    ], ctx);
    expect(stats).toMatchObject({ scanned: 2, unknownType: 1, updated: 0, unchanged: 1 });
    expect(updates()).toHaveLength(0);
  });

  test('fillPrefix：只补 prefix_id 为 NULL 的行，且更新语句带 IS NULL 条件', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const originIndex = { lookup: (a) => (a.startsWith('2400:3200:') ? { prefixId: 7 } : null) };
    const stats = await enrich.enrichRows([
      { address_id: 1, address: '2400:3200::10', prefix_id: null, iid_type: ID['low-byte'] },
      { address_id: 2, address: '2400:3200::11', prefix_id: 9, iid_type: ID['low-byte'] }, // 已有前缀：不改
      { address_id: 3, address: '2001:db8::12', prefix_id: null, iid_type: ID['low-byte'] } // 没有匹配的来源
    ], { ...ctxBase(), fillPrefix: true, originIndex });
    expect(stats.prefixFilled).toBe(1);
    const prefixUpdate = updates().find(([sql]) => /SET prefix_id/.test(sql));
    expect(prefixUpdate[0]).toMatch(/prefix_id IS NULL/);
    expect(prefixUpdate[1]).toEqual([7, [1]]);
  });

  test('大批量更新按 1000 个一组分块', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const rows = Array.from({ length: 2500 }, (_, i) => ({ address_id: i + 1, address: '2001:db8::1', prefix_id: 5, iid_type: null }));
    await enrich.enrichRows(rows, ctxBase());
    expect(updates().map(([, p]) => p[1].length)).toEqual([1000, 1000, 500]);
  });

  test('enrichAddresses：去重、过滤无效 ID，读取、分类、写回', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/FROM address_types/.test(sql)) return [typeRows];
      if (/FROM ip_prefixes/.test(sql)) return [[{ prefix_id: 7, prefix: '2001:db8::', prefix_length: 32, asn: 1, country_id: 1 }]];
      if (/FROM active_addresses/.test(sql)) {
        return [[
          { address_id: 1, address: '2001:db8::1', prefix_id: null, iid_type: ID.random },
          { address_id: 2, address: '2001:db8::53', prefix_id: 7, iid_type: null }
        ]];
      }
      return [{ affectedRows: 1 }];
    });
    const stats = await enrich.enrichAddresses([1, '2', 2, 0, -3, 'x', 1.5, null]);
    expect(stats).toMatchObject({ scanned: 2, updated: 2, prefixFilled: 1, byType: { 'low-byte': 1, service: 1 } });
    const read = db.query.mock.calls.find(([sql]) => /FROM active_addresses/.test(sql));
    expect(read[1]).toEqual([[1, 2]]);
  });

  test('enrichAddresses：空输入不访问数据库；fillPrefix=false 不载入前缀', async () => {
    expect(await enrich.enrichAddresses([])).toMatchObject({ scanned: 0 });
    expect(await enrich.enrichAddresses(undefined)).toMatchObject({ scanned: 0 });
    expect(db.query).not.toHaveBeenCalled();

    db.query.mockImplementation(async (sql) => (/FROM address_types/.test(sql) ? [typeRows] : /FROM active_addresses/.test(sql) ? [[]] : [{ affectedRows: 0 }]));
    await enrich.enrichAddresses([1], { fillPrefix: false });
    expect(db.query.mock.calls.some(([sql]) => /FROM ip_prefixes/.test(sql))).toBe(false);
  });
});
