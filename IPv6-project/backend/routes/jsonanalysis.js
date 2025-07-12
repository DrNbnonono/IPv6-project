const express = require('express');
const router = express.Router();
const jsonanalysisController = require('../controllers/jsonanalysisController');
const { authenticate } = require('../middleware/auth');

// 所有路由都需要认证
router.use(authenticate);

// 解析JSON文件
router.get('/parse/:fileId', jsonanalysisController.parseJsonFile);

// 解析JSON文本
router.post('/parse-text', jsonanalysisController.parseJsonText);

// 获取会话数据
router.get('/session/:sessionId', jsonanalysisController.getSessionData);

// 基于会话的字段提取
router.post('/extract-fields-session', jsonanalysisController.extractFieldsFromSession);

// 基于会话的搜索过滤
router.post('/search-filter-session', jsonanalysisController.searchFilterFromSession);

// 通用数据过滤
router.post('/filter-session', jsonanalysisController.filterFromSession);

// 专门针对zgrab2结果的提取
router.post('/extract-zgrab2', jsonanalysisController.extractZgrab2Results);

// 专门针对xmap结果的提取
router.post('/extract-xmap', jsonanalysisController.extractXmapResults);

// 提取字段（兼容旧版本）
router.post('/extract-fields', jsonanalysisController.extractFields);

// 搜索和过滤（兼容旧版本）
router.post('/search-filter', jsonanalysisController.searchAndFilter);

// 保存处理后的JSON文件
router.post('/save', jsonanalysisController.saveProcessedJson);

module.exports = router;