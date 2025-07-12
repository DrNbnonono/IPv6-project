const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { authenticate } = require('../middleware/auth');

// 公共路由（无需认证）
router.get('/map-data', addressController.getMapData);
router.get('/countries/ranking', addressController.getCountryRanking);
router.get('/asns/ranking', addressController.getAsnRanking);
router.get('/countries/:countryId', addressController.getCountryDetail);
router.get('/asns/:asn', addressController.getAsnDetail);
router.get('/prefixes/search', addressController.searchPrefix);
router.get('/prefixes/:prefixId', addressController.getPrefixDetail);
router.get('/search', addressController.searchIPv6);
// 需要认证的路由
router.get('/addresses/:addressId', authenticate, addressController.getAddressDetail);

// 通用搜索
router.get('/search', addressController.searchIPv6);

// 获取全球统计
router.get('/global-stats', addressController.getGlobalStats);
router.get('/addresses/global-stats', addressController.getGlobalStats);

//协议组件相关路由
router.get('/protocols', addressController.getProtocols);
router.get('/protocols/:protocolId', addressController.getProtocolDetail);
router.get('/protocols/:protocolId/asns', addressController.getProtocolAsns);
router.get('/protocols/:protocolId/regions', addressController.getProtocolRegions);
router.get('/asns/:asn/protocols/:protocolId', addressController.getAsnProtocolDetail);
router.get('/protocols/:protocolId/countries', addressController.getProtocolCountries);
router.get('/countries/:countryId/protocols/:protocolId', addressController.getCountryProtocolDetail);

//漏洞组件相关路由
router.get('/vulnerabilities', addressController.getVulnerabilities);
router.get('/vulnerabilities/:vulnerabilityId', addressController.getVulnerabilityDetail);
router.get('/vulnerabilities/:vulnerabilityId/asns', addressController.getVulnerabilityAsns);
router.get('/vulnerabilities/:vulnerabilityId/regions', addressController.getVulnerabilityRegions);
router.get('/asns/:asn/vulnerabilities/:vulnerabilityId', addressController.getAsnVulnerabilityDetail);
router.get('/vulnerabilities/:vulnerabilityId/countries', addressController.getVulnerabilityCountries);
router.get('/countries/:countryId/vulnerabilities/:vulnerabilityId', addressController.getCountryVulnerabilityDetail);
module.exports = router;