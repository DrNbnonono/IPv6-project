const fs = require('fs');
const os = require('os');
const path = require('path');

const policy = require('../services/terminalPolicyService');
const terminalService = require('../services/terminalService');

let jail;

beforeAll(() => {
  jail = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'observ6-jail-')));
  fs.writeFileSync(path.join(jail, 'hello.txt'), 'hello world\n');
  fs.writeFileSync(path.join(jail, '.env'), 'SECRET=1\n');
  fs.mkdirSync(path.join(jail, 'sub'));
  fs.writeFileSync(path.join(jail, 'sub', '.env.production'), 'SECRET=2\n');
  process.env.TERMINAL_JAIL_ROOT = jail;
});

afterAll(() => {
  delete process.env.TERMINAL_JAIL_ROOT;
  fs.rmSync(jail, { recursive: true, force: true });
});

const check = (command, args) => policy.validateArgs(command, args, { cwd: jail });

describe('白名单收紧', () => {
  test.each(['rm', 'mv', 'cp', 'mkdir', 'find', 'xargs', 'sed', 'awk', 'wget'])('%s 不再被允许', (cmd) => {
    expect(terminalService.isCommandAllowed(cmd)).toBe(false);
  });

  test('网络诊断命令仍可用', () => {
    ['ping6', 'dig', 'traceroute6', 'nmap', 'curl', 'ls'].forEach((cmd) => {
      expect(terminalService.isCommandAllowed(cmd)).toBe(true);
    });
  });

  test('每个白名单命令都有参数规则（ip 单独处理）', () => {
    for (const cmd of Object.keys(terminalService.ALLOWED_COMMANDS)) {
      if (['cd', 'clear', 'history', 'ip'].includes(cmd)) continue;
      expect(() => check(cmd, [])).not.toThrow(/暂不支持/);
    }
  });
});

describe('validateArgs 拒绝危险参数', () => {
  const denied = [
    ['nmap 脚本引擎', 'nmap', ['--script', 'http-vuln', '2001:db8::1']],
    ['nmap 输出文件', 'nmap', ['-oN', '/tmp/x', '2001:db8::1']],
    ['nmap 读取目标文件', 'nmap', ['-iL', '/etc/passwd']],
    ['nmap 目标含 shell 字符', 'nmap', ['example.com;id']],
    ['curl 写文件', 'curl', ['-o', '/tmp/x', 'http://example.com']],
    ['curl file 协议', 'curl', ['file:///etc/passwd']],
    ['curl 本机', 'curl', ['http://127.0.0.1:3306']],
    ['curl 元数据地址', 'curl', ['http://169.254.169.254/latest/meta-data']],
    ['curl localhost', 'curl', ['http://localhost:3000/api/test']],
    ['curl 上传', 'curl', ['-T', 'x', 'http://example.com']],
    ['ping 洪水', 'ping', ['-f', 'example.com']],
    ['ping 次数过大', 'ping', ['-c', '1000', 'example.com']],
    ['dig 读文件', 'dig', ['-f', '/etc/passwd']],
    ['tail 跟随', 'tail', ['-f', 'hello.txt']],
    ['cat 越界', 'cat', ['/etc/passwd']],
    ['cat 相对越界', 'cat', ['../../../etc/passwd']],
    ['cat .env', 'cat', ['.env']],
    ['cat 子目录 .env.production', 'cat', ['sub/.env.production']],
    ['ls 越界', 'ls', ['/']],
    ['grep 缺少路径', 'grep', ['pattern']],
    ['ip 修改', 'ip', ['addr', 'add', '1.2.3.4/24', 'dev', 'eth0']],
    ['ip netns exec', 'ip', ['netns', 'exec', 'x', 'sh']],
    ['date 设置时间', 'date', ['-s', '2000-01-01']],
    ['ps 带额外参数', 'ps', ['aux', 'e']],
    ['双横线', 'cat', ['--', 'hello.txt']]
  ];
  test.each(denied)('%s', (_name, cmd, args) => {
    expect(() => check(cmd, args)).toThrow();
  });

  test('跟随符号链接逃逸 jail 会被拒绝', () => {
    const link = path.join(jail, 'escape');
    fs.symlinkSync('/etc', link);
    expect(() => check('ls', ['escape'])).toThrow('路径超出允许范围');
    fs.unlinkSync(link);
  });
});

describe('validateArgs 放行正常用法', () => {
  const allowed = [
    ['nmap', ['-6', '-Pn', '-T4', '-p80,443', '2001:db8::1']],
    ['nmap', ['-sn', '2001:db8::/64']],
    ['ping6', ['-c', '4', 'example.com']],
    ['curl', ['-I', '-s', '-L', 'https://example.com/path?a=1']],
    ['dig', ['+short', 'AAAA', 'example.com']],
    ['host', ['example.com']],
    ['traceroute6', ['-n', '2001:db8::1']],
    ['ip', ['-6', 'addr', 'show']],
    ['ls', ['-la']],
    ['ls', ['-lh', 'sub']],
    ['cat', ['hello.txt']],
    ['head', ['-n', '5', 'hello.txt']],
    ['wc', ['-l', 'hello.txt']],
    ['echo', ['hi', 'there']],
    ['uname', ['-a']],
    ['df', ['-h']]
  ];
  test.each(allowed)('%s %j', (cmd, args) => {
    expect(() => check(cmd, args)).not.toThrow();
  });

  test('grep -r 自动排除敏感文件', () => {
    const result = check('grep', ['-r', '-n', 'hello', '.']);
    expect(result).toEqual(expect.arrayContaining(['--exclude=.env*']));
  });
});

describe('buildSafeEnv', () => {
  test('不继承敏感环境变量', () => {
    process.env.JWT_SECRET = 'jwt-secret-value';
    process.env.DB_PASSWORD = 'db-password-value';
    process.env.DEEPSEEK_API_KEY = 'llm-key-value';
    const env = policy.buildSafeEnv({ JWT_SECRET: 'x', FOO: 'bar' });
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.FOO).toBeUndefined();
    expect(env.PATH).toBeDefined();
  });
});

describe('terminalService 端到端', () => {
  let terminalId;

  beforeAll(() => {
    const created = terminalService.createTerminal(null, { workingDirectory: jail });
    terminalId = created.terminal.id;
  });

  test('允许的命令正常执行', async () => {
    const result = await terminalService.executeCommand(terminalId, 'echo hello');
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  test('子进程拿不到服务端密钥', async () => {
    process.env.JWT_SECRET = 'jwt-secret-value';
    const created = terminalService.createTerminal(null, { workingDirectory: jail });
    const result = await terminalService.executeCommand(created.terminal.id, 'echo done');
    expect(result.stdout).not.toContain('jwt-secret-value');
    expect(terminalService.getTerminalInfo(created.terminal.id).terminal).toBeDefined();
  });

  test('读取 .env 被拒绝', async () => {
    await expect(terminalService.executeCommand(terminalId, 'cat .env')).rejects.toThrow('敏感文件');
  });

  test('参数越界被拒绝', async () => {
    await expect(terminalService.executeCommand(terminalId, 'cat /etc/passwd')).rejects.toThrow('路径超出允许范围');
  });

  test('已移除的命令被拒绝', async () => {
    await expect(terminalService.executeCommand(terminalId, 'rm -rf hello.txt')).rejects.toThrow('命令不在允许列表中');
  });

  test('shell 元字符被拒绝', async () => {
    await expect(terminalService.executeCommand(terminalId, 'echo a; cat /etc/passwd')).rejects.toThrow('控制字符');
  });

  test('cd 不能逃出 jail，可以进入子目录', async () => {
    await expect(terminalService.executeCommand(terminalId, 'cd /')).rejects.toThrow('路径超出允许范围');
    const result = await terminalService.executeCommand(terminalId, 'cd sub');
    expect(result.success).toBe(true);
    expect(result.stdout).toBe(path.join(jail, 'sub'));
    await terminalService.executeCommand(terminalId, 'cd ..');
  });

  test('setWorkingDirectory 同样受 jail 限制', () => {
    expect(terminalService.setWorkingDirectory(terminalId, '/').success).toBe(false);
    expect(terminalService.setWorkingDirectory(terminalId, 'sub').success).toBe(true);
    terminalService.setWorkingDirectory(terminalId, '..');
  });
});
