#!/usr/bin/env node
/**
 * 轻量压测脚本（P6-1）：对检测平台公共接口与开放 API 做“并发 → 延迟”阶梯测试，不依赖额外包。
 *
 *   node scripts/loadTest.js --base http://127.0.0.1:3000 --scenario detection
 *   node scripts/loadTest.js --scenario open --api-key ov6_xxx --levels 1,5,10,25,50 --duration 10
 *   node scripts/loadTest.js --scenario all --api-key ov6_xxx --out load-report.json
 *
 * 参数：
 *   --base       目标地址，默认 http://127.0.0.1:3000（可以是 IPv6 字面量，如 http://[::1]:3000）
 *   --scenario   detection（检测平台公共接口）| open（开放 API，需要 --api-key）| all
 *   --levels     并发阶梯，逗号分隔，默认 1,5,10,25,50,100
 *   --duration   每个阶梯持续秒数，默认 10
 *   --warmup     每个场景先用并发 2 预热的秒数，默认 3
 *   --api-key    开放 API 的密钥（只放在请求头里，报告里不会出现）
 *   --out        把结果写成 JSON 文件
 *
 * 重要：
 *  - 只应对自己的测试环境运行。脚本会拒绝默认以外的非本机目标，除非加 --i-own-this-target。
 *  - 服务端有全局限流（API_RATE_MAX，默认每分钟 600 次/IP）和开放 API 的按 key 限流；压测前需把它们调高，
 *    否则结果里会出现大量 429，测到的是限流器而不是系统。脚本会在 429 占比超过 1% 时给出提示。
 *  - 这是闭环压测（每个并发 worker 收到响应后立刻发下一个请求），测的是“饱和吞吐与排队延迟”，
 *    不等同于真实用户的到达过程。
 * 这是 CLI 工具，直接输出到控制台。退出码：0 完成；1 参数错误；2 目标不可达。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

const parseArgs = (argv) => {
  const opts = { base: 'http://127.0.0.1:3000', scenario: 'detection', levels: [1, 5, 10, 25, 50, 100], duration: 10, warmup: 3 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--base') opts.base = next();
    else if (arg === '--scenario') opts.scenario = next();
    else if (arg === '--levels') opts.levels = String(next()).split(',').map((n) => parseInt(n, 10));
    else if (arg === '--duration') opts.duration = Number(next());
    else if (arg === '--warmup') opts.warmup = Number(next());
    else if (arg === '--api-key') opts.apiKey = next();
    else if (arg === '--out') opts.out = next();
    else if (arg === '--i-own-this-target') opts.confirmed = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!['detection', 'open', 'all'].includes(opts.scenario)) throw new Error('--scenario 只能是 detection / open / all');
  if (!opts.levels.length || opts.levels.some((n) => !Number.isInteger(n) || n < 1 || n > 1000)) throw new Error('--levels 需要 1–1000 的整数');
  if (!(opts.duration > 0 && opts.duration <= 600)) throw new Error('--duration 需要 0–600 秒');
  if ((opts.scenario === 'open' || opts.scenario === 'all') && !opts.apiKey) throw new Error('开放 API 场景需要 --api-key');
  return opts;
};

const isLocalHost = (hostname) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);

const SCENARIOS = {
  detection: [
    '/api/addresses/global-stats',
    '/api/addresses/map-data',
    '/api/addresses/countries/ranking',
    '/api/addresses/asns/ranking',
    '/api/addresses/trends?scope=global&days=30',
    '/api/addresses/protocols',
    '/api/addresses/vulnerabilities',
    '/api/addresses/countries/AA',
    '/api/addresses/asns/64513',
    '/api/addresses/search?query=2001:db8:1::',
    '/api/addresses/search?query=SYN-AS5'
  ],
  open: [
    '/api/open/v1/stats/global',
    '/api/open/v1/stats/countries',
    '/api/open/v1/stats/countries/AA',
    '/api/open/v1/stats/asns/64513',
    '/api/open/v1/trends?scope=global&days=30',
    '/api/open/v1/prefixes?limit=50'
  ]
};

/** 百分位（最近秩法）。samples 已升序。 */
const percentile = (sorted, p) => {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
};

const summarize = (latencies, counters, seconds) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = counters.ok + counters.limited + counters.serverError + counters.clientError + counters.failed;
  return {
    requests: total,
    rps: Number((total / seconds).toFixed(1)),
    ok: counters.ok,
    limited429: counters.limited,
    clientError: counters.clientError,
    serverError: counters.serverError,
    failed: counters.failed,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : null
  };
};

const makeClient = (base, headers) => {
  const target = new URL(base);
  const lib = target.protocol === 'https:' ? https : http;
  const agent = new lib.Agent({ keepAlive: true, maxSockets: Infinity });
  const request = (pathAndQuery) => new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = lib.request({
      agent,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: pathAndQuery,
      method: 'GET',
      headers,
      timeout: 30000
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
    req.end();
  });
  return { request, close: () => agent.destroy() };
};

/** 以固定并发跑 seconds 秒，worker 轮流取场景中的路径。 */
const runLevel = async (client, paths, concurrency, seconds) => {
  const latencies = [];
  const counters = { ok: 0, limited: 0, serverError: 0, clientError: 0, failed: 0 };
  const perPath = new Map(paths.map((p) => [p, { latencies: [], errors: 0 }]));
  const deadline = Date.now() + seconds * 1000;
  let cursor = 0;
  const started = Date.now();

  const worker = async () => {
    while (Date.now() < deadline) {
      const pathAndQuery = paths[cursor++ % paths.length];
      const { status, ms } = await client.request(pathAndQuery);
      latencies.push(ms);
      const bucket = perPath.get(pathAndQuery);
      bucket.latencies.push(ms);
      if (status >= 200 && status < 300) counters.ok++;
      else if (status === 429) { counters.limited++; bucket.errors++; }
      else if (status >= 500) { counters.serverError++; bucket.errors++; }
      else if (status >= 400) { counters.clientError++; bucket.errors++; }
      else { counters.failed++; bucket.errors++; }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - started) / 1000;
  const result = summarize(latencies, counters, elapsed);
  result.concurrency = concurrency;
  result.paths = [...perPath.entries()].map(([p, v]) => {
    const sorted = [...v.latencies].sort((a, b) => a - b);
    return { path: p, requests: sorted.length, errors: v.errors, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
  });
  return result;
};

const fmt = (n) => (n === null || n === undefined ? '-' : n.toFixed(1));

const printTable = (name, rows) => {
  console.log(`\n== ${name} ==`);
  console.log('并发    rps    ok   429  4xx  5xx  失败   p50ms   p95ms   p99ms   maxms');
  for (const r of rows) {
    console.log([
      String(r.concurrency).padStart(4), String(r.rps).padStart(7), String(r.ok).padStart(6), String(r.limited429).padStart(5),
      String(r.clientError).padStart(4), String(r.serverError).padStart(4), String(r.failed).padStart(5),
      fmt(r.p50).padStart(8), fmt(r.p95).padStart(8), fmt(r.p99).padStart(8), fmt(r.max).padStart(8)
    ].join(' '));
  }
  const limited = rows.reduce((s, r) => s + r.limited429, 0);
  const total = rows.reduce((s, r) => s + r.requests, 0);
  if (total > 0 && limited / total > 0.01) {
    console.log(`提示：${((limited / total) * 100).toFixed(1)}% 的请求被限流（429），这部分结果测的是限流器；请调高 API_RATE_MAX / OPEN_API_RATE_PER_MIN 后重测。`);
  }
};

const runScenario = async (name, base, headers, opts) => {
  const paths = SCENARIOS[name];
  const client = makeClient(base, headers);
  try {
    const probe = await client.request(paths[0]);
    if (probe.status === 0) throw Object.assign(new Error(`目标不可达：${base}`), { code: 'UNREACHABLE' });
    if (opts.warmup > 0) await runLevel(client, paths, 2, opts.warmup);
    const rows = [];
    for (const level of opts.levels) {
      rows.push(await runLevel(client, paths, level, opts.duration));
    }
    printTable(name, rows);
    return { scenario: name, paths, levels: rows };
  } finally {
    client.close();
  }
};

const main = async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误：${err.message}`);
    process.exit(1);
  }

  const host = new URL(opts.base).hostname;
  if (!isLocalHost(host) && !opts.confirmed) {
    console.error(`目标 ${host} 不是本机。压测会产生大量请求，只应对你自己的测试环境运行；确认后加 --i-own-this-target。`);
    process.exit(1);
  }

  const scenarios = opts.scenario === 'all' ? ['detection', 'open'] : [opts.scenario];
  const report = {
    generatedAt: new Date().toISOString(),
    base: opts.base,
    duration: opts.duration,
    node: process.version,
    results: []
  };

  try {
    for (const name of scenarios) {
      const headers = name === 'open' ? { 'X-API-Key': opts.apiKey } : {};
      report.results.push(await runScenario(name, opts.base, headers, opts));
    }
  } catch (err) {
    console.error(err.message);
    process.exit(err.code === 'UNREACHABLE' ? 2 : 1);
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));
    console.log(`\n结果已写入 ${opts.out}`);
  }
};

if (require.main === module) {
  main();
}

module.exports = { parseArgs, percentile, summarize, SCENARIOS, isLocalHost };
