/**
 * 别名前缀检测（APD）接口。任务接口的形状与 /api/xmap 一致：
 *   POST /                  创建任务（只入队，202）
 *   POST /cancel/:taskId    终止
 *   GET  /tasks             任务列表（分页、按状态过滤）
 *   GET  /task/:taskId      任务详情（含分类计数）
 *   GET  /result/:taskId    下载检测摘要（JSON：aliased / uncertain / clean 及每个前缀的应答数）
 *   DELETE /:taskId         删除任务及其文件
 * 另有：
 *   GET  /aliased           已检测到的别名前缀（分页、按前缀搜索）
 *   DELETE /aliased/:id     人工移除误判的前缀（管理员）
 *   POST /filter            用已知的别名前缀过滤地址（可保存为新文件）
 */

const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const taskService = require('../services/taskService');
const aliasDetect = require('../services/aliasDetectService');
const { DIRS, resolveStoredPath } = require('../services/storageService');
const auditService = require('../services/auditService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('apd-controller');

const ITEMS_PER_PAGE = 20;
const STATUSES = ['pending', 'running', 'completed', 'failed', 'canceled'];

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleError = (res, label, error) => {
  if (error instanceof aliasDetect.ApdError) return fail(res, error.status, error.message);
  logger.error(`${label}失败:`, error.message);
  return fail(res, 500, `${label}失败`);
};

const parseTaskId = (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    fail(res, 400, '无效的任务ID格式');
    return null;
  }
  return taskId;
};

const findOwnTask = async (taskId, userId, columns = 'id, status') => {
  const [tasks] = await db.query(
    `SELECT ${columns} FROM tasks WHERE id = ? AND user_id = ? AND task_type = 'apd'`,
    [taskId, userId]
  );
  return tasks && tasks[0];
};

exports.createApdTask = async (req, res) => {
  try {
    const result = await aliasDetect.enqueueApdTask({ user: req.user, body: req.body || {} });
    logger.info(`用户 ${req.user.id} 创建 APD 任务 ${result.taskId}（${result.prefixCount} 个前缀）`);
    res.status(202).json({ success: true, message: '别名前缀检测任务已提交', ...result });
  } catch (error) {
    handleError(res, '创建别名前缀检测任务', error);
  }
};

exports.getApdTasks = async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const { status } = req.query;

  try {
    let where = "WHERE user_id = ? AND task_type = 'apd'";
    const params = [userId];
    if (status && STATUSES.includes(status)) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [tasks] = await db.query(
      `SELECT id, description, status, created_at, started_at, completed_at, exit_code, process_signal
       FROM tasks ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM tasks ${where}`, params);

    res.json({
      success: true,
      tasks,
      pagination: { total: Number(total), page, perPage: ITEMS_PER_PAGE, totalPages: Math.ceil(Number(total) / ITEMS_PER_PAGE) }
    });
  } catch (error) {
    handleError(res, '获取任务列表', error);
  }
};

const readSummary = (outputPath) => {
  try {
    const summary = JSON.parse(fs.readFileSync(resolveStoredPath(outputPath), 'utf8'));
    return {
      prefixCount: summary.prefixCount,
      probesPerPrefix: summary.probesPerPrefix,
      responders: summary.responders,
      counts: summary.counts,
      clearedFromTable: summary.clearedFromTable,
      finishedAt: summary.finishedAt
    };
  } catch (error) {
    return null;
  }
};

exports.getApdTaskDetails = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(
      taskId, req.user.id,
      'id, command, description, status, created_at, started_at, completed_at, exit_code, process_signal, error_message, output_path, params'
    );
    if (!task) return fail(res, 404, '任务不存在或无权访问');

    const params = typeof task.params === 'string' ? (() => { try { return JSON.parse(task.params); } catch (e) { return {}; } })() : (task.params || {});
    const { output_path: outputPath, params: _params, ...rest } = task;
    res.json({
      success: true,
      task: {
        ...rest,
        prefixCount: params.prefixCount,
        probeCount: params.probeCount,
        summary: task.status === 'completed' ? readSummary(outputPath) : null
      }
    });
  } catch (error) {
    handleError(res, '获取任务详情', error);
  }
};

exports.getApdResult = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id, 'output_path');
    if (!task) return fail(res, 404, '任务不存在或无权访问');

    const resultPath = task.output_path ? resolveStoredPath(task.output_path) : null;
    if (!resultPath || !fs.existsSync(resultPath)) return fail(res, 404, '结果文件不存在');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=apd_result_${taskId}.json`);
    fs.createReadStream(resultPath).pipe(res);
  } catch (error) {
    handleError(res, '下载结果', error);
  }
};

exports.cancelApdTask = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id);
    if (!task) return fail(res, 404, '任务不存在或无权访问');
    if (!['pending', 'running'].includes(task.status)) {
      return fail(res, 400, `任务当前状态为 ${task.status}，无法终止`);
    }

    // 先置为 canceled 再发信号：进程结束后触发的 close 事件不会再改写状态或写入检测结果
    await taskService.markTaskCanceled(taskId);
    if (task.status === 'running') aliasDetect.terminateApdProcess(taskId);

    res.json({ success: true, message: '任务已终止' });
  } catch (error) {
    handleError(res, '终止任务', error);
  }
};

exports.deleteApdTask = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id, 'id, status, log_path, output_path, params');
    if (!task) return fail(res, 404, '任务不存在或无权访问');
    if (task.status === 'running') return fail(res, 400, '任务正在运行中，请先终止任务');

    const params = typeof task.params === 'string' ? (() => { try { return JSON.parse(task.params); } catch (e) { return {}; } })() : (task.params || {});
    const files = [
      task.log_path, task.output_path, params.planFile, params.rawResultFile,
      path.join(DIRS.apdInputs, `${taskId}.txt`), path.join(DIRS.xmapLog, `${taskId}_error.log`)
    ];
    for (const file of files) {
      if (!file) continue;
      try {
        fs.rmSync(resolveStoredPath(file), { force: true });
      } catch (error) {
        logger.warn(`删除任务 ${taskId} 的文件失败: ${error.message}`);
      }
    }

    await db.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id]);
    res.json({ success: true, message: '任务已删除' });
  } catch (error) {
    handleError(res, '删除任务', error);
  }
};

// ---------- 别名前缀表 ----------

exports.getAliasedPrefixes = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 50, 1), 200);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 64) : '';

  try {
    const where = search ? 'WHERE prefix LIKE ?' : '';
    const params = search ? [`${search.replace(/[%_\\]/g, '\\$&')}%`] : [];

    const [items] = await db.query(
      `SELECT id, prefix, prefix_length, probes_sent, probes_answered, method, task_id, detected_at, updated_at
       FROM aliased_prefixes ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM aliased_prefixes ${where}`, params);
    res.json({ success: true, data: { items, total: Number(total), page, pageSize } });
  } catch (error) {
    handleError(res, '获取别名前缀', error);
  }
};

exports.removeAliasedPrefix = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return fail(res, 400, '无效的 ID');

  try {
    const [found] = await db.query('SELECT prefix FROM aliased_prefixes WHERE id = ?', [id]);
    if (!found || found.length === 0) return fail(res, 404, '别名前缀不存在');
    await db.query('DELETE FROM aliased_prefixes WHERE id = ?', [id]);
    await auditService.record({
      userId: req.user.id, action: 'apd.aliased.remove', resourceType: 'aliased_prefix', resourceId: found[0].prefix,
      detail: { prefix: found[0].prefix }, ip: req.ip
    });
    res.json({ success: true, message: '已移除' });
  } catch (error) {
    handleError(res, '移除别名前缀', error);
  }
};

exports.filterAddresses = async (req, res) => {
  try {
    const data = await aliasDetect.filterWithKnownAliases({ user: req.user, body: req.body || {} });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, '过滤地址', error);
  }
};
