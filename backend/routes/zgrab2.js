const express = require('express');
const router = express.Router();
const zgrab2Controller = require('../controllers/zgrab2Controller');
const presetController = require('../controllers/scanPresetController');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

// 获取支持的模块列表 (需要放在动态路由之前)
router.get('/modules', authenticate, zgrab2Controller.getSupportedModules);

// 扫描预设（模块 + 端口的套件）；套用时生成多模块 INI 配置文件
router.get('/presets', authenticate, presetController.listPresets);
router.post('/presets', authenticate, audit('preset.create', {
  resourceType: 'scan_preset',
  resourceId: (req, res, body) => body && body.data && body.data.id,
  detail: (req) => ({ name: req.body && req.body.name })
}), presetController.createPreset);
router.delete('/presets/:id', authenticate, audit('preset.delete', { resourceType: 'scan_preset', resourceId: (req) => req.params.id }), presetController.deletePreset);
router.post('/presets/:id/apply', authenticate, audit('preset.apply', { resourceType: 'scan_preset', resourceId: (req) => req.params.id }), presetController.applyPreset);

// 文件管理功能已移至统一的 /files 接口
// 配置文件和输入文件上传: POST /files/upload
// 获取文件列表: GET /files?toolType=zgrab2
// 删除文件: DELETE /files/:id
// 获取文件内容: GET /files/:id/content

// 创建zgrab2任务
router.post('/', authenticate, audit('task.create', {
  resourceType: 'zgrab2_task',
  resourceId: (req, res, body) => body && body.taskId,
  detail: (req, res, body) => ({
    module: req.body && req.body.module,
    inputFile: req.body && req.body.inputFile,
    reason: body && body.success === false ? body.message : undefined
  })
}), zgrab2Controller.createTask);

// 取消任务
router.post('/cancel/:taskId', authenticate, audit('task.cancel', { resourceType: 'zgrab2_task', resourceId: (req) => req.params.taskId }), zgrab2Controller.cancelTask);

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
router.delete('/:taskId', authenticate, audit('task.delete', { resourceType: 'zgrab2_task', resourceId: (req) => req.params.taskId }), zgrab2Controller.deleteTask);

module.exports = router;