const express = require('express');
const router = express.Router();
const zgrab2Controller = require('../controllers/zgrab2Controller');
const { authenticate } = require('../middleware/auth');

// 获取支持的模块列表 (需要放在动态路由之前)
router.get('/modules', authenticate, zgrab2Controller.getSupportedModules);

// 文件管理功能已移至统一的 /files 接口
// 配置文件和输入文件上传: POST /files/upload
// 获取文件列表: GET /files?toolType=zgrab2
// 删除文件: DELETE /files/:id
// 获取文件内容: GET /files/:id/content

// 创建zgrab2任务
router.post('/', authenticate, zgrab2Controller.createTask);

// 取消任务
router.post('/cancel/:taskId', authenticate, zgrab2Controller.cancelTask);

// 获取zgrab2任务列表
router.get('/tasks', authenticate, zgrab2Controller.getTasks);

// 获取任务详情
router.get('/task/:taskId', authenticate, zgrab2Controller.getTaskDetails);

// 获取任务状态
router.get('/task/:taskId/status', authenticate, zgrab2Controller.getTaskStatus);

// 获取任务进度
router.get('/task/:taskId/progress', authenticate, zgrab2Controller.getTaskProgress);

// 下载结果文件
router.get('/result/:taskId', authenticate, zgrab2Controller.downloadResult);

// 下载日志文件
router.get('/log/:taskId', authenticate, zgrab2Controller.downloadLog);

// 删除任务
router.delete('/:taskId', authenticate, zgrab2Controller.deleteTask);

module.exports = router;