#!/usr/bin/env node
/**
 * Agent 评测（P4-6）：用 tests/agent/cases.json 衡量工具选择、参数、结果类型和危险操作拦截。
 *
 *   node scripts/evalAgent.js                   用录制的回复跑（和 CI 一样，只检验管线，不衡量模型）
 *   node scripts/evalAgent.js --live            用 .env 里配置的真实模型跑（发版前留存一份报告）
 *   选项: --out report.json   把完整结果写成 JSON（默认只在控制台输出）
 *         --category scan     只跑某一类（scan / probe / apd / tga / enrich / query / task / knowledge / workflow / terminal / chat / danger）
 *         --limit 10          只跑前 N 条
 *         --delay 500         每条之间等待的毫秒数（避免触发提供商限流）
 *
 * 工具的 execute 被换成桩：不碰数据库、不发请求、不扫描。--live 会真实调用大模型（产生费用）。
 * 录制模式下 danger 类用例回放的是“模型做错了”的输出，用来检验管线，不计入工具选择与参数准确率；
 * live 模式下由真实模型自己决定怎么答，所有用例（包括 danger）都计入，拦截率只统计模型实际发出的调用。
 *
 * 这是 CLI 工具，直接输出到控制台。退出码：0 完成；1 参数错误或没有配置模型。
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const llmService = require('../services/llmService');
const toolService = require('../services/toolService');
const agentService = require('../services/agentService');
const agentAudit = require('../services/agentAuditService');
const runner = require('../tests/agent/evalRunner');

const parseArgs = (argv) => {
  const opts = { live: false, out: null, category: null, limit: null, delay: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--live') opts.live = true;
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--category') opts.category = argv[++i];
    else if (arg === '--limit') opts.limit = parseInt(argv[++i], 10);
    else if (arg === '--delay') opts.delay = parseInt(argv[++i], 10) || 0;
    else throw new Error(`未知参数: ${arg}`);
  }
  if (opts.limit !== null && !(opts.limit > 0)) throw new Error('--limit 必须是正整数');
  return opts;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const realChat = llmService.chat;
  const live = opts.live;
  if (opts.live) {
    if (!llmService.supportsNativeTools()) {
      console.error('没有可用的模型：请在 .env 里配置 AI_PROVIDER 与对应的 API 密钥（且未设置 AGENT_NATIVE_TOOLS=false）');
      return 1;
    }
  } else {
    llmService.supportsNativeTools = () => true;
  }

  let { cases } = runner.loadCases();
  if (opts.category) cases = cases.filter((c) => c.category === opts.category);
  if (opts.limit) cases = cases.slice(0, opts.limit);
  if (cases.length === 0) {
    console.error('没有符合条件的用例');
    return 1;
  }

  const stubs = runner.installStubs({ toolService, agentAudit });
  const llm = opts.live
    ? { chat: (prompt, history, options) => realChat(prompt, history, options) }
    : {
      chat: async (prompt, history, options, testCase) => ({
        message: testCase.recorded.reply,
        model: 'recorded',
        provider: 'recorded',
        toolCalls: options.tools ? testCase.recorded.toolCalls.map((call, i) => ({ id: `c${i}`, name: call.name, arguments: call.arguments })) : []
      })
    };

  const results = [];
  for (const testCase of cases) {
    // live 模式下不使用录制的“模型做错了”回复：这些用例交给真实模型，看它自己会不会出错
    const row = await runner.runCase(testCase, { agentService, toolService, llmService, llm, calls: stubs.calls, live });
    results.push(row);
    const mark = row.outcomeOk && row.toolOk ? '✓' : '✗';
    console.log(`${mark} ${row.id}  工具 ${row.actualTool || '无'}（期望 ${row.expectedTool || '无'}）  结果 ${row.outcome}（期望 ${row.expectedOutcome}）`);
    if (opts.delay) await sleep(opts.delay);
  }
  stubs.restore();

  const summary = runner.summarize(results);
  console.log(`\n模式: ${opts.live ? `真实模型（${process.env.AI_PROVIDER || '默认提供商'}）` : '录制回复（仅检验管线，不衡量模型）'}`);
  console.log(runner.formatSummary(summary));

  if (opts.out) {
    const report = { generatedAt: new Date().toISOString(), mode: opts.live ? 'live' : 'recorded', provider: opts.live ? (process.env.AI_PROVIDER || null) : null, summary, results };
    fs.writeFileSync(opts.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`报告已写入 ${opts.out}`);
  }
  return 0;
};

main().then((code) => {
  const db = require('../database/db');
  Promise.resolve(db.end && db.end()).catch(() => {}).finally(() => process.exit(code));
});
