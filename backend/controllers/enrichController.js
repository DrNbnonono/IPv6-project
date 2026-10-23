/**
 * 结果富化接口（挂在 /api/database 下）：
 *   POST /classify-iid                  登录即可；对一组地址做 IID 分类（不访问 active_addresses，不写库）
 *   POST /enrich-iid                    管理员；创建富化任务（只入队，202）
 *   GET  /enrich-iid/tasks              管理员；任务列表
 *   GET  /enrich-iid/task/:taskId       管理员；任务详情（含摘要、运行中的进度）
 *   POST /enrich-iid/cancel/:taskId     管理员；终止
 *   POST /filter-iid                    登录即可；按 IID 类型保留/剔除地址，可保存为自己的 ZGrab2/XMap 输入文件
 * 富化任务写的是共享的 active_addresses，所以任务接口都要求管理员，任务对所有管理员可见。
 */

const db = require('../database/db');
const taskService = require('../services/taskService');
const enrich = require('../services/enrichService');
const enrichTasks = require('../services/enrichTaskService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('enrich-controller');

const ITEMS_PER_PAGE = 20;
const MAX_CLASSIFY = 1000;
const STATUSES = ['pending', 'running', 'completed', 'failed', 'canceled'];

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleError = (res, label, error) => {
  if (error instanceof enrichTasks.EnrichError) return fail(res, error.status, error.message);
  if (error instanceof enrich.EnrichFilterError) return fail(res, 400, error.message);
  logger.error(`${label}失败:`, error.message);
  return fail(res, 500, `${label}失败`);
};

const parseParams = (value) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value) || {};
  } catch (error) {
    return {};
  }
};

exports.classifyIid = async (req, res) => {
  const { addresses } = req.body || {};
  if (!Array.isArray(addresses) || addresses.length === 0) return fail(res, 400, '请提供地址数组 addresses');
  if (addresses.length > MAX_CLASSIFY) return fail(res, 400, `一次最多分类 ${MAX_CLASSIFY} 个地址`);

  try {
    const [types] = await db.query('SELECT type_name, description, is_risky FROM address_types');
    const info = new Map(types.map((t) => [t.type_name, t]));
    const items = addresses.map((raw) => {
      const address = String(raw).trim();
      const type = enrich.classifyIid(address);
      if (type === null) return { address, valid: false, type: null };
      const meta = info.get(type);
      return {
        address,
        valid: true,
        type,
        description: meta ? meta.description : null,
        isRisky: meta ? !!meta.is_risky : null,
        mac: enrich.extractEui64Mac(address)
      };
    });
    const counts = {};
    for (const item of items) if (item.valid) counts[item.type] = (counts[item.type] || 0) + 1;
    res.json({ success: true, data: { items, counts, invalid: items.filter((i) => !i.valid).length } });
  } catch (error) {
    handleError(res, 'IID 分类', error);
  }
};

exports.filterIid = async (req, res) => {
  try {
    const result = await enrich.filterByIidType({ user: req.user, body: req.body || {} });
    // 响应不含服务器路径
    if (result.savedFile) delete result.savedFile.filePath;
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, '按 IID 类型过滤', error);
  }
};

exports.createEnrichTask = async (req, res) => {
  try {
    const result = await enrichTasks.enqueueEnrichTask({ user: req.user, body: req.body || {} });
    logger.info(`用户 ${req.user.id} 创建富化任务 ${result.taskId}`);
    res.status(202).json({ success: true, message: '富化任务已提交', ...result });
  } catch (error) {
    handleError(res, '创建富化任务', error);
  }
};

exports.getEnrichTasks = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const { status } = req.query;
  try {
    let where = "WHERE task_type = 'enrich'";
    const params = [];
    if (status && STATUSES.includes(status)) {
      where += ' AND status = ?';
      params.push(status);
    }
    const [tasks] = await db.query(
      `SELECT id, description, status, created_at, started_at, completed_at FROM tasks ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
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

const parseTaskId = (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (!Number.isInteger(taskId) || taskId < 1) {
    fail(res, 400, '无效的任务ID格式');
    return null;
  }
  return taskId;
};

exports.getEnrichTaskDetails = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;
  try {
    const [rows] = await db.query(
      `SELECT id, description, status, created_at, started_at, completed_at, error_message, params
       FROM tasks WHERE id = ? AND task_type = 'enrich'`,
      [taskId]
    );
    if (!rows || !rows[0]) return fail(res, 404, '任务不存在');
    const { params: rawParams, ...rest } = rows[0];
    const { summary, ...params } = parseParams(rawParams);
    res.json({
      success: true,
      task: { ...rest, params, summary: summary || null, progress: rest.status === 'running' ? enrichTasks.getProgress(taskId) : null }
    });
  } catch (error) {
    handleError(res, '获取任务详情', error);
  }
};

exports.cancelEnrichTask = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;
  try {
    const [rows] = await db.query("SELECT id, status FROM tasks WHERE id = ? AND task_type = 'enrich'", [taskId]);
    if (!rows || !rows[0]) return fail(res, 404, '任务不存在');
    if (!['pending', 'running'].includes(rows[0].status)) {
      return fail(res, 400, `任务当前状态为 ${rows[0].status}，无法终止`);
    }
    await taskService.markTaskCanceled(taskId);
    res.json({ success: true, message: '任务已终止（已写入的批次保留）' });
  } catch (error) {
    handleError(res, '终止任务', error);
  }
};
