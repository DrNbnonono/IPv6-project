/**
 * IP / CIDR 工具（IPv4 与 IPv6，BigInt 实现，不依赖第三方库）
 *
 * 解析结果统一为 { version, start, end, prefix, text }：
 * - start / end 是该范围首尾地址的整数值（BigInt），同一 version 内可直接比较；
 * - text 是规范化后的写法：IPv4 为点分十进制，IPv6 为压缩小写形式；
 * - 单个地址视为 /32（IPv4）或 /128（IPv6）。
 * 不接受主机名、带 zone id（fe80::1%eth0）的地址、八进制/十六进制写法的 IPv4（如 010.0.0.1）。
 */

const net = require('net');

const BITS = { 4: 32, 6: 128 };

const parseIPv4 = (text) => {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null; // 拒绝前导零（可能被解释为八进制）
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
};

const parseIPv6 = (text) => {
  if (text.includes('%')) return null; // zone id
  let head = text;
  let tail = null;
  const doubleColon = text.indexOf('::');
  if (doubleColon !== -1) {
    if (text.indexOf('::', doubleColon + 1) !== -1) return null;
    head = text.slice(0, doubleColon);
    tail = text.slice(doubleColon + 2);
  }

  const toGroups = (part) => (part === '' ? [] : part.split(':'));
  const headGroups = toGroups(head);
  const tailGroups = tail === null ? [] : toGroups(tail);

  // 末尾可以是内嵌的 IPv4（::ffff:1.2.3.4）
  const expand = (groups, isLast) => {
    const out = [];
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      if (g.includes('.')) {
        if (!(isLast && i === groups.length - 1)) return null;
        const v4 = parseIPv4(g);
        if (v4 === null) return null;
        out.push(Number((v4 >> 16n) & 0xffffn), Number(v4 & 0xffffn));
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };

  const headWords = expand(headGroups, tail === null);
  const tailWords = expand(tailGroups, true);
  if (!headWords || !tailWords) return null;

  let words;
  if (tail === null) {
    if (headWords.length !== 8) return null;
    words = headWords;
  } else {
    const missing = 8 - headWords.length - tailWords.length;
    if (missing < 1) return null; // “::” 至少代表一组零
    words = [...headWords, ...new Array(missing).fill(0), ...tailWords];
  }

  return words.reduce((acc, w) => (acc << 16n) | BigInt(w), 0n);
};

const formatIPv4 = (value) => [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join('.');

const formatIPv6 = (value) => {
  const words = [];
  for (let i = 7; i >= 0; i -= 1) words.push(Number((value >> BigInt(i * 16)) & 0xffffn));

  // 找最长的连续零段（长度 >= 2）压缩成 ::
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; i += 1) {
    if (words[i] !== 0) continue;
    let j = i;
    while (j < 8 && words[j] === 0) j += 1;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }

  const hex = words.map((w) => w.toString(16));
  if (bestLen < 2) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
};

/**
 * 解析单个地址或 CIDR。成功返回范围对象，失败返回 null。
 * CIDR 中主机位不为 0 时按“包含该地址的网段”处理（2001:db8::1/32 → 2001:db8::/32）。
 */
const parseTarget = (input) => {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || text.length > 64) return null;

  const [addr, prefixText, extra] = text.split('/');
  if (extra !== undefined) return null;

  const version = net.isIP(addr);
  if (version !== 4 && version !== 6) return null;

  const value = version === 4 ? parseIPv4(addr) : parseIPv6(addr);
  if (value === null) return null;

  const bits = BITS[version];
  let prefix = bits;
  if (prefixText !== undefined) {
    if (!/^\d{1,3}$/.test(prefixText)) return null;
    prefix = Number(prefixText);
    if (prefix > bits) return null;
  }

  const hostBits = BigInt(bits - prefix);
  const mask = (1n << hostBits) - 1n;
  const start = value & ~mask & ((1n << BigInt(bits)) - 1n);
  const end = start | mask;
  const base = version === 4 ? formatIPv4(start) : formatIPv6(start);
  return { version, start, end, prefix, text: prefix === bits && prefixText === undefined ? base : `${base}/${prefix}` };
};

/** outer 是否完整包含 inner。 */
const contains = (outer, inner) =>
  outer.version === inner.version && outer.start <= inner.start && outer.end >= inner.end;

/** 两个范围是否有交集。 */
const overlaps = (a, b) => a.version === b.version && a.start <= b.end && b.start <= a.end;

/** 范围内的地址数量（BigInt）。 */
const size = (range) => range.end - range.start + 1n;

/** 把整数值格式化为规范文本（IPv4 点分十进制；IPv6 小写压缩，最长零段 >= 2 才压缩）。 */
const formatAddress = (version, value) => (version === 4 ? formatIPv4(value) : formatIPv6(value));

module.exports = { parseTarget, contains, overlaps, size, formatAddress };
