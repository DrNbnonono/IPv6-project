const { isReadOnlySelect } = require('../services/sqlGuardService');

describe('isReadOnlySelect 允许的查询', () => {
  const allowed = [
    'SELECT * FROM active_addresses LIMIT 10',
    '  select address, asn FROM active_addresses WHERE country_id = 1 ORDER BY id DESC LIMIT 100',
    "SELECT COUNT(*) FROM active_addresses WHERE address LIKE '2001:db8:%'",
    'SELECT created_at, updated_at FROM prefixes',
    "SELECT * FROM vulnerabilities WHERE name = 'delete; drop table x -- #'",
    '(SELECT id FROM asns) UNION (SELECT id FROM countries)',
    'SELECT `address` FROM `active_addresses` LIMIT 5'
  ];
  test.each(allowed)('%s', (sql) => {
    expect(isReadOnlySelect(sql)).toBe(true);
  });
});

describe('isReadOnlySelect 拒绝的查询', () => {
  const denied = [
    ['非 SELECT', 'DELETE FROM active_addresses'],
    ['堆叠语句', 'SELECT 1; DROP TABLE users'],
    ['行内注释', 'SELECT 1 -- comment'],
    ['井号注释', 'SELECT 1 # comment'],
    ['块注释绕过关键字', 'SELECT 1 /*!50000 UNION */ SELECT 2'],
    ['读取用户表', 'SELECT phone, password_hash FROM users'],
    ['带库名读取用户表', 'SELECT * FROM ipv6.users'],
    ['反引号读取用户表', 'SELECT * FROM `users`'],
    ['information_schema', 'SELECT table_name FROM information_schema.tables'],
    ['mysql 系统库', 'SELECT user, authentication_string FROM mysql.user'],
    ['SLEEP', 'SELECT SLEEP(30)'],
    ['BENCHMARK', 'SELECT BENCHMARK(100000000, MD5(1))'],
    ['LOAD_FILE', "SELECT LOAD_FILE('/etc/passwd')"],
    ['INTO OUTFILE', "SELECT * FROM asns INTO OUTFILE '/tmp/x'"],
    ['INTO DUMPFILE', "SELECT 1 INTO DUMPFILE '/tmp/x'"],
    ['FOR UPDATE', 'SELECT * FROM asns FOR UPDATE'],
    ['用户变量', 'SELECT @a := 1'],
    ['系统变量', 'SELECT @@version'],
    ['引号未闭合', "SELECT * FROM asns WHERE name = 'abc"],
    ['空字符串', '   '],
    ['非字符串', null],
    ['超长查询', `SELECT ${'1,'.repeat(15000)}1`]
  ];
  test.each(denied)('%s', (_name, sql) => {
    expect(isReadOnlySelect(sql)).toBe(false);
  });
});
