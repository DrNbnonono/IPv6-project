/**
 * 高级查询构建器
 * 前端只提交结构化筛选条件，SQL 由这里统一生成；所有标识符来自白名单，所有取值走占位符，
 * 因此不再接受前端直接提交的 SQL。
 */

const { isReadOnlySelect } = require('./sqlGuardService');

class QueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;

// active_addresses 本身不记录时间（见 structure.sql）；“首次/最近发现”取该地址各协议记录
// （address_protocols）的最早/最晚时间。没有任何协议记录的地址为 NULL，日期条件会排除它们。
// 用相关子查询而不是 JOIN 聚合：不受其他条件对 address_protocols 的 JOIN 影响，主键 (address_id, …) 可直接定位。
const FIRST_SEEN_EXPR = '(SELECT MIN(x.first_seen) FROM address_protocols x WHERE x.address_id = aa.address_id)';
const LAST_SEEN_EXPR = '(SELECT MAX(x.last_seen) FROM address_protocols x WHERE x.address_id = aa.address_id)';

// 可选输出字段 -> SELECT 片段
const FIELD_SELECTS = {
  address: 'aa.address',
  address_id: 'aa.address_id',
  prefix: 'ip.prefix',
  country: 'c.country_name_zh, c.country_name',
  asn: 'a.asn, a.as_name_zh, a.as_name',
  first_seen: `${FIRST_SEEN_EXPR} as first_seen`,
  last_seen: `${LAST_SEEN_EXPR} as last_seen`,
  iid_type: 'at.type_name as iid_type',
  protocols: "GROUP_CONCAT(DISTINCT CONCAT(p.protocol_name, ':', IFNULL(ap.port, p.protocol_number)) SEPARATOR '; ') as protocols",
  vulnerabilities: "GROUP_CONCAT(DISTINCT CONCAT(v.description, IF(av.is_fixed, ' (已修复)', ' (未修复)')) SEPARATOR '; ') as vulnerabilities"
};

// 可选排序字段 -> 实际列
const ORDER_COLUMNS = {
  address: 'aa.address',
  first_seen: FIRST_SEEN_EXPR,
  last_seen: LAST_SEEN_EXPR
};

const isBlank = (value) => value === undefined || value === null || value === '';

const toInt = (value, label) => {
  const text = String(value).trim();
  if (!/^\d{1,18}$/.test(text)) {
    throw new QueryValidationError(`${label} 必须是正整数`);
  }
  return Number(text);
};

// countries.country_id 是 ISO 两位字母代码（如 CN），不是数字
const toCountryCode = (value, label) => {
  const text = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(text)) {
    throw new QueryValidationError(`${label} 必须是两位国家代码（如 CN）`);
  }
  return text;
};

const toTriState = (value, label) => {
  if (isBlank(value)) return '';
  const text = String(value);
  if (text !== 'true' && text !== 'false') {
    throw new QueryValidationError(`${label} 只能是 true 或 false`);
  }
  return text;
};

const toDate = (value, label) => {
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new QueryValidationError(`${label} 必须是 YYYY-MM-DD 格式`);
  }
  return text;
};

// IPv6 前缀只允许十六进制、冒号、点和斜杠，最长 64 字符
const toPrefix = (value) => {
  const text = String(value).trim();
  if (!/^[0-9a-fA-F:.]{2,45}(\/\d{1,3})?$/.test(text)) {
    throw new QueryValidationError('前缀格式无效');
  }
  return text;
};

/**
 * 校验并规范化筛选条件
 */
const normalizeFilters = (filters) => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw new QueryValidationError('缺少查询条件');
  }

  const fields = Array.isArray(filters.fields) && filters.fields.length > 0
    ? filters.fields
    : ['address'];

  fields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(FIELD_SELECTS, field)) {
      throw new QueryValidationError(`不支持的输出字段: ${field}`);
    }
  });

  const orderBy = isBlank(filters.orderBy) ? '' : String(filters.orderBy);
  if (orderBy && !Object.prototype.hasOwnProperty.call(ORDER_COLUMNS, orderBy)) {
    throw new QueryValidationError(`不支持的排序字段: ${orderBy}`);
  }

  const direction = isBlank(filters.orderDirection) ? 'asc' : String(filters.orderDirection).toLowerCase();
  if (direction !== 'asc' && direction !== 'desc') {
    throw new QueryValidationError('排序方向只能是 asc 或 desc');
  }

  let limit = DEFAULT_LIMIT;
  if (!isBlank(filters.limit)) {
    limit = toInt(filters.limit, 'limit');
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new QueryValidationError(`limit 必须在 1 到 ${MAX_LIMIT} 之间`);
    }
  }

  const normalized = {
    fields: [...new Set(fields)],
    orderBy,
    direction,
    limit,
    hasVulnerability: toTriState(filters.hasVulnerability, 'hasVulnerability'),
    vulnerabilityFixed: toTriState(filters.vulnerabilityFixed, 'vulnerabilityFixed'),
    protocolSupport: toTriState(filters.protocolSupport, 'protocolSupport')
  };

  if (!isBlank(filters.country)) normalized.country = toCountryCode(filters.country, 'country');
  if (!isBlank(filters.asn)) normalized.asn = toInt(filters.asn, 'asn');
  if (!isBlank(filters.prefix)) normalized.prefix = toPrefix(filters.prefix);
  if (!isBlank(filters.vulnerabilityType)) normalized.vulnerabilityType = toInt(filters.vulnerabilityType, 'vulnerabilityType');
  if (!isBlank(filters.protocolType)) normalized.protocolType = toInt(filters.protocolType, 'protocolType');

  // 数据库不记录在线率（active_addresses 没有 uptime_percentage 列）；明确拒绝，而不是生成会报错的 SQL
  if (!isBlank(filters.minUptime)) {
    throw new QueryValidationError('当前数据库不记录在线率，不支持 minUptime 条件');
  }

  ['firstSeenAfter', 'firstSeenBefore', 'lastSeenAfter', 'lastSeenBefore'].forEach((key) => {
    if (!isBlank(filters[key])) normalized[key] = toDate(filters[key], key);
  });

  if (normalized.protocolSupport !== '' && normalized.protocolType === undefined) {
    throw new QueryValidationError('选择协议支持条件时必须指定协议类型');
  }

  return normalized;
};

/**
 * 根据筛选条件生成 { sql, params }
 */
const buildAdvancedQuery = (filters) => {
  const f = normalizeFilters(filters);
  const params = [];

  let sql = `SELECT ${f.fields.map((field) => FIELD_SELECTS[field]).join(', ')}`;

  sql += ` FROM active_addresses aa
  JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
  JOIN countries c ON ip.country_id = c.country_id
  JOIN asns a ON ip.asn = a.asn
  LEFT JOIN address_types at ON aa.iid_type = at.type_id`;

  if (f.hasVulnerability === 'true' || f.fields.includes('vulnerabilities')) {
    sql += ` LEFT JOIN address_vulnerabilities av ON aa.address_id = av.address_id
  LEFT JOIN vulnerabilities v ON av.vulnerability_id = v.vulnerability_id`;
  }

  if (f.protocolSupport !== '' || f.fields.includes('protocols')) {
    sql += ` LEFT JOIN address_protocols ap ON aa.address_id = ap.address_id
  LEFT JOIN protocols p ON ap.protocol_id = p.protocol_id`;
  }

  const where = [];

  if (f.country !== undefined) {
    where.push('c.country_id = ?');
    params.push(f.country);
  }
  if (f.asn !== undefined) {
    where.push('a.asn = ?');
    params.push(f.asn);
  }
  if (f.prefix !== undefined) {
    where.push('ip.prefix = ?');
    params.push(f.prefix);
  }

  if (f.hasVulnerability === 'true') {
    where.push('av.address_id IS NOT NULL');
    if (f.vulnerabilityFixed === 'true') {
      where.push('av.is_fixed = 1');
    } else if (f.vulnerabilityFixed === 'false') {
      where.push('av.is_fixed = 0');
    }
    if (f.vulnerabilityType !== undefined) {
      where.push('av.vulnerability_id = ?');
      params.push(f.vulnerabilityType);
    }
  } else if (f.hasVulnerability === 'false') {
    where.push('av.address_id IS NULL');
  }

  if (f.protocolSupport === 'true') {
    where.push('ap.protocol_id = ?');
    params.push(f.protocolType);
  } else if (f.protocolSupport === 'false') {
    where.push('(ap.protocol_id != ? OR ap.address_id IS NULL)');
    params.push(f.protocolType);
  }

  if (f.firstSeenAfter) {
    where.push(`${FIRST_SEEN_EXPR} >= ?`);
    params.push(f.firstSeenAfter);
  }
  if (f.firstSeenBefore) {
    where.push(`${FIRST_SEEN_EXPR} <= ?`);
    params.push(`${f.firstSeenBefore} 23:59:59`);
  }
  if (f.lastSeenAfter) {
    where.push(`${LAST_SEEN_EXPR} >= ?`);
    params.push(f.lastSeenAfter);
  }
  if (f.lastSeenBefore) {
    where.push(`${LAST_SEEN_EXPR} <= ?`);
    params.push(`${f.lastSeenBefore} 23:59:59`);
  }

  if (where.length > 0) {
    sql += ` WHERE ${where.join(' AND ')}`;
  }

  // 始终分组，保证 GROUP_CONCAT 聚合字段按地址汇总
  sql += ' GROUP BY aa.address_id';

  if (f.orderBy) {
    sql += ` ORDER BY ${ORDER_COLUMNS[f.orderBy]} ${f.direction.toUpperCase()}`;
  }

  sql += ' LIMIT ?';
  params.push(f.limit);

  // 兜底：生成的 SQL 必须通过只读校验，否则视为程序错误
  if (!isReadOnlySelect(sql)) {
    throw new Error('生成的查询未通过安全校验');
  }

  return { sql, params };
};

module.exports = {
  buildAdvancedQuery,
  normalizeFilters,
  QueryValidationError,
  toCountryCode,
  FIELD_SELECTS,
  ORDER_COLUMNS,
  MAX_LIMIT
};
