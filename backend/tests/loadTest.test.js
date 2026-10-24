const { parseArgs, percentile, summarize, SCENARIOS, isLocalHost } = require('../scripts/loadTest');

describe('loadTest 脚本的纯函数', () => {
  test('percentile：最近秩法，空数组返回 null', () => {
    expect(percentile([], 50)).toBeNull();
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 1)).toBe(1);
    expect(percentile([7], 99)).toBe(7);
  });

  test('summarize：统计各类状态并计算 rps', () => {
    const counters = { ok: 8, limited: 1, serverError: 1, clientError: 0, failed: 0 };
    const result = summarize([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], counters, 2);
    expect(result.requests).toBe(10);
    expect(result.rps).toBe(5);
    expect(result.p50).toBe(50);
    expect(result.max).toBe(100);
    expect(result.limited429).toBe(1);
    expect(result.serverError).toBe(1);
  });

  test('parseArgs：默认值与自定义', () => {
    const defaults = parseArgs([]);
    expect(defaults.scenario).toBe('detection');
    expect(defaults.levels).toEqual([1, 5, 10, 25, 50, 100]);
    const custom = parseArgs(['--scenario', 'open', '--api-key', 'ov6_x', '--levels', '2,4', '--duration', '3', '--out', 'r.json']);
    expect(custom).toMatchObject({ scenario: 'open', apiKey: 'ov6_x', levels: [2, 4], duration: 3, out: 'r.json' });
  });

  test('parseArgs：非法参数被拒绝', () => {
    expect(() => parseArgs(['--bogus'])).toThrow('未知参数');
    expect(() => parseArgs(['--scenario', 'nope'])).toThrow('--scenario');
    expect(() => parseArgs(['--levels', '0'])).toThrow('--levels');
    expect(() => parseArgs(['--levels', '1,abc'])).toThrow('--levels');
    expect(() => parseArgs(['--duration', '0'])).toThrow('--duration');
    expect(() => parseArgs(['--duration', '9999'])).toThrow('--duration');
    expect(() => parseArgs(['--scenario', 'open'])).toThrow('--api-key');
    expect(() => parseArgs(['--scenario', 'all'])).toThrow('--api-key');
  });

  test('isLocalHost：只认本机，其他需要显式确认', () => {
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('::1')).toBe(true);
    expect(isLocalHost('example.com')).toBe(false);
    expect(isLocalHost('2001:db8::1')).toBe(false);
  });

  test('场景路径都是以 / 开头的相对路径', () => {
    for (const paths of Object.values(SCENARIOS)) {
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(p.startsWith('/api/')).toBe(true);
    }
  });
});
