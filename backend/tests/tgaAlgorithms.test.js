/**
 * 目标生成算法与命令行：纯函数，不连数据库。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const tga = require('../services/tgaAlgorithms');
const { main, parseArgs } = require('../scripts/tga/generate');

const nib = (...addresses) => addresses.map(tga.toNibbles);
const text = (list) => list.map(tga.fromNibbles);
const run = (algorithm, seeds, extra = {}) => tga.generate({ algorithm, seeds: nib(...seeds), rng: tga.makeRng(1), budget: 1000, ...extra });

describe('toNibbles / fromNibbles', () => {
  test('互逆，且是 32 个小写十六进制字符', () => {
    const n = tga.toNibbles('2001:DB8::1');
    expect(n).toBe('20010db8000000000000000000000001');
    expect(tga.fromNibbles(n)).toBe('2001:db8::1');
  });

  test.each(['192.0.2.1', '2001:db8::/64', 'example.com', '', '2001:db8::1%eth0'])('%p 不是单个 IPv6 地址 → null', (input) => {
    expect(tga.toNibbles(input)).toBeNull();
  });
});

describe('resolveOptions', () => {
  test('补全默认值', () => {
    expect(tga.resolveOptions('density-expand')).toEqual({ maxWildcards: 2 });
    expect(tga.resolveOptions('subnet-walk', {})).toEqual({ subnetBits: 8, topIids: 8 });
    expect(tga.resolveOptions('nibble-dist', { explore: '0.1' })).toEqual({ explore: 0.1 });
  });

  test.each([
    ['density-expand', { maxWildcards: 5 }, '1–4'],
    ['density-expand', { maxWildcards: 1.5 }, '整数'],
    ['density-expand', { bogus: 1 }, '不支持参数'],
    ['subnet-walk', { subnetBits: 3 }, '4–16'],
    ['nibble-dist', { explore: 0.9 }, '0–0.5'],
    ['nibble-dist', { explore: 'abc' }, '0–0.5'],
    ['no-such', {}, '未知的算法']
  ])('%s %j 被拒绝', (algorithm, options, message) => {
    expect(() => tga.resolveOptions(algorithm, options)).toThrow(message);
  });

  test('listAlgorithms 给出三个算法及参数说明', () => {
    const list = tga.listAlgorithms();
    expect(list.map((a) => a.id)).toEqual(['density-expand', 'subnet-walk', 'nibble-dist']);
    expect(list[0].options.maxWildcards).toMatchObject({ default: 2, min: 1, max: 4 });
  });
});

describe('density-expand', () => {
  test('把种子之间不同的位置放开：::1 ::2 ::5 → ::0–::f 中除种子外的 13 个', () => {
    const { addresses, stats } = run('density-expand', ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:1:2::5']);
    expect(addresses).toHaveLength(13);
    expect(text(addresses)).not.toContain('2001:db8:1:2::1');
    expect(text(addresses)).toContain('2001:db8:1:2::f');
    expect(text(addresses)).toContain('2001:db8:1:2::');
    expect(stats).toMatchObject({ seeds: 3, generated: 13, exhausted: true });
    expect(stats.algorithmStats.clusters).toBe(1);
  });

  test('只有一个种子的 /64 不产生候选；不同 /64 互不影响', () => {
    const { addresses } = run('density-expand', ['2001:db8:1:2::1', '2001:db8:9:9::1']);
    expect(addresses).toEqual([]);
  });

  test('按密度从高到低：差异位置少的簇先出', () => {
    const dense = ['2001:db8:1:1::1', '2001:db8:1:1::2']; // 1 个放开位置，密度 2/16
    const sparse = ['2001:db8:1:2::11', '2001:db8:1:2::22']; // 2 个放开位置，密度 2/256
    const { addresses } = run('density-expand', [...sparse, ...dense]);
    expect(text(addresses)[0].startsWith('2001:db8:1:1:')).toBe(true);
    expect(text(addresses).findIndex((a) => a.startsWith('2001:db8:1:2:'))).toBeGreaterThan(text(addresses).findLastIndex((a) => a.startsWith('2001:db8:1:1:')) - 1);
  });

  test('maxWildcards 控制簇的大小：放得越开，候选越多', () => {
    const seeds = ['2001:db8:1:2::100', '2001:db8:1:2::200', '2001:db8:1:2::110', '2001:db8:1:2::210'];
    expect(run('density-expand', seeds, { options: { maxWildcards: 1 } }).addresses).toHaveLength(28); // 拆成两个簇，各 16 − 2
    expect(run('density-expand', seeds, { options: { maxWildcards: 2 } }).addresses).toHaveLength(252); // 一个簇 256 − 4
  });

  test('budget 截断；结果去重且不含种子', () => {
    const seeds = ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:1:2::5'];
    const { addresses, stats } = run('density-expand', seeds, { budget: 5 });
    expect(addresses).toHaveLength(5);
    expect(new Set(addresses).size).toBe(5);
    expect(stats.exhausted).toBe(false);
  });
});

describe('subnet-walk', () => {
  const seeds = ['2001:db8:1:5::1', '2001:db8:1:6::1', '2001:db8:1:5::2'];

  test('在已知 /48 下枚举子网号，配高频接口标识；不含种子', () => {
    const { addresses, stats } = run('subnet-walk', seeds, { options: { subnetBits: 4 } });
    expect(addresses).toHaveLength(29); // 16 个子网 × 2 个接口标识 − 3 个种子
    expect(text(addresses)).toContain('2001:db8:1:f::2');
    expect(text(addresses)).not.toContain('2001:db8:1:5::1');
    expect(stats.algorithmStats).toEqual({ prefixes48: 1, iids: 2 });
  });

  test('第一批候选是子网号最小的那一行（先覆盖各 /48，再往后）', () => {
    const { addresses } = run('subnet-walk', seeds, { options: { subnetBits: 4 }, budget: 2 });
    expect(text(addresses)).toEqual(['2001:db8:1::1', '2001:db8:1::2']);
  });

  test('topIids 限制接口标识个数', () => {
    const { addresses } = run('subnet-walk', seeds, { options: { subnetBits: 4, topIids: 1 } });
    expect(addresses).toHaveLength(14); // 16 个子网 × ::1 − 2 个种子
    expect(text(addresses).every((a) => a.endsWith('::1'))).toBe(true);
  });

  test('多个 /48 轮流出现', () => {
    const { addresses } = run('subnet-walk', ['2001:db8:1:5::1', '2001:db8:2:5::1'], { options: { subnetBits: 4 }, budget: 4 });
    expect(text(addresses).map((a) => a.split(':')[2])).toEqual(['1', '2', '1', '2']);
  });
});

describe('nibble-dist', () => {
  test('前 64 位来自种子的 /64，结果去重且不含种子，相同随机种子可复现', () => {
    const seeds = ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:3:4::a'];
    const a = run('nibble-dist', seeds, { options: { explore: 0.3 }, budget: 200 });
    const b = run('nibble-dist', seeds, { options: { explore: 0.3 }, budget: 200 });
    expect(a.addresses).toEqual(b.addresses);
    expect(a.addresses).toHaveLength(200);
    expect(new Set(a.addresses).size).toBe(200);
    const prefixes = new Set(text(a.addresses).map((x) => tga.toNibbles(x).slice(0, 16)));
    expect([...prefixes].every((p) => nib(...seeds).some((s) => s.startsWith(p)))).toBe(true);
    expect(text(a.addresses)).not.toContain('2001:db8:1:2::1');
    const c = tga.generate({ algorithm: 'nibble-dist', seeds: nib(...seeds), rng: tga.makeRng(2), budget: 200, options: { explore: 0.3 } });
    expect(c.addresses).not.toEqual(a.addresses);
  });

  test('候选空间耗尽时提前结束，不会死循环', () => {
    const { addresses, stats } = run('nibble-dist', ['2001:db8:1:2::1', '2001:db8:1:2::2'], { options: { explore: 0 } });
    expect(addresses).toEqual([]); // 空间只有 ::1 与 ::2，都是种子
    expect(stats.exhausted).toBe(true);
  });
});

describe('别名前缀过滤', () => {
  test('makeAliasFilter 只接受长度为 4 的倍数的 IPv6 前缀；没有有效前缀返回 null', () => {
    expect(tga.makeAliasFilter([])).toBeNull();
    expect(tga.makeAliasFilter(['192.0.2.0/24', '2001:db8::/62', 'junk', '::/0'])).toBeNull();
    const isAliased = tga.makeAliasFilter(['2001:db8:1:2::/64', '2001:db8:9::/48']);
    expect(isAliased(tga.toNibbles('2001:db8:1:2::77'))).toBe(true);
    expect(isAliased(tga.toNibbles('2001:db8:9:5::1'))).toBe(true);
    expect(isAliased(tga.toNibbles('2001:db8:1:3::1'))).toBe(false);
  });

  test('generate 跳过别名前缀内的候选并计数', () => {
    const seeds = ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:1:2::5'];
    const clean = run('density-expand', seeds);
    const filtered = run('density-expand', seeds, { isAliased: tga.makeAliasFilter(['2001:db8:1:2::/64']) });
    expect(clean.addresses).toHaveLength(13);
    expect(filtered.addresses).toEqual([]);
    expect(filtered.stats.aliasedSkipped).toBe(13);
  });
});

describe('generate 参数校验', () => {
  test.each([0, -1, 1.5, tga.MAX_BUDGET + 1, 'x'])('budget=%p 被拒绝', (budget) => {
    expect(() => run('density-expand', ['2001:db8::1', '2001:db8::2'], { budget })).toThrow('budget');
  });

  test('没有种子 / 未知算法 / 非法参数', () => {
    expect(() => tga.generate({ algorithm: 'density-expand', seeds: [] })).toThrow('没有可用的种子');
    expect(() => tga.generate({ algorithm: 'nope', seeds: nib('2001:db8::1') })).toThrow('未知的算法');
    expect(() => run('density-expand', ['2001:db8::1'], { options: { maxWildcards: 9 } })).toThrow('1–4');
  });

  test('重复种子会去重', () => {
    const { stats } = run('density-expand', ['2001:db8::1', '2001:db8::1', '2001:db8::2']);
    expect(stats.seeds).toBe(2);
  });
});

describe('命令行 scripts/tga/generate.js', () => {
  let dir;
  const SCRIPT = path.resolve(__dirname, '../scripts/tga/generate.js');
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tga-cli-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const file = (name, content) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  };

  test('parseArgs：必填项、未知参数、缺少值、--option', () => {
    expect(parseArgs(['--algorithm', 'a', '--seeds', 's', '--out', 'o', '--option', 'k=v', '--option', 'x=1=2'])).toMatchObject({ algorithm: 'a', options: { k: 'v', x: '1=2' } });
    expect(() => parseArgs(['--seeds', 's', '--out', 'o'])).toThrow('--algorithm');
    expect(() => parseArgs(['--algorithm', 'a', '--seeds', 's', '--out', 'o', '--bogus', '1'])).toThrow('未知参数');
    expect(() => parseArgs(['--algorithm'])).toThrow('缺少值');
    expect(() => parseArgs(['--algorithm', 'a', '--seeds', 's', '--out', 'o', '--option', 'novalue'])).toThrow('key=value');
  });

  test('main：读种子（跳过注释、空行、无效项和逗号后字段），排除别名前缀，写地址文件与摘要', async () => {
    const seeds = file('seeds.txt', '# 种子\n2001:db8:1:2::1,extra\n2001:db8:1:2::2\n\n2001:db8:1:2::5\nnot-an-address\n192.0.2.1\n2001:db8:7:7::1\n2001:db8:7:7::2\n');
    const aliased = file('aliased.txt', '2001:db8:7:7::/64\n');
    const out = path.join(dir, 'out.txt');
    const summaryFile = path.join(dir, 'summary.json');
    const summary = await main(['--algorithm', 'density-expand', '--seeds', seeds, '--out', out, '--aliased', aliased, '--summary', summaryFile, '--budget', '100', '--rng-seed', '5']);

    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(13); // 2001:db8:7:7::/64 的 14 个候选全部被排除
    expect(lines.every((l) => l.startsWith('2001:db8:1:2:'))).toBe(true);
    expect(summary).toMatchObject({ algorithm: 'density-expand', seedsRead: 7, seedsInvalid: 2, aliasedPrefixes: 1, generated: 13, aliasedSkipped: 14, rngSeed: 5 });
    expect(summary.options).toEqual({ maxWildcards: 2 }); // 摘要里是校验后的数值参数
    expect(JSON.parse(fs.readFileSync(summaryFile, 'utf8')).generated).toBe(13);
  });

  test('作为进程运行：成功退出 0；错误退出 1 并把原因写到 stderr', () => {
    const seeds = file('s.txt', '2001:db8::1\n2001:db8::2\n');
    const out = path.join(dir, 'o.txt');
    execFileSync(process.execPath, [SCRIPT, '--algorithm', 'subnet-walk', '--seeds', seeds, '--out', out, '--budget', '10', '--option', 'subnetBits=4']);
    expect(fs.readFileSync(out, 'utf8').trim().split('\n').length).toBeGreaterThan(0);

    const again = spawnSync(process.execPath, [SCRIPT, '--algorithm', 'subnet-walk', '--seeds', seeds, '--out', out]);
    expect(again.status).toBe(1); // 输出文件已存在，不覆盖

    const bad = spawnSync(process.execPath, [SCRIPT, '--algorithm', 'nope', '--seeds', seeds, '--out', path.join(dir, 'x.txt')]);
    expect(bad.status).toBe(1);
    expect(bad.stderr.toString()).toContain('未知的算法');

    const empty = file('empty.txt', 'junk\n');
    const none = spawnSync(process.execPath, [SCRIPT, '--algorithm', 'density-expand', '--seeds', empty, '--out', path.join(dir, 'y.txt')]);
    expect(none.status).toBe(1);
    expect(none.stderr.toString()).toContain('没有可用的种子');

    const missing = spawnSync(process.execPath, [SCRIPT, '--algorithm', 'density-expand', '--seeds', path.join(dir, 'nope.txt'), '--out', path.join(dir, 'z.txt')]);
    expect(missing.status).toBe(1);
  });

  test('非法的 --rng-seed', async () => {
    const seeds = file('s2.txt', '2001:db8::1\n2001:db8::2\n');
    await expect(main(['--algorithm', 'density-expand', '--seeds', seeds, '--out', path.join(dir, 'o2.txt'), '--rng-seed', '-1'])).rejects.toThrow('--rng-seed');
  });
});
