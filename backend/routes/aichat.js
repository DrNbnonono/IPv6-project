/**
 * AI Chat Routes
 * Detection页面和Tools页面的AI问答路由
 */

const express = require('express');
const router = express.Router();
const aichatController = require('../controllers/aichatController');

// Detection页面AI - IPv6数据分析专家
router.post('/detection/chat', aichatController.detectionChat);

// Tools页面AI - 探测助手（预留，暂未实现）
router.post('/tools/chat', aichatController.toolsChat);

// AI服务状态
router.get('/status', aichatController.getStatus);

module.exports = router;
