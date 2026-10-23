/**
 * 任务服务
 * tasks 表的统一读写入口：创建记录、标记运行/结束、统计，以及服务重启后的状态对账。
 *
 * 约定：
 * - 状态枚举 pending / running / completed / failed / canceled（注意是单个 l 的 canceled）；
 * - 终态（completed / failed / canceled）不会被覆盖：markTaskRunning / markTaskFinished 只会修改
 *   pending / running 的任务。因此用户取消后，随后到来的进程 close 事件不会把状态改回 failed；
 * - 函数遇到数据库错误时直接抛出，由调用方（控制器）的 try/catch 处理。
 */

const fs = require('fs');
const db = require('../database/db');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('task-service');

const TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'canceled'];
const FINAL_STATUSES = ['completed', 'failed', 'canceled'];

// ---------- 任务 ID ----------

let lastTaskId = 0;

/** 生成任务 ID：沿用毫秒时间戳，同一毫秒内多次调用也保证严格递增。 */
const nextTaskId = () => {
  const now = Date.now();
  lastTaskId = now > lastTaskId ? now : lastTaskId + 1;
  return lastTaskId;
};

// ---------- 创建与状态流转 ----------

/**
 * 创建任务记录，返回任务 ID。
 * 日志/结果路径依赖任务 ID 时，先用 nextTaskId() 取得 ID，再通过 taskId 传入。
 */
const createTaskRecord = async ({
  taskId,
  userId,
  taskType,
  command,
  description = null,
  logPath = null,
  outputPath = null,
  params = null,
  priority = 0,
  status = 'pending'
}) => {
  if (!userId) throw new Error('createTaskRecord: 缺少 userId');
  if (!taskType) throw new Error('createTaskRecord: 缺少 taskType');
  if (!TASK_STATUSES.includes(status)) throw new Error(`createTaskRecord: 无效状态 ${status}`);

  const id = taskId || nextTaskId();
  await db.query(
    `INSERT INTO tasks (id, user_id, command, description, status, log_path, output_path, task_type, params, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, command, description, status, logPath, outputPath, taskType, params ? JSON.stringify(params) : null, priority]
  );
  return id;
};

const affected = (result) => Array.isArray(result) && result[0] && result[0].affectedRows > 0;

/** 标记任务开始运行并记录 PID；已处于终态的任务不会被改回 running。返回是否更新了记录。 */
const markTaskRunning = async (taskId, pid = null) => {
  const result = await db.query(
    `UPDATE tasks SET status = 'running', pid = ?, started_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('pending', 'running')`,
    [pid, taskId]
  );
  return affected(result);
};

/**
 * 标记任务结束（completed / failed / canceled）。只修改 pending / running 的任务，
 * 返回是否更新了记录（任务已是终态时返回 false）。
 */
const markTaskFinished = async (taskId, { status, errorMessage = null, exitCode = null, signal = null } = {}) => {
  if (!FINAL_STATUSES.includes(status)) throw new Error(`markTaskFinished: 无效的结束状态 ${status}`);
  const result = await db.query(
    `UPDATE tasks
     SET status = ?, error_message = ?, exit_code = ?, process_signal = ?, pid = NULL, completed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('pending', 'running')`,
    [status, errorMessage, exitCode, signal, taskId]
  );
  return affected(result);
};

/** 取消任务（pending 或 running）。返回是否更新了记录。 */
const markTaskCanceled = (taskId, message = '用户手动终止') =>
  markTaskFinished(taskId, { status: 'canceled', errorMessage: message });

/** 统计某类任务各状态的数量，缺失的状态补 0。 */
const getTaskCounts = async (taskType) => {
  const [rows] = await db.query(
    'SELECT status, COUNT(*) AS count FROM tasks WHERE task_type = ? GROUP BY status',
    [taskType]
  );
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
  for (const row of rows || []) {
    if (row.status in counts) counts[row.status] = Number(row.count);
  }
  return counts;
};

// ---------- 进程探测 ----------

/**
 * 判断 pid 是否仍是这个任务的进程。
 * kill(pid, 0) 只探测存在性；xmap 经 sudo 以 root 运行，非 root 的 Node 进程会得到 EPERM，
 * 这同样说明进程存在。操作系统可能复用 PID，因此在 Linux 上再核对 /proc/<pid>/cmdline
 * 是否包含任务 ID（日志/结果文件名里都带有任务 ID）。
 */
const isTaskProcessAlive = (pid, taskId, procRoot = '/proc') => {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code !== 'EPERM') return false;
  }

  let cmdline;
  try {
    cmdline = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8');
  } catch (error) {
    // /proc 存在但没有这个 pid：进程已不在；没有 /proc（非 Linux）或无权读取：无法核对，按存活处理
    if (error.code === 'ENOENT') return !fs.existsSync(procRoot);
    return true;
  }
  return cmdline.includes(String(taskId));
};

/** 向任务进程发信号（先核对 PID 仍属于该任务）。返回是否发送成功。 */
const signalTaskProcess = (pid, taskId, signal = 'SIGTERM') => {
  if (!isTaskProcessAlive(pid, taskId)) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    logger.warn(`向任务 ${taskId} 的进程 ${pid} 发送 ${signal} 失败: ${error.message}`);
    return false;
  }
};

// ---------- 启动对账 ----------

const watchers = new Map();

const stopWatchers = () => {
  for (const timer of watchers.values()) clearInterval(timer);
  watchers.clear();
};

const LOST_MESSAGE = '服务重启，进程状态丢失';
const GONE_MESSAGE = '服务重启后进程已结束，无法获知退出状态（结果文件可能仍可用）';

const failLost = async (row, message) => {
  const updated = await markTaskFinished(row.id, { status: 'failed', errorMessage: message });
  if (updated) logger.warn(`任务 ${row.id} 已标记为失败: ${message}`);
  return updated;
};

/** 为重启前遗留的仍在运行的进程挂一个轮询，进程结束后补写状态。 */
const watchTask = (row, { pollMs, alive }) => {
  if (watchers.has(row.id)) return;
  const timer = setInterval(async () => {
    try {
      if (alive(row.pid, row.id)) return;
      clearInterval(timer);
      watchers.delete(row.id);
      await failLost(row, GONE_MESSAGE);
    } catch (error) {
      logger.error(`监听任务 ${row.id} 失败:`, error.message);
    }
  }, pollMs);
  timer.unref();
  watchers.set(row.id, timer);
};

/**
 * 服务启动时对账：数据库里 running 的任务，进程不在了就改为 failed；
 * 进程还在（服务重启但扫描进程是 detached 的）就继续监听，等它结束后补写状态。
 * 没有记录 PID 的 running 任务（旧版本创建的，或服务内执行的导入任务）无法确认，按丢失处理。
 * 返回 { failed, watching }。
 */
const reconcileTasksOnStartup = async ({ pollMs = 5000, alive = isTaskProcessAlive, watch = true } = {}) => {
  const [rows] = await db.query("SELECT id, pid, task_type FROM tasks WHERE status = 'running'");
  let failed = 0;
  let watching = 0;

  for (const row of rows || []) {
    if (row.pid && alive(row.pid, row.id)) {
      if (watch) watchTask(row, { pollMs, alive });
      watching += 1;
    } else if (await failLost(row, LOST_MESSAGE)) {
      failed += 1;
    }
  }

  if (failed || watching) {
    logger.info(`任务对账完成: ${failed} 个标记为失败，${watching} 个继续监听`);
  }
  return { failed, watching };
};

module.exports = {
  TASK_STATUSES,
  nextTaskId,
  createTaskRecord,
  markTaskRunning,
  markTaskFinished,
  markTaskCanceled,
  getTaskCounts,
  isTaskProcessAlive,
  signalTaskProcess,
  reconcileTasksOnStartup,
  stopWatchers
};
