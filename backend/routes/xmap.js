const express = require('express');
const multer = require('multer');
const path = require('path'); // 添加这行导入
const xmapController = require('../controllers/xmapController');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const { DIRS, ensureDir } = require('../services/storageService');

const router = express.Router();
router.use(authenticate);

// 配置multer用于文件上传
const upload = multer({
  // 临时上传目录，收到文件时才创建
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureDir(DIRS.uploads))
  }),
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
router.post('/whitelist', upload.single('file'), audit('whitelist.upload', { resourceType: 'whitelist_file' }), xmapController.uploadWhitelist)

router.get('/log/:taskId', xmapController.getLog);
router.post('/', audit('task.create', {
  resourceType: 'xmap_task',
  resourceId: (req, res, body) => body && body.taskId,
  detail: (req, res, body) => ({
    target: req.body && req.body.targetaddress,
    whitelistFile: req.body && req.body.whitelistFile,
    rate: req.body && req.body.rate,
    help: Boolean(req.body && req.body.help),
    reason: body && body.success === false ? body.message : undefined
  })
}), xmapController.scan);
router.post('/cancel/:taskId', audit('task.cancel', { resourceType: 'xmap_task', resourceId: (req) => req.params.taskId }), xmapController.cancelTask);
router.delete('/:taskId', audit('task.delete', { resourceType: 'xmap_task', resourceId: (req) => req.params.taskId }), xmapController.deleteTask);
router.get('/task/:taskId', xmapController.getTaskDetails);
router.get('/tasks', xmapController.getTasks);
router.get('/result/:taskId', xmapController.getResult);
router.get('/whitelists', xmapController.getWhitelists);
router.delete('/whitelist/:id', audit('whitelist.delete', { resourceType: 'whitelist_file', resourceId: (req) => req.params.id }), xmapController.deleteWhitelist);

module.exports = router;