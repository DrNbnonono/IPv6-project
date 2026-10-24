/**
 * 统一日志服务。
 *
 * 用法：
 *   const { createModuleLogger } = require('../services/loggerService');
 *   const logger = createModuleLogger('xmap');
 *   logger.info('任务已创建', { taskId });          // 参数风格与 console.log 一致
 *   logger.error('启动失败:', error);               // Error 会输出堆栈
 *
 * 约定：
 * - 所有日志统一进入同一个 winston 根日志器（控制台 + backend_logs/combined.log + error.log），
 *   每个模块通过 child 增加 `module` 字段。
 * - 参数会先经过 maskSensitive 脱敏（token、密码、Authorization、Cookie、API Key 等），
 *   字符串里的 `Bearer xxx`、`password=xxx` 也会被遮蔽。
 * - 级别由 LOG_LEVEL 控制（默认 info）；原先的调试输出（console.log）统一用 logger.debug，
 *   需要排查时设置 LOG_LEVEL=debug。
 * - NODE_ENV=test 时默认静默，也不创建日志文件；设置 LOG_IN_TEST=true 可打开。
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { createLogger, format, transports, config } = require('winston');
const { DIRS } = require('./storageService');

const MASK = '***';
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 200;
const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

// 键名命中即整体遮蔽；以 tokens 结尾的（max_tokens、total_tokens 等用量统计）不是凭据
const SENSITIVE_KEY = /(password|passwd|pwd|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|credential|sudo)/i;
const isSensitiveKey = (key) => SENSITIVE_KEY.test(key) && !/tokens$/i.test(key);

const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_RE = /((?:password|passwd|pwd|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^\s"',&;}]+/gi;

const maskString = (str) => String(str).replace(BEARER_RE, `$1${MASK}`).replace(KEY_VALUE_RE, `$1${MASK}`);

/**
 * 深度遮蔽对象中的敏感字段，返回新对象，不修改入参。
 * 处理循环引用、超深嵌套、Error、Buffer、Date。
 */
function maskSensitive(value, depth = 0, seen = new WeakSet()) {
  if (typeof value === 'string') return maskString(value);
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? '[Function]' : value;
  }
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  let result;
  if (value instanceof Error) {
    result = { name: value.name, message: maskString(value.message) };
    if (value.stack) result.stack = maskString(value.stack);
    for (const key of Object.keys(value)) {
      result[key] = isSensitiveKey(key) ? MASK : maskSensitive(value[key], depth + 1, seen);
    }
  } else if (Array.isArray(value)) {
    result = value.slice(0, MAX_ARRAY_ITEMS).map((item) => maskSensitive(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) result.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
  } else {
    result = {};
    for (const key of Object.keys(value)) {
      result[key] = isSensitiveKey(key) ? MASK : maskSensitive(value[key], depth + 1, seen);
    }
  }

  seen.delete(value);
  return result;
}

const formatOne = (arg) => {
  if (typeof arg === 'string') return maskString(arg);
  if (arg instanceof Error) return maskString(arg.stack || arg.message);
  return maskSensitive(arg);
};

/** 把 console 风格的参数列表格式化为单个已脱敏字符串（支持 %s/%d 占位符）。 */
function formatLogArgs(args) {
  if (!args.length) return '';
  return util.format(...args.map(formatOne));
}

// ---------- 根日志器（惰性创建）----------

let rootLogger = null;

function buildRootLogger() {
  const inTest = process.env.NODE_ENV === 'test' && process.env.LOG_IN_TEST !== 'true';
  const level = process.env.LOG_LEVEL || 'info';

  if (inTest) {
    return createLogger({ level, transports: [new transports.Console({ silent: true })] });
  }

  try {
    fs.mkdirSync(DIRS.backendLogs, { recursive: true });
  } catch (err) {
    // 日志目录不可写时退化为仅控制台输出，而不是让服务起不来
    process.stderr.write(`日志目录不可用，仅输出到控制台: ${err.message}\n`);
  }

  const timestamp = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });
  const lineFormat = format.printf(
    ({ timestamp: ts, level: lvl, module: mod, message }) => `${ts} ${lvl} [${mod || 'app'}] ${message}`
  );

  const list = [
    new transports.Console({
      format: format.combine(timestamp, format.colorize(), lineFormat),
      // stdio 类程序（如 scripts/mcpStdio.js）的 stdout 是协议通道，日志必须走 stderr
      ...(process.env.LOG_TO_STDERR === '1' ? { stderrLevels: Object.keys(config.npm.levels) } : {})
    })
  ];

  if (fs.existsSync(DIRS.backendLogs)) {
    const fileFormat = format.combine(timestamp, format.json());
    list.push(
      new transports.File({ filename: path.join(DIRS.backendLogs, 'combined.log'), format: fileFormat }),
      new transports.File({ filename: path.join(DIRS.backendLogs, 'error.log'), level: 'error', format: fileFormat })
    );
  }

  return createLogger({ level, transports: list });
}

/**
 * 创建模块日志器。返回的对象具有 winston Logger 的各级别方法，
 * 但参数按 console 风格处理（多参数、Error、对象均可），并自动脱敏。
 */
function createModuleLogger(moduleName) {
  if (!rootLogger) rootLogger = buildRootLogger();
  const child = rootLogger.child({ module: moduleName });
  for (const lvl of LEVELS) {
    const write = child[lvl].bind(child);
    child[lvl] = (...args) => write(formatLogArgs(args));
  }
  return child;
}

// 仅供测试：取得（必要时创建）根日志器以挂接捕获用的 transport，以及丢弃根日志器
function _getRootLogger() {
  if (!rootLogger) rootLogger = buildRootLogger();
  return rootLogger;
}

function _reset() {
  if (rootLogger) rootLogger.close();
  rootLogger = null;
}

module.exports = { createModuleLogger, maskSensitive, maskString, formatLogArgs, _getRootLogger, _reset };
