/**
 * terminalService 会话层：创建/关闭、并发上限、内置命令、真实子进程执行、超时、清理。
 * 命令参数的安全规则见 terminal.test.js；这里只跑无副作用的命令（echo/pwd/cat/ls），全部限定在临时 jail 内。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const terminalService = require('../services/terminalService');

let jail;

beforeAll(() => {
  jail = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-term-')));
  fs.writeFileSync(path.join(jail, 'a.txt'), 'line1\nline2\n');
  fs.mkdirSync(path.join(jail, 'sub'));
  process.env.TERMINAL_JAIL_ROOT = jail;
});

afterAll(() => {
  delete process.env.TERMINAL_JAIL_ROOT;
  fs.rmSync(jail, { recursive: true, force: true });
});

const openIds = [];
const open = (options = {}) => {
  const res = terminalService.createTerminal(undefined, { workingDirectory: jail, ...options });
  if (res.success) openIds.push(res.terminal.id);
  return res;
};

afterEach(() => {
  openIds.splice(0).forEach((id) => terminalService.closeTerminal(id));
  terminalService.cleanupTerminals();
});

describe('会话管理', () => {
  test('创建后可查询信息与列表', () => {
    const { terminal } = open();
    expect(terminal.workingDirectory).toBe(jail);

    const info = terminalService.getTerminalInfo(terminal.id);
    expect(info).toMatchObject({ success: true, terminal: { id: terminal.id, isActive: true, commandCount: 0, runningCount: 0 } });

    const all = terminalService.getAllTerminals();
    expect(all.terminals.map((t) => t.id)).toContain(terminal.id);
    expect(all.maxAllowed).toBe(terminalService.TERMINAL_CONFIG.maxConcurrentTerminals);
  });

  test('可指定 sessionId', () => {
    const res = terminalService.createTerminal('fixed-id', { workingDirectory: jail });
    openIds.push('fixed-id');
    expect(res.terminal.id).toBe('fixed-id');
  });

  test('超过并发上限时拒绝创建', () => {
    const max = terminalService.TERMINAL_CONFIG.maxConcurrentTerminals;
    for (let i = 0; i < max; i += 1) expect(open().success).toBe(true);
    const over = open();
    expect(over.success).toBe(false);
    expect(over.error).toContain(String(max));
  });

  test('不存在的终端：各接口返回失败而不是抛出', () => {
    expect(terminalService.getTerminalInfo('nope').success).toBe(false);
    expect(terminalService.getCommandHistory('nope').success).toBe(false);
    expect(terminalService.closeTerminal('nope').success).toBe(false);
    expect(terminalService.setWorkingDirectory('nope', '.').success).toBe(false);
  });

  test('关闭后不能再执行命令，清理后从列表消失', async () => {
    const { terminal } = open();
    expect(terminalService.closeTerminal(terminal.id)).toEqual({ success: true });
    await expect(terminalService.executeCommand(terminal.id, 'echo hi')).rejects.toThrow('终端已关闭');

    terminalService.cleanupTerminals();
    expect(terminalService.getTerminalInfo(terminal.id).success).toBe(false);
    await expect(terminalService.executeCommand(terminal.id, 'echo hi')).rejects.toThrow('不存在');
  });

  test('长时间不活跃的终端会被清理', () => {
    const { terminal } = open();
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 60 * 1000;
    try {
      terminalService.cleanupTerminals();
    } finally {
      Date.now = realNow;
    }
    expect(terminalService.getTerminalInfo(terminal.id).success).toBe(false);
  });

  test('getAllowedCommands 与白名单一致', () => {
    const res = terminalService.getAllowedCommands();
    expect(res.total).toBe(Object.keys(terminalService.ALLOWED_COMMANDS).length);
    expect(res.commands.find((c) => c.command === 'ls')).toBeTruthy();
    expect(res.commands.find((c) => c.command === 'rm')).toBeUndefined();
  });
});

describe('命令执行', () => {
  test('echo 的输出与历史记录', async () => {
    const { terminal } = open();
    const res = await terminalService.executeCommand(terminal.id, 'echo hello');
    expect(res).toMatchObject({ success: true, exitCode: 0, timedOut: false });
    expect(res.stdout.trim()).toBe('hello');

    const { history } = terminalService.getCommandHistory(terminal.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ command: 'echo hello', status: 'success', exitCode: 0 });
    expect(history[0].duration).not.toBeNull();
    expect(terminalService.getTerminalInfo(terminal.id).terminal.commandCount).toBe(1);
  });

  test('支持引号参数', async () => {
    const { terminal } = open();
    const res = await terminalService.executeCommand(terminal.id, 'echo "a  b" \'c d\'');
    expect(res.stdout.trim()).toBe('a  b c d');
  });

  test('cat 读取 jail 内文件；失败的命令 success=false 并带退出码', async () => {
    const { terminal } = open();
    const ok = await terminalService.executeCommand(terminal.id, 'cat a.txt');
    expect(ok.stdout).toBe('line1\nline2\n');

    const bad = await terminalService.executeCommand(terminal.id, 'cat missing.txt');
    expect(bad.success).toBe(false);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toMatch(/missing\.txt/);
    expect(terminalService.getCommandHistory(terminal.id).history[1].status).toBe('error');
  });

  test('getCommandHistory 的 limit', async () => {
    const { terminal } = open();
    for (let i = 0; i < 3; i += 1) await terminalService.executeCommand(terminal.id, `echo ${i}`);
    const { history } = terminalService.getCommandHistory(terminal.id, 2);
    expect(history.map((h) => h.command)).toEqual(['echo 1', 'echo 2']);
  });

  test.each([
    ['空命令', '   ', '命令不能为空'],
    ['非字符串', null, '命令不能为空'],
    ['管道', 'echo a | cat', '控制字符'],
    ['命令替换', 'echo $(id)', '控制字符'],
    ['分号', 'echo a; id', '控制字符'],
    ['引号未闭合', 'echo "abc', '命令格式无效'],
    ['不在白名单', 'rm -rf x', '不在允许列表'],
    ['原型链名称', 'constructor', '不在允许列表']
  ])('拒绝：%s', async (_name, command, message) => {
    const { terminal } = open();
    await expect(terminalService.executeCommand(terminal.id, command)).rejects.toThrow(message);
    // 被拒绝的命令不进入历史
    expect(terminalService.getCommandHistory(terminal.id).history).toHaveLength(0);
  });

  test('cwd 选项不能跳出 jail', async () => {
    const { terminal } = open();
    await expect(terminalService.executeCommand(terminal.id, 'pwd', { cwd: '..' })).rejects.toThrow();
    const res = await terminalService.executeCommand(terminal.id, 'pwd', { cwd: 'sub' });
    expect(res.stdout.trim()).toBe(path.join(jail, 'sub'));
  });

  test('超时：阻塞中的命令被杀掉并标记 timedOut', async () => {
    const fifo = path.join(jail, 'blocker');
    execFileSync('mkfifo', [fifo]);
    const { terminal } = open();

    const res = await terminalService.executeCommand(terminal.id, 'cat blocker', { timeout: 200 });

    expect(res.timedOut).toBe(true);
    expect(res.success).toBe(false);
    expect(res.command.status).toBe('timeout');
    fs.rmSync(fifo);
  });

  test('timeout 不会超过上限，非法值回落到默认', async () => {
    const { terminal } = open();
    // 非法/超大的 timeout 不影响正常命令
    for (const timeout of [-1, 'abc', 1e12]) {
      const res = await terminalService.executeCommand(terminal.id, 'echo ok', { timeout });
      expect(res.success).toBe(true);
    }
  });
});

describe('内置命令', () => {
  test('cd 切换目录并影响后续命令，history/clear 可用', async () => {
    const { terminal } = open();

    const cd = await terminalService.executeCommand(terminal.id, 'cd sub');
    expect(cd.stdout).toBe(path.join(jail, 'sub'));
    expect(terminalService.getTerminalInfo(terminal.id).terminal.workingDirectory).toBe(path.join(jail, 'sub'));

    const pwd = await terminalService.executeCommand(terminal.id, 'pwd');
    expect(pwd.stdout.trim()).toBe(path.join(jail, 'sub'));

    const hist = await terminalService.executeCommand(terminal.id, 'history');
    expect(hist.stdout).toContain('1  cd sub');
    expect(hist.stdout).toContain('2  pwd');

    const clear = await terminalService.executeCommand(terminal.id, 'clear');
    expect(clear).toMatchObject({ success: true, stdout: '', exitCode: 0 });
  });

  test('cd 到不存在的目录或 jail 之外会失败，并记录为 error', async () => {
    const { terminal } = open();
    await expect(terminalService.executeCommand(terminal.id, 'cd nope')).rejects.toThrow();
    await expect(terminalService.executeCommand(terminal.id, 'cd ..')).rejects.toThrow();
    await expect(terminalService.executeCommand(terminal.id, 'cd a.txt')).rejects.toThrow('目标目录不存在');
    const { history } = terminalService.getCommandHistory(terminal.id);
    expect(history.every((h) => h.status === 'error')).toBe(true);
  });
});

describe('setWorkingDirectory', () => {
  test('jail 内成功，jail 外失败且目录不变', () => {
    const { terminal } = open();
    expect(terminalService.setWorkingDirectory(terminal.id, 'sub')).toEqual({
      success: true,
      workingDirectory: path.join(jail, 'sub')
    });

    const escaped = terminalService.setWorkingDirectory(terminal.id, '../..');
    expect(escaped.success).toBe(false);
    expect(terminalService.getTerminalInfo(terminal.id).terminal.workingDirectory).toBe(path.join(jail, 'sub'));
  });
});
