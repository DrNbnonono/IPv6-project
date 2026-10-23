/**
 * Agent 工具调用的审计与历史（P4-4）。
 *
 * 两个去处：
 *   audit_logs                    谁、什么时候、让 Agent 做了什么——包括模型提出但还在等确认的调用、被拒绝的无效调用
 *   agent_memory(tool_history)    用户自己的工具使用历史（只含结果摘要）
 *
 * 通过 POST /api/agent/tools/execute 的执行由路由上的审计中间件（agent.tool）记录；
 * 这里负责对话（/api/agent/chat）里模型发起的调用，以及两条路径共用的工具历史。
 * 所有函数都不会抛出：审计和历史写入失败不能让对话或工具执行失败。
 *
 * 动作名：
 *   agent.chat.tool            对话中执行了只读工具（success 反映工具结果）
 *   agent.chat.tool_pending    模型提出了需要确认的调用，已转给用户确认（尚未执行）
 *   agent.chat.tool_rejected   模型给出的调用参数无效，没有执行
 */

const auditService = require('./auditService');
const memoryService = require('./memoryService');
const { maskSensitive, createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('agent-audit');

const MAX_TEXT = 300;
const clip = (value) => (typeof value === 'string' && value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value);

/** 把工具结果压缩成可以长期保存的摘要：不含命令输出、地址列表等正文。 */
const summarizeResult = (result) => {
  if (!result || typeof result !== 'object') return { success: false };
  const summary = { success: result.success === true };
  if (result.error) summary.error = clip(String(result.error));
  const inner = result.result;
  if (inner && typeof inner === 'object') {
    if (inner.taskId !== undefined) summary.taskId = inner.taskId;
    if (typeof inner.count === 'number') summary.count = inner.count;
    if (typeof inner.exitCode === 'number') summary.exitCode = inner.exitCode;
  }
  return summary;
};

/** 参数脱敏并截断（审计服务还会再限制总长度）。 */
const safeParams = (params) => {
  try {
    return maskSensitive(params === undefined ? null : params);
  } catch (error) {
    return null;
  }
};

const userKey = (user) => (user && user.id !== undefined && user.id !== null ? String(user.id) : null);

/** 写入用户的工具使用历史。 */
const recordToolHistory = async ({ user, tool, params, result }) => {
  const key = userKey(user);
  if (!key || !tool) return false;
  // 历史只记工具真正完成了什么；失败（含参数校验未通过）在审计日志里有记录
  if (!result || result.success !== true) return false;
  try {
    const written = await memoryService.longTermMemory.addToolHistory(key, tool, safeParams(params), summarizeResult(result));
    return Boolean(written && written.success);
  } catch (error) {
    logger.error(`记录工具历史失败（${tool}）:`, error.message);
    return false;
  }
};

/**
 * 记录对话中的一次工具事件。
 *   event   'executed' | 'pending' | 'rejected'
 *   result  executed 时为工具结果；pending 时为待确认请求；rejected 时忽略
 *   errors  rejected 时的原因列表
 */
const recordChatToolEvent = async ({ user, tool, params, event, result, errors, ip }) => {
  try {
    const userId = user && user.id ? user.id : null;
    const name = String(tool || '').slice(0, 40);
    if (event === 'executed') {
      const summary = summarizeResult(result);
      await auditService.record({
        userId,
        action: 'agent.chat.tool',
        resourceType: 'agent_tool',
        resourceId: name,
        success: summary.success,
        detail: { tool: name, params: safeParams(params), ...summary },
        ip
      });
      await recordToolHistory({ user, tool: name, params, result });
    } else if (event === 'pending') {
      await auditService.record({
        userId,
        action: 'agent.chat.tool_pending',
        resourceType: 'agent_tool',
        resourceId: name,
        success: true,
        detail: { tool: name, params: safeParams(result && result.params ? result.params : params) },
        ip
      });
    } else if (event === 'rejected') {
      await auditService.record({
        userId,
        action: 'agent.chat.tool_rejected',
        resourceType: 'agent_tool',
        resourceId: name,
        success: false,
        detail: { tool: name, params: safeParams(params), errors: Array.isArray(errors) ? errors.map((item) => clip(String(item))).slice(0, 5) : [] },
        ip
      });
    }
  } catch (error) {
    logger.error('记录 Agent 工具事件失败:', error.message);
  }
};

module.exports = { summarizeResult, recordToolHistory, recordChatToolEvent };
