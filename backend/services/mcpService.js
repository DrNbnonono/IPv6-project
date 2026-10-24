/**
 * MCP 服务（P4-8）：把平台的只读能力以 Model Context Protocol 暴露给外部 Agent / 客户端。
 *
 * 设计取舍（与最初"暴露 TOOL_REGISTRY"的设想不同，原因见下）：
 * - 只暴露只读工具，不暴露任何会发起扫描、写库或改配置的工具。平台内部的有副作用工具靠“用户在界面里确认”
 *   这道关卡兜底，而 MCP 调用方没有这一步，把它们开放出去等于绕过确认。
 * - 认证与限流复用开放 API 的密钥（中间件 authenticateApiKey，路由见 routes/mcp.js）；
 *   工具按密钥的权限范围注册：stats → 统计/趋势/前缀/知识检索/探针信息；addresses → 另外多一个读取完整地址的工具。
 *   没有对应权限的工具根本不会出现在 tools/list 里。
 * - 所有工具直接复用 openApiService / statsSnapshotService / knowledgeService，参数校验与 /api/open/v1 完全一致。
 * - 每次工具调用写一条审计（action = mcp.tool，resource = 密钥），参数经脱敏与截断，不记录返回内容。
 *
 * 两种接入方式：
 *   HTTP：POST /api/mcp（无状态 Streamable HTTP），带 API 密钥；
 *   stdio：node scripts/mcpStdio.js（本机 Claude Desktop 等客户端），权限范围由 MCP_STDIO_SCOPES 指定，默认只有 stats。
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const open = require('./openApiService');
const knowledge = require('./knowledgeService');
const optOut = require('./optOutService');
const auditService = require('./auditService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('mcp');

const SERVER_NAME = 'observ6';
const SERVER_VERSION = '1.0.0';
// 单次返回的地址数上限：比 REST 接口（1000）更小，避免一次塞满模型上下文
const MAX_ADDRESSES_PER_CALL = 200;
const MAX_KNOWLEDGE_TOP_K = 8;
const MAX_TEXT = 60000;

const INSTRUCTIONS = [
  'ObserV6 是一个 IPv6 网络测量平台，这个服务提供只读的统计查询。',
  '数据来自平台数据库的汇总计数与每日快照，不是实时扫描结果；"addresses" 指已发现的活跃 IPv6 地址数。',
  '所有工具都是只读的，不能发起扫描或修改任何数据。',
  '先用 get_global_stats 了解规模，再用 list_countries / get_country / get_asn 下钻；查概念和用法用 search_knowledge。'
].join('\n');

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const clipText = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…（输出过长已截断，请缩小范围或翻页）` : text);
const textResult = (data) => ({ content: [{ type: 'text', text: clipText(JSON.stringify(data)) }] });
const errorResult = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

const intArg = (description) => z.number().int().describe(description);

/**
 * 工具定义。scope 为所需权限；handler 返回可 JSON 序列化的数据，业务错误抛 OpenApiError。
 * 输入的范围检查交给 openApiService（与 REST 接口同一套），这里的 zod 只描述类型。
 */
const TOOLS = [
  {
    name: 'get_global_stats',
    title: '全球概览',
    scope: 'stats',
    description: '全球规模：国家数、ASN 数、IPv6 前缀数、活跃地址数，以及数据更新时间。',
    inputSchema: {},
    handler: () => open.globalStats()
  },
  {
    name: 'list_countries',
    title: '国家排行',
    scope: 'stats',
    description: '按活跃地址数或前缀数排序的国家列表。',
    inputSchema: {
      limit: intArg('返回条数，1–300，默认 50').optional(),
      sort: z.enum(['addresses', 'prefixes']).describe('排序依据，默认 addresses').optional()
    },
    handler: (args) => open.listCountries(args)
  },
  {
    name: 'get_country',
    title: '国家详情',
    scope: 'stats',
    description: '某个国家的前缀数、活跃地址数，以及活跃地址最多的前 10 个 ASN。',
    inputSchema: { code: z.string().describe('两位国家代码，如 CN').max(8) },
    handler: (args) => open.getCountry(args.code)
  },
  {
    name: 'get_asn',
    title: 'ASN 详情',
    scope: 'stats',
    description: '某个 ASN 的名称、所在国家、前缀数与活跃地址数。',
    inputSchema: { asn: z.union([z.number().int(), z.string().max(16)]).describe('AS 号，如 4134 或 "AS4134"') },
    handler: (args) => open.getAsn(args.asn)
  },
  {
    name: 'get_trends',
    title: '历史趋势',
    scope: 'stats',
    description: '每日快照形成的趋势：前缀数与活跃地址数随时间的变化，可看全球、某国家或某 ASN。',
    inputSchema: {
      scope: z.enum(['global', 'country', 'asn']).describe('范围，默认 global').optional(),
      id: z.union([z.string().max(16), z.number().int()]).describe('scope 为 country 时是国家代码，为 asn 时是 AS 号').optional(),
      days: intArg('向前看多少天，默认 30').optional()
    },
    handler: (args) => open.trends(args)
  },
  {
    name: 'list_prefixes',
    title: 'IPv6 前缀列表',
    scope: 'stats',
    description: '分页列出 IPv6 前缀（含所属 ASN、国家、注册机构、活跃地址数），可按 ASN 或国家过滤。',
    inputSchema: {
      asn: z.union([z.number().int(), z.string().max(16)]).describe('按 AS 号过滤').optional(),
      country: z.string().max(8).describe('按国家代码过滤').optional(),
      page: intArg('页码，从 1 开始').optional(),
      pageSize: intArg('每页条数，1–200，默认 50').optional()
    },
    handler: (args) => open.listPrefixes(args)
  },
  {
    name: 'list_addresses',
    title: '前缀下的活跃地址',
    scope: 'addresses',
    description: `读取某个前缀下已发现的完整活跃地址（含 IID 类型），用 nextAfter 游标翻页。每次最多 ${MAX_ADDRESSES_PER_CALL} 条；prefixId 来自 list_prefixes。`,
    inputSchema: {
      prefixId: intArg('前缀 ID，来自 list_prefixes'),
      limit: z.number().int().min(1).max(MAX_ADDRESSES_PER_CALL).describe(`返回条数，1–${MAX_ADDRESSES_PER_CALL}，默认 100`).optional(),
      after: intArg('上一页返回的 nextAfter；首页不填').optional()
    },
    handler: (args) => open.listAddresses({ ...args, limit: args.limit === undefined ? 100 : args.limit })
  },
  {
    name: 'search_knowledge',
    title: '知识库检索',
    scope: 'stats',
    description: '在平台知识库（IPv6 基础、扫描与合规、API 用法等文档）里全文检索，返回相关片段与出处。查询至少两个字符。',
    inputSchema: {
      query: z.string().min(2).max(200).describe('检索词或问题'),
      topK: z.number().int().min(1).max(MAX_KNOWLEDGE_TOP_K).describe(`返回片段数，默认 5，最多 ${MAX_KNOWLEDGE_TOP_K}`).optional()
    },
    handler: async (args) => {
      const found = await knowledge.searchKnowledge(args.query, args.topK || 5);
      if (!found.available) throw new open.OpenApiError('知识库尚未启用（需要先执行迁移 14 并建立索引）', 503);
      return {
        results: found.results.map((r) => ({ source: r.source, title: r.title, content: r.content, score: Number(r.score.toFixed(3)) }))
      };
    }
  },
  {
    name: 'get_probe_info',
    title: '探针说明',
    scope: 'stats',
    description: '平台运营方公开的探测说明：运营单位、探测来源地址、联系邮箱，以及网络运营者如何提交退出请求。',
    inputSchema: {},
    handler: () => {
      const info = optOut.publicInfo();
      return { ...info, optOutPage: '/about-scanning', optOutEndpoint: 'POST /api/opt-out' };
    }
  }
];

/** 工具名 → 所需权限，供文档与测试使用。 */
const toolScopes = () => Object.fromEntries(TOOLS.map((t) => [t.name, t.scope]));

const toolsForScopes = (scopes) => TOOLS.filter((tool) => scopes.includes(tool.scope));

/** 审计一次工具调用：参数脱敏截断由 auditService 完成，不记录返回内容。 */
const auditCall = (key, tool, args, success) =>
  auditService.record({
    userId: null,
    action: 'mcp.tool',
    resourceType: 'api_key',
    resourceId: String(key.id),
    success,
    detail: { tool, key: key.name, args },
    ip: key.ip || null
  });

/**
 * 为一把密钥创建 MCP server。key = { id, name, scopes, ip? }。
 * HTTP 入口是无状态的：每个请求创建一个 server + transport，用完即弃。
 */
const createMcpServer = (key) => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  for (const tool of toolsForScopes(key.scopes || [])) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { ...readOnly, title: tool.title } },
      async (args) => {
        const input = args || {};
        try {
          const data = await tool.handler(input);
          await auditCall(key, tool.name, input, true);
          return textResult(data);
        } catch (error) {
          await auditCall(key, tool.name, input, false);
          if (error instanceof open.OpenApiError) return errorResult(error.message);
          logger.error(`MCP 工具 ${tool.name} 执行失败:`, error.message);
          return errorResult('服务暂时不可用');
        }
      }
    );
  }
  return server;
};

module.exports = {
  SERVER_NAME,
  SERVER_VERSION,
  INSTRUCTIONS,
  MAX_ADDRESSES_PER_CALL,
  TOOLS,
  toolScopes,
  toolsForScopes,
  createMcpServer
};
