const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticate } = require('../middleware/auth');

// 所有文件操作路由都需要认证
router.use(authenticate);

// 文件上传
router.post('/upload', fileController.uploadFile);

// 获取文件列表
router.get('/', fileController.getFiles);

// 删除文件
router.delete('/:id', fileController.deleteFile);

// 下载文件
router.get('/:id/download', fileController.downloadFile);

module.exports = router;