/**
 * 每日统计快照与趋势（P5-1）
 *
 * 数据来自 countries / asns 上已有的汇总计数，不扫描 active_addresses；每天写一份到
 * daily_global_stats / daily_country_stats / daily_asn_stats（迁移 15），趋势接口读这些表。
 *
 * 写入：
 *   takeSnapshot({ date })            写（或覆盖）某一天的快照
 *   ensureDailySnapshot({ now })      今天的快照还没有、且已过了 STATS_SNAPSHOT_HOUR 就写一份
 *   startDailySnapshot()              服务启动时调用；每 10 分钟检查一次（app.js）。STATS_SNAPSHOT_ENABLED=false 关闭
 * 读取：
 *   getTrend({ scope, id, days })     global / country / asn 的每日序列与变化摘要
 *
 * 迁移 15 没执行时：写入被跳过（只在日志里提示一次），读取返回 503。
 */

const db = require('../database/db');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('stats-snapshot');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 730;

class StatsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'StatsError';
    this.status = status;
  }
}

const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);

/** 本地日期 YYYY-MM-DD（快照按服务器本地日历日计）。 */
const formatDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const snapshotHour = () => {
  const n = parseInt(process.env.STATS_SNAPSHOT_HOUR, 10);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 2;
};

/** 写（或覆盖）某一天的快照。date 默认今天。 */
const takeSnapshot = async ({ date } = {}) => {
  const day = date || formatDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new StatsError('date 必须是 YYYY-MM-DD');

  await db.query(
    `INSERT INTO daily_global_stats (stat_date, total_countries, total_asns, total_prefixes, total_addresses)
     SELECT ?,
            (SELECT COUNT(*) FROM countries),
            (SELECT COUNT(*) FROM asns),
            (SELECT COALESCE(SUM(total_ipv6_prefixes), 0) FROM countries),
            (SELECT COALESCE(SUM(total_active_ipv6), 0) FROM countries)
     ON DUPLICATE KEY UPDATE
       total_countries = VALUES(total_countries), total_asns = VALUES(total_asns),
       total_prefixes = VALUES(total_prefixes), total_addresses = VALUES(total_addresses)`,
    [day]
  );
  await db.query(
    `INSERT INTO daily_country_stats (stat_date, country_id, total_prefixes, total_addresses)
     SELECT ?, country_id, COALESCE(total_ipv6_prefixes, 0), COALESCE(total_active_ipv6, 0)
     FROM countries
     WHERE COALESCE(total_ipv6_prefixes, 0) > 0 OR COALESCE(total_active_ipv6, 0) > 0
     ON DUPLICATE KEY UPDATE
       total_prefixes = VALUES(total_prefixes), total_addresses = VALUES(total_addresses)`,
    [day]
  );
  await db.query(
    `INSERT INTO daily_asn_stats (stat_date, asn, total_prefixes, total_addresses)
     SELECT ?, asn, COALESCE(total_ipv6_prefixes, 0), COALESCE(total_active_ipv6, 0)
     FROM asns
     WHERE COALESCE(total_ipv6_prefixes, 0) > 0 OR COALESCE(total_active_ipv6, 0) > 0
     ON DUPLICATE KEY UPDATE
       total_prefixes = VALUES(total_prefixes), total_addresses = VALUES(total_addresses)`,
    [day]
  );
  return { date: day };
};

let warnedMissingTable = false;

/**
 * 今天的快照还没有、且本地时间已过 STATS_SNAPSHOT_HOUR（默认 2 点）就写一份。
 * 返回 { taken, date } 或 { taken: false, reason }。从不抛出。
 */
const ensureDailySnapshot = async ({ now = new Date() } = {}) => {
  const today = formatDate(now);
  if (now.getHours() < snapshotHour()) return { taken: false, date: today, reason: 'too-early' };
  try {
    const [rows] = await db.query('SELECT 1 FROM daily_global_stats WHERE stat_date = ? LIMIT 1', [today]);
    if (Array.isArray(rows) && rows.length > 0) return { taken: false, date: today, reason: 'exists' };
    await takeSnapshot({ date: today });
    logger.info(`已写入 ${today} 的统计快照`);
    return { taken: true, date: today };
  } catch (error) {
    if (isMissingTable(error)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        logger.warn('统计快照表不存在，请先执行迁移：node scripts/migrate.js（迁移 15）');
      }
      return { taken: false, date: today, reason: 'no-table' };
    }
    logger.error('写入统计快照失败:', error.message);
    return { taken: false, date: today, reason: 'error' };
  }
};

let timer = null;

/** 启动每日快照检查。重复调用无副作用。 */
const startDailySnapshot = ({ intervalMs = CHECK_INTERVAL_MS } = {}) => {
  if (timer) return false;
  if (String(process.env.STATS_SNAPSHOT_ENABLED).toLowerCase() === 'false') {
    logger.info('每日统计快照已关闭（STATS_SNAPSHOT_ENABLED=false）');
    return false;
  }
  timer = setInterval(() => { ensureDailySnapshot(); }, intervalMs);
  timer.unref();
  ensureDailySnapshot();
  logger.info(`每日统计快照已启动：每天 ${snapshotHour()} 点后写入一次`);
  return true;
};

const stopDailySnapshot = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

// ---------- 趋势 ----------

const SCOPES = {
  global: {
    sql: `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date, total_prefixes, total_addresses, total_countries, total_asns
          FROM daily_global_stats WHERE stat_date >= ? ORDER BY stat_date`
  },
  country: {
    sql: `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date, total_prefixes, total_addresses
          FROM daily_country_stats WHERE country_id = ? AND stat_date >= ? ORDER BY stat_date`
  },
  asn: {
    sql: `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date, total_prefixes, total_addresses
          FROM daily_asn_stats WHERE asn = ? AND stat_date >= ? ORDER BY stat_date`
  }
};

const normalizeTrendQuery = ({ scope = 'global', id, days } = {}) => {
  const scopeName = String(scope);
  if (!Object.prototype.hasOwnProperty.call(SCOPES, scopeName)) {
    throw new StatsError('scope 只能是 global、country 或 asn');
  }

  let daysValue = DEFAULT_DAYS;
  if (days !== undefined && days !== null && days !== '') {
    if (!/^\d{1,4}$/.test(String(days).trim())) throw new StatsError(`days 必须是 1–${MAX_DAYS} 的整数`);
    daysValue = Number(String(days).trim());
    if (daysValue < 1 || daysValue > MAX_DAYS) throw new StatsError(`days 必须是 1–${MAX_DAYS} 的整数`);
  }

  let key = null;
  if (scopeName === 'country') {
    const code = String(id ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new StatsError('country 范围需要 id=两位国家代码（如 CN）');
    key = code;
  } else if (scopeName === 'asn') {
    const text = String(id ?? '').trim().replace(/^AS/i, '');
    if (!/^\d{1,10}$/.test(text) || Number(text) < 1 || Number(text) > 4294967295) {
      throw new StatsError('asn 范围需要 id=AS 号（如 4134）');
    }
    key = Number(text);
  }
  return { scope: scopeName, id: key, days: daysValue };
};

const change = (first, last) => ({
  first,
  last,
  change: last - first,
  changePct: first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : null
});

/**
 * 每日序列：[{ date, prefixes, addresses }]（global 另有 countries、asns），按日期升序。
 * 没有快照的日子不补点；summary 比较窗口内第一个和最后一个有数据的点。
 */
const getTrend = async (query = {}, { now = new Date() } = {}) => {
  const { scope, id, days } = normalizeTrendQuery(query);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const from = formatDate(start);

  let rows;
  try {
    const args = scope === 'global' ? [from] : [id, from];
    [rows] = await db.query(SCOPES[scope].sql, args);
  } catch (error) {
    if (isMissingTable(error)) throw new StatsError('趋势数据尚未启用，请先执行数据库迁移（迁移 15）', 503);
    throw error;
  }

  const points = (Array.isArray(rows) ? rows : []).map((row) => {
    const point = { date: row.date, prefixes: Number(row.total_prefixes), addresses: Number(row.total_addresses) };
    if (scope === 'global') {
      point.countries = Number(row.total_countries);
      point.asns = Number(row.total_asns);
    }
    return point;
  });

  const summary = points.length === 0
    ? null
    : {
      from: points[0].date,
      to: points[points.length - 1].date,
      addresses: change(points[0].addresses, points[points.length - 1].addresses),
      prefixes: change(points[0].prefixes, points[points.length - 1].prefixes)
    };

  return { scope, id, days, from, points, summary };
};

module.exports = {
  StatsError,
  takeSnapshot,
  ensureDailySnapshot,
  startDailySnapshot,
  stopDailySnapshot,
  normalizeTrendQuery,
  getTrend,
  formatDate,
  DEFAULT_DAYS,
  MAX_DAYS
};
