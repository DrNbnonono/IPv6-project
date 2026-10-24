/**
 * 目标生成路由（/api/tga）。任务接口形状与 /api/xmap 一致。
 */

const express = require('express');
const router = express.Router();
const tgaController = require('../controllers/tgaController');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

router.use(authenticate);

router.get('/algorithms', tgaController.getAlgorithms);

router.post('/', audit('task.create', {
  resourceType: 'tga_task',
  resourceId: (req, res, body) => body && body.taskId,
  detail: (req, res, body) => ({
    algorithm: req.body && req.body.algorithm,
    budget: req.body && req.body.budget,
    seedFile: req.body && req.body.seedFile,
    seedPrefix: req.body && req.body.seedPrefix,
    seedAsn: req.body && req.body.seedAsn,
    reason: body && body.success === false ? body.message : undefined
  })
}), tgaController.createTgaTask);
router.post('/cancel/:taskId', audit('task.cancel', { resourceType: 'tga_task', resourceId: (req) => req.params.taskId }), tgaController.cancelTgaTask);
router.get('/tasks', tgaController.getTgaTasks);
router.get('/task/:taskId', tgaController.getTgaTaskDetails);
router.get('/result/:taskId', tgaController.getTgaResult);
router.delete('/:taskId', audit('task.delete', { resourceType: 'tga_task', resourceId: (req) => req.params.taskId }), tgaController.deleteTgaTask);

module.exports = router;
