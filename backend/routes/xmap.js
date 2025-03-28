const express = require('express');
const multer = require('multer');
const path = require('path'); // 添加这行导入
const xmapController = require('../controllers/xmapController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 配置multer用于文件上传
const upload = multer({
  dest: 'uploads/', // 临时上传目录
  limits: {
    fileSize: 1024 * 1024 * 5, // 限制5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // 只允许txt文件
    if (path.extname(file.originalname).toLowerCase() === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('只支持.txt格式的白名单文件'));
    }
  }
});

// 上传白名单文件
router.post('/whitelist', upload.single('whitelistFile'), xmapController.uploadWhitelist);

// 其他路由保持不变...
router.get('/log/:taskId', xmapController.getLog);
router.post('/', xmapController.scan);
router.post('/cancel/:taskId', xmapController.cancelTask);
router.delete('/:taskId', xmapController.deleteTask);
router.get('/task/:taskId', xmapController.getTaskDetails);
router.get('/tasks', xmapController.getTasks);
router.get('/result/:taskId', xmapController.getResult);



module.exports = router;