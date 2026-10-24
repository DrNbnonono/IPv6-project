const { validateInput } = require('../scripts/createAdmin');

describe('createAdmin.validateInput', () => {
  const ok = { phone: '13800000000', username: 'root', password: 'Str0ng-pass-123' };

  test('合法输入通过', () => {
    expect(validateInput(ok)).toBeNull();
    expect(validateInput({ ...ok, username: undefined })).toBeNull();
  });

  test.each(['', 'abc', '123', '1'.repeat(21), '138 0000 0000'])('非法手机号 %p', (phone) => {
    expect(validateInput({ ...ok, phone })).toMatch(/手机号/);
  });

  test('密码长度范围 8–128', () => {
    expect(validateInput({ ...ok, password: 'short' })).toMatch(/至少/);
    expect(validateInput({ ...ok, password: '' })).toMatch(/至少/);
    expect(validateInput({ ...ok, password: 'a'.repeat(129) })).toMatch(/不能超过/);
    expect(validateInput({ ...ok, password: 'a'.repeat(128) })).toBeNull();
  });

  test('用户名不超过 50 个字符', () => {
    expect(validateInput({ ...ok, username: 'u'.repeat(51) })).toMatch(/用户名/);
  });
});
