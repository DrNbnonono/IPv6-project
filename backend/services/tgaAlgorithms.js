/**
 * 目标生成算法（TGA, Target Generation Algorithm）
 *
 * 从已知的活跃 IPv6 地址（种子）推测可能活跃的新地址，供 XMap 探测。
 * 这里实现的是三个简单、可解释的算法，思路分别来自 6Gen（按相似度聚类并把差异位置放开）、
 * 常见的“子网枚举 + 高频接口标识”做法、以及 Entropy/IP（按位置的取值分布采样）。
 * 它们不是这些论文方法的完整复现，也没有在真实网络上评测命中率——命中率取决于种子质量，需要用扫描结果自己评估。
 *
 * 全部在“32 个十六进制字符”的字符串上工作（地址的 nibble 表示），不依赖数据库，
 * 由 scripts/tga/generate.js 在独立进程里运行（不阻塞 Web 进程，取消任务即杀进程）。
 *
 * 算法接口：generate({ algorithm, seeds, budget, options, rng, isAliased })
 *   seeds     去重后的 nibble 字符串数组
 *   返回      { addresses: [nibble 字符串], stats }
 * 生成结果去重、不含种子本身、不含别名前缀内的地址；数量不超过 budget（候选空间不足时会更少）。
 */

const { parseTarget, formatAddress } = require('./cidrService');

const MAX_BUDGET = 1000000;
const MAX_SEEDS = 1000000;
const DEFAULT_BUDGET = 10000;

const ALGORITHMS = {
  'density-expand': {
    name: '密度扩展（6Gen 思路）',
    description: '把同一 /64 内的种子按差异位置聚类：种子之间不同的位置放开为 0–f，其余位置固定，按“种子数 / 候选空间”从密到疏枚举。适合接口标识较规整的网络（如 ::1、::2、::a 这类连续编号）。',
    options: {
      maxWildcards: { type: 'integer', default: 2, min: 1, max: 4, label: '每个簇最多放开的位置数', description: '放开的位置越多，候选空间越大（16 的 n 次方）；超过时按最左的差异位置拆成更小的簇' }
    }
  },
  'subnet-walk': {
    name: '子网枚举',
    description: '取种子里出现最多的接口标识，到已知 /48 下枚举相邻的 /64 子网。适合发现同一机构/运营商下按规则划分的新子网。',
    options: {
      subnetBits: { type: 'integer', default: 8, min: 4, max: 16, label: '枚举的子网位数', description: '在 /48 之后的 16 位子网号里，枚举最低的 n 位（2 的 n 次方个子网）' },
      topIids: { type: 'integer', default: 8, min: 1, max: 64, label: '高频接口标识个数', description: '使用种子里出现次数最多的前 K 个接口标识（后 64 位）' }
    }
  },
  'nibble-dist': {
    name: '位置分布采样（Entropy/IP 思路）',
    description: '前 64 位从种子的 /64 前缀里按出现次数抽取，接口标识的每个位置按种子里该位置的取值分布独立采样（带少量随机探索）。结果带随机性，可用相同的随机种子复现。',
    options: {
      explore: { type: 'number', default: 0.02, min: 0, max: 0.5, label: '随机探索概率', description: '每个位置以该概率改为在 0–f 里均匀取值，用来跳出种子里已有的取值' }
    }
  }
};

/** 校验并补全某个算法的参数；未知参数或越界抛出 Error（message 可直接展示给用户）。 */
const resolveOptions = (algorithm, input = {}) => {
  const spec = ALGORITHMS[algorithm];
  if (!spec) throw new Error(`未知的算法: ${String(algorithm).slice(0, 40)}`);
  const given = input && typeof input === 'object' ? input : {};
  for (const key of Object.keys(given)) {
    if (!spec.options[key]) throw new Error(`算法 ${algorithm} 不支持参数 ${String(key).slice(0, 40)}`);
  }
  const resolved = {};
  for (const [key, def] of Object.entries(spec.options)) {
    const raw = given[key] === undefined || given[key] === '' || given[key] === null ? def.default : Number(given[key]);
    const ok = Number.isFinite(raw) && raw >= def.min && raw <= def.max && (def.type !== 'integer' || Number.isInteger(raw));
    if (!ok) throw new Error(`参数 ${key} 必须是 ${def.min}–${def.max} 之间的${def.type === 'integer' ? '整数' : '数'}`);
    resolved[key] = raw;
  }
  return resolved;
};

// ---------- 地址 ↔ nibble ----------

/** '2001:db8::1' → 32 字符小写十六进制；不是单个 IPv6 地址返回 null。 */
const toNibbles = (text) => {
  const range = parseTarget(String(text).trim());
  if (!range || range.version !== 6 || range.prefix !== 128) return null;
  return range.start.toString(16).padStart(32, '0');
};

const fromNibbles = (nibbles) => formatAddress(6, BigInt(`0x${nibbles}`));

// ---------- 随机数 ----------

/** mulberry32：带种子的伪随机数，返回 [0, 1)。同一种子可复现整个生成过程。 */
const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pushTo = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

const HEX = '0123456789abcdef';

// ---------- 算法 ----------

function* densityExpand(seeds, options, stats) {
  const groups = new Map();
  for (const seed of seeds) pushTo(groups, seed.slice(0, 16), seed);

  const clusters = [];
  const split = (members) => {
    const wild = [];
    for (let pos = 16; pos < 32; pos += 1) {
      const first = members[0][pos];
      if (members.some((m) => m[pos] !== first)) wild.push(pos);
    }
    if (wild.length === 0) return;
    if (wild.length <= options.maxWildcards) {
      clusters.push({ members, wild });
      return;
    }
    const byValue = new Map();
    for (const m of members) pushTo(byValue, m[wild[0]], m);
    for (const part of byValue.values()) if (part.length >= 2) split(part);
  };
  for (const members of groups.values()) if (members.length >= 2) split(members);

  const density = (c) => c.members.length / 16 ** c.wild.length;
  clusters.sort((a, b) => density(b) - density(a) || b.members.length - a.members.length);
  stats.clusters = clusters.length;

  for (const { members, wild } of clusters) {
    const base = members[0].split('');
    const total = 16 ** wild.length;
    for (let i = 0; i < total; i += 1) {
      let rest = i;
      for (let w = wild.length - 1; w >= 0; w -= 1) {
        base[wild[w]] = HEX[rest & 15];
        rest >>= 4;
      }
      yield base.join('');
    }
  }
}

function* subnetWalk(seeds, options, stats) {
  const entries = new Map(); // `${/48}:${子网号高位}` → { prefix, high, count }
  const iidCounts = new Map();
  const shift = options.subnetBits;
  for (const seed of seeds) {
    const subnet = parseInt(seed.slice(12, 16), 16);
    const high = subnet >> shift;
    const key = `${seed.slice(0, 12)}:${high}`;
    const entry = entries.get(key) || { prefix: seed.slice(0, 12), high, count: 0 };
    entry.count += 1;
    entries.set(key, entry);
    const iid = seed.slice(16);
    iidCounts.set(iid, (iidCounts.get(iid) || 0) + 1);
  }
  const ordered = [...entries.values()].sort((a, b) => b.count - a.count || (a.prefix < b.prefix ? -1 : 1));
  const iids = [...iidCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, options.topIids).map(([iid]) => iid);
  stats.prefixes48 = new Set(ordered.map((e) => e.prefix)).size;
  stats.iids = iids.length;

  const span = 2 ** shift;
  for (let s = 0; s < span; s += 1) {
    for (const entry of ordered) {
      const subnet = ((entry.high << shift) | s).toString(16).padStart(4, '0');
      for (const iid of iids) yield `${entry.prefix}${subnet}${iid}`;
    }
  }
}

function* nibbleDist(seeds, options, stats, rng) {
  const prefixes = seeds.map((s) => s.slice(0, 16));
  const counts = Array.from({ length: 16 }, () => new Array(16).fill(0));
  for (const seed of seeds) for (let i = 0; i < 16; i += 1) counts[i][parseInt(seed[16 + i], 16)] += 1;
  stats.prefixes64 = new Set(prefixes).size;

  const cumulative = counts.map((row) => {
    let sum = 0;
    return row.map((n) => { sum += n; return sum; });
  });

  for (;;) {
    let out = prefixes[Math.floor(rng() * prefixes.length)];
    for (let i = 0; i < 16; i += 1) {
      if (options.explore > 0 && rng() < options.explore) {
        out += HEX[Math.floor(rng() * 16)];
        continue;
      }
      const row = cumulative[i];
      const pick = rng() * row[15];
      let v = 0;
      while (row[v] <= pick) v += 1;
      out += HEX[v];
    }
    yield out;
  }
}

/** 别名前缀过滤器：prefixes 是 CIDR 文本（只用长度为 4 的倍数的 IPv6 前缀）；返回 (nibbles) => boolean。 */
const makeAliasFilter = (prefixes) => {
  const byLength = new Map();
  for (const text of prefixes) {
    const range = parseTarget(String(text).trim());
    if (!range || range.version !== 6 || range.prefix % 4 !== 0 || range.prefix === 0) continue;
    const nibbleLength = range.prefix / 4;
    const key = range.start.toString(16).padStart(32, '0').slice(0, nibbleLength);
    if (!byLength.has(nibbleLength)) byLength.set(nibbleLength, new Set());
    byLength.get(nibbleLength).add(key);
  }
  if (byLength.size === 0) return null;
  const lengths = [...byLength.keys()];
  return (nibbles) => lengths.some((length) => byLength.get(length).has(nibbles.slice(0, length)));
};

/**
 * 生成目标。seeds 为 nibble 字符串数组（可有重复，会去重）。
 * 返回 { addresses, stats }，stats 含 seeds、generated、aliasedSkipped、duplicates、exhausted 与算法自己的统计。
 */
const generate = ({ algorithm, seeds, budget = DEFAULT_BUDGET, options = {}, rng = makeRng(Date.now()), isAliased = null }) => {
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_BUDGET) {
    throw new Error(`budget 必须是 1–${MAX_BUDGET} 之间的整数`);
  }
  const resolved = resolveOptions(algorithm, options);
  const unique = [...new Set(seeds)];
  if (unique.length === 0) throw new Error('没有可用的种子地址');
  if (unique.length > MAX_SEEDS) throw new Error(`种子地址超过上限 ${MAX_SEEDS}`);

  const stats = { seeds: unique.length, options: resolved, algorithmStats: {} };
  const iterator = {
    'density-expand': () => densityExpand(unique, resolved, stats.algorithmStats),
    'subnet-walk': () => subnetWalk(unique, resolved, stats.algorithmStats),
    'nibble-dist': () => nibbleDist(unique, resolved, stats.algorithmStats, rng)
  }[algorithm]();

  const seen = new Set(unique);
  const addresses = [];
  let aliasedSkipped = 0;
  let duplicates = 0;
  let attempts = 0;
  let streak = 0; // 连续重复/被过滤的次数，用来判断随机采样已经枯竭
  const maxAttempts = Math.max(budget * 20, 100000);
  const maxStreak = 50000;
  let exhausted = true;

  for (const candidate of iterator) {
    attempts += 1;
    if (seen.has(candidate)) {
      duplicates += 1;
      streak += 1;
    } else if (isAliased && isAliased(candidate)) {
      aliasedSkipped += 1;
      streak += 1;
    } else {
      seen.add(candidate);
      addresses.push(candidate);
      streak = 0;
      if (addresses.length >= budget) {
        exhausted = false;
        break;
      }
    }
    if (algorithm === 'nibble-dist' && (attempts >= maxAttempts || streak >= maxStreak)) break;
  }

  Object.assign(stats, { generated: addresses.length, aliasedSkipped, duplicates, exhausted });
  return { addresses, stats };
};

const listAlgorithms = () =>
  Object.entries(ALGORITHMS).map(([id, spec]) => ({ id, name: spec.name, description: spec.description, options: spec.options }));

module.exports = {
  ALGORITHMS,
  MAX_BUDGET,
  MAX_SEEDS,
  DEFAULT_BUDGET,
  resolveOptions,
  toNibbles,
  fromNibbles,
  makeRng,
  makeAliasFilter,
  generate,
  listAlgorithms
};
