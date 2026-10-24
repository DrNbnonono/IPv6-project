/**
 * 别名前缀检测（APD, Aliased Prefix Detection）
 *
 * 别名前缀：整个前缀下的任何地址都会应答（常见于 CDN/防火墙/负载均衡把一整段 /64 绑到同一台设备）。
 * 这类前缀会让“活跃地址数”虚高，统计前需要识别并剔除。
 *
 * 方法（Gasser 等人 2018 年 IMC 论文中的做法）：对候选前缀 P/len，把后续 4 个比特的 16 种取值各取一个子前缀，
 * 在每个子前缀里随机生成一个地址，共 16 个探测地址；16 个全部应答则判定为别名前缀。
 * 随机地址在正常的稀疏前缀里几乎不可能同时命中，所以全部应答是很强的证据。
 *
 * 判定（minResponses 默认 16）：
 *   aliased    应答数 >= minResponses
 *   clean      应答数 == 0
 *   uncertain  其间（0 < 应答数 < minResponses）：可能是丢包、限速，或只有部分子前缀被别名，建议降速复测
 *
 * 本服务分三层：
 *   纯函数    generateProbeAddresses / buildProbePlan / classifyResponses / derivePrefixes / filterAddresses
 *   入队      enqueueApdTask：校验、套用扫描策略、写探测文件、创建 task_type='apd' 的任务
 *   执行      runApdTask：调度器调用；启动 xmap（-I 探测文件），结束后解析应答、分类、写库
 *
 * 候选前缀只接受 IPv6、长度为 4 的倍数（16–124）；每个任务最多 MAX_PREFIXES_PER_TASK 个前缀。
 * 评测精确率/召回率需要有标注集，本服务不预设数字（见升级计划 P3-1 验收）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const db = require('../database/db');
const { DIRS, resolveStoredPath } = require('./storageService');
const { parseTarget, formatAddress } = require('./cidrService');
const { buildXmapInvocation, buildPrivileged } = require('./xmapCommandService');
const taskService = require('./taskService');
const scheduler = require('./schedulerService');
const scanPolicy = require('./scanPolicyService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('apd');

const PROBES_PER_PREFIX = 16;
const MIN_PREFIX_LENGTH = 16;
const MAX_PREFIX_LENGTH = 124;
const MAX_PREFIXES_PER_TASK = 20000;
const MAX_FILTER_ADDRESSES = 1000000; // 地址文件/过滤请求的行数上限
const METHOD = 'apd-16';

class ApdError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApdError';
    this.status = status;
  }
}

// ---------- 纯函数 ----------

/** 解析候选前缀：必须是 IPv6、写明长度、长度为 4 的倍数且在允许范围内。失败返回 null。 */
const parseCandidatePrefix = (text) => {
  if (typeof text !== 'string' || !text.includes('/')) return null;
  const range = parseTarget(text.trim());
  if (!range || range.version !== 6) return null;
  if (range.prefix < MIN_PREFIX_LENGTH || range.prefix > MAX_PREFIX_LENGTH || range.prefix % 4 !== 0) return null;
  return range;
};

const randomBits = (bitCount, rng) => {
  if (bitCount <= 0) return 0n;
  const bytes = rng(Math.ceil(bitCount / 8));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value & ((1n << BigInt(bitCount)) - 1n);
};

/**
 * 为一个候选前缀生成探测地址：第 len+1…len+4 位依次取 0…f，其余位随机。
 * count < 16 时只取前 count 个取值（仅用于测试/降低开销，判定仍应使用 16）。
 */
const generateProbeAddresses = (prefix, count = PROBES_PER_PREFIX, rng = crypto.randomBytes) => {
  const range = typeof prefix === 'string' ? parseCandidatePrefix(prefix) : prefix;
  if (!range) throw new ApdError(`无效的候选前缀: ${String(prefix).slice(0, 64)}（需要 IPv6 且长度为 4 的倍数，如 2001:db8:1:2::/64）`);
  if (!Number.isInteger(count) || count < 1 || count > PROBES_PER_PREFIX) {
    throw new ApdError(`探测地址数量必须在 1–${PROBES_PER_PREFIX} 之间`);
  }

  const remaining = 128 - range.prefix - 4;
  const nibbleShift = BigInt(remaining);
  const out = [];
  for (let nibble = 0; nibble < count; nibble += 1) {
    const value = range.start | (BigInt(nibble) << nibbleShift) | randomBits(remaining, rng);
    out.push(formatAddress(6, value));
  }
  return out;
};

/**
 * 校验并去重候选前缀，生成探测计划：
 *   { prefixes: [规范化前缀], probes: { 前缀: [地址…] }, addresses: [全部地址] }
 */
const buildProbePlan = (prefixes, { rng = crypto.randomBytes } = {}) => {
  const list = Array.isArray(prefixes) ? prefixes : [];
  const seen = new Set();
  const plan = { prefixes: [], probes: {}, addresses: [] };

  for (const item of list) {
    const range = parseCandidatePrefix(item);
    if (!range) throw new ApdError(`无效的候选前缀: ${String(item).slice(0, 64)}（需要 IPv6 且长度为 4 的倍数，如 2001:db8:1:2::/64）`);
    if (seen.has(range.text)) continue;
    seen.add(range.text);
    if (seen.size > MAX_PREFIXES_PER_TASK) {
      throw new ApdError(`候选前缀数量超过单个任务上限 ${MAX_PREFIXES_PER_TASK}，请拆成多个任务`);
    }
    const probes = generateProbeAddresses(range, PROBES_PER_PREFIX, rng);
    plan.prefixes.push(range.text);
    plan.probes[range.text] = probes;
    plan.addresses.push(...probes);
  }
  if (plan.prefixes.length === 0) throw new ApdError('没有候选前缀');
  return plan;
};

const canonicalAddress = (text) => {
  const range = parseTarget(String(text).trim());
  return range && range.version === 6 && range.prefix === 128 ? range.text : null;
};

/**
 * 按应答情况把前缀分类。responders 是应答地址的集合（任意写法，会规范化）。
 * 返回 { aliased, uncertain, clean }，每项为 { prefix, sent, answered }。
 */
const classifyResponses = (plan, responders, { minResponses = PROBES_PER_PREFIX } = {}) => {
  const answeredAddresses = new Set();
  for (const raw of responders) {
    const canonical = canonicalAddress(raw);
    if (canonical) answeredAddresses.add(canonical);
  }

  const result = { aliased: [], uncertain: [], clean: [] };
  for (const prefix of plan.prefixes) {
    const probes = plan.probes[prefix];
    const answered = probes.reduce((n, address) => n + (answeredAddresses.has(address) ? 1 : 0), 0);
    const entry = { prefix, sent: probes.length, answered };
    if (answered >= minResponses) result.aliased.push(entry);
    else if (answered === 0) result.clean.push(entry);
    else result.uncertain.push(entry);
  }
  return result;
};

/** 从地址列表推出候选前缀：每个地址取其所在的 /length 前缀（length 为 4 的倍数），去重。 */
const derivePrefixes = (addresses, length = 64) => {
  if (!Number.isInteger(length) || length < MIN_PREFIX_LENGTH || length > MAX_PREFIX_LENGTH || length % 4 !== 0) {
    throw new ApdError(`前缀长度必须是 ${MIN_PREFIX_LENGTH}–${MAX_PREFIX_LENGTH} 之间 4 的倍数`);
  }
  const out = new Set();
  for (const text of addresses) {
    const range = parseTarget(String(text).trim());
    if (!range || range.version !== 6) continue;
    const hostBits = BigInt(128 - length);
    const start = (range.start >> hostBits) << hostBits;
    out.add(`${formatAddress(6, start)}/${length}`);
  }
  return [...out];
};

/**
 * 从地址列表里剔除落在别名前缀内的地址。
 * 对每个出现过的前缀长度，把地址截断到该长度后在集合里查找，复杂度与地址数 × 不同长度数成正比。
 * 返回 { kept: [地址], removed: [{ address, prefix }] }；无法解析的地址原样保留。
 */
const filterAddresses = (addresses, aliasedPrefixes) => {
  const byLength = new Map(); // 长度 → Set(起始值)
  for (const text of aliasedPrefixes) {
    const range = parseTarget(String(text));
    if (!range || range.version !== 6) continue;
    if (!byLength.has(range.prefix)) byLength.set(range.prefix, new Map());
    byLength.get(range.prefix).set(range.start, range.text);
  }
  const lengths = [...byLength.keys()].sort((a, b) => a - b);

  const kept = [];
  const removed = [];
  for (const address of addresses) {
    const range = lengths.length ? parseTarget(String(address).trim()) : null;
    let matched = null;
    if (range && range.version === 6) {
      for (const length of lengths) {
        const hostBits = BigInt(128 - length);
        const hit = byLength.get(length).get((range.start >> hostBits) << hostBits);
        if (hit) {
          matched = hit;
          break;
        }
      }
    }
    if (matched) removed.push({ address, prefix: matched });
    else kept.push(address);
  }
  return { kept, removed };
};

// ---------- 结果解析 ----------

/**
 * 流式读取 xmap 的 JSON 输出，返回应答源地址的集合。
 * 不假定输出是“一行一个对象”还是一个 JSON 数组：逐行去掉首尾的 [ ] , 后尝试解析对象，
 * 解析不了的行退回用正则取 "saddr"。带有 success 字段且为假的记录（非应答）不计入。
 */
const parseResponders = async (resultFile) => {
  const responders = new Set();
  if (!fs.existsSync(resultFile)) return responders;

  const input = readline.createInterface({ input: fs.createReadStream(resultFile, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const raw of input) {
      const line = raw.trim().replace(/^\[/, '').replace(/[\],]+$/, '');
      if (!line) continue;
      let saddr = null;
      try {
        const record = JSON.parse(line);
        if (record && typeof record === 'object') {
          if (record.success !== undefined && !record.success) continue;
          saddr = record.saddr;
        }
      } catch (error) {
        const match = /"saddr"\s*:\s*"([^"]+)"/.exec(line);
        saddr = match ? match[1] : null;
      }
      if (typeof saddr === 'string') responders.add(saddr);
    }
  } finally {
    input.close();
  }
  return responders;
};

// ---------- 入队 ----------

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

/** 读取用户自己上传/生成的地址文件（一行一个，取第一个逗号前的字段，跳过空行与 # 注释）。 */
const readAddressFile = async (userId, fileName) => {
  const found = rows(await db.query(
    'SELECT file_path FROM whitelists WHERE file_name = ? AND user_id = ? AND is_deleted = 0 LIMIT 1',
    [String(fileName), userId]
  ));
  if (found.length === 0) throw new ApdError('地址文件不存在或不属于你', 403);
  const filePath = resolveStoredPath(found[0].file_path);
  if (!fs.existsSync(filePath)) throw new ApdError('地址文件不存在');

  const addresses = [];
  const input = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const raw of input) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      addresses.push(line.split(',')[0].trim());
      if (addresses.length > MAX_FILTER_ADDRESSES) throw new ApdError(`地址文件超过 ${MAX_FILTER_ADDRESSES} 行`);
    }
  } finally {
    input.close();
  }
  return addresses;
};

const splitList = (value) => (Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/)).map((item) => String(item).trim()).filter(Boolean);

/**
 * 创建 APD 任务（只入队）。body: { prefixes?, addressFile?, prefixLength?, rate?, description? }
 * 候选前缀必须通过扫描策略（落在白名单内，速率与每日配额）。
 * 返回 { taskId, prefixCount, probeCount, rate }；校验失败抛出带 status 的 ApdError。
 */
const enqueueApdTask = async ({ user, body = {} }) => {
  const length = body.prefixLength === undefined || body.prefixLength === '' ? 64 : Number(body.prefixLength);
  const candidates = splitList(body.prefixes);

  if (body.addressFile) {
    candidates.push(...derivePrefixes(await readAddressFile(user.id, body.addressFile), length));
  }
  if (candidates.length === 0) throw new ApdError('请提供候选前缀（prefixes）或地址文件（addressFile）');

  const plan = buildProbePlan(candidates);

  const verdict = await scanPolicy.validateScanRequest({
    user, taskType: 'apd', targets: plan.prefixes, rate: body.rate
  });
  if (!verdict.allowed) throw new ApdError(verdict.reason, 403);

  const taskId = taskService.nextTaskId();
  const probeFile = path.join(DIRS.apdInputs, `${taskId}.txt`);
  const planFile = path.join(DIRS.apdInputs, `${taskId}.json`);
  const rawResultFile = path.join(DIRS.apdResults, `${taskId}.raw.json`);
  const summaryFile = path.join(DIRS.apdResults, `${taskId}.json`);
  const logFile = path.join(DIRS.xmapLog, `${taskId}.csv`);

  fs.mkdirSync(DIRS.apdInputs, { recursive: true });
  fs.mkdirSync(DIRS.apdResults, { recursive: true });
  fs.mkdirSync(DIRS.xmapLog, { recursive: true });
  fs.writeFileSync(probeFile, `${plan.addresses.join('\n')}\n`, { flag: 'wx' });
  fs.writeFileSync(planFile, JSON.stringify({ prefixes: plan.prefixes, probes: plan.probes }), { flag: 'wx' });

  const args = [
    '-6', '-I', probeFile, '-B', verdict.normalized.rate, '-M', 'icmp_echo',
    '-u', logFile, '-o', rawResultFile, '-q', '-O', 'json', '-f', '*'
  ];

  try {
    await taskService.createTaskRecord({
      taskId,
      userId: user.id,
      taskType: 'apd',
      command: buildXmapInvocation(args).display,
      description: body.description || `别名前缀检测（${plan.prefixes.length} 个前缀）`,
      logPath: logFile,
      outputPath: summaryFile,
      params: { args, planFile, rawResultFile, summaryFile, prefixCount: plan.prefixes.length, probeCount: plan.addresses.length }
    });
  } catch (error) {
    fs.rmSync(probeFile, { force: true });
    fs.rmSync(planFile, { force: true });
    throw error;
  }

  scheduler.requestTick();
  return { taskId, prefixCount: plan.prefixes.length, probeCount: plan.addresses.length, rate: verdict.normalized.rate };
};

// ---------- 过滤（用已知的别名前缀剔除地址）----------

/**
 * 用 aliased_prefixes 表里已知的别名前缀过滤地址列表，用于“过滤前后活跃地址数”的对比。
 * body: { addressFile? | addresses?, save?, tool? }；save 为真时把保留下来的地址存成新文件
 * （登记到 whitelists 表，tool 为 'zgrab2'（默认）或 'xmap'，与手动上传的文件一样可被任务引用）。
 */
const filterWithKnownAliases = async ({ user, body = {} }) => {
  let addresses;
  if (body.addressFile) addresses = await readAddressFile(user.id, body.addressFile);
  else if (body.addresses !== undefined) addresses = splitList(body.addresses);
  else throw new ApdError('请提供 addressFile 或 addresses');
  if (addresses.length === 0) throw new ApdError('地址列表为空');
  if (addresses.length > MAX_FILTER_ADDRESSES) throw new ApdError(`地址数量超过 ${MAX_FILTER_ADDRESSES}`);

  const known = rows(await db.query('SELECT prefix FROM aliased_prefixes')).map((row) => row.prefix);
  const { kept, removed } = filterAddresses(addresses, known);

  const byPrefix = new Map();
  for (const item of removed) byPrefix.set(item.prefix, (byPrefix.get(item.prefix) || 0) + 1);
  const topPrefixes = [...byPrefix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([prefix, count]) => ({ prefix, count }));

  const result = {
    total: addresses.length,
    kept: kept.length,
    removed: removed.length,
    aliasedPrefixesKnown: known.length,
    topPrefixes,
    savedFile: null
  };

  if (body.save) {
    if (kept.length === 0) throw new ApdError('过滤后没有剩余地址，不生成文件');
    const tool = body.tool === 'xmap' ? 'xmap' : 'zgrab2';
    const { saveTargetsFile } = require('./storageService');
    const saved = await saveTargetsFile(user.id, kept, tool, `别名前缀过滤后的地址（剔除 ${removed.length} 个）`);
    result.savedFile = { fileId: saved.fileId, fileName: saved.fileName, filePath: saved.filePath, count: saved.count, tool };
  }
  return result;
};

// ---------- 执行 ----------

const activeProcesses = new Map();

/** 结果入库：别名前缀 upsert；重新检测后完全无应答的前缀从表中移除（别名可能已经消失）；不确定的不动。 */
const persistClassification = async ({ classification, taskId, userId }) => {
  for (const entry of classification.aliased) {
    const length = Number(entry.prefix.split('/')[1]);
    await db.query(
      `INSERT INTO aliased_prefixes (prefix, prefix_length, probes_sent, probes_answered, method, task_id, detected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE probes_sent = VALUES(probes_sent), probes_answered = VALUES(probes_answered),
         method = VALUES(method), task_id = VALUES(task_id), detected_by = VALUES(detected_by)`,
      [entry.prefix, length, entry.sent, entry.answered, METHOD, taskId, userId]
    );
  }
  let cleared = 0;
  for (let i = 0; i < classification.clean.length; i += 500) {
    const batch = classification.clean.slice(i, i + 500).map((entry) => entry.prefix);
    const result = await db.query('DELETE FROM aliased_prefixes WHERE prefix IN (?)', [batch]);
    cleared += (Array.isArray(result) && result[0] && result[0].affectedRows) || 0;
  }
  return cleared;
};

/** xmap 正常结束后的收尾：解析应答 → 分类 → 写摘要文件和数据库。 */
const finishApdTask = async (task) => {
  const params = task.params || {};
  const plan = JSON.parse(fs.readFileSync(params.planFile, 'utf8'));
  const responders = await parseResponders(params.rawResultFile);
  const classification = classifyResponses(plan, responders);
  const cleared = await persistClassification({ classification, taskId: task.id, userId: task.userId });

  const summary = {
    taskId: task.id,
    method: METHOD,
    finishedAt: new Date().toISOString(),
    prefixCount: plan.prefixes.length,
    probesPerPrefix: PROBES_PER_PREFIX,
    responders: responders.size,
    counts: { aliased: classification.aliased.length, uncertain: classification.uncertain.length, clean: classification.clean.length },
    clearedFromTable: cleared,
    aliased: classification.aliased,
    uncertain: classification.uncertain,
    clean: classification.clean
  };
  fs.writeFileSync(params.summaryFile, JSON.stringify(summary));
  return summary;
};

/**
 * 调度器调用：启动 xmap 并立即返回；进程结束时在 close 事件里分类并写入状态。
 * error 监听器必须在任何 await 之前挂上（与 xmapController.runXmapTask 相同的原因）。
 */
const runApdTask = async (task) => {
  const taskId = task.id;
  const params = task.params || {};
  const args = Array.isArray(params.args) ? params.args : null;
  if (!args || !params.planFile || !params.summaryFile) throw new Error('任务缺少 APD 参数');

  const invocation = buildXmapInvocation(args);
  const errorLogFile = path.join(DIRS.xmapLog, `${taskId}_error.log`);

  const child = spawn(invocation.command, invocation.args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  child.unref();
  activeProcesses.set(taskId, child);
  child.stderr.pipe(fs.createWriteStream(errorLogFile));

  child.on('error', async (spawnError) => {
    activeProcesses.delete(taskId);
    logger.error(`APD 任务 ${taskId} 启动失败`, { error: spawnError.message });
    try {
      await taskService.markTaskFinished(taskId, { status: 'failed', errorMessage: `无法启动 ${invocation.command}: ${spawnError.message}` });
    } catch (dbError) {
      logger.error(`更新 APD 任务 ${taskId} 状态失败`, { error: dbError.message });
    }
    scheduler.requestTick();
  });

  child.on('close', async (code, signal) => {
    activeProcesses.delete(taskId);
    let status = 'completed';
    let errorMessage = null;

    if (code !== 0 || signal) {
      status = 'failed';
      errorMessage = `进程异常终止 - 退出码: ${code}, 信号: ${signal || '无'}`;
      try {
        const lines = fs.readFileSync(errorLogFile, 'utf8').split('\n').filter((line) => line.trim());
        if (lines.length > 0) errorMessage += `\n最后错误:\n${lines.slice(-5).join('\n')}`;
      } catch (readError) {
        // 没有错误日志就只报退出码
      }
    } else {
      // 任务已被取消时不再写入检测结果（取消后到来的 close 事件不应改变数据）
      try {
        const current = rows(await db.query('SELECT status FROM tasks WHERE id = ?', [taskId]))[0];
        if (current && current.status === 'canceled') {
          status = 'canceled';
        } else {
          await finishApdTask(task);
        }
      } catch (processError) {
        status = 'failed';
        errorMessage = `处理检测结果失败: ${processError.message}`;
        logger.error(`APD 任务 ${taskId} 收尾失败`, { error: processError.message });
      }
    }

    try {
      if (status !== 'canceled') {
        await taskService.markTaskFinished(taskId, { status, errorMessage, exitCode: code, signal });
      }
    } catch (dbError) {
      logger.error(`更新 APD 任务 ${taskId} 状态失败`, { error: dbError.message });
    }
    scheduler.requestTick();
  });

  const stillWanted = await taskService.markTaskRunning(taskId, child.pid);
  if (!stillWanted) {
    logger.warn(`APD 任务 ${taskId} 在启动前已被取消，终止刚启动的进程`);
    terminateApdProcess(taskId);
  }
};

/** 终止任务的 xmap 进程：先对进程组发 SIGTERM，3 秒后 SIGKILL；再按命令行兜底（xmap 经 sudo 运行时有用）。 */
const terminateApdProcess = (taskId) => {
  const child = activeProcesses.get(taskId);
  if (child && child.pid) {
    for (const target of [-child.pid, child.pid]) {
      try {
        process.kill(target, 'SIGTERM');
      } catch (error) {
        // 进程可能已经退出
      }
    }
    const timer = setTimeout(() => {
      for (const target of [-child.pid, child.pid]) {
        try {
          process.kill(target, 'SIGKILL');
        } catch (error) {
          // 已退出
        }
      }
    }, 3000);
    timer.unref();
  }

  const invocation = buildPrivileged('pkill', ['-f', `xmap.*${taskId}`]);
  const killer = spawn(invocation.command, invocation.args, { stdio: 'ignore' });
  killer.on('error', (error) => logger.debug(`pkill 不可用: ${error.message}`));
  killer.unref();
};

scheduler.registerRunner('apd', runApdTask);

module.exports = {
  ApdError,
  PROBES_PER_PREFIX,
  MAX_PREFIXES_PER_TASK,
  parseCandidatePrefix,
  generateProbeAddresses,
  buildProbePlan,
  classifyResponses,
  derivePrefixes,
  filterAddresses,
  filterWithKnownAliases,
  readAddressFile,
  parseResponders,
  enqueueApdTask,
  runApdTask,
  terminateApdProcess,
  finishApdTask
};
