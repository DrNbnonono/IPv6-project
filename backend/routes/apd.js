/**
 * 别名前缀检测路由（/api/apd）。任务接口形状与 /api/xmap 一致。
 */

const express = require('express');
const router = express.Router();
const apdController = require('../controllers/apdController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

router.use(authenticate);

router.post('/', audit('task.create', {
  resourceType: 'apd_task',
  resourceId: (req, res, body) => body && body.taskId,
  detail: (req, res, body) => ({
    prefixCount: body && body.prefixCount,
    addressFile: req.body && req.body.addressFile,
    rate: req.body && req.body.rate,
    reason: body && body.success === false ? body.message : undefined
  })
}), apdController.createApdTask);
router.post('/cancel/:taskId', audit('task.cancel', { resourceType: 'apd_task', resourceId: (req) => req.params.taskId }), apdController.cancelApdTask);
router.get('/tasks', apdController.getApdTasks);
router.get('/task/:taskId', apdController.getApdTaskDetails);
router.get('/result/:taskId', apdController.getApdResult);

router.get('/aliased', apdController.getAliasedPrefixes);
router.delete('/aliased/:id', requireAdmin, apdController.removeAliasedPrefix);
router.post('/filter', audit('apd.filter', {
  resourceType: 'apd',
  detail: (req, res, body) => ({
    addressFile: req.body && req.body.addressFile,
    save: Boolean(req.body && req.body.save),
    total: body && body.data && body.data.total,
    removed: body && body.data && body.data.removed
  })
}), apdController.filterAddresses);

router.delete('/:taskId', audit('task.delete', { resourceType: 'apd_task', resourceId: (req) => req.params.taskId }), apdController.deleteApdTask);

module.exports = router;
