/**
 * 目标生成任务（TGA）
 *
 * 从种子地址推测可能活跃的新地址，生成可直接给 XMap 使用的地址文件。算法见 tgaAlgorithms.js；
 * 这里负责任务流程：
 *   enqueueTgaTask   校验、准备种子文件（上传文件或从 active_addresses 抽取）、创建 task_type='tga' 的任务
 *   runTgaTask       调度器调用：以子进程运行 scripts/tga/generate.js（不阻塞 Web 进程，取消任务即杀进程）
 *   finishTgaTask    成功后把生成的文件登记到 whitelists 表（工具 xmap），可在 XMap 页面直接选用；
 *                    并按扫描策略预检，告知有多少地址会在扫描时被拒绝
 *
 * 种子来源（二选一）：
 *   seedFile             自己上传的文件名（一行一个地址）
 *   seedPrefix / seedAsn 从 active_addresses 取最多 seedLimit 条（默认 100000，上限 500000）；
 *                        按 prefix_id 的索引顺序取前 N 条，不是随机抽样
 * 生成过程不发送任何探测包，因此不占用每日扫描配额；但生成的地址要扫描时，每一个都要通过扫描策略。
 * 默认排除 aliased_prefixes 里已知的别名前缀（excludeAliased=false 可关闭）。
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const db = require('../database/db');
const { DIRS, resolveStoredPath } = require('./storageService');
const { parseTarget } = require('./cidrService');
const taskService = require('./taskService');
const scheduler = require('./schedulerService');
const scanPolicy = require('./scanPolicyService');
const tga = require('./tgaAlgorithms');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('tga');

const SCRIPT = path.resolve(__dirname, '../scripts/tga/generate.js');
const DEFAULT_SEED_LIMIT = 100000;
const MAX_SEED_LIMIT = 500000;
const MAX_PREFIX_IDS = 1000;

class TgaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TgaError';
    this.status = status;
  }
}

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

const toInt = (value, name, { min, max, fallback }) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new TgaError(`${name} 必须是 ${min}–${max} 之间的整数`);
  return n;
};

/** 命令行参数：路径与数值都由服务端生成，用户只能影响经过校验的算法参数 */
const buildArgs = ({ algorithm, seedsFile, outFile, summaryFile, aliasedFile, budget, options, rngSeed }) => {
  const args = [SCRIPT, '--algorithm', algorithm, '--seeds', seedsFile, '--out', outFile, '--summary', summaryFile, '--budget', String(budget)];
  if (aliasedFile) args.push('--aliased', aliasedFile);
  if (rngSeed !== undefined) args.push('--rng-seed', String(rngSeed));
  for (const [key, value] of Object.entries(options)) args.push('--option', `${key}=${value}`);
  return args;
};

/** 种子来自用户自己上传的文件：返回该文件的实际路径。 */
const resolveSeedFile = async (userId, fileName) => {
  const found = rows(await db.query(
    'SELECT file_path FROM whitelists WHERE file_name = ? AND user_id = ? AND is_deleted = 0 LIMIT 1',
    [String(fileName), userId]
  ));
  if (found.length === 0) throw new TgaError('种子文件不存在或不属于你', 403);
  const filePath = resolveStoredPath(found[0].file_path);
  if (!fs.existsSync(filePath)) throw new TgaError('种子文件已不存在');
  return filePath;
};

/** 种子来自库里的活跃地址：按前缀 / ASN 找到 prefix_id，再取最多 limit 条地址，写入种子文件。 */
const exportSeedsFromDatabase = async ({ prefix, asn, limit, targetFile }) => {
  const prefixIds = new Set();

  if (prefix !== undefined && prefix !== '') {
    const range = parseTarget(String(prefix));
    if (!range || range.version !== 6 || !String(prefix).includes('/')) throw new TgaError('seedPrefix 必须是 IPv6 前缀，如 2001:db8::/32');
    const [network, length] = range.text.split('/');
    for (const row of rows(await db.query(
      "SELECT prefix_id FROM ip_prefixes WHERE version = '6' AND prefix = ? AND prefix_length = ?", [network, Number(length)]
    ))) prefixIds.add(row.prefix_id);
  }
  if (asn !== undefined && asn !== '') {
    const asnNumber = toInt(asn, 'seedAsn', { min: 1, max: 4294967295 });
    for (const row of rows(await db.query("SELECT prefix_id FROM ip_prefixes WHERE version = '6' AND asn = ?", [asnNumber]))) {
      prefixIds.add(row.prefix_id);
    }
  }
  if (prefixIds.size === 0) throw new TgaError('没有找到匹配的前缀（库里没有该前缀 / ASN 的 IPv6 记录）', 404);
  if (prefixIds.size > MAX_PREFIX_IDS) throw new TgaError(`匹配的前缀超过 ${MAX_PREFIX_IDS} 个，请缩小范围`);

  const addresses = rows(await db.query(
    "SELECT address FROM active_addresses WHERE version = '6' AND prefix_id IN (?) LIMIT ?", [[...prefixIds], limit]
  )).map((row) => row.address);
  if (addresses.length === 0) throw new TgaError('这些前缀下没有活跃地址可作为种子', 404);

  fs.writeFileSync(targetFile, `${addresses.join('\n')}\n`, { flag: 'wx' });
  return addresses.length;
};

/**
 * 创建 TGA 任务（只入队）。
 * body: { algorithm, budget?, options?, seedFile? | seedPrefix?/seedAsn?, seedLimit?, excludeAliased?, rngSeed?, description? }
 * 返回 { taskId, algorithm, budget, seedSource }；校验失败抛出带 status 的 TgaError。
 */
const enqueueTgaTask = async ({ user, body = {} }) => {
  const algorithm = String(body.algorithm || '');
  if (!tga.ALGORITHMS[algorithm]) throw new TgaError(`未知的算法: ${algorithm.slice(0, 40) || '（未指定）'}`);

  let options;
  try {
    options = tga.resolveOptions(algorithm, body.options);
  } catch (error) {
    throw new TgaError(error.message);
  }
  const budget = toInt(body.budget, 'budget', { min: 1, max: tga.MAX_BUDGET, fallback: tga.DEFAULT_BUDGET });
  const seedLimit = toInt(body.seedLimit, 'seedLimit', { min: 1, max: MAX_SEED_LIMIT, fallback: DEFAULT_SEED_LIMIT });
  const rngSeed = body.rngSeed === undefined || body.rngSeed === '' ? undefined : toInt(body.rngSeed, 'rngSeed', { min: 0, max: 4294967295 });
  const excludeAliased = body.excludeAliased !== false;

  const hasDbSeed = (body.seedPrefix !== undefined && body.seedPrefix !== '') || (body.seedAsn !== undefined && body.seedAsn !== '');
  if (!body.seedFile && !hasDbSeed) throw new TgaError('请提供种子：seedFile（上传的文件）或 seedPrefix / seedAsn（库里的活跃地址）');
  if (body.seedFile && hasDbSeed) throw new TgaError('seedFile 与 seedPrefix / seedAsn 只能选一种');

  const taskId = taskService.nextTaskId();
  fs.mkdirSync(DIRS.tgaInputs, { recursive: true });
  fs.mkdirSync(DIRS.tgaResults, { recursive: true });
  fs.mkdirSync(DIRS.whitelists, { recursive: true });

  const created = []; // 出错时清理
  const seedsFile = body.seedFile
    ? await resolveSeedFile(user.id, body.seedFile)
    : path.join(DIRS.tgaInputs, `${taskId}.seeds.txt`);
  const outFile = path.join(DIRS.whitelists, `whitelist_${user.id}_${taskId}.txt`);
  const summaryFile = path.join(DIRS.tgaResults, `${taskId}.json`);
  const logFile = path.join(DIRS.tgaResults, `${taskId}.err.log`);
  let aliasedFile = null;

  try {
    let seedCount = null;
    if (hasDbSeed) {
      seedCount = await exportSeedsFromDatabase({ prefix: body.seedPrefix, asn: body.seedAsn, limit: seedLimit, targetFile: seedsFile });
      created.push(seedsFile);
    }
    if (excludeAliased) {
      const aliased = rows(await db.query('SELECT prefix FROM aliased_prefixes')).map((row) => row.prefix);
      if (aliased.length > 0) {
        aliasedFile = path.join(DIRS.tgaInputs, `${taskId}.aliased.txt`);
        fs.writeFileSync(aliasedFile, `${aliased.join('\n')}\n`, { flag: 'wx' });
        created.push(aliasedFile);
      }
    }

    const args = buildArgs({ algorithm, seedsFile, outFile, summaryFile, aliasedFile, budget, options, rngSeed });
    await taskService.createTaskRecord({
      taskId,
      userId: user.id,
      taskType: 'tga',
      command: `node ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`,
      description: body.description || `目标生成（${tga.ALGORITHMS[algorithm].name}，预算 ${budget}）`,
      logPath: logFile,
      outputPath: outFile,
      params: {
        args, algorithm, budget, outFile, summaryFile, aliasedFile,
        seedSource: body.seedFile ? { type: 'file', fileName: String(body.seedFile) } : { type: 'database', prefix: body.seedPrefix || null, asn: body.seedAsn || null, count: seedCount }
      }
    });
  } catch (error) {
    for (const file of created) fs.rmSync(file, { force: true });
    throw error;
  }

  scheduler.requestTick();
  return { taskId, algorithm, budget, seedSource: body.seedFile ? 'file' : 'database' };
};

// ---------- 执行 ----------

const activeProcesses = new Map();

/** 成功后：登记地址文件、预检扫描策略、补全摘要。返回摘要。 */
const finishTgaTask = async (task) => {
  const params = task.params || {};
  const summary = JSON.parse(fs.readFileSync(params.summaryFile, 'utf8'));
  if (!fs.existsSync(params.outFile)) throw new Error('生成的地址文件不存在');

  const fileName = path.basename(params.outFile);
  const tools = rows(await db.query("SELECT id FROM tools WHERE name = 'xmap' LIMIT 1"));
  if (tools.length === 0) throw new Error('工具未配置: xmap');
  await db.query(
    `INSERT INTO whitelists (user_id, tool_id, file_name, file_path, description, is_deleted, uploaded_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW())`,
    [task.userId, tools[0].id, fileName, params.outFile, `目标生成 ${params.algorithm}（任务 ${task.id}，${summary.generated} 个地址）`]
  );

  // 预检：这些地址扫描时是否都能通过策略。只做提示，不影响任务结果。
  let scannable = null;
  if (summary.generated > 0) {
    try {
      const verdict = await scanPolicy.validateTargetFile({ user: { id: task.userId }, filePath: params.outFile });
      scannable = { allowed: verdict.allowed, reason: verdict.reason };
    } catch (error) {
      logger.warn(`TGA 任务 ${task.id} 的策略预检失败: ${error.message}`);
    }
  }

  const finished = { ...summary, taskId: task.id, fileName, scannable, finishedAt: new Date().toISOString() };
  fs.writeFileSync(params.summaryFile, JSON.stringify(finished));
  return finished;
};

/**
 * 调度器调用：启动生成进程并立即返回；进程结束时在 close 事件里收尾并写入状态。
 * error 监听器必须在任何 await 之前挂上（与 runXmapTask 相同的原因）。
 */
const runTgaTask = async (task) => {
  const taskId = task.id;
  const params = task.params || {};
  if (!Array.isArray(params.args) || !params.outFile || !params.summaryFile) throw new Error('任务缺少 TGA 参数');

  const errorLogFile = path.join(DIRS.tgaResults, `${taskId}.err.log`);
  const child = spawn(process.execPath, params.args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  child.unref();
  activeProcesses.set(taskId, child);
  child.stderr.pipe(fs.createWriteStream(errorLogFile));

  const removePartialOutput = () => fs.rmSync(params.outFile, { force: true });

  child.on('error', async (spawnError) => {
    activeProcesses.delete(taskId);
    logger.error(`TGA 任务 ${taskId} 启动失败`, { error: spawnError.message });
    try {
      await taskService.markTaskFinished(taskId, { status: 'failed', errorMessage: `无法启动生成进程: ${spawnError.message}` });
    } catch (dbError) {
      logger.error(`更新 TGA 任务 ${taskId} 状态失败`, { error: dbError.message });
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
        if (lines.length > 0) errorMessage += `\n错误信息:\n${lines.slice(-5).join('\n')}`;
      } catch (readError) {
        // 没有错误输出就只报退出码
      }
      removePartialOutput();
    } else {
      try {
        const current = rows(await db.query('SELECT status FROM tasks WHERE id = ?', [taskId]))[0];
        if (current && current.status === 'canceled') {
          status = 'canceled';
          removePartialOutput();
        } else {
          await finishTgaTask(task);
        }
      } catch (processError) {
        status = 'failed';
        errorMessage = `处理生成结果失败: ${processError.message}`;
        logger.error(`TGA 任务 ${taskId} 收尾失败`, { error: processError.message });
      }
    }

    try {
      if (status !== 'canceled') {
        await taskService.markTaskFinished(taskId, { status, errorMessage, exitCode: code, signal });
      }
    } catch (dbError) {
      logger.error(`更新 TGA 任务 ${taskId} 状态失败`, { error: dbError.message });
    }
    scheduler.requestTick();
  });

  const stillWanted = await taskService.markTaskRunning(taskId, child.pid);
  if (!stillWanted) {
    logger.warn(`TGA 任务 ${taskId} 在启动前已被取消，终止刚启动的进程`);
    terminateTgaProcess(taskId);
  }
};

/** 终止生成进程：先对进程组发 SIGTERM，3 秒后 SIGKILL。 */
const terminateTgaProcess = (taskId) => {
  const child = activeProcesses.get(taskId);
  if (!child || !child.pid) return;
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
};

scheduler.registerRunner('tga', runTgaTask);

module.exports = {
  TgaError,
  DEFAULT_SEED_LIMIT,
  MAX_SEED_LIMIT,
  listAlgorithms: tga.listAlgorithms,
  enqueueTgaTask,
  runTgaTask,
  finishTgaTask,
  terminateTgaProcess
};
