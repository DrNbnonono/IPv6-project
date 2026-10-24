const { getXmapBin, useSudo, buildXmapInvocation, buildPrivileged } = require('../services/xmapCommandService');

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('xmapCommandService', () => {
  test('默认：经 sudo 调用 PATH 里的 xmap（保持原有行为）', () => {
    delete process.env.XMAP_BIN;
    delete process.env.XMAP_USE_SUDO;
    expect(getXmapBin()).toBe('xmap');
    expect(useSudo()).toBe(true);
    expect(buildXmapInvocation(['-6', '-B', '10M'])).toEqual({
      command: 'sudo',
      args: ['xmap', '-6', '-B', '10M'],
      display: 'sudo xmap -6 -B 10M'
    });
  });

  test('XMAP_BIN 指定可执行文件，仍经 sudo', () => {
    process.env.XMAP_BIN = '/opt/xmap/bin/xmap';
    expect(buildXmapInvocation(['-6']).args).toEqual(['/opt/xmap/bin/xmap', '-6']);
  });

  test('XMAP_USE_SUDO=false：直接执行，不出现 sudo', () => {
    process.env.XMAP_BIN = '/usr/local/sbin/xmap';
    process.env.XMAP_USE_SUDO = 'false';
    expect(useSudo()).toBe(false);
    expect(buildXmapInvocation(['-6', 'x'])).toEqual({
      command: '/usr/local/sbin/xmap',
      args: ['-6', 'x'],
      display: '/usr/local/sbin/xmap -6 x'
    });
  });

  test.each(['FALSE', 'False', 'false'])('XMAP_USE_SUDO=%s 不区分大小写', (value) => {
    process.env.XMAP_USE_SUDO = value;
    expect(useSudo()).toBe(false);
  });

  test('其他取值（含 true、空串）按启用 sudo 处理', () => {
    for (const value of ['true', '1', '']) {
      process.env.XMAP_USE_SUDO = value;
      expect(useSudo()).toBe(true);
    }
  });

  test('辅助命令：按 sudo 开关决定是否提权', () => {
    delete process.env.XMAP_USE_SUDO;
    expect(buildPrivileged('pkill', ['-f', 'x'])).toEqual({ command: 'sudo', args: ['pkill', '-f', 'x'] });
    process.env.XMAP_USE_SUDO = 'false';
    expect(buildPrivileged('pkill', ['-f', 'x'])).toEqual({ command: 'pkill', args: ['-f', 'x'] });
  });
});
