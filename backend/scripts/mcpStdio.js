#!/usr/bin/env node
/**
 * 本机 MCP 入口（stdio）：供 Claude Desktop 等本地客户端启动，直接读取本机配置的数据库。
 *
 *   node scripts/mcpStdio.js
 *
 * 客户端配置示例（claude_desktop_config.json）：
 *   { "mcpServers": { "observ6": { "command": "node", "args": ["/path/to/backend/scripts/mcpStdio.js"] } } }
 *
 * 权限范围由环境变量 MCP_STDIO_SCOPES 决定（逗号分隔，默认 stats）；要让客户端读取完整地址需显式设为 stats,addresses。
 * stdout 是协议通道，所有日志都写 stderr。数据库配置读取 .env（与后端相同）。
 * 只读：和 HTTP 入口是同一套工具，不能发起扫描或修改数据。
 */

process.env.LOG_TO_STDERR = '1';

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SCOPES } = require('../services/apiKeyService');
const { createMcpServer } = require('../services/mcpService');

/** 解析 MCP_STDIO_SCOPES；非法值直接报错退出，而不是悄悄降级或放大权限。 */
const parseScopes = (value) => {
  const list = String(value === undefined || value === '' ? 'stats' : value).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((s) => !SCOPES.includes(s));
  if (list.length === 0 || bad.length > 0) {
    throw new Error(`MCP_STDIO_SCOPES 无效${bad.length ? `：${bad.join(', ')}` : ''}（可选：${SCOPES.join(', ')}）`);
  }
  return [...new Set(list)];
};

const main = async () => {
  let scopes;
  try {
    scopes = parseScopes(process.env.MCP_STDIO_SCOPES);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  const server = createMcpServer({ id: 'stdio', name: 'stdio', scopes });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`ObserV6 MCP（stdio）已启动，权限范围: ${scopes.join(', ')}\n`);
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`启动失败: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseScopes };
