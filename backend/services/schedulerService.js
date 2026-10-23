/**
 * 调度器
 * 控制器只负责校验并把任务写成 pending；真正启动进程由这里按并发上限从队列里拉起。
 *
 * 用法：
 *   registerRunner('xmap', async (task) => { ...spawn 进程，调用 taskService.markTaskRunning(task.id, pid)... });
 *   startScheduler();          // 服务启动时调用一次（app.js）
 *   requestTick();             // 新任务入队、任务结束后调用，缩短等待
 *
 * runner 的约定：
 * - 收到的 task 已被调度器领取（数据库状态已是 running）；runner 负责启动进程、记录 pid，
 *   并在进程结束时调用 taskService.markTaskFinished。runner 在进程启动后即可返回，不需要等进程结束；
 * - runner 抛出异常时，调度器把任务标记为 failed。
 *
 * 并发上限（环境变量，见 .env.example）：
 * - MAX_CONCURRENT_<TYPE>：该类型同时运行的任务数，xmap 默认 2、zgrab2 默认 4，其他类型默认 2；
 * - MAX_CONCURRENT_PER_USER：同一用户在同一类型下同时运行的任务数，默认 3。
 * 超出上限的任务保持 pending，按 优先级降序、入队时间、ID 依次启动。
 *
 * 本调度器假定只有一个后端实例；领取使用条件更新，即使误起多个实例也不会重复启动同一任务，
 * 但并发上限是各实例分别统计的。
 */

const taskService = require('./taskService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('scheduler');

const DEFAULT_LIMITS = { xmap: 2, zgrab2: 4 };
const FALLBACK_LIMIT = 2;
const DEFAULT_PER_USER = 3;
const DEFAULT_INTERVAL_MS = 2000;
const PENDING_BATCH = 200;

const runners = new Map();
let timer = null;
let ticking = false;
let tickRequested = false;

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** 读取某类任务的并发上限（每次调用都读环境变量，便于测试与热调整）。 */
const getLimits = (taskType) => ({
  global: toPositiveInt(process.env[`MAX_CONCURRENT_${String(taskType).toUpperCase()}`], DEFAULT_LIMITS[taskType] || FALLBACK_LIMIT),
  perUser: toPositiveInt(process.env.MAX_CONCURRENT_PER_USER, DEFAULT_PER_USER)
});

/** 注册某类任务的启动函数。重复注册同一类型会覆盖。 */
const registerRunner = (taskType, runner) => {
  if (!taskType || typeof runner !== 'function') {
    throw new Error('registerRunner: 需要 taskType 与 runner 函数');
  }
  runners.set(taskType, runner);
};

const launch = (task, runner) => {
  Promise.resolve()
    .then(() => runner(task))
    .catch(async (error) => {
      logger.error(`任务 ${task.id} 启动失败:`, error.message);
      try {
        await taskService.markTaskFinished(task.id, { status: 'failed', errorMessage: `任务启动失败: ${error.message}` });
      } catch (dbError) {
        logger.error(`更新任务 ${task.id} 状态失败:`, dbError.message);
      }
    });
};

/**
 * 执行一轮调度：对每种已注册的类型，在并发上限内从 pending 队列领取任务并交给 runner。
 * 返回本轮启动的任务数。同一时刻只会有一轮在执行；执行期间收到的 tick 请求会在结束后补跑一次。
 */
const tick = async () => {
  if (ticking) {
    tickRequested = true;
    return 0;
  }
  ticking = true;
  let started = 0;

  try {
    for (const [taskType, runner] of runners) {
      const limits = getLimits(taskType);
      const counts = await taskService.getTaskCounts(taskType);
      let free = limits.global - counts.running;
      if (free <= 0 || counts.pending === 0) continue;

      const perUser = await taskService.getRunningCountsByUser(taskType);
      const pending = await taskService.listPendingTasks(taskType, PENDING_BATCH);

      for (const task of pending) {
        if (free <= 0) break;
        const used = perUser.get(task.userId) || 0;
        if (used >= limits.perUser) continue; // 该用户已达上限，跳过，让后面的其他用户先运行

        // 条件更新：任务在排队期间被取消、或被别处领取时返回 false
        if (!(await taskService.claimTask(task.id))) continue;

        perUser.set(task.userId, used + 1);
        free -= 1;
        started += 1;
        logger.info(`调度任务 ${task.id}（${taskType}，用户 ${task.userId}）`);
        launch(task, runner);
      }
    }
  } finally {
    ticking = false;
    if (tickRequested) {
      tickRequested = false;
      setImmediate(() => {
        tick().catch((error) => logger.error('调度失败:', error.message));
      });
    }
  }
  return started;
};

/** 请求尽快调度一轮（调度器未启动时不做任何事）。 */
const requestTick = () => {
  if (!timer) return;
  setImmediate(() => {
    tick().catch((error) => logger.error('调度失败:', error.message));
  });
};

/** 启动周期调度。重复调用无副作用。 */
const startScheduler = ({ intervalMs = DEFAULT_INTERVAL_MS } = {}) => {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((error) => logger.error('调度失败:', error.message));
  }, intervalMs);
  timer.unref();
  logger.info(`调度器已启动，轮询间隔 ${intervalMs}ms，已注册类型: ${[...runners.keys()].join(', ') || '无'}`);
  requestTick();
};

const stopScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
  tickRequested = false;
};

module.exports = {
  registerRunner,
  startScheduler,
  stopScheduler,
  requestTick,
  tick,
  getLimits
};
