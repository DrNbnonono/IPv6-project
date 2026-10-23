/** 存储方案对比脚本里不依赖数据库的部分：参数解析、地址与前缀的生成（范围查询的 LIKE / BETWEEN 要对得上）。 */
const { parseArgs, prefixBytes, expand, prefixText } = require('../scripts/benchAddressStorage');

describe('parseArgs', () => {
  test('默认值与显式参数', () => {
    expect(parseArgs([])).toEqual({ rows: 1000000, prefixes: 2000, keep: false, json: false, yes: false });
    expect(parseArgs(['--yes', '--rows', '5000', '--prefixes', '10', '--keep', '--json'])).toEqual({ rows: 5000, prefixes: 10, keep: true, json: true, yes: true });
  });

  test.each([
    [['--rows', '10'], '--rows'],
    [['--prefixes', '70000'], '--prefixes'],
    [['--rows', 'abc'], '--rows'],
    [['--prefixes', '5000', '--rows', '2000'], '不能大于'],
    [['--bogus'], '未知参数']
  ])('非法参数 %j', (args, text) => {
    expect(() => parseArgs(args)).toThrow(text);
  });
});

describe('地址生成', () => {
  test('前缀字节与展开文本、文本前缀一致', () => {
    const buf = Buffer.concat([prefixBytes(0x1234), Buffer.alloc(10)]);
    expect(expand(buf)).toBe('2001:0db8:1234:0000:0000:0000:0000:0000');
    expect(prefixText(0x1234)).toBe('2001:0db8:1234:');
    expect(expand(buf).startsWith(prefixText(0x1234))).toBe(true);
  });

  test('不同前缀的文本前缀互不包含', () => {
    expect(prefixText(1)).not.toBe(prefixText(2));
    expect(expand(Buffer.concat([prefixBytes(2), Buffer.alloc(10, 0xff)])).startsWith(prefixText(1))).toBe(false);
  });
});
