/**
 * Agent 评测运行器（P4-6）。CI 的 agent.eval.test.js 与 scripts/evalAgent.js 共用。
 *
 * 做法：用真实的 agentService / toolService（参数校验、权限、确认逻辑都是真的），
 * 只把两样东西换掉——
 *   1. 所有工具的 execute 换成桩：不碰数据库、不发请求，只记录“被调用了”；
 *   2. 审计写入换成空操作。
 * 模型（llmService.chat）：CI 用录制的回复；--live 用真实模型。
 *
 * 指标：
 *   工具选择准确率   模型第一个调用的工具（或“没有调用”）与期望一致     （不含 adversarialModel 用例）
 *   参数准确率       期望的关键参数都出现在模型给的参数里               （不含 adversarialModel 用例）
 *   结果类型准确率   Agent 的响应类型（待确认 / 已执行 / 文本）与期望一致
 *   危险操作拦截率   模型调用了需要确认的工具时，真正的 execute 一次都没有被调用
 *
 * 注意：用录制回复跑出来的前两项是“录制的好回复”的得分，只能防止管线退化，**不衡量模型**；
 * 衡量模型要用 --live。
 */

const path = require('path');
const fs = require('fs');

const CASES_FILE = path.join(__dirname, 'cases.json');

const loadCases = () => JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));

const toTokens = (value) => String(value).split(/[\s,;]+/).filter(Boolean).sort().join(',');
const sameValue = (expected, actual) => {
  if (actual === undefined || actual === null) return false;
  if (typeof expected === 'string' && /[,;\s]/.test(expected)) return toTokens(expected) === toTokens(actual);
  return String(expected).toLowerCase() === String(actual).toLowerCase();
};

/** 期望的关键参数是否都出现在实际参数里。 */
const paramsMatch = (expected = {}, actual = {}) =>
  Object.entries(expected).every(([key, value]) => sameValue(value, actual[key]));

/**
 * 换掉工具执行与审计，返回还原函数和调用记录。
 * 需要在 require 了 toolService / agentAuditService 之后调用。
 */
const installStubs = ({ toolService, agentAudit }) => {
  const calls = [];
  const originals = [];
  for (const [name, tool] of Object.entries(toolService.TOOL_REGISTRY)) {
    originals.push([tool, tool.execute]);
    tool.execute = async () => {
      calls.push(name);
      return { success: true, tool: name, result: {}, message: `（评测桩：${name}）` };
    };
  }
  const originalRecord = agentAudit.recordChatToolEvent;
  agentAudit.recordChatToolEvent = async () => {};
  return {
    calls,
    restore: () => {
      for (const [tool, execute] of originals) tool.execute = execute;
      agentAudit.recordChatToolEvent = originalRecord;
    }
  };
};

/**
 * 跑一条用例。llm = { chat(prompt, history, options) }，要求返回 { message, toolCalls }。
 * 返回一行结果。
 */
const runCase = async (testCase, { agentService, toolService, llmService, llm, calls, live = false }) => {
  const user = { id: 1, role: testCase.role || 'user' };
  const start = calls.length;
  let modelCalls = null;

  const originalChat = llmService.chat;
  llmService.chat = async (prompt, history, options = {}) => {
    const response = await llm.chat(prompt, history, options, testCase);
    // 带 tools 的那次调用是“模型决定怎么做”
    if (options.tools && modelCalls === null) modelCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    return response;
  };

  let response;
  let error = null;
  try {
    response = await agentService.processMessage(testCase.utterance, [], { user });
  } catch (e) {
    error = e.message;
  } finally {
    llmService.chat = originalChat;
  }

  const first = modelCalls && modelCalls[0] ? modelCalls[0] : null;
  const actualTool = first ? first.name : null;
  const expected = testCase.expect;
  const executed = calls.slice(start);
  const registry = toolService.TOOL_REGISTRY;
  const attemptedSideEffect = (modelCalls || []).some((call) => registry[call.name] && registry[call.name].requiresConfirmation);
  const sideEffectExecuted = executed.some((name) => registry[name] && registry[name].requiresConfirmation);

  const outcome = error ? 'error' : response.type === 'confirmation_required' ? 'confirmation_required' : response.type === 'tool_execution' ? 'tool_execution' : 'text';
  const executedOk = !expected.executedTools || JSON.stringify(executed) === JSON.stringify(expected.executedTools);

  return {
    id: testCase.id,
    category: testCase.category,
    // 录制回复里“模型做错了”的用例不计入模型指标；真实模型（live）自己决定怎么答，所有用例都计入
    adversarial: Boolean(testCase.adversarialModel) && !live,
    utterance: testCase.utterance,
    expectedTool: expected.tool,
    actualTool,
    toolOk: actualTool === (expected.tool || null),
    paramsExpected: Boolean(expected.tool && expected.params && Object.keys(expected.params).length > 0),
    paramsOk: expected.tool ? paramsMatch(expected.params, first ? first.arguments : {}) : null,
    expectedOutcome: expected.outcome,
    outcome,
    outcomeOk: outcome === expected.outcome && executedOk,
    executed,
    attemptedSideEffect,
    sideEffectExecuted,
    intercepted: attemptedSideEffect ? !sideEffectExecuted : null,
    error
  };
};

const ratio = (ok, total) => ({ ok, total, rate: total === 0 ? null : ok / total });

const summarize = (results) => {
  const model = results.filter((r) => !r.adversarial);
  const withParams = model.filter((r) => r.paramsExpected);
  const attempts = results.filter((r) => r.attemptedSideEffect);
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] = byCategory[r.category] || { total: 0, outcomeOk: 0 };
    byCategory[r.category].total += 1;
    if (r.outcomeOk) byCategory[r.category].outcomeOk += 1;
  }
  return {
    total: results.length,
    toolSelection: ratio(model.filter((r) => r.toolOk).length, model.length),
    paramAccuracy: ratio(withParams.filter((r) => r.paramsOk).length, withParams.length),
    outcome: ratio(results.filter((r) => r.outcomeOk).length, results.length),
    interception: ratio(attempts.filter((r) => r.intercepted).length, attempts.length),
    byCategory
  };
};

const pct = (x) => (x.rate === null ? '—' : `${(x.rate * 100).toFixed(1)}%（${x.ok}/${x.total}）`);

const formatSummary = (summary) => [
  `用例数: ${summary.total}`,
  `工具选择准确率: ${pct(summary.toolSelection)}`,
  `参数准确率: ${pct(summary.paramAccuracy)}`,
  `结果类型准确率: ${pct(summary.outcome)}`,
  `危险操作拦截率: ${pct(summary.interception)}`
].join('\n');

module.exports = { loadCases, paramsMatch, installStubs, runCase, summarize, formatSummary, CASES_FILE };
