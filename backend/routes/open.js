/**
 * 开放只读 API（/api/open/v1）：API 密钥鉴权 + 按密钥限流，只有 GET。
 * 文档见 backend/knowledge/platform/open-api.md（同时是 Agent 知识库的一部分）。
 */

const express = require('express');
const openController = require('../controllers/openController');
const { authenticateApiKey, requireScope } = require('../middleware/apiKey');

const router = express.Router();

router.use(authenticateApiKey);

router.get('/', openController.index);
router.get('/stats/global', requireScope('stats'), openController.globalStats);
router.get('/stats/countries', requireScope('stats'), openController.listCountries);
router.get('/stats/countries/:code', requireScope('stats'), openController.getCountry);
router.get('/stats/asns/:asn', requireScope('stats'), openController.getAsn);
router.get('/trends', requireScope('stats'), openController.trends);
router.get('/prefixes', requireScope('stats'), openController.listPrefixes);
router.get('/addresses', requireScope('addresses'), openController.listAddresses);

module.exports = router;
