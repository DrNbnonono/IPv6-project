/**
 * 扫描策略
 * 在创建 xmap / zgrab2 任务之前检查目标、速率与配额。原则是默认拒绝：
 * 目标必须完整落在白名单内，才允许扫描。
 *
 * 白名单来源（取并集）：
 * - 环境变量 SCAN_ALLOWED_TARGETS（逗号分隔的地址/CIDR），适合部署时固定的实验网段；
 * - 表 scan_allowlist，管理员在 /api/admin/scan-allowlist 维护。
 * 拒绝规则（优先于白名单）：
 * - 内置的保留/特殊地址：回环、未指定、组播、链路本地（含云元数据 169.254.0.0/16）、IPv4 映射、NAT64 等；
 * - 表 scan_blacklist 中的网段——只要目标与黑名单有任何交集就拒绝。
 * 要开放更大的范围，需要管理员显式添加白名单条目（例如 ::/0），该操作会写入审计日志。
 *
 * 速率与配额（环境变量给默认值，user_quotas 表按用户覆盖）：
 * - SCAN_MAX_RATE（默认 100M，单位 bit/s，支持 K/M/G 后缀）：单个 xmap 任务的速率上限；
 * - SCAN_DEFAULT_RATE（默认 10M）：请求未指定速率时使用的值（不超过上限）；
 * - SCAN_DAILY_LIMIT（默认 100）：每个用户每天可创建的扫描任务数（xmap + zgrab2 + apd）。
 *
 * 本服务返回 { allowed, reason, normalized }，不抛出业务异常；数据库错误会向上抛出。
 * 说明：策略在创建任务时检查；任务排队期间白名单发生变化不会重新检查。
 */

const fs = require('fs');
const readline = require('readline');
const db = require('../database/db');
const { parseTarget, contains, overlaps } = require('./cidrService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('scan-policy');

// 内置禁止扫描的范围（与白名单无关，任何情况下都拒绝）
const BUILTIN_BLOCKED = [
  ['::/128', '未指定地址'],
  ['::1/128', '回环地址'],
  ['ff00::/8', '组播地址'],
  ['fe80::/10', '链路本地地址'],
  ['::ffff:0:0/96', 'IPv4 映射地址'],
  ['64:ff9b::/96', 'NAT64 转换地址'],
  ['0.0.0.0/8', '“本网络”地址'],
  ['127.0.0.0/8', '回环地址'],
  ['169.254.0.0/16', '链路本地地址（含云厂商元数据服务）'],
  ['224.0.0.0/4', '组播地址'],
  ['240.0.0.0/4', '保留地址（含广播）']
].map(([cidr, label]) => ({ range: parseTarget(cidr), label }));

const RATE_UNITS = { k: 1e3, m: 1e6, g: 1e9 };

/** '10M' → 10000000（bit/s）；非法返回 null。 */
const parseRate = (value) => {
  const match = /^(\d+(?:\.\d+)?)([KkMmGg])?$/.exec(String(value).trim());
  if (!match) return null;
  const bps = Math.round(Number(match[1]) * (match[2] ? RATE_UNITS[match[2].toLowerCase()] : 1));
  return Number.isFinite(bps) && bps > 0 ? bps : null;
};

/** 10000000 → '10M'（能整除时用后缀）。 */
const formatRate = (bps) => {
  if (bps % 1e9 === 0) return `${bps / 1e9}G`;
  if (bps % 1e6 === 0) return `${bps / 1e6}M`;
  if (bps % 1e3 === 0) return `${bps / 1e3}K`;
  return String(bps);
};

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

/** 解析一组 CIDR 文本，丢弃并记录无法解析的条目。 */
const parseEntries = (list, source) => {
  const out = [];
  for (const text of list) {
    const range = parseTarget(text);
    if (range) out.push({ range, text: range.text });
    else logger.warn(`${source} 中的条目无法解析，已忽略: ${text}`);
  }
  return out;
};

/** 读取当前生效的策略：白名单、黑名单、该用户的速率与每日上限。 */
const loadPolicy = async (userId) => {
  const envAllowed = String(process.env.SCAN_ALLOWED_TARGETS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const [allowRows, blockRows, quotaRows] = await Promise.all([
    db.query('SELECT cidr FROM scan_allowlist'),
    db.query('SELECT cidr FROM scan_blacklist'),
    userId ? db.query('SELECT max_rate_bps, daily_scan_limit FROM user_quotas WHERE user_id = ?', [userId]) : Promise.resolve([[]])
  ]);

  const quota = rows(quotaRows)[0] || {};
  const defaultMax = parseRate(process.env.SCAN_MAX_RATE || '100M') || 100e6;
  const maxRateBps = quota.max_rate_bps ? Number(quota.max_rate_bps) : defaultMax;
  const defaultRateBps = Math.min(parseRate(process.env.SCAN_DEFAULT_RATE || '10M') || 10e6, maxRateBps);

  return {
    allow: [
      ...parseEntries(envAllowed, 'SCAN_ALLOWED_TARGETS'),
      ...parseEntries(rows(allowRows).map((r) => r.cidr), 'scan_allowlist')
    ],
    block: parseEntries(rows(blockRows).map((r) => r.cidr), 'scan_blacklist'),
    maxRateBps,
    defaultRateBps,
    dailyLimit: quota.daily_scan_limit ? Number(quota.daily_scan_limit) : toPositiveInt(process.env.SCAN_DAILY_LIMIT, 100)
  };
};

/** 检查单个范围：返回 null 表示允许，否则返回拒绝原因。 */
const checkRange = (range, policy) => {
  const builtin = BUILTIN_BLOCKED.find((item) => overlaps(item.range, range));
  if (builtin) return `目标 ${range.text} 属于不允许扫描的${builtin.label}范围 ${builtin.range.text}`;

  const blocked = policy.block.find((item) => overlaps(item.range, range));
  if (blocked) return `目标 ${range.text} 与黑名单 ${blocked.text} 重叠`;

  if (!policy.allow.some((item) => contains(item.range, range))) {
    return `目标 ${range.text} 不在允许扫描的范围内（默认拒绝）；请联系管理员把已获授权的网段加入白名单`;
  }
  return null;
};

const splitTargets = (targets) => {
  const list = Array.isArray(targets) ? targets : [targets];
  return list
    .filter((item) => item !== undefined && item !== null)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
};

const deny = (reason) => ({ allowed: false, reason, normalized: null });

/** 今天（服务器时区）该用户已创建的扫描任务数。 */
const countTodayScans = async (userId) => {
  const result = await db.query(
    "SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND task_type IN ('xmap', 'zgrab2', 'apd') AND created_at >= CURDATE()",
    [userId]
  );
  return Number((rows(result)[0] || {}).count || 0);
};

/**
 * 校验一个扫描请求。
 *   user      { id }
 *   taskType  'xmap' | 'zgrab2' | 'apd'（xmap 与 apd 会发送探测包，检查速率；zgrab2 不检查）
 *   targets   地址/CIDR 的数组或逗号分隔字符串
 *   rate      请求的速率（xmap 的 -B 写法，如 '10M'），可省略
 *   requireTargets  为 true（默认）时，没有任何目标即拒绝
 * 通过时 normalized = { targets: [规范化文本], rate, rateBps }（rate/rateBps 仅 xmap 有）。
 */
const validateScanRequest = async ({ user, taskType, targets, rate, requireTargets = true }) => {
  const policy = await loadPolicy(user && user.id);
  const list = splitTargets(targets);

  if (list.length === 0 && requireTargets) {
    return deny('未指定扫描目标：不允许不带目标的扫描');
  }

  const normalizedTargets = [];
  for (const text of list) {
    const range = parseTarget(text);
    if (!range) return deny(`目标 "${text}" 不是有效的 IP 地址或 CIDR（不接受域名）`);
    const reason = checkRange(range, policy);
    if (reason) return deny(reason);
    normalizedTargets.push(range.text);
  }

  const normalized = { targets: normalizedTargets };

  if (taskType === 'xmap' || taskType === 'apd') {
    let rateBps;
    if (rate === undefined || rate === null || rate === '') {
      rateBps = policy.defaultRateBps;
      normalized.rate = formatRate(rateBps);
    } else {
      rateBps = parseRate(rate);
      if (rateBps === null) return deny(`速率 "${rate}" 格式无效`);
      if (rateBps > policy.maxRateBps) {
        return deny(`速率 ${rate} 超过你的上限 ${formatRate(policy.maxRateBps)}`);
      }
      normalized.rate = String(rate).trim();
    }
    normalized.rateBps = rateBps;
  }

  if (user && user.id) {
    const used = await countTodayScans(user.id);
    if (used >= policy.dailyLimit) {
      return deny(`今天已创建 ${used} 个扫描任务，达到每日上限 ${policy.dailyLimit}`);
    }
  }

  return { allowed: true, reason: null, normalized };
};

/**
 * 逐行检查目标文件（zgrab2 的输入文件、xmap 的白名单文件）。
 * 每行取第一个逗号前的字段作为目标，空行和 # 开头的行跳过；遇到第一个违规行即停止。
 * 返回 { allowed, reason, count }，count 为检查通过的目标行数。
 */
const validateTargetFile = async ({ user, filePath }) => {
  const policy = await loadPolicy(user && user.id);

  const input = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let lineNo = 0;
  let count = 0;
  let verdict = null;

  try {
    for await (const raw of input) {
      lineNo += 1;
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      const text = line.split(',')[0].trim();
      const range = parseTarget(text);
      const reason = range ? checkRange(range, policy) : `不是有效的 IP 地址或 CIDR（不接受域名）: ${text.slice(0, 64)}`;
      if (reason) {
        verdict = deny(`文件第 ${lineNo} 行: ${reason}`);
        break;
      }
      count += 1;
    }
  } finally {
    input.close();
  }

  if (verdict) return { ...verdict, count };
  if (count === 0) return { allowed: false, reason: '文件中没有任何扫描目标', normalized: null, count };
  return { allowed: true, reason: null, normalized: null, count };
};

/** 当前生效的策略摘要（管理页展示用，不含用户级覆盖）。 */
const describePolicy = () => ({
  envAllowedTargets: String(process.env.SCAN_ALLOWED_TARGETS || '').split(',').map((s) => s.trim()).filter(Boolean),
  builtinBlocked: BUILTIN_BLOCKED.map((item) => ({ cidr: item.range.text, label: item.label })),
  defaults: {
    maxRate: formatRate(parseRate(process.env.SCAN_MAX_RATE || '100M') || 100e6),
    defaultRate: formatRate(parseRate(process.env.SCAN_DEFAULT_RATE || '10M') || 10e6),
    dailyScanLimit: toPositiveInt(process.env.SCAN_DAILY_LIMIT, 100)
  }
});

module.exports = {
  validateScanRequest,
  validateTargetFile,
  describePolicy,
  parseRate,
  formatRate,
  BUILTIN_BLOCKED
};
