/**
 * 富化任务（task_type='enrich'）：按 address_id 分批扫描 active_addresses，分类 IID、补全来源前缀（见 enrichService）。
 *
 * 为什么是后台任务：表可能有上千万行，同步 HTTP 请求会超时。任务在服务进程内执行（不起子进程），
 * 每批 ENRICH_BATCH_SIZE（默认 2000）行，批与批之间暂停 ENRICH_BATCH_PAUSE_MS（默认 20ms）以免挤占数据库。
 *
 * 任务参数（body）：
 *   范围（至少一个，或 all=true 表示全表）：asn、countryId、prefixId
 *   overwrite   默认 false：只改 iid_type 为 NULL / 'random' 的行；true 时覆盖外部导入的结果
 *   fillPrefix  默认 true：补全 prefix_id 为 NULL 的行
 *   limit       最多扫描多少行（默认不限）
 *
 * 取消：状态在批与批之间检查，已被取消就停止，不再写入；已写入的批次保留（每批的更新是幂等的，可重跑）。
 * 进度只保存在内存里（getProgress），服务重启后任务按“丢失”标记为失败，重新创建即可，已处理的行会被跳过。
 */

const db = require('../database/db');
const taskService = require('./taskService');
const scheduler = require('./schedulerService');
const enrich = require('./enrichService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('enrich-task');

class EnrichError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'EnrichError';
    this.status = status;
  }
}

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const batchSize = () => {
  const n = parseInt(process.env.ENRICH_BATCH_SIZE, 10);
  return Number.isInteger(n) && n >= 100 && n <= 20000 ? n : 2000;
};
const batchPauseMs = () => {
  const n = parseInt(process.env.ENRICH_BATCH_PAUSE_MS, 10);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : 20;
};

const toInt = (value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new EnrichError(`${label} 必须是 ${min}–${max} 之间的整数`);
  return n;
};
const isSet = (value) => value !== undefined && value !== null && value !== '';
const toBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new EnrichError('布尔参数只能是 true 或 false');
};

/** 校验并规范化任务参数。 */
const resolveParams = (body = {}) => {
  const scope = {};
  if (isSet(body.asn)) scope.asn = toInt(body.asn, 'asn', { max: 4294967295 });
  if (isSet(body.countryId)) scope.countryId = toInt(body.countryId, 'countryId');
  if (isSet(body.prefixId)) scope.prefixId = toInt(body.prefixId, 'prefixId');
  const all = toBool(body.all, false);
  if (Object.keys(scope).length === 0 && !all) {
    throw new EnrichError('请指定范围（asn、countryId、prefixId 之一），或明确传 all=true 处理全表');
  }
  if (Object.keys(scope).length > 0 && all) throw new EnrichError('all=true 不能与 asn / countryId / prefixId 同时使用');

  return {
    scope,
    overwrite: toBool(body.overwrite, false),
    fillPrefix: toBool(body.fillPrefix, true),
    limit: isSet(body.limit) ? toInt(body.limit, 'limit') : null
  };
};

/** 创建任务（只入队）。user = { id }。返回 { taskId, scope, overwrite, fillPrefix, limit }。 */
const enqueueEnrichTask = async ({ user, body }) => {
  const params = resolveParams(body);
  const typeIds = await enrich.loadTypeIds();
  if (!typeIds.has('random')) throw new EnrichError('address_types 中缺少 random 类型，无法判断哪些地址尚未分类', 500);

  const scopeText = params.scope.asn ? `AS${params.scope.asn}` : params.scope.countryId ? `国家 ${params.scope.countryId}` : params.scope.prefixId ? `前缀 ${params.scope.prefixId}` : '全表';
  const taskId = taskService.nextTaskId();
  await taskService.createTaskRecord({
    taskId,
    userId: user.id,
    taskType: 'enrich',
    command: 'enrich-iid',
    description: (body && body.description) || `IID 分类与来源补全（${scopeText}${params.overwrite ? '，覆盖已有类型' : ''}）`,
    params
  });
  scheduler.requestTick();
  return { taskId, ...params };
};

// ---------- 执行 ----------

const progress = new Map(); // taskId → { scanned, updated, prefixFilled, lastAddressId, startedAt }

/** 运行中任务的进度（仅内存，服务重启后丢失）。 */
const getProgress = (taskId) => progress.get(Number(taskId)) || null;

const scopeClause = (scope) => {
  if (scope.prefixId) return { sql: ' AND prefix_id = ?', args: [scope.prefixId] };
  if (scope.asn) return { sql: ' AND prefix_id IN (SELECT prefix_id FROM ip_prefixes WHERE asn = ?)', args: [scope.asn] };
  if (scope.countryId) return { sql: ' AND prefix_id IN (SELECT prefix_id FROM ip_prefixes WHERE country_id = ?)', args: [scope.countryId] };
  return { sql: '', args: [] };
};

const isCanceled = async (taskId) => {
  const [row] = rows(await db.query('SELECT status FROM tasks WHERE id = ?', [taskId]));
  return !row || row.status !== 'running';
};

/** 主循环。返回摘要；任务被取消时返回 null。 */
const scanAndEnrich = async (task) => {
  const params = task.params || {};
  const scope = params.scope || {};
  const startedAt = Date.now();
  const typeIds = await enrich.loadTypeIds();
  const randomTypeId = typeIds.get('random');
  if (randomTypeId === undefined) throw new Error('address_types 中缺少 random 类型');

  const ctx = {
    typeIds,
    randomTypeId,
    overwrite: !!params.overwrite,
    fillPrefix: params.fillPrefix !== false,
    originIndex: null
  };
  let originSize = 0;
  if (ctx.fillPrefix) {
    ctx.originIndex = await enrich.loadOriginIndex();
    originSize = ctx.originIndex.size;
  }

  const stats = enrich.emptyStats();
  const state = { scanned: 0, updated: 0, prefixFilled: 0, lastAddressId: 0, startedAt };
  progress.set(task.id, state);

  const clause = scopeClause(scope);
  // 只取可能需要改动的行，减少传输：默认只看 NULL / random；需要补前缀时再加上 prefix_id 为空的行
  let pending = '';
  const pendingArgs = [];
  if (!ctx.overwrite) {
    pending = ' AND (iid_type IS NULL OR iid_type = ?';
    pendingArgs.push(randomTypeId);
    if (ctx.fillPrefix) pending += ' OR prefix_id IS NULL';
    pending += ')';
  }

  const size = batchSize();
  const pause = batchPauseMs();
  let lastId = 0;

  try {
    for (;;) {
      if (await isCanceled(task.id)) return null;
      const want = params.limit ? Math.min(size, params.limit - stats.scanned) : size;
      if (want <= 0) break;

      const batch = rows(await db.query(
        `SELECT address_id, address, prefix_id, iid_type FROM active_addresses
         WHERE address_id > ? AND version = '6'${clause.sql}${pending}
         ORDER BY address_id LIMIT ?`,
        [lastId, ...clause.args, ...pendingArgs, want]
      ));
      if (batch.length === 0) break;

      await enrich.enrichRows(batch, ctx, stats);
      lastId = Number(batch[batch.length - 1].address_id);
      Object.assign(state, { scanned: stats.scanned, updated: stats.updated, prefixFilled: stats.prefixFilled, lastAddressId: lastId });

      if (batch.length < want) break;
      if (pause > 0) await sleep(pause);
    }
  } finally {
    // 进度保留一小段时间供详情页读取最终值
    const timer = setTimeout(() => progress.delete(task.id), 60000);
    timer.unref();
  }

  return { ...stats, lastAddressId: lastId, prefixesLoaded: originSize, durationMs: Date.now() - startedAt };
};

/** 调度器调用：任务已被领取（running）。执行放到后台，runner 立即返回。 */
const runEnrichTask = async (task) => {
  const taskId = task.id;
  setImmediate(async () => {
    try {
      const summary = await scanAndEnrich(task);
      if (summary === null) {
        logger.info(`富化任务 ${taskId} 已被取消`);
        return;
      }
      await db.query('UPDATE tasks SET params = ? WHERE id = ?', [JSON.stringify({ ...(task.params || {}), summary }), taskId]);
      await taskService.markTaskFinished(taskId, { status: 'completed' });
      logger.info(`富化任务 ${taskId} 完成：扫描 ${summary.scanned}，更新 ${summary.updated}，补前缀 ${summary.prefixFilled}`);
    } catch (error) {
      logger.error(`富化任务 ${taskId} 失败:`, error.message);
      try {
        await taskService.markTaskFinished(taskId, { status: 'failed', errorMessage: error.message });
      } catch (dbError) {
        logger.error(`更新富化任务 ${taskId} 状态失败:`, dbError.message);
      }
    }
  });
};

scheduler.registerRunner('enrich', runEnrichTask);

module.exports = { EnrichError, resolveParams, enqueueEnrichTask, runEnrichTask, scanAndEnrich, getProgress };
