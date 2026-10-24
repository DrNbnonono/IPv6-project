/**
 * 开放只读 API（/api/open/v1）：业务在 services/openApiService.js，这里只做响应格式和错误映射。
 * 响应统一为 { success, data }；错误为 { success:false, message }。
 */

const open = require('../services/openApiService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('open-api');

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof open.OpenApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    logger.error(`开放 API 请求失败 ${req.method} ${req.path}:`, error.message);
    return res.status(500).json({ success: false, message: '服务暂时不可用' });
  }
};

exports.index = handle(async (req) => ({
  version: 'v1',
  key: { name: req.apiKey.name, scopes: req.apiKey.scopes },
  endpoints: [
    'GET /stats/global',
    'GET /stats/countries?limit=&sort=addresses|prefixes',
    'GET /stats/countries/:code',
    'GET /stats/asns/:asn',
    'GET /trends?scope=global|country|asn&id=&days=',
    'GET /prefixes?asn=&country=&page=&pageSize=',
    'GET /addresses?prefixId=&limit=&after=   （需要 addresses 权限）'
  ]
}));
exports.globalStats = handle(() => open.globalStats());
exports.listCountries = handle((req) => open.listCountries(req.query));
exports.getCountry = handle((req) => open.getCountry(req.params.code));
exports.getAsn = handle((req) => open.getAsn(req.params.asn));
exports.trends = handle((req) => open.trends(req.query));
exports.listPrefixes = handle((req) => open.listPrefixes(req.query));
exports.listAddresses = handle((req) => open.listAddresses(req.query));
