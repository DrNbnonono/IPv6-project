const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const { authenticate } = require('../middleware/auth');

// 所有数据库操作路由都需要认证
router.use(authenticate);

// 获取数据库统计信息
router.get('/stats', databaseController.getDatabaseStats);

// 导入IPv6地址
router.post('/import-addresses', databaseController.importAddresses);

// 更新漏洞状态
router.post('/update-vulnerabilities', databaseController.updateVulnerabilities);

// 更新协议支持
router.post('/update-protocol-support', databaseController.updateProtocolSupport);

// 执行高级查询
router.post('/advanced-query', databaseController.advancedQuery);

// 获取国家统计信息
router.get('/country-stats', databaseController.getCountryStats);

// 获取漏洞统计信息
router.get('/vulnerability-stats', databaseController.getVulnerabilityStats);

// 删除地址
router.post('/delete-addresses', databaseController.deleteAddresses);

// 获取漏洞类型
router.get('/vulnerability-types', databaseController.getVulnerabilityTypes);

// 获取协议类型
router.get('/protocol-types', databaseController.getProtocolTypes);

// 新增：获取特定国家的ASN列表
router.get('/countries/:countryId/asns', databaseController.getAsnsByCountry);

// 新增：获取特定ASN的前缀列表
router.get('/asns/:asn/prefixes', databaseController.getPrefixesByAsn);

// 新增：搜索ASN
router.get('/asns/search', databaseController.searchAsns);

// 新增：搜索前缀
router.get('/prefixes/search', databaseController.searchPrefixes);

// 获取地址类型
router.get('/address-types', databaseController.getAddressTypes);

// 更新地址 IID 类型
router.post('/update-iid-types', databaseController.updateIIDTypes);

module.exports = router;