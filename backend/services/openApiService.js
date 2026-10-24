/**
 * 开放只读 API 的查询（P5-3）：/api/open/v1/*
 *
 * 只读、参数全部校验并走占位符。统计类数据来自 countries / asns / ip_prefixes 上已有的汇总计数；
 * 完整地址只能通过 listAddresses 按前缀分页读取（路由要求 addresses 权限），
 * 用 address_id 做游标，避免对 7500 万行的表做 OFFSET 分页。
 */

const db = require('../database/db');
const stats = require('./statsSnapshotService');

class OpenApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'OpenApiError';
    this.status = status;
  }
}

const rowsOf = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

const intParam = (value, label, { min, max, fallback }) => {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (!/^\d{1,12}$/.test(text)) throw new OpenApiError(`${label} 必须是 ${min}–${max} 的整数`);
  const n = Number(text);
  if (n < min || n > max) throw new OpenApiError(`${label} 必须是 ${min}–${max} 的整数`);
  return n;
};

const countryCode = (value, label = 'country') => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new OpenApiError(`${label} 必须是两位国家代码（如 CN）`);
  return code;
};

const asnNumber = (value, label = 'asn') => {
  const text = String(value ?? '').trim().replace(/^AS/i, '');
  if (!/^\d{1,10}$/.test(text) || Number(text) < 1 || Number(text) > 4294967295) throw new OpenApiError(`${label} 必须是 AS 号（如 4134）`);
  return Number(text);
};

const countryView = (row) => ({
  code: row.country_id,
  name: row.country_name,
  nameZh: row.country_name_zh || null,
  region: row.region || null,
  prefixes: Number(row.total_ipv6_prefixes) || 0,
  addresses: Number(row.total_active_ipv6) || 0
});

const asnView = (row) => ({
  asn: Number(row.asn),
  name: row.as_name,
  nameZh: row.as_name_zh || null,
  country: row.country_id || null,
  prefixes: Number(row.total_ipv6_prefixes) || 0,
  addresses: Number(row.total_active_ipv6) || 0
});

const globalStats = async () => {
  const [row] = rowsOf(await db.query(
    `SELECT (SELECT COUNT(*) FROM countries) AS total_countries,
            (SELECT COUNT(*) FROM asns) AS total_asns,
            (SELECT COALESCE(SUM(total_ipv6_prefixes), 0) FROM countries) AS total_prefixes,
            (SELECT COALESCE(SUM(total_active_ipv6), 0) FROM countries) AS total_addresses,
            (SELECT MAX(last_updated) FROM countries) AS updated_at`
  ));
  return {
    countries: Number(row?.total_countries) || 0,
    asns: Number(row?.total_asns) || 0,
    prefixes: Number(row?.total_prefixes) || 0,
    addresses: Number(row?.total_addresses) || 0,
    updatedAt: row?.updated_at || null
  };
};

const COUNTRY_SORT = { addresses: 'total_active_ipv6', prefixes: 'total_ipv6_prefixes' };

const listCountries = async ({ limit, sort } = {}) => {
  const n = intParam(limit, 'limit', { min: 1, max: 300, fallback: 50 });
  const sortKey = sort === undefined || sort === '' ? 'addresses' : String(sort);
  if (!Object.prototype.hasOwnProperty.call(COUNTRY_SORT, sortKey)) throw new OpenApiError('sort 只能是 addresses 或 prefixes');
  const rows = rowsOf(await db.query(
    `SELECT country_id, country_name, country_name_zh, region, total_ipv6_prefixes, total_active_ipv6
     FROM countries ORDER BY ${COUNTRY_SORT[sortKey]} DESC, country_id LIMIT ?`,
    [n]
  ));
  return rows.map(countryView);
};

const getCountry = async (code) => {
  const id = countryCode(code, 'code');
  const [row] = rowsOf(await db.query(
    `SELECT country_id, country_name, country_name_zh, region, total_ipv6_prefixes, total_active_ipv6
     FROM countries WHERE country_id = ? LIMIT 1`,
    [id]
  ));
  if (!row) throw new OpenApiError('国家不存在', 404);
  const topAsns = rowsOf(await db.query(
    `SELECT asn, as_name, as_name_zh, country_id, total_ipv6_prefixes, total_active_ipv6
     FROM asns WHERE country_id = ? ORDER BY total_active_ipv6 DESC, asn LIMIT 10`,
    [id]
  ));
  return { ...countryView(row), topAsns: topAsns.map(asnView) };
};

const getAsn = async (value) => {
  const asn = asnNumber(value, 'asn');
  const [row] = rowsOf(await db.query(
    `SELECT asn, as_name, as_name_zh, country_id, total_ipv6_prefixes, total_active_ipv6
     FROM asns WHERE asn = ? LIMIT 1`,
    [asn]
  ));
  if (!row) throw new OpenApiError('ASN 不存在', 404);
  return asnView(row);
};

const listPrefixes = async ({ asn, country, page, pageSize } = {}) => {
  const where = ["version = '6'"];
  const args = [];
  if (asn !== undefined && asn !== '') { where.push('asn = ?'); args.push(asnNumber(asn)); }
  if (country !== undefined && country !== '') { where.push('country_id = ?'); args.push(countryCode(country)); }
  const size = intParam(pageSize, 'pageSize', { min: 1, max: 200, fallback: 50 });
  const pageNo = intParam(page, 'page', { min: 1, max: 100000, fallback: 1 });

  const [{ total } = { total: 0 }] = rowsOf(await db.query(`SELECT COUNT(*) AS total FROM ip_prefixes WHERE ${where.join(' AND ')}`, args));
  const rows = rowsOf(await db.query(
    `SELECT prefix_id, prefix, prefix_length, asn, country_id, registry, active_ipv6_count
     FROM ip_prefixes WHERE ${where.join(' AND ')} ORDER BY prefix_id LIMIT ? OFFSET ?`,
    [...args, size, (pageNo - 1) * size]
  ));
  return {
    page: pageNo,
    pageSize: size,
    total: Number(total) || 0,
    items: rows.map((r) => ({
      prefixId: Number(r.prefix_id),
      prefix: r.prefix,
      length: Number(r.prefix_length),
      asn: r.asn === null || r.asn === undefined ? null : Number(r.asn),
      country: r.country_id || null,
      registry: r.registry || null,
      addresses: Number(r.active_ipv6_count) || 0
    }))
  };
};

/** 某个前缀下的完整地址，按 address_id 游标分页。 */
const listAddresses = async ({ prefixId, limit, after } = {}) => {
  const id = intParam(prefixId, 'prefixId', { min: 1, max: 9007199254740991, fallback: undefined });
  if (id === undefined) throw new OpenApiError('需要 prefixId（可从 /prefixes 取得）');
  const n = intParam(limit, 'limit', { min: 1, max: 1000, fallback: 100 });
  const cursor = intParam(after, 'after', { min: 0, max: 9007199254740991, fallback: 0 });

  const [prefix] = rowsOf(await db.query('SELECT prefix_id FROM ip_prefixes WHERE prefix_id = ? LIMIT 1', [id]));
  if (!prefix) throw new OpenApiError('前缀不存在', 404);

  const rows = rowsOf(await db.query(
    `SELECT a.address_id, a.address, t.type_name AS iid_type
     FROM active_addresses a LEFT JOIN address_types t ON t.type_id = a.iid_type
     WHERE a.prefix_id = ? AND a.address_id > ? ORDER BY a.address_id LIMIT ?`,
    [id, cursor, n + 1]
  ));
  const hasMore = rows.length > n;
  const items = rows.slice(0, n);
  return {
    prefixId: id,
    items: items.map((r) => ({ address: r.address, iidType: r.iid_type || null })),
    nextAfter: hasMore ? Number(items[items.length - 1].address_id) : null
  };
};

const trends = async (query = {}) => {
  try {
    return await stats.getTrend(query);
  } catch (error) {
    if (error instanceof stats.StatsError) throw new OpenApiError(error.message, error.status);
    throw error;
  }
};

module.exports = {
  OpenApiError,
  globalStats,
  listCountries,
  getCountry,
  getAsn,
  listPrefixes,
  listAddresses,
  trends
};
