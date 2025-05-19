const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const { authenticate } = require('../middleware/auth');

// 所有数据库操作路由都需要认证
router.use(authenticate);

// 获取数据库统计信息
router.get('/stats', databaseController.getDatabaseStats);


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

// 获取特定国家的ASN列表
router.get('/countries/:countryId/asns', databaseController.getAsnsByCountry);


// 获取地址类型
router.get('/address-types', databaseController.getAddressTypes);

// 更新地址 IID 类型
router.post('/update-iid-types', databaseController.updateIIDTypes);


//---------------国家管理相关的API----------------//

router.post('/countries', databaseController.createCountry);
router.put('/countries/:id', databaseController.updateCountry);
router.delete('/countries/:id', databaseController.deleteCountry);


//---------------ASN管理相关的API----------------//

router.post('/asns', databaseController.createAsn);
router.put('/asns/:id', databaseController.updateAsn);
router.delete('/asns/:id', databaseController.deleteAsn);


//---------------前缀管理相关的API----------------//
router.get('/prefixes', databaseController.getPrefixes);
router.post('/prefixes', databaseController.createPrefix);
router.put('/prefixes/:id', databaseController.updatePrefix);
router.delete('/prefixes/:id', databaseController.deletePrefix);


//---------------搜索相关的API----------------//
router.get('/asns/country/:countryId', databaseController.getAsnsByCountry);//根据国家获取ASN列表
router.get('/countries', databaseController.getCountries);//获取国家列表
router.get('/asns', databaseController.searchAsns);//获取ASN列表
router.get('/asns/all', databaseController.getAllAsns);//获取所有ASN列表
router.get('/prefixes/by-asn/:asn', databaseController.getPrefixesByAsn);
router.get('/asns/search', databaseController.searchAsns);// 搜索ASN
router.get('/prefixes/search', databaseController.searchPrefixes);// 搜索前缀


//---------------漏洞管理相关API----------------//
// 漏洞定义管理 (CRUD for vulnerabilities table)
router.get('/vulnerabilities', databaseController.getVulnerabilities); // 获取所有漏洞定义
router.post('/vulnerabilities', databaseController.createVulnerability); // 添加新漏洞定义
router.put('/vulnerabilities/:id', databaseController.updateVulnerability); // 更新漏洞定义
router.delete('/vulnerabilities/:id', databaseController.deleteVulnerability); // 删除漏洞定义
// 批量更新ASN漏洞受影响地址数
router.post('/asn-vulnerability-stats/batch-update', databaseController.batchUpdateAsnVulnerabilityStats);


//---------------协议管理相关API----------------//
// 协议定义管理 (CRUD for protocols table)
router.get('/protocols', databaseController.getProtocols); // 获取所有协议定义
router.post('/protocols', databaseController.createProtocol); // 添加新协议定义
router.put('/protocols/:id', databaseController.updateProtocol); // 更新协议定义
router.delete('/protocols/:id', databaseController.deleteProtocol); // 删除协议定义
// 批量更新ASN协议受影响地址数
router.post('/asn-protocol-stats/batch-update', databaseController.batchUpdateAsnProtocolStats);


//---------------文件上传相关API已经单独实现----------------//


//---------------地址导入任务相关API----------------//
router.post('/import-tasks', databaseController.createImportTask);
router.get('/import-tasks', databaseController.getImportTasks);
router.get('/import-tasks/:id', databaseController.getImportTaskStatus);
router.delete('/import-tasks/:id', databaseController.cancelImportTask);
router.delete('/import-tasks/:id/delete', databaseController.deleteImportTask);

module.exports = router;