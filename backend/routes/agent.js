/**
 * Agent路由
 */

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticate } = require('../middleware/auth');

// 公开路由（获取状态和欢迎消息）
router.get('/status', agentController.getStatus);
router.get('/welcome', agentController.getWelcome);

// 需要认证的路由
router.post('/chat', authenticate, agentController.chat);
router.get('/tools', authenticate, agentController.getTools);
router.post('/tools/execute', authenticate, agentController.executeTool);
router.post('/workflow/generate', authenticate, agentController.generateWorkflow);

// 记忆管理路由
router.get('/memory/summary', authenticate, agentController.getMemorySummary);
router.get('/memory/preferences', authenticate, agentController.getPreferences);
router.post('/memory/preferences', authenticate, agentController.savePreferences);
router.delete('/memory', authenticate, agentController.clearMemory);

// 终端管理路由
router.get('/terminals', authenticate, agentController.getAllTerminals);
router.get('/terminal/allowed-commands', authenticate, agentController.getAllowedCommands);
router.post('/terminal', authenticate, agentController.createTerminal);
router.get('/terminal/:id', authenticate, agentController.getTerminal);
router.delete('/terminal/:id', authenticate, agentController.closeTerminal);
router.get('/terminal/:id/history', authenticate, agentController.getTerminalHistory);
router.post('/terminal/execute', authenticate, agentController.executeCommand);

module.exports = router;
