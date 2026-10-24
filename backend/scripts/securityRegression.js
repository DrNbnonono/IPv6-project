#!/usr/bin/env node
/**
 * 安全回归（P6-3）：对运行中的后端做黑盒检查，覆盖 P0 的全部安全用例以及后续新增的开放 API、报告、扫描策略。
 * 目的：演示前与代码冻结期每次改动后重跑，确认没有回退。单元测试（`npm test`）覆盖代码层面，这里覆盖“部署出来的整体”。
 *
 *   node scripts/securityRegression.js --base http://127.0.0.1:3000
 *   node scripts/securityRegression.js --base http://127.0.0.1:3000 --user-token <JWT> --admin-token <JWT> --strict
 *
 * 参数：
 *   --base            目标地址，默认 http://127.0.0.1:3000；非本机需加 --i-own-this-target
 *   --user-token      普通用户的 JWT（用于分权检查）；也可用环境变量 SEC_USER_TOKEN
 *   --admin-token     管理员的 JWT（用于终端、API 密钥、审计检查）；也可用环境变量 SEC_ADMIN_TOKEN
 *   --other-user-id   另一个普通用户的 ID，用于检查“不能下载别人的报告”（可选）
 *   --include-ratelimit  同时验证登录限流（会连续发 12 次错误登录，让本机 IP 被限流 15 分钟，默认不做）
 *   --strict          warn 级别的项也算失败（部署前用）
 *   --json            以 JSON 输出结果
 *
 * 取得令牌：用测试账号走一遍登录接口即可（`POST /api/auth/login` 返回 token）。**不要用生产账号的令牌跑回归**。
 * 没给令牌的项会标记 SKIP，而不是通过。
 *
 * 副作用：
 *  - 会发 1 次错误登录（计入登录限流）；
 *  - 提供管理员令牌时会创建并立刻吊销一个名为 security-regression 的 API 密钥；
 *  - 提供普通用户令牌时会尝试创建扫描任务（目标不在白名单内时会被拒绝，不会真的扫描；
 *    如果该目标恰好在白名单里，脚本会判为失败并提醒，但任务已被创建，请到任务页取消）。
 *
 * 退出码：0 全部通过（或只有 warn/skip）；1 有失败；2 参数错误或目标不可达。
 */

const { URL } = require('url');
const crypto = require('crypto');

const REGRESSION_KEY_NAME = 'security-regression';
// RFC 5737 文档保留地址，不属于任何真实主机
const DOC_TARGET = '203.0.113.7';

const parseArgs = (argv, env = process.env) => {
  const opts = {
    base: 'http://127.0.0.1:3000',
    userToken: env.SEC_USER_TOKEN || '',
    adminToken: env.SEC_ADMIN_TOKEN || '',
    otherUserId: null,
    includeRateLimit: false,
    strict: false,
    json: false,
    confirmed: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--base') opts.base = next();
    else if (arg === '--user-token') opts.userToken = next();
    else if (arg === '--admin-token') opts.adminToken = next();
    else if (arg === '--other-user-id') opts.otherUserId = next();
    else if (arg === '--include-ratelimit') opts.includeRateLimit = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--i-own-this-target') opts.confirmed = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!opts.base) throw new Error('--base 不能为空');
  return opts;
};

const isLocalHost = (hostname) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);

/** 构造一个 alg=none 的伪造令牌（应当被拒绝）。 */
const forgeNoneToken = (id = 1) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id, role: 'admin' })}.`;
};

/** 用错误密钥签发的 HS256 令牌（应当被拒绝）。 */
const forgeWrongSecretToken = (id = 1) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ id, role: 'admin' });
  const sig = crypto.createHmac('sha256', 'not-the-real-secret').update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

/** 响应里是否带有内部信息：堆栈、文件路径、SQL 报错、请求头回显。 */
const LEAK_PATTERN = /node_modules|\.js:\d+|\bat [\w.<>]+ \(|SQL syntax|ER_[A-Z_]+|ECONNREFUSED|receivedHeaders|stack"?\s*:/i;

const makeHttp = (base) => {
  const root = base.replace(/\/+$/, '');
  return async (method, path, { headers = {}, body, rawBody, timeoutMs = 15000 } = {}) => {
    const started = Date.now();
    const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) };
    if (rawBody !== undefined) {
      init.body = rawBody;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    }
    const res = await fetch(`${root}${path}`, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    return { status: res.status, headers: res.headers, text, json, ms: Date.now() - started };
  };
};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const pass = (detail) => ({ status: 'pass', detail });
const fail = (detail) => ({ status: 'fail', detail });
const warn = (detail) => ({ status: 'warn', detail });

/** 检查清单。needs: none | user | admin；ref 对应升级计划里的编号。 */
const buildChecks = (opts) => [
  {
    id: 'SR-01', ref: 'P0-2', needs: 'none', name: '需要登录的接口，未带令牌一律 401',
    run: async ({ http }) => {
      const routes = [
        ['GET', '/api/xmap/tasks'], ['GET', '/api/zgrab2/tasks'], ['GET', '/api/admin/scan-policy'], ['GET', '/api/agent/terminals'],
        ['GET', '/api/database/stats'], ['POST', '/api/database/advanced-query'], ['POST', '/api/reports'], ['GET', '/api/workflows']
      ];
      const bad = [];
      for (const [method, path] of routes) {
        const res = await http(method, path, method === 'POST' ? { body: {} } : {});
        if (res.status !== 401) bad.push(`${method} ${path} → ${res.status}`);
      }
      return bad.length ? fail(bad.join('；')) : pass(`${routes.length} 个接口均返回 401`);
    }
  },
  {
    id: 'SR-02', ref: 'P0-2', needs: 'none', name: '伪造/无效令牌被拒绝，且响应不回显请求头',
    run: async ({ http }) => {
      const tokens = { 乱码: 'abc.def.ghi', 'alg=none': forgeNoneToken(), 错误密钥: forgeWrongSecretToken() };
      const bad = [];
      for (const [label, token] of Object.entries(tokens)) {
        const res = await http('GET', '/api/xmap/tasks', { headers: bearer(token) });
        if (res.status !== 401) bad.push(`${label} → ${res.status}`);
        else if (LEAK_PATTERN.test(res.text) || res.text.includes(token)) bad.push(`${label} 的 401 响应带有内部信息或回显了令牌`);
      }
      return bad.length ? fail(bad.join('；')) : pass('三种伪造令牌均 401，响应干净');
    }
  },
  {
    id: 'SR-03', ref: 'P0-2', needs: 'none', name: '登录失败的文案统一，不暴露用户是否存在，不含密码/哈希',
    run: async ({ http }) => {
      const phone = `139${String(Date.now()).slice(-8)}`;
      const res = await http('POST', '/api/auth/login', { body: { phone, password: 'definitely-wrong' } });
      if (res.status === 429) return warn('本机 IP 已被登录限流（429），本项未能验证；15 分钟后重跑');
      if (res.status !== 401) return fail(`期望 401，实际 ${res.status}`);
      if (!/手机号或密码错误/.test(res.text)) return fail(`文案不是统一的“手机号或密码错误”：${res.text.slice(0, 80)}`);
      if (/\$2[aby]\$|password_hash/i.test(res.text)) return fail('响应里出现了哈希相关内容');
      return pass('统一文案');
    }
  },
  {
    id: 'SR-04', ref: 'P0-6', needs: 'none', name: '安全响应头：nosniff、无 x-powered-by、有 x-frame-options',
    run: async ({ http }) => {
      const res = await http('GET', '/api/test');
      const bad = [];
      if (res.headers.get('x-content-type-options') !== 'nosniff') bad.push('缺少 X-Content-Type-Options: nosniff');
      if (res.headers.get('x-powered-by')) bad.push('暴露了 X-Powered-By');
      if (!res.headers.get('x-frame-options') && !/frame-ancestors/.test(res.headers.get('content-security-policy') || '')) bad.push('缺少 X-Frame-Options / frame-ancestors');
      return bad.length ? fail(bad.join('；')) : pass('响应头齐全');
    }
  },
  {
    id: 'SR-05', ref: 'P0-6', needs: 'none', name: 'CORS：陌生来源不被放行',
    run: async ({ http }) => {
      const origin = 'https://evil.example';
      const res = await http('GET', '/api/test', { headers: { Origin: origin } });
      const allow = res.headers.get('access-control-allow-origin');
      if (allow === origin || allow === '*') {
        return warn(`陌生来源被放行（Access-Control-Allow-Origin: ${allow}）。部署前请设置 CORS_ORIGINS`);
      }
      return pass('陌生来源未被放行');
    }
  },
  {
    id: 'SR-06', ref: 'P0-6', needs: 'none', name: '请求体过大返回 413，且是 JSON',
    run: async ({ http }) => {
      const res = await http('POST', '/api/auth/login', { body: { phone: 'x', password: 'y'.repeat(3 * 1024 * 1024) } });
      if (res.status === 429) return warn('被限流（429），本项未能验证');
      if (res.status !== 413) return fail(`期望 413，实际 ${res.status}`);
      if (!res.json) return fail('413 响应不是 JSON');
      return pass('413 + JSON');
    }
  },
  {
    id: 'SR-07', ref: 'P5-3', needs: 'none', name: '开放 API 必须带密钥；密钥放在 URL 里不被接受',
    run: async ({ http }) => {
      const bad = [];
      for (const path of ['/api/open/v1/stats/global', '/api/open/v1/stats/global?api_key=ov6_fake', '/api/open/v1/stats/global?key=ov6_fake&apikey=ov6_fake']) {
        const res = await http('GET', path);
        if (res.status !== 401) bad.push(`${path} → ${res.status}`);
      }
      return bad.length ? fail(bad.join('；')) : pass('无密钥/URL 密钥均 401');
    }
  },
  {
    id: 'SR-08', ref: 'P0-4', needs: 'none', name: '公共搜索接口：注入载荷不报 5xx、不泄露 SQL 报错、延时注入无效',
    run: async ({ http }) => {
      const payloads = ["' OR 1=1 -- ", "1'; DROP TABLE users; -- ", "' UNION SELECT password_hash FROM users -- "];
      const bad = [];
      for (const q of payloads) {
        const res = await http('GET', `/api/addresses/search?query=${encodeURIComponent(q)}`);
        if (res.status >= 500) bad.push(`“${q.slice(0, 12)}…” → ${res.status}`);
        else if (LEAK_PATTERN.test(res.text)) bad.push(`“${q.slice(0, 12)}…” 的响应带有内部信息`);
        else if (/\$2[aby]\$/.test(res.text)) bad.push('响应里出现了密码哈希');
      }
      const sleepRes = await http('GET', `/api/addresses/search?query=${encodeURIComponent("' AND SLEEP(5) -- ")}`, { timeoutMs: 20000 });
      if (sleepRes.ms > 3500) bad.push(`延时注入生效（耗时 ${sleepRes.ms}ms）`);
      return bad.length ? fail(bad.join('；')) : pass('注入载荷均被当作普通文本处理');
    }
  },
  {
    id: 'SR-09', ref: 'P1-1', needs: 'none', name: '文档接口：路径穿越读不到服务器文件',
    run: async ({ http }) => {
      const paths = [
        '/api/docs/zgrab2/zh/..%2F..%2F..%2F..%2F.env', '/api/docs/zgrab2/..%2F..%2F..%2F..%2Fetc%2Fpasswd/x',
        '/api/docs/xmap/en/%2e%2e%2f%2e%2e%2f%2e%2e%2f.env', '/api/docs/xmap/%2e%2e%2f%2e%2e%2fetc%2fpasswd/x'
      ];
      const bad = [];
      for (const path of paths) {
        const res = await http('GET', path);
        if (/JWT_SECRET|DB_PASSWORD|root:.*:0:0/.test(res.text)) bad.push(`${path} 读到了敏感文件`);
        else if (res.status === 200) bad.push(`${path} → 200`);
      }
      return bad.length ? fail(bad.join('；')) : pass('穿越路径均被拒绝');
    }
  },
  {
    id: 'SR-10', ref: 'P6-3', needs: 'none', name: '错误响应不泄露堆栈/文件路径（JSON 解析失败、未知路径、URL 编码错误）',
    run: async ({ http }) => {
      const cases = [
        ['POST', '/api/auth/login', { rawBody: '{bad', headers: { 'Content-Type': 'application/json' } }],
        ['GET', '/api/this-route-does-not-exist', {}],
        ['GET', '/api/addresses/%E0%A4%A', {}]
      ];
      const bad = [];
      for (const [method, path, init] of cases) {
        const res = await http(method, path, init);
        if (res.status === 429) continue;
        if (LEAK_PATTERN.test(res.text)) bad.push(`${method} ${path} → ${res.status}，响应带有堆栈或文件路径`);
        else if (res.status >= 500) bad.push(`${method} ${path} → ${res.status}`);
      }
      return bad.length ? fail(bad.join('；')) : pass('响应均为干净的 JSON/短文本');
    }
  },
  {
    id: 'SR-11', ref: 'P0-6', needs: 'none', name: '全局限流已启用（响应带 RateLimit 头）',
    run: async ({ http }) => {
      const res = await http('GET', '/api/test');
      return res.headers.get('ratelimit') || res.headers.get('x-ratelimit-limit') || res.headers.get('ratelimit-limit')
        ? pass('有限流头')
        : fail('响应里没有限流头，全局限流可能没有生效');
    }
  },
  {
    id: 'SR-12', ref: 'P0-6', needs: 'none', name: '连续错误登录触发 429（--include-ratelimit）', optIn: 'includeRateLimit', optInFlag: '--include-ratelimit',
    run: async ({ http }) => {
      let limited = false;
      for (let i = 0; i < 12; i++) {
        const res = await http('POST', '/api/auth/login', { body: { phone: '13800000000', password: `wrong-${i}` } });
        if (res.status === 429) { limited = true; break; }
      }
      return limited ? pass('第 N 次错误登录后返回 429') : fail('连续 12 次错误登录都没有被限流');
    }
  },
  {
    id: 'SR-20', ref: 'P0-3', needs: 'user', name: '普通用户不能做管理员操作（数据库写、管理页、密钥、审计）',
    run: async ({ http, userToken }) => {
      const h = bearer(userToken);
      const routes = [
        ['POST', '/api/database/delete-addresses', { ids: [1] }], ['POST', '/api/database/countries', { country_id: 'ZZ' }],
        ['DELETE', '/api/database/prefixes/1'], ['GET', '/api/admin/scan-policy'], ['POST', '/api/admin/api-keys', { name: 'x' }],
        ['GET', '/api/admin/audit-logs'], ['GET', '/api/admin/users'], ['POST', '/api/admin/scan-allowlist', { target: '203.0.113.0/24' }]
      ];
      const bad = [];
      for (const [method, path, body] of routes) {
        const res = await http(method, path, { headers: h, body });
        if (res.status !== 403) bad.push(`${method} ${path} → ${res.status}`);
      }
      return bad.length ? fail(bad.join('；')) : pass(`${routes.length} 个管理员接口均 403`);
    }
  },
  {
    id: 'SR-21', ref: 'P0-4', needs: 'user', name: '高级查询：不接受裸 SQL，注入式过滤条件被拒绝',
    run: async ({ http, userToken }) => {
      const h = bearer(userToken);
      const bad = [];
      const cases = [
        ['裸 query', { query: 'SELECT * FROM users' }, [400]],
        ['裸 sql', { sql: 'DROP TABLE users' }, [400]],
        ['非白名单字段', { filters: { fields: ['password_hash'] } }, [400]],
        ['国家代码注入', { filters: { country: "CN' OR '1'='1" } }, [400]],
        ['ASN 注入', { filters: { asn: '1 OR 1=1' } }, [400]]
      ];
      for (const [label, body, expected] of cases) {
        const res = await http('POST', '/api/database/advanced-query', { headers: h, body });
        if (!expected.includes(res.status)) bad.push(`${label} → ${res.status}`);
        if (/\$2[aby]\$/.test(res.text)) bad.push(`${label} 的响应出现了密码哈希`);
      }
      return bad.length ? fail(bad.join('；')) : pass(`${cases.length} 种恶意入参均被拒绝`);
    }
  },
  {
    id: 'SR-22', ref: 'P2-3', needs: 'user', name: '扫描目标默认拒绝（不在白名单的目标不会创建任务）',
    run: async ({ http, userToken }) => {
      const res = await http('POST', '/api/xmap', { headers: bearer(userToken), body: { targetaddress: DOC_TARGET, rate: '10' } });
      if (res.status === 429) return warn('被限流（429），本项未能验证');
      const refused = (res.json && res.json.success === false) || res.status >= 400;
      if (refused) return pass('被策略拒绝');
      return fail(`文档保留地址 ${DOC_TARGET} 竟被接受（任务可能已创建，请到任务页取消）；请检查扫描白名单是否过宽`);
    }
  },
  {
    id: 'SR-23', ref: 'P0-7', needs: 'user', name: 'Agent 的扫描类工具未确认时不执行',
    run: async ({ http, userToken }) => {
      const res = await http('POST', '/api/agent/tools/execute', { headers: bearer(userToken), body: { toolName: 'xmap', params: { target: DOC_TARGET } } });
      if (res.status === 409 && res.json && res.json.needsConfirmation) return pass('返回 needsConfirmation，未执行');
      if (res.json && res.json.success === false) return pass(`被拒绝：${String(res.json.message).slice(0, 40)}`);
      return fail(`未确认的扫描工具得到了 ${res.status}：${res.text.slice(0, 80)}`);
    }
  },
  {
    id: 'SR-24', ref: 'P5-2', needs: 'user', name: '报告下载：路径穿越与他人的报告 ID 被拒绝',
    run: async ({ http, userToken, otherUserId }) => {
      const bad = [];
      for (const id of ['..%2F..%2Fetc%2Fpasswd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', 'x'.repeat(300)]) {
        const res = await http('GET', `/api/reports/${id}/download`, { headers: bearer(userToken) });
        if (res.status === 200 || /root:.*:0:0/.test(res.text)) bad.push(`ID ${id.slice(0, 20)} → ${res.status}`);
      }
      if (otherUserId) {
        const res = await http('GET', `/api/reports/u${encodeURIComponent(otherUserId)}_t1_1700000000000/download`, { headers: bearer(userToken) });
        if (res.status === 200) bad.push('可以下载他人的报告');
        else if (![403, 404].includes(res.status)) bad.push(`他人的报告 ID 返回 ${res.status}（期望 403/404）`);
      }
      return bad.length ? fail(bad.join('；')) : pass(otherUserId ? '穿越与越权均被拒绝' : '穿越被拒绝（未提供 --other-user-id，越权项未测）');
    }
  },
  {
    id: 'SR-30', ref: 'P0-5', needs: 'admin', name: '终端：危险命令被拒绝（rm、读 .env、curl file://、ls /etc、命令拼接）',
    run: async ({ http, adminToken }) => {
      const h = bearer(adminToken);
      const created = await http('POST', '/api/agent/terminal', { headers: h, body: {} });
      const terminalId = created.json && created.json.terminal && created.json.terminal.id;
      if (!terminalId) return fail(`无法创建终端：${created.status} ${created.text.slice(0, 80)}`);
      const bad = [];
      try {
        for (const command of ['rm -rf x', 'cat ../backend/.env', 'curl file:///etc/passwd', 'ls /etc', 'ls; id', 'echo $(id)', 'cat /etc/passwd']) {
          const res = await http('POST', '/api/agent/terminal/execute', { headers: h, body: { terminalId, command } });
          if (res.json && res.json.success === true) bad.push(`“${command}” 被执行了`);
          else if (/root:.*:0:0|JWT_SECRET|DB_PASSWORD/.test(res.text)) bad.push(`“${command}” 的响应含敏感内容`);
        }
      } finally {
        await http('DELETE', `/api/agent/terminal/${terminalId}`, { headers: h });
      }
      return bad.length ? fail(bad.join('；')) : pass('7 条危险命令均被拒绝');
    }
  },
  {
    id: 'SR-31', ref: 'P5-3', needs: 'admin', name: 'API 密钥：明文只在创建时返回一次，列表不含明文/哈希，吊销后立即失效',
    run: async ({ http, adminToken }) => {
      const h = bearer(adminToken);
      const created = await http('POST', '/api/admin/api-keys', { headers: h, body: { name: REGRESSION_KEY_NAME, scopes: ['stats'] } });
      const data = created.json && created.json.data;
      const key = data && (data.key || (data.apiKey && data.apiKey.key));
      const id = data && ((data.record && data.record.id) || data.id);
      if (!key || !/^ov6_/.test(key) || id === undefined) return fail(`创建接口的返回不符合预期：${created.status} ${created.text.slice(0, 100)}`);
      const bad = [];
      try {
        const listed = await http('GET', '/api/admin/api-keys', { headers: h });
        if (listed.text.includes(key)) bad.push('列表里出现了密钥明文');
        if (/key_hash|"hash"|[0-9a-f]{64}/i.test(listed.text)) bad.push('列表里出现了密钥哈希');
        const used = await http('GET', '/api/open/v1/stats/global', { headers: { 'X-API-Key': key } });
        if (used.status !== 200) bad.push(`新密钥调用开放 API 得到 ${used.status}`);
        const scoped = await http('GET', '/api/open/v1/addresses', { headers: { 'X-API-Key': key } });
        if (scoped.status !== 403) bad.push(`未授予 addresses 权限的密钥读取完整地址得到 ${scoped.status}（期望 403）`);
      } finally {
        await http('DELETE', `/api/admin/api-keys/${id}`, { headers: h });
      }
      const afterRevoke = await http('GET', '/api/open/v1/stats/global', { headers: { 'X-API-Key': key } });
      if (afterRevoke.status !== 401) bad.push(`吊销后仍可使用（${afterRevoke.status}）`);
      return bad.length ? fail(bad.join('；')) : pass('创建 → 使用 → 权限范围 → 吊销 全部符合预期');
    }
  },
  {
    id: 'SR-32', ref: 'P0-2', needs: 'admin', name: '用户列表与审计日志不含密码哈希、令牌或 API 密钥明文',
    run: async ({ http, adminToken }) => {
      const h = bearer(adminToken);
      const bad = [];
      for (const path of ['/api/admin/users', '/api/admin/audit-logs?pageSize=200']) {
        const res = await http('GET', path, { headers: h });
        if (res.status !== 200) { bad.push(`${path} → ${res.status}`); continue; }
        if (/\$2[aby]\$|password_hash/i.test(res.text)) bad.push(`${path} 含密码哈希`);
        if (/ov6_[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{10,}\./.test(res.text)) bad.push(`${path} 含令牌或密钥明文`);
      }
      return bad.length ? fail(bad.join('；')) : pass('未发现敏感内容');
    }
  }
];

const runChecks = async (opts, http) => {
  const ctx = { http, userToken: opts.userToken, adminToken: opts.adminToken, otherUserId: opts.otherUserId };
  const results = [];
  for (const check of buildChecks(opts)) {
    const base = { id: check.id, ref: check.ref, name: check.name };
    if (check.optIn && !opts[check.optIn]) { results.push({ ...base, status: 'skip', detail: `未加 ${check.optInFlag}` }); continue; }
    if (check.needs === 'user' && !opts.userToken) { results.push({ ...base, status: 'skip', detail: '未提供 --user-token' }); continue; }
    if (check.needs === 'admin' && !opts.adminToken) { results.push({ ...base, status: 'skip', detail: '未提供 --admin-token' }); continue; }
    try {
      results.push({ ...base, ...(await check.run(ctx)) });
    } catch (err) {
      results.push({ ...base, status: 'fail', detail: `检查本身出错：${err.message}` });
    }
  }
  return results;
};

const summarize = (results, strict) => {
  const count = (s) => results.filter((r) => r.status === s).length;
  const failed = count('fail') + (strict ? count('warn') : 0);
  return { pass: count('pass'), fail: count('fail'), warn: count('warn'), skip: count('skip'), exitCode: failed > 0 ? 1 : 0 };
};

const LABEL = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' };

const main = async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误：${err.message}`);
    process.exit(2);
  }
  const host = new URL(opts.base).hostname;
  if (!isLocalHost(host) && !opts.confirmed) {
    console.error(`目标 ${host} 不是本机。回归会发送恶意构造的请求，只应对你自己的测试环境运行；确认后加 --i-own-this-target。`);
    process.exit(2);
  }
  const http = makeHttp(opts.base);
  try {
    await http('GET', '/api/health');
  } catch (err) {
    console.error(`目标不可达：${opts.base}（${err.message}）`);
    process.exit(2);
  }

  const results = await runChecks(opts, http);
  const summary = summarize(results, opts.strict);
  if (opts.json) {
    console.log(JSON.stringify({ base: opts.base, strict: opts.strict, summary, results }, null, 2));
  } else {
    for (const r of results) console.log(`${LABEL[r.status]}  ${r.id} [${r.ref}] ${r.name}\n        ${r.detail}`);
    console.log(`\n通过 ${summary.pass}，失败 ${summary.fail}，警告 ${summary.warn}，跳过 ${summary.skip}${opts.strict ? '（--strict：警告算失败）' : ''}`);
    if (summary.skip > 0) console.log('提示：跳过的项没有被验证；提供测试账号的令牌可以跑完整套。');
  }
  process.exit(summary.exitCode);
};

if (require.main === module) {
  main();
}

module.exports = { parseArgs, isLocalHost, forgeNoneToken, forgeWrongSecretToken, buildChecks, runChecks, summarize, LEAK_PATTERN };
