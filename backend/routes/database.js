const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const enrichController = require('../controllers/enrichController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { auditWrites } = require('../middleware/audit');

// 所有数据库操作路由都需要认证；写操作额外需要管理员权限（后端强制，不依赖前端 adminOnly）
router.use(authenticate);

// 纯计算、不写库：放在审计中间件之前，避免记成 db.write
router.post('/classify-iid', enrichController.classifyIid);
// 只会为当前用户生成自己的输入文件（不写共享数据）
router.post('/filter-iid', enrichController.filterIid);

// 写操作与 advanced-query 记入审计日志
router.use(auditWrites('db'));

// 获取数据库统计信息
router.get('/stats', databaseController.getDatabaseStats);


// 执行高级查询
router.post('/advanced-query', databaseController.advancedQuery);

// 获取国家统计信息
router.get('/country-stats', databaseController.getCountryStats);

// 获取漏洞统计信息
router.get('/vulnerability-stats', databaseController.getVulnerabilityStats);

// 删除地址
router.post('/delete-addresses', requireAdmin, databaseController.deleteAddresses);

// 获取漏洞类型
router.get('/vulnerability-types', databaseController.getVulnerabilityTypes);

// 获取协议类型
router.get('/protocol-types', databaseController.getProtocolTypes);

// 获取特定国家的ASN列表
router.get('/countries/:countryId/asns', databaseController.getAsnsByCountry);


// 获取地址类型
router.get('/address-types', databaseController.getAddressTypes);

// 更新地址 IID 类型
router.post('/update-iid-types', requireAdmin, databaseController.updateIIDTypes);

// IID 分类与来源补全（后台任务；写共享的 active_addresses，因此都需要管理员）
router.post('/enrich-iid', requireAdmin, enrichController.createEnrichTask);
router.get('/enrich-iid/tasks', requireAdmin, enrichController.getEnrichTasks);
router.get('/enrich-iid/task/:taskId', requireAdmin, enrichController.getEnrichTaskDetails);
router.post('/enrich-iid/cancel/:taskId', requireAdmin, enrichController.cancelEnrichTask);


//---------------国家管理相关的API----------------//

router.post('/countries', requireAdmin, databaseController.createCountry);
router.put('/countries/:id', requireAdmin, databaseController.updateCountry);
router.delete('/countries/:id', requireAdmin, databaseController.deleteCountry);


//---------------ASN管理相关的API----------------//

router.post('/asns', requireAdmin, databaseController.createAsn);
router.put('/asns/:id', requireAdmin, databaseController.updateAsn);
router.delete('/asns/:id', requireAdmin, databaseController.deleteAsn);


//---------------前缀管理相关的API----------------//
router.get('/prefixes', databaseController.getPrefixes);
router.post('/prefixes', requireAdmin, databaseController.createPrefix);
router.put('/prefixes/:id', requireAdmin, databaseController.updatePrefix);
router.delete('/prefixes/:id', requireAdmin, databaseController.deletePrefix);


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
router.post('/vulnerabilities', requireAdmin, databaseController.createVulnerability); // 添加新漏洞定义
router.put('/vulnerabilities/:id', requireAdmin, databaseController.updateVulnerability); // 更新漏洞定义
router.delete('/vulnerabilities/:id', requireAdmin, databaseController.deleteVulnerability); // 删除漏洞定义
// 批量更新ASN漏洞受影响地址数
router.post('/asn-vulnerability-stats/batch-update', requireAdmin, databaseController.batchUpdateAsnVulnerabilityStats);


//---------------协议管理相关API----------------//
// 协议定义管理 (CRUD for protocols table)
router.get('/protocols', databaseController.getProtocols); // 获取所有协议定义
router.post('/protocols', requireAdmin, databaseController.createProtocol); // 添加新协议定义
router.put('/protocols/:id', requireAdmin, databaseController.updateProtocol); // 更新协议定义
router.delete('/protocols/:id', requireAdmin, databaseController.deleteProtocol); // 删除协议定义
// 批量更新ASN协议受影响地址数
router.post('/asn-protocol-stats/batch-update', requireAdmin, databaseController.batchUpdateAsnProtocolStats);


//---------------文件上传相关API已经单独实现----------------//


//---------------地址导入任务相关API----------------//
router.post('/import-tasks', requireAdmin, databaseController.createImportTask);
router.get('/import-tasks', requireAdmin, databaseController.getImportTasks);
router.get('/import-tasks/:id', requireAdmin, databaseController.getImportTaskStatus);
router.delete('/import-tasks/:id', requireAdmin, databaseController.cancelImportTask);
router.delete('/import-tasks/:id/delete', requireAdmin, databaseController.deleteImportTask);

module.exports = router;