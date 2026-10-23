/**
 * 终端命令参数策略
 * terminalService 只校验命令名是否在白名单中，这里负责校验参数：
 *  - 每个命令只放行明确列出的选项，其余一律拒绝（例如 nmap --script、curl -o、dig -f）
 *  - 涉及文件路径的命令，路径必须落在 jail 根目录内，且不能指向 .env、私钥等敏感文件
 *  - 目标主机/URL 必须格式合法，且 curl 不能访问本机与云元数据地址
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DEFAULT_JAIL_ROOT = path.resolve(__dirname, '../..');

const getJailRoot = () => {
  const configured = process.env.TERMINAL_JAIL_ROOT;
  return path.resolve(configured || DEFAULT_JAIL_ROOT);
};

// 传给子进程的环境变量白名单：不继承 DB 密码、JWT 密钥、LLM Key 等
const ENV_WHITELIST = ['PATH', 'LANG', 'LC_ALL', 'TERM', 'HOME'];

const buildSafeEnv = (extra = {}) => {
  const env = {};
  for (const key of ENV_WHITELIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  for (const key of ENV_WHITELIST) {
    if (typeof extra[key] === 'string') {
      env[key] = extra[key];
    }
  }
  return env;
};

const SENSITIVE_BASENAME = /^(\.env.*|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_[a-z0-9]+|authorized_keys|known_hosts|\.npmrc|\.netrc|\.git-credentials|shadow|passwd)$/i;

const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const realpathIfExists = (target) => {
  try {
    return fs.realpathSync(target);
  } catch (error) {
    return target;
  }
};

/**
 * 把路径解析为 jail 内的绝对路径；越界或敏感文件抛错
 */
const resolveInJail = (cwd, target, jailRoot = getJailRoot()) => {
  const root = realpathIfExists(path.resolve(jailRoot));
  const resolved = realpathIfExists(path.resolve(cwd, target));

  if (!isInside(root, resolved)) {
    throw new Error('路径超出允许范围');
  }
  if (SENSITIVE_BASENAME.test(path.basename(resolved))) {
    throw new Error('不允许访问敏感文件');
  }
  return resolved;
};

const HOST_PATTERN = /^(?:[A-Za-z0-9]|:)[A-Za-z0-9._:-]*(?:\/\d{1,3})?$/;
const PORT_SPEC = /^-p[0-9,\-]{1,64}$/;
const NUMBER = /^\d{1,4}$/;

const isBlockedHost = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '::' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^fe80:/.test(host) ||
    host === 'metadata.google.internal'
  );
};

/**
 * 每个命令的参数规则
 *  flags:      无值选项（精确匹配或正则）
 *  valueFlags: 带值选项，值必须匹配对应正则；值与选项必须分开写（-c 4）
 *  positional: none | host | path | url | grep
 *  maxPositional: 位置参数个数上限
 */
const RULES = {
  nmap: {
    flags: ['-6', '-Pn', '-n', '-F', '-sn', '-sT', '-sS', '-sU', '-sV', '-v', '-T0', '-T1', '-T2', '-T3', '-T4', '-T5', PORT_SPEC],
    positional: 'host',
    maxPositional: 8,
    requirePositional: true
  },
  ping: { flags: ['-n', '-4', '-6'], valueFlags: { '-c': /^(?:[1-9]|1\d|20)$/, '-W': /^(?:[1-9]|[1-5]\d|60)$/ }, positional: 'host', maxPositional: 1, requirePositional: true },
  ping6: { flags: ['-n'], valueFlags: { '-c': /^(?:[1-9]|1\d|20)$/, '-W': /^(?:[1-9]|[1-5]\d|60)$/ }, positional: 'host', maxPositional: 1, requirePositional: true },
  curl: { flags: ['-I', '-s', '-L'], positional: 'url', maxPositional: 1, requirePositional: true },
  netstat: { flags: ['-an', '-tu', '-tuln', '-rn'], positional: 'none' },
  ss: { flags: ['-tuln', '-tun', '-s'], positional: 'none' },
  traceroute: { flags: ['-n', '-4', '-6'], valueFlags: { '-m': /^(?:[1-9]|[1-5]\d|60)$/, '-q': /^[1-5]$/, '-w': /^[1-9]$/ }, positional: 'host', maxPositional: 1, requirePositional: true },
  traceroute6: { flags: ['-n'], valueFlags: { '-m': /^(?:[1-9]|[1-5]\d|60)$/, '-q': /^[1-5]$/, '-w': /^[1-9]$/ }, positional: 'host', maxPositional: 1, requirePositional: true },
  nslookup: { flags: [], positional: 'host', maxPositional: 2, requirePositional: true },
  dig: { flags: ['-4', '-6', '+short', '+trace', '-x'], positional: 'host', maxPositional: 3, requirePositional: true },
  host: { flags: ['-4', '-6', '-t'], positional: 'host', maxPositional: 3, requirePositional: true },
  ifconfig: { flags: ['-a'], positional: 'none' },
  uname: { flags: ['-a', '-r', '-m'], positional: 'none' },
  hostname: { flags: [], positional: 'none' },
  uptime: { flags: [], positional: 'none' },
  whoami: { flags: [], positional: 'none' },
  ps: { flags: ['aux'], positional: 'none' },
  top: { flags: ['-bn1'], positional: 'none' },
  ls: { flags: ['-l', '-a', '-la', '-lh', '-lah', '-h'], positional: 'path', maxPositional: 8 },
  pwd: { flags: [], positional: 'none' },
  cat: { flags: [], positional: 'path', maxPositional: 8, requirePositional: true },
  head: { flags: [], valueFlags: { '-n': NUMBER }, positional: 'path', maxPositional: 8, requirePositional: true },
  tail: { flags: [], valueFlags: { '-n': NUMBER }, positional: 'path', maxPositional: 8, requirePositional: true },
  grep: { flags: ['-r', '-R', '-i', '-n', '-v', '-c', '-E', '-F', '-w'], positional: 'grep', maxPositional: 9, requirePositional: true },
  sort: { flags: ['-n', '-r', '-u'], positional: 'path', maxPositional: 8, requirePositional: true },
  wc: { flags: ['-l', '-c', '-w'], positional: 'path', maxPositional: 8, requirePositional: true },
  echo: { flags: [], positional: 'free', maxPositional: 50 },
  date: { flags: ['-u'], positional: 'none' },
  df: { flags: ['-h'], positional: 'none' },
  du: { flags: ['-sh', '-h', '-s'], positional: 'path', maxPositional: 8 },
  free: { flags: ['-h', '-m'], positional: 'none' }
};

// ip 单独处理：只允许查看，不允许 add/del/set/exec 等
const IP_OBJECTS = new Set(['addr', 'address', 'link', 'route']);
const IP_FORBIDDEN = new Set(['add', 'del', 'delete', 'set', 'flush', 'change', 'replace', 'exec', 'netns', 'tunnel']);

const matchesFlag = (rule, arg) =>
  rule.flags.some((flag) => (flag instanceof RegExp ? flag.test(arg) : flag === arg));

const validateUrl = (value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error('URL 格式无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅允许 http/https');
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error('不允许访问本机或元数据地址');
  }
};

const validateIp = (args) => {
  if (args.length === 0 || !args.some((arg) => IP_OBJECTS.has(arg))) {
    throw new Error('ip 仅支持 addr/link/route 查看');
  }
  for (const arg of args) {
    if (IP_FORBIDDEN.has(arg) || !/^[A-Za-z0-9._:-]+$/.test(arg)) {
      throw new Error(`ip 参数不允许: ${arg}`);
    }
  }
  return args;
};

/**
 * 校验命令参数。通过时返回（可能被追加了安全选项的）参数数组；不通过抛出 Error。
 * @param {string} command 命令名（已通过白名单）
 * @param {string[]} args 参数
 * @param {{cwd: string, jailRoot?: string}} context
 */
const validateArgs = (command, args, context = {}) => {
  if (command === 'ip') {
    return validateIp(args);
  }

  const rule = RULES[command];
  if (!rule) {
    throw new Error('该命令暂不支持');
  }

  const cwd = context.cwd || process.cwd();
  const jailRoot = context.jailRoot || getJailRoot();
  const valueFlags = rule.valueFlags || {};
  const positional = [];
  let seenFlagTerminator = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (typeof arg !== 'string' || arg.length === 0 || arg.length > 512) {
      throw new Error('参数无效');
    }

    if (!seenFlagTerminator && arg === '--') {
      throw new Error('不支持 -- 参数');
    }

    if (Object.prototype.hasOwnProperty.call(valueFlags, arg)) {
      const value = args[i + 1];
      if (value === undefined || !valueFlags[arg].test(value)) {
        throw new Error(`选项 ${arg} 的值无效`);
      }
      i += 1;
      continue;
    }

    if (matchesFlag(rule, arg)) {
      continue;
    }

    // 以 - 或 + 开头但不在白名单：拒绝（dig 的 +short 等已在 flags 中列出）
    if (arg.startsWith('-') || (arg.startsWith('+') && rule.positional !== 'free')) {
      throw new Error(`参数不允许: ${arg}`);
    }

    positional.push(arg);
  }

  if (rule.requirePositional && positional.length === 0) {
    throw new Error('缺少必要参数');
  }
  if (positional.length > (rule.maxPositional || 0)) {
    throw new Error('参数过多');
  }

  switch (rule.positional) {
    case 'none':
      if (positional.length > 0) {
        throw new Error('该命令不接受额外参数');
      }
      break;
    case 'host':
      positional.forEach((value) => {
        if (!HOST_PATTERN.test(value)) {
          throw new Error(`目标格式无效: ${value}`);
        }
      });
      break;
    case 'url':
      positional.forEach(validateUrl);
      break;
    case 'path':
      positional.forEach((value) => resolveInJail(cwd, value, jailRoot));
      break;
    case 'grep':
      // 第一个位置参数是匹配模式，其余是路径
      positional.slice(1).forEach((value) => resolveInJail(cwd, value, jailRoot));
      if (positional.length < 2) {
        throw new Error('grep 需要同时提供模式和文件路径');
      }
      break;
    default:
      break;
  }

  // grep 递归时排除敏感文件，防止通过目录遍历读到 .env 等
  if (command === 'grep' && args.some((a) => a === '-r' || a === '-R')) {
    return ['--exclude=.env*', '--exclude=*.pem', '--exclude=*.key', '--exclude=id_*', ...args];
  }

  return args;
};

module.exports = {
  validateArgs,
  resolveInJail,
  buildSafeEnv,
  getJailRoot,
  ENV_WHITELIST
};
