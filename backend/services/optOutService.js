/**
 * 探针退出渠道（P2-4）
 * 网络运营者通过公开页面提交“请不要扫描我的网段”，管理员审核：
 *   通过 → 写入 scan_blacklist（永久生效），请求标记 approved；
 *   驳回 → 请求标记 rejected。
 * 审核期间（pending）的网段由 scanPolicyService 同样拒绝——宁可误停，不可误扫。
 *
 * 公开接口是匿名的，因此有几道防滥用的限制：
 * - 一次最多 MAX_CIDRS 个网段；网段不能太大（IPv6 不短于 /32，IPv4 不短于 /16），
 *   否则匿名用户一次提交就能让整个平台无法扫描。更大的范围请直接联系运营方；
 * - 同一来源 IP 同时最多 MAX_PENDING_PER_IP 条待审核请求；
 * - 路由层另有按 IP 的限流（见 middleware/rateLimit.js 的 optOutLimiter）。
 * 联系方式只保存、只给管理员看，任何公开接口都不返回。
 *
 * 本服务返回 { ok, ... } 形式的结果，不抛出业务异常；数据库错误会向上抛出。
 */

const db = require('../database/db');
const { parseTarget } = require('./cidrService');

const MAX_CIDRS = 10;
const MAX_PENDING_PER_IP = 20;
const MIN_PREFIX = { 4: 16, 6: 32 };
const STATUSES = ['pending', 'approved', 'rejected'];

const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

/** 去掉控制字符并截断；空串视为未提供。 */
const cleanText = (value, max) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.replace(CONTROL_CHARS, '').trim();
  if (text.length > max) return undefined;
  return text || null;
};

const splitCidrs = (value) => {
  const list = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(/[\s,;]+/);
  return list.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== '');
};

/**
 * 校验并规范化一次提交；不访问数据库。
 * 成功返回 { ok: true, cidrs, contact, organization, note }，失败返回 { ok: false, message }。
 */
const validateSubmission = (body) => {
  const input = body && typeof body === 'object' ? body : {};

  const rawList = splitCidrs(input.cidrs);
  if (rawList.length === 0) return { ok: false, message: '请至少填写一个要排除的 IP 地址或网段' };
  if (rawList.length > MAX_CIDRS) return { ok: false, message: `一次最多提交 ${MAX_CIDRS} 个网段` };

  const cidrs = [];
  for (const item of rawList) {
    const range = parseTarget(item);
    if (!range) return { ok: false, message: `“${String(item).slice(0, 64)}”不是有效的 IP 地址或 CIDR（不接受域名）` };
    if (range.prefix < MIN_PREFIX[range.version]) {
      return {
        ok: false,
        message: `网段 ${range.text} 范围过大：IPv${range.version} 通过本页提交的网段不能短于 /${MIN_PREFIX[range.version]}，更大的范围请直接邮件联系`
      };
    }
    if (!cidrs.includes(range.text)) cidrs.push(range.text);
  }

  const contact = typeof input.contact === 'string' ? input.contact.replace(CONTROL_CHARS, '').trim() : '';
  if (!contact || contact.length > 255 || !EMAIL_PATTERN.test(contact)) {
    return { ok: false, message: '请填写有效的联系邮箱，我们会通过它确认请求' };
  }

  const organization = cleanText(input.organization, 120);
  if (organization === undefined) return { ok: false, message: '单位名称必须是不超过 120 个字符的文本' };
  const note = cleanText(input.note, 500);
  if (note === undefined) return { ok: false, message: '补充说明必须是不超过 500 个字符的文本' };

  return { ok: true, cidrs, contact, organization, note };
};

/**
 * 提交一次退出请求。
 * 已有相同网段的待审核/已通过请求时不重复入库，但对提交者仍然返回成功（不泄露已有记录）。
 * 返回 { ok: true, received: n } 或 { ok: false, status, message }。
 */
const submit = async (body, ip) => {
  const checked = validateSubmission(body);
  if (!checked.ok) return { ok: false, status: 400, message: checked.message };

  const pending = rows(await db.query(
    "SELECT COUNT(*) AS count FROM opt_out_requests WHERE source_ip = ? AND status = 'pending'",
    [ip || null]
  ));
  if (Number((pending[0] || {}).count || 0) + checked.cidrs.length > MAX_PENDING_PER_IP) {
    return { ok: false, status: 429, message: '你名下待审核的请求过多，请等待处理后再提交' };
  }

  for (const cidr of checked.cidrs) {
    const existing = rows(await db.query(
      "SELECT id FROM opt_out_requests WHERE cidr = ? AND status IN ('pending', 'approved') LIMIT 1",
      [cidr]
    ));
    if (existing.length > 0) continue;
    await db.query(
      'INSERT INTO opt_out_requests (cidr, contact, organization, note, source_ip) VALUES (?, ?, ?, ?, ?)',
      [cidr, checked.contact, checked.organization, checked.note, ip || null]
    );
  }
  return { ok: true, received: checked.cidrs.length };
};

/** 待审核请求中的网段，供扫描策略立即生效；表不存在（迁移 17 尚未执行）时返回空数组。 */
const pendingCidrs = async () => {
  try {
    return rows(await db.query("SELECT cidr FROM opt_out_requests WHERE status = 'pending'")).map((row) => row.cidr);
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
};

const view = (row) => ({
  id: row.id,
  cidr: row.cidr,
  contact: row.contact,
  organization: row.organization,
  note: row.note,
  status: row.status,
  sourceIp: row.source_ip,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note,
  createdAt: row.created_at
});

/** 管理员列表：可按状态过滤，最新的在前。 */
const list = async ({ status, limit = 100, offset = 0 } = {}) => {
  if (status !== undefined && !STATUSES.includes(status)) return { ok: false, status: 400, message: 'status 只能是 pending / approved / rejected' };
  const take = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);

  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const items = rows(await db.query(
    `SELECT id, cidr, contact, organization, note, status, source_ip, reviewed_by, reviewed_at, review_note, created_at
     FROM opt_out_requests ${where} ORDER BY id DESC LIMIT ${take} OFFSET ${skip}`,
    params
  ));
  const totals = rows(await db.query('SELECT status, COUNT(*) AS count FROM opt_out_requests GROUP BY status'));
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of totals) if (row.status in counts) counts[row.status] = Number(row.count);
  return { ok: true, items: items.map(view), counts };
};

/**
 * 审核。decision 为 'approve' | 'reject'。
 * 通过时先写 scan_blacklist（幂等），再把请求改成 approved；两步之间失败只会让请求保持 pending（仍然被拒绝扫描），重试即可。
 * 返回 { ok: true, cidr, status } 或 { ok: false, status, message }。
 */
const review = async ({ id, decision, note, adminId }) => {
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, message: '无效的请求 ID' };
  if (!['approve', 'reject'].includes(decision)) return { ok: false, status: 400, message: 'decision 只能是 approve 或 reject' };
  const reviewNote = cleanText(note, 255);
  if (reviewNote === undefined) return { ok: false, status: 400, message: '审核备注必须是不超过 255 个字符的文本' };

  const found = rows(await db.query('SELECT id, cidr, organization, status FROM opt_out_requests WHERE id = ?', [id]));
  if (found.length === 0) return { ok: false, status: 404, message: '请求不存在' };
  const request = found[0];
  if (request.status !== 'pending') return { ok: false, status: 409, message: '该请求已处理过' };

  if (decision === 'approve') {
    const reason = `退出请求 #${request.id}${request.organization ? `：${request.organization}` : ''}`.slice(0, 255);
    await db.query(
      'INSERT INTO scan_blacklist (cidr, reason, created_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [request.cidr, reason, adminId || null]
    );
  }

  const status = decision === 'approve' ? 'approved' : 'rejected';
  const [result] = await db.query(
    "UPDATE opt_out_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ? AND status = 'pending'",
    [status, adminId || null, reviewNote, id]
  );
  if (!result || result.affectedRows === 0) return { ok: false, status: 409, message: '该请求已处理过' };
  return { ok: true, cidr: request.cidr, status };
};

/** 说明页展示的运营方信息，来自环境变量；未配置的项返回 null/空数组，页面据此提示“尚未公布”。 */
const publicInfo = () => {
  const split = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    organization: (process.env.SCAN_ORG_NAME || '').trim() || null,
    contactEmail: (process.env.SCAN_CONTACT_EMAIL || '').trim() || null,
    sourceAddresses: split(process.env.SCAN_SOURCE_ADDRESSES),
    purpose: (process.env.SCAN_PURPOSE || '').trim() || null,
    limits: {
      maxCidrs: MAX_CIDRS,
      minPrefixV4: MIN_PREFIX[4],
      minPrefixV6: MIN_PREFIX[6]
    }
  };
};

module.exports = {
  MAX_CIDRS,
  MAX_PENDING_PER_IP,
  MIN_PREFIX,
  validateSubmission,
  submit,
  pendingCidrs,
  list,
  review,
  publicInfo
};
