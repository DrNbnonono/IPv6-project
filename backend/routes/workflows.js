const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');
const { authenticate } = require('../middleware/auth');

// 公开访问的路由（不需要认证）
router.get('/node-types', workflowController.getNodeTypes);         // 获取支持的节点类型
router.get('/templates', workflowController.getWorkflowTemplates);  // 获取工作流模板

// 所有其他路由都需要认证
router.use(authenticate);

// 工作流管理
router.get('/', workflowController.getWorkflows);                    // 获取工作流列表
router.post('/', workflowController.createWorkflow);                 // 创建工作流
router.get('/:id', workflowController.getWorkflowById);             // 获取工作流详情
router.put('/:id', workflowController.updateWorkflow);              // 更新工作流
router.delete('/:id', workflowController.deleteWorkflow);           // 删除工作流

// 工作流执行
router.post('/:id/execute', workflowController.executeWorkflow);    // 执行工作流
router.get('/:id/executions', workflowController.getExecutions);    // 获取执行历史
router.get('/executions/:executionId', workflowController.getExecutionDetails); // 获取执行详情
router.post('/executions/:executionId/cancel', workflowController.cancelExecution); // 取消执行
router.post('/executions/:executionId/pause', workflowController.pauseExecution);   // 暂停执行
router.post('/executions/:executionId/resume', workflowController.resumeExecution); // 恢复执行

module.exports = router;
