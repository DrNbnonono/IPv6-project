const express = require('express');
const xmapController = require('../controllers/xmapController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 创建新扫描任务
router.post('/', xmapController.scan);

// 终止任务
router.post('/cancel/:taskId', xmapController.cancelTask);

// 删除任务
router.delete('/:taskId', xmapController.deleteTask);

// 获取任务详情
router.get('/task/:taskId', xmapController.getTaskDetails);

// 获取任务列表（可选status查询参数）
router.get('/tasks', xmapController.getTasks);

// 获取任务结果
router.get('/result/:taskId', xmapController.getResult);

module.exports = router;