/**
 * ZGrab2 命令构造
 * 旧实现把用户输入拼进 shell 字符串后用 exec 执行，port 和 additionalParams 可注入命令。
 * 这里把所有输入校验成参数数组，由 execFile 直接执行（不经过 shell）。
 */

const ZGRAB2_BIN = process.env.ZGRAB2_BIN || '/home/ipv6/go/bin/src/zmap/zgrab2/zgrab2';

class Zgrab2ArgsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Zgrab2ArgsError';
  }
}

// 这些选项会改变 zgrab2 读写的文件，只能由程序自己指定
const RESERVED_OPTIONS = new Set([
  'output-file', 'input-file', 'log-file', 'metadata-file', 'status-updates-file',
  'config-file', 'config', 'port', 'help', 'version'
]);

const OPTION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
// 值允许常见可见字符和空格，禁止控制字符；长度受限
const OPTION_VALUE = /^[^\u0000-\u001f\u007f]{1,256}$/;

/**
 * 校验端口，返回整数；未提供时返回 undefined
 */
const validatePort = (port) => {
  if (port === undefined || port === null || port === '') {
    return undefined;
  }
  const text = String(port).trim();
  if (!/^\d{1,5}$/.test(text)) {
    throw new Zgrab2ArgsError('端口必须是 1-65535 的整数');
  }
  const value = Number(text);
  if (value < 1 || value > 65535) {
    throw new Zgrab2ArgsError('端口必须是 1-65535 的整数');
  }
  return value;
};

/**
 * 校验额外参数，返回 ['--key=value', ...]；值为空的项被忽略（与旧行为一致）
 */
const buildExtraArgs = (additionalParams) => {
  if (additionalParams === undefined || additionalParams === null) {
    return [];
  }
  if (typeof additionalParams !== 'object' || Array.isArray(additionalParams)) {
    throw new Zgrab2ArgsError('额外参数格式无效');
  }

  const args = [];
  for (const [rawKey, rawValue] of Object.entries(additionalParams)) {
    if (rawValue === undefined || rawValue === null || rawValue === '' || rawValue === false) {
      continue;
    }
    const key = String(rawKey).trim().replace(/^-+/, '');
    if (!OPTION_NAME.test(key)) {
      throw new Zgrab2ArgsError(`额外参数名无效: ${String(rawKey).slice(0, 40)}`);
    }
    if (RESERVED_OPTIONS.has(key.toLowerCase())) {
      throw new Zgrab2ArgsError(`额外参数不允许: ${key}`);
    }
    if (typeof rawValue === 'object') {
      throw new Zgrab2ArgsError(`额外参数值无效: ${key}`);
    }
    const value = String(rawValue);
    if (!OPTION_VALUE.test(value)) {
      throw new Zgrab2ArgsError(`额外参数值无效: ${key}`);
    }
    args.push(rawValue === true ? `--${key}` : `--${key}=${value}`);
  }
  return args;
};

/**
 * 单模块扫描参数
 */
const buildSingleModuleArgs = ({ module, port, inputFile, outputFile, logFile, additionalParams }) => [
  module,
  '--port', String(port),
  '-f', inputFile,
  '-o', outputFile,
  '-l', logFile,
  ...buildExtraArgs(additionalParams)
];

/**
 * 多模块（配置文件）扫描参数
 */
const buildMultipleArgs = ({ configFile, inputFile, outputFile, logFile }) => [
  'multiple',
  '-c', configFile,
  '-f', inputFile,
  '-o', outputFile,
  '-l', logFile
];

/**
 * 供任务记录展示的命令文本（仅用于保存/显示，不会交给 shell 执行）
 */
const formatCommand = (args, bin = ZGRAB2_BIN) => [bin, ...args].join(' ');

module.exports = {
  ZGRAB2_BIN,
  Zgrab2ArgsError,
  RESERVED_OPTIONS,
  validatePort,
  buildExtraArgs,
  buildSingleModuleArgs,
  buildMultipleArgs,
  formatCommand
};
