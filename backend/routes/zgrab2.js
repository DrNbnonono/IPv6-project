const express = require('express');
const router = express.Router();
const zgrab2Controller = require('../controllers/zgrab2Controller');
const authMiddleware = require('../middleware/auth');

// 创建zgrab2任务
router.post('/', authMiddleware, zgrab2Controller.createTask);

// 获取zgrab2任务列表
router.get('/', authMiddleware, zgrab2Controller.getTasks);

// 获取任务详情
router.get('/:taskId', authMiddleware, zgrab2Controller.getTaskDetails);

module.exports = router;