const { parseTarget, contains, overlaps, size } = require('../services/cidrService');

describe('parseTarget', () => {
  test.each([
    ['192.0.2.1', 4, 32, '192.0.2.1'],
    ['192.0.2.0/24', 4, 24, '192.0.2.0/24'],
    ['192.0.2.77/24', 4, 24, '192.0.2.0/24'],
    ['0.0.0.0/0', 4, 0, '0.0.0.0/0'],
    ['2001:db8::1', 6, 128, '2001:db8::1'],
    ['2001:DB8::/32', 6, 32, '2001:db8::/32'],
    ['2001:db8::1/32', 6, 32, '2001:db8::/32'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', 6, 128, '2001:db8::1'],
    ['::', 6, 128, '::'],
    ['::/0', 6, 0, '::/0'],
    ['::1', 6, 128, '::1'],
    ['::ffff:192.0.2.1', 6, 128, '::ffff:c000:201'],
    ['fe80::1', 6, 128, 'fe80::1'],
    ['2001:db8:0:1:0:0:0:1', 6, 128, '2001:db8:0:1::1'],
    ['1:0:0:2:0:0:0:3', 6, 128, '1:0:0:2::3'] // 取最长的零段压缩
  ])('%s', (input, version, prefix, text) => {
    expect(parseTarget(input)).toMatchObject({ version, prefix, text });
  });

  test.each([
    '', '  ', 'example.com', '192.0.2', '192.0.2.256', '192.0.2.1.1', '010.0.0.1', '1.2.3.4/33', '1.2.3.4/-1',
    '1.2.3.4/', '1.2.3.4/24/8', '2001:db8::/129', '2001:db8:::1', '2001::db8::1', '12345::1', 'g::1',
    '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7::8', 'fe80::1%eth0', '::ffff:1.2.3', '1.2.3.4,5.6.7.8',
    null, undefined, 123, {}, 'a'.repeat(100)
  ])('拒绝 %p', (input) => {
    expect(parseTarget(input)).toBeNull();
  });

  test('前后空白被忽略', () => {
    expect(parseTarget('  2001:db8::/32 ').text).toBe('2001:db8::/32');
  });
});

describe('contains / overlaps / size', () => {
  const p = parseTarget;

  test('包含关系', () => {
    expect(contains(p('2001:db8::/32'), p('2001:db8:1::/48'))).toBe(true);
    expect(contains(p('2001:db8::/32'), p('2001:db8::1'))).toBe(true);
    expect(contains(p('2001:db8::/32'), p('2001:db8::/32'))).toBe(true);
    expect(contains(p('2001:db8:1::/48'), p('2001:db8::/32'))).toBe(false);
    expect(contains(p('2001:db8::/32'), p('2001:db9::1'))).toBe(false);
    expect(contains(p('::/0'), p('2001:db8::/32'))).toBe(true);
    expect(contains(p('10.0.0.0/8'), p('10.1.2.3'))).toBe(true);
    expect(contains(p('10.0.0.0/8'), p('11.0.0.1'))).toBe(false);
  });

  test('IPv4 与 IPv6 互不包含、互不相交（即使整数范围会重叠）', () => {
    expect(contains(p('::/0'), p('10.0.0.1'))).toBe(false);
    expect(contains(p('0.0.0.0/0'), p('::1'))).toBe(false);
    expect(overlaps(p('0.0.0.0/0'), p('::/0'))).toBe(false);
  });

  test('相交判断：部分重叠也算', () => {
    expect(overlaps(p('2001:db8::/32'), p('2001:db8:1::/48'))).toBe(true);
    expect(overlaps(p('2001:db8:1::/48'), p('2001:db8::/32'))).toBe(true);
    expect(overlaps(p('2001:db8::/32'), p('2001:db9::/32'))).toBe(false);
    expect(overlaps(p('10.0.0.0/25'), p('10.0.0.128/25'))).toBe(false);
    expect(overlaps(p('10.0.0.0/24'), p('10.0.0.255'))).toBe(true);
  });

  test('地址数量', () => {
    expect(size(p('10.0.0.0/24'))).toBe(256n);
    expect(size(p('2001:db8::1'))).toBe(1n);
    expect(size(p('2001:db8::/64'))).toBe(1n << 64n);
    expect(size(p('::/0'))).toBe(1n << 128n);
  });
});
