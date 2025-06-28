const express = require('express');
const router = express.Router();
const zgrab2Controller = require('../controllers/zgrab2Controller');
const { authenticate } = require('../middleware/auth');

// 创建zgrab2任务
router.post('/', authenticate, zgrab2Controller.createTask);

// 获取zgrab2任务列表
router.get('/', authenticate, zgrab2Controller.getTasks);

// 获取任务详情
router.get('/:taskId', authenticate, zgrab2Controller.getTaskDetails);

// 删除任务
router.delete('/:taskId', authenticate, zgrab2Controller.deleteTask);

// 下载结果文件
router.get('/:taskId/result', authenticate, zgrab2Controller.downloadResult);

// 下载日志文件
router.get('/:taskId/log', authenticate, zgrab2Controller.downloadLog);

// 获取支持的模块列表
router.get('/supported-modules', authenticate, zgrab2Controller.getSupportedModules);

// 获取任务状态
router.get('/:taskId/status', authenticate, zgrab2Controller.getTaskStatus);

// 获取任务进度
router.get('/:taskId/progress', authenticate, zgrab2Controller.getTaskProgress);

module.exports = router;