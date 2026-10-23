/**
 * 目标生成（TGA）接口。任务接口的形状与 /api/xmap、/api/apd 一致：
 *   GET  /algorithms        可用算法与参数说明
 *   POST /                  创建任务（只入队，202）
 *   POST /cancel/:taskId    终止
 *   GET  /tasks             任务列表（分页、按状态过滤）
 *   GET  /task/:taskId      任务详情（含生成摘要）
 *   GET  /result/:taskId    下载生成的地址文件（一行一个地址）
 *   DELETE /:taskId         删除任务及其中间文件（已生成并登记的地址文件保留，可在文件管理里删除）
 */

const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const taskService = require('../services/taskService');
const targetGen = require('../services/targetGenService');
const tga = require('../services/tgaAlgorithms');
const { DIRS, resolveStoredPath } = require('../services/storageService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('tga-controller');

const ITEMS_PER_PAGE = 20;
const STATUSES = ['pending', 'running', 'completed', 'failed', 'canceled'];

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleError = (res, label, error) => {
  if (error instanceof targetGen.TgaError) return fail(res, error.status, error.message);
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
    `SELECT ${columns} FROM tasks WHERE id = ? AND user_id = ? AND task_type = 'tga'`,
    [taskId, userId]
  );
  return tasks && tasks[0];
};

const parseParams = (value) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value) || {};
  } catch (error) {
    return {};
  }
};

exports.getAlgorithms = (req, res) => {
  res.json({
    success: true,
    data: {
      algorithms: targetGen.listAlgorithms(),
      limits: {
        defaultBudget: tga.DEFAULT_BUDGET,
        maxBudget: tga.MAX_BUDGET,
        defaultSeedLimit: targetGen.DEFAULT_SEED_LIMIT,
        maxSeedLimit: targetGen.MAX_SEED_LIMIT
      }
    }
  });
};

exports.createTgaTask = async (req, res) => {
  try {
    const result = await targetGen.enqueueTgaTask({ user: req.user, body: req.body || {} });
    logger.info(`用户 ${req.user.id} 创建 TGA 任务 ${result.taskId}（${result.algorithm}）`);
    res.status(202).json({ success: true, message: '目标生成任务已提交', ...result });
  } catch (error) {
    handleError(res, '创建目标生成任务', error);
  }
};

exports.getTgaTasks = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const { status } = req.query;

  try {
    let where = "WHERE user_id = ? AND task_type = 'tga'";
    const params = [req.user.id];
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

exports.getTgaTaskDetails = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(
      taskId, req.user.id,
      'id, command, description, status, created_at, started_at, completed_at, exit_code, process_signal, error_message, params'
    );
    if (!task) return fail(res, 404, '任务不存在或无权访问');

    const params = parseParams(task.params);
    let summary = null;
    if (task.status === 'completed' && params.summaryFile) {
      try {
        summary = JSON.parse(fs.readFileSync(resolveStoredPath(params.summaryFile), 'utf8'));
      } catch (error) {
        summary = null;
      }
    }

    const { params: _params, command: _command, ...rest } = task;
    res.json({
      success: true,
      task: { ...rest, algorithm: params.algorithm, budget: params.budget, seedSource: params.seedSource, summary }
    });
  } catch (error) {
    handleError(res, '获取任务详情', error);
  }
};

exports.getTgaResult = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id, 'status, output_path');
    if (!task) return fail(res, 404, '任务不存在或无权访问');
    if (task.status !== 'completed') return fail(res, 409, '任务尚未成功完成');

    const resultPath = task.output_path ? resolveStoredPath(task.output_path) : null;
    if (!resultPath || !fs.existsSync(resultPath)) return fail(res, 404, '结果文件不存在（可能已在文件管理里删除）');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=tga_targets_${taskId}.txt`);
    fs.createReadStream(resultPath).pipe(res);
  } catch (error) {
    handleError(res, '下载结果', error);
  }
};

exports.cancelTgaTask = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id);
    if (!task) return fail(res, 404, '任务不存在或无权访问');
    if (!['pending', 'running'].includes(task.status)) {
      return fail(res, 400, `任务当前状态为 ${task.status}，无法终止`);
    }

    // 先置为 canceled 再发信号：进程结束后触发的 close 事件不会再改写状态或登记文件
    await taskService.markTaskCanceled(taskId);
    if (task.status === 'running') targetGen.terminateTgaProcess(taskId);

    res.json({ success: true, message: '任务已终止' });
  } catch (error) {
    handleError(res, '终止任务', error);
  }
};

exports.deleteTgaTask = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await findOwnTask(taskId, req.user.id, 'id, status, params');
    if (!task) return fail(res, 404, '任务不存在或无权访问');
    if (task.status === 'running') return fail(res, 400, '任务正在运行中，请先终止任务');

    // 只删中间文件；生成的地址文件已登记为用户的文件，保留
    const params = parseParams(task.params);
    const files = [
      params.summaryFile, params.aliasedFile,
      path.join(DIRS.tgaResults, `${taskId}.err.log`),
      path.join(DIRS.tgaInputs, `${taskId}.seeds.txt`)
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
