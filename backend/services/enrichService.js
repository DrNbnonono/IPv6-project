/**
 * 结果富化：IID 分类、EUI-64 MAC 提取、来源前缀最长匹配，以及把它们批量写回 active_addresses。
 *
 * IID 分类（classifyIid）只看地址的后 64 位，返回库里 address_types 已有的类型名。
 * 这是启发式规则，不是确定的事实——一个 ::1234 既可能是人为编号，也可能是巧合。规则按下面的顺序匹配，
 * 第一条命中即返回：
 *   1. isatap        IID = (0000|0200):5efe:a.b.c.d
 *   2. ieee          IID 的第 4、5 字节为 ff:fe（修改的 EUI-64），可还原 MAC
 *   3. low-byte      IID 全为 0，或前 48 位为 0（::1、::2、::100 这类低位编号）
 *      service       前 48 位为 0，且低 16 位按“十六进制数字当十进制读”等于常见服务端口（::53、::80、::443）
 *      embed-port    同上，但端口在常见注册端口表里（::8080、::3306）
 *   4. byte-pattern  四个 16 位组全相同；或高低 32 位相同；或去掉前导 0 后至少 6 个十六进制位且逐位 +1 / -1（::1234:5678）
 *   5. ipv4-32       前 32 位为 0 且低 32 位的第一个字节非 0（::192.168.1.1）
 *   6. ipv4-64       0:ffff:a.b.c.d 形式；或四个 16 位组都是“十六进制数字当十进制读 ≤ 255”且第一组非 0（192:168:1:1）
 *   7. random        其余
 * 库里还有 ipv4-all、embed-port-all、embed-port-rev 三个类型名：前两个是汇总类别，embed-port-rev 的判定规则
 * 无法从仓库还原，所以分类器不会产出它们；外部导入接口（update-iid-types）仍可写入。
 *
 * 写回规则（enrichRows）：
 * - iid_type 默认只改 NULL 和 'random'（导入存储过程统一写 random，等于“未分类”）；overwrite=true 时改所有行，
 *   会覆盖外部导入的结果；
 * - prefix_id 只补 NULL 的行，且只有在 fillPrefix 时才查——已有的 prefix_id 是导入时明确指定的，不会被改动；
 * - 来源前缀的最长匹配在内存里做：一次性载入 IPv6 前缀（按解析后的数值匹配，不依赖 ip_prefixes.prefix 的书写形式）。
 *
 * 数据库错误向上抛出。
 */

const db = require('../database/db');
const { parseTarget } = require('./cidrService');

const MASK64 = (1n << 64n) - 1n;
const MAX_PREFIXES = 2000000;

// “十六进制数字当十进制读”的端口：0x0053 → 53，0x8080 → 8080
const SERVICE_PORTS = new Set([21, 22, 23, 25, 53, 69, 80, 110, 123, 143, 161, 389, 443, 445, 465, 587, 993, 995]);
const REGISTERED_PORTS = new Set([1080, 1433, 1521, 2222, 3000, 3306, 3389, 5000, 5060, 5432, 5900, 6379, 8000, 8008, 8080, 8081, 8443, 8888, 9000, 9090, 9200, 27017]);

/** 解析成 IPv6 整数；非 IPv6 单地址返回 null。 */
const parseV6 = (address) => {
  if (typeof address !== 'string' || address.includes('/')) return null;
  const range = parseTarget(address);
  return range && range.version === 6 ? range.start : null;
};

/** 把 IID 拆成 8 个字节（高位在前）与 4 个 16 位组。 */
const splitIid = (iid) => {
  const groups = [0, 1, 2, 3].map((i) => Number((iid >> BigInt(48 - 16 * i)) & 0xffffn));
  const bytes = groups.flatMap((g) => [g >> 8, g & 0xff]);
  return { groups, bytes };
};

/** 16 位组的十六进制写法若只含数字，按十进制读；否则返回 null。 */
const decimalOf = (group) => {
  const hex = group.toString(16);
  return /^\d+$/.test(hex) ? parseInt(hex, 10) : null;
};

const isSequential = (iid) => {
  const hex = iid.toString(16);
  if (hex.length < 6) return false;
  const digits = [...hex].map((c) => parseInt(c, 16));
  const step = (digits[1] - digits[0] + 16) % 16;
  if (step !== 1 && step !== 15) return false;
  return digits.every((d, i) => i === 0 || (d - digits[i - 1] + 16) % 16 === step);
};

/** 分类一个 IID（BigInt，64 位）。 */
const classifyIidValue = (iid) => {
  const { groups, bytes } = splitIid(iid);
  const [g0, g1, g2, g3] = groups;

  if ((g0 === 0x0000 || g0 === 0x0200) && g1 === 0x5efe) return 'isatap';
  if (bytes[3] === 0xff && bytes[4] === 0xfe) return 'ieee';
  if (iid === 0n) return 'low-byte';

  if (g0 === 0 && g1 === 0 && g2 === 0) {
    const port = decimalOf(g3);
    if (port !== null && SERVICE_PORTS.has(port)) return 'service';
    if (port !== null && REGISTERED_PORTS.has(port)) return 'embed-port';
    return 'low-byte';
  }

  if ((g0 === g1 && g1 === g2 && g2 === g3) || (g0 === g2 && g1 === g3) || isSequential(iid)) return 'byte-pattern';

  if (g0 === 0 && g1 === 0 && (g2 >> 8) !== 0) return 'ipv4-32';

  if (g0 === 0 && g1 === 0xffff && (g2 >> 8) !== 0) return 'ipv4-64';
  const dec = groups.map(decimalOf);
  if (dec.every((n) => n !== null && n <= 255) && g0 !== 0) return 'ipv4-64';

  return 'random';
};

/** 地址的 IID 类型名；不是 IPv6 地址返回 null。 */
const classifyIid = (address) => {
  const value = parseV6(address);
  return value === null ? null : classifyIidValue(value & MASK64);
};

/** 修改的 EUI-64 地址还原 MAC（小写、冒号分隔）；不是 EUI-64 返回 null。 */
const extractEui64Mac = (address) => {
  const value = parseV6(address);
  if (value === null) return null;
  const iid = value & MASK64;
  if (classifyIidValue(iid) !== 'ieee') return null;
  const { bytes } = splitIid(iid);
  const mac = [bytes[0] ^ 0x02, bytes[1], bytes[2], bytes[5], bytes[6], bytes[7]];
  return mac.map((b) => b.toString(16).padStart(2, '0')).join(':');
};

// ---------- 来源前缀 ----------

/**
 * 载入 IPv6 前缀，建立最长前缀匹配索引。
 * 返回 { size, lengths, lookup(address) }；lookup 对 IPv6 单地址返回 { prefixId, asn, countryId, prefix, prefixLength } 或 null。
 * 前缀文本里没有 /长度 时用 prefix_length 补全；无法解析的行忽略。
 */
const loadOriginIndex = async () => {
  const [rows] = await db.query(
    "SELECT prefix_id, prefix, prefix_length, asn, country_id FROM ip_prefixes WHERE version = '6' LIMIT ?",
    [MAX_PREFIXES + 1]
  );
  if (rows.length > MAX_PREFIXES) throw new Error(`IPv6 前缀数量超过 ${MAX_PREFIXES}，无法载入内存索引`);

  const byLength = new Map();
  for (const row of rows) {
    const text = String(row.prefix).includes('/') ? String(row.prefix) : `${row.prefix}/${row.prefix_length}`;
    const range = parseTarget(text);
    if (!range || range.version !== 6) continue;
    if (!byLength.has(range.prefix)) byLength.set(range.prefix, new Map());
    const bucket = byLength.get(range.prefix);
    if (!bucket.has(range.start)) {
      bucket.set(range.start, { prefixId: row.prefix_id, asn: row.asn, countryId: row.country_id, prefix: range.text, prefixLength: range.prefix });
    }
  }

  const lengths = [...byLength.keys()].sort((a, b) => b - a);
  const lookup = (address) => {
    const value = parseV6(address);
    if (value === null) return null;
    for (const length of lengths) {
      const host = BigInt(128 - length);
      const hit = byLength.get(length).get((value >> host) << host);
      if (hit) return hit;
    }
    return null;
  };
  return { size: rows.length, lengths, lookup };
};

/** 单个地址的来源（每次调用都会载入前缀索引，批量请用 loadOriginIndex）。 */
const lookupOrigin = async (address) => (await loadOriginIndex()).lookup(address);

// ---------- 批量富化 ----------

/** address_types 的 type_name → type_id。 */
const loadTypeIds = async () => {
  const [rows] = await db.query('SELECT type_id, type_name FROM address_types');
  return new Map(rows.map((row) => [row.type_name, row.type_id]));
};

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const emptyStats = () => ({ scanned: 0, classified: 0, updated: 0, unchanged: 0, prefixFilled: 0, unknownType: 0, byType: {} });

/**
 * 处理一批 active_addresses 行 { address_id, address, prefix_id, iid_type }，把结果写回并累加到 stats。
 *   ctx = { typeIds: Map, randomTypeId, originIndex?: 索引, overwrite, fillPrefix }
 */
const enrichRows = async (rows, ctx, stats = emptyStats()) => {
  const typeUpdates = new Map(); // typeId → [addressId]
  const prefixUpdates = new Map(); // prefixId → [addressId]

  for (const row of rows) {
    stats.scanned += 1;
    const typeName = classifyIid(row.address);
    if (typeName === null) {
      stats.unchanged += 1;
      continue;
    }
    const typeId = ctx.typeIds.get(typeName);
    if (typeId === undefined) {
      stats.unknownType += 1;
    } else {
      stats.classified += 1;
      const replaceable = ctx.overwrite || row.iid_type === null || row.iid_type === undefined || row.iid_type === ctx.randomTypeId;
      if (replaceable && row.iid_type !== typeId) {
        if (!typeUpdates.has(typeId)) typeUpdates.set(typeId, []);
        typeUpdates.get(typeId).push(row.address_id);
        stats.byType[typeName] = (stats.byType[typeName] || 0) + 1;
      } else {
        stats.unchanged += 1;
      }
    }

    if (ctx.fillPrefix && ctx.originIndex && (row.prefix_id === null || row.prefix_id === undefined)) {
      const origin = ctx.originIndex.lookup(row.address);
      if (origin) {
        if (!prefixUpdates.has(origin.prefixId)) prefixUpdates.set(origin.prefixId, []);
        prefixUpdates.get(origin.prefixId).push(row.address_id);
      }
    }
  }

  for (const [typeId, ids] of typeUpdates) {
    for (const part of chunk(ids, 1000)) {
      await db.query('UPDATE active_addresses SET iid_type = ? WHERE address_id IN (?)', [typeId, part]);
    }
    stats.updated += ids.length;
  }
  for (const [prefixId, ids] of prefixUpdates) {
    for (const part of chunk(ids, 1000)) {
      await db.query('UPDATE active_addresses SET prefix_id = ? WHERE address_id IN (?) AND prefix_id IS NULL', [prefixId, part]);
    }
    stats.prefixFilled += ids.length;
  }
  return stats;
};

/**
 * 富化一组地址 ID：读取、分类、写回。返回统计（scanned、classified、updated、unchanged、prefixFilled、unknownType、byType）。
 * 选项：overwrite（默认 false）、fillPrefix（默认 true）。
 */
const enrichAddresses = async (addressIds, { overwrite = false, fillPrefix = true } = {}) => {
  const ids = [...new Set((addressIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const stats = emptyStats();
  if (ids.length === 0) return stats;

  const typeIds = await loadTypeIds();
  const ctx = { typeIds, randomTypeId: typeIds.get('random'), overwrite, fillPrefix, originIndex: fillPrefix ? await loadOriginIndex() : null };
  for (const part of chunk(ids, 2000)) {
    const [rows] = await db.query(
      "SELECT address_id, address, prefix_id, iid_type FROM active_addresses WHERE address_id IN (?) AND version = '6'",
      [part]
    );
    await enrichRows(rows, ctx, stats);
  }
  return stats;
};

// ---------- 按 IID 类型过滤地址列表 ----------

/** classifyIid 可能返回的类型名（库里的 ipv4-all / embed-port-all / embed-port-rev 不会产出）。 */
const CLASSIFIER_TYPES = ['isatap', 'ieee', 'low-byte', 'service', 'embed-port', 'byte-pattern', 'ipv4-32', 'ipv4-64', 'random'];
const MAX_FILTER_ADDRESSES = 1000000;

class EnrichFilterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnrichFilterError';
  }
}

/**
 * 按 IID 类型保留（keep）或剔除（drop）地址。不是 IPv6 单地址的行一律丢弃并计入 invalid。
 *   body: { addressFile? | addresses?, mode: 'keep' | 'drop', types: [类型名], save?, tool? ('zgrab2' | 'xmap', 默认 zgrab2) }
 * 返回 { total, kept, removed, invalid, counts（输入中各类型的数量）, savedFile }；save 时把保留的地址登记为对应工具的输入文件。
 */
const filterByIidType = async ({ user, body = {} }) => {
  const mode = body.mode === 'drop' ? 'drop' : body.mode === 'keep' ? 'keep' : null;
  if (!mode) throw new EnrichFilterError("mode 必须是 'keep'（只保留所选类型）或 'drop'（剔除所选类型）");
  const types = Array.isArray(body.types) ? [...new Set(body.types.map(String))] : [];
  if (types.length === 0) throw new EnrichFilterError('请选择至少一个 IID 类型');
  const unknown = types.filter((t) => !CLASSIFIER_TYPES.includes(t));
  if (unknown.length > 0) throw new EnrichFilterError(`不支持的 IID 类型: ${unknown.join(', ')}`);

  let addresses;
  if (body.addressFile) {
    addresses = await require('./aliasDetectService').readAddressFile(user.id, body.addressFile);
  } else if (body.addresses !== undefined) {
    addresses = (Array.isArray(body.addresses) ? body.addresses : String(body.addresses).split(/[\s,;]+/)).map((a) => String(a).trim()).filter(Boolean);
  } else {
    throw new EnrichFilterError('请提供 addressFile 或 addresses');
  }
  if (addresses.length === 0) throw new EnrichFilterError('地址列表为空');
  if (addresses.length > MAX_FILTER_ADDRESSES) throw new EnrichFilterError(`地址数量超过 ${MAX_FILTER_ADDRESSES}`);

  const selected = new Set(types);
  const kept = [];
  const counts = {};
  let invalid = 0;
  for (const address of addresses) {
    const type = classifyIid(address);
    if (type === null) {
      invalid += 1;
      continue;
    }
    counts[type] = (counts[type] || 0) + 1;
    if (selected.has(type) === (mode === 'keep')) kept.push(address);
  }

  const result = { total: addresses.length, kept: kept.length, removed: addresses.length - invalid - kept.length, invalid, counts, savedFile: null };
  if (body.save) {
    if (kept.length === 0) throw new EnrichFilterError('过滤后没有剩余地址，不生成文件');
    const tool = body.tool === 'xmap' ? 'xmap' : 'zgrab2';
    const { saveTargetsFile } = require('./storageService');
    const saved = await saveTargetsFile(user.id, kept, tool, `按 IID 类型过滤（${mode === 'keep' ? '保留' : '剔除'} ${types.join('、')}）`);
    result.savedFile = { fileId: saved.fileId, fileName: saved.fileName, filePath: saved.filePath, count: saved.count, tool };
  }
  return result;
};

module.exports = {
  CLASSIFIER_TYPES,
  EnrichFilterError,
  filterByIidType,
  classifyIid,
  extractEui64Mac,
  loadOriginIndex,
  lookupOrigin,
  loadTypeIds,
  enrichRows,
  enrichAddresses,
  emptyStats
};
