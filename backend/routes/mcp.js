/**
 * MCP 入口（/api/mcp，P4-8）：无状态 Streamable HTTP，API 密钥鉴权 + 按密钥限流（与开放 API 共用计数）。
 * 只接受 POST（JSON-RPC）；GET（服务端推送流）与 DELETE（结束会话）对无状态服务没有意义，返回 405。
 * 每个请求创建独立的 server 与 transport，请求结束即关闭，不保留会话状态。
 * 客户端配置与工具清单见 backend/knowledge/platform/mcp.md。
 */

const express = require('express');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { authenticateApiKey } = require('../middleware/apiKey');
const { createMcpServer } = require('../services/mcpService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('mcp');

const router = express.Router();

router.use(authenticateApiKey);

const rpcError = (res, status, code, message) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });

router.post('/', async (req, res) => {
  const server = createMcpServer({ ...req.apiKey, ip: req.ip });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error('处理 MCP 请求失败:', error.message);
    if (!res.headersSent) rpcError(res, 500, -32603, '服务暂时不可用');
  }
});

const notAllowed = (req, res) => {
  res.setHeader('Allow', 'POST');
  rpcError(res, 405, -32000, '该 MCP 服务是无状态的，只接受 POST');
};
router.get('/', notAllowed);
router.delete('/', notAllowed);

module.exports = router;
