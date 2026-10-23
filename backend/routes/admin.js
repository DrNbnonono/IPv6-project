/**
 * 管理员路由（/api/admin）：扫描策略、用户配额、审计日志。
 * 后端强制要求管理员，不依赖前端的 adminOnly。
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/scan-policy', adminController.getScanPolicy);
router.post('/scan-allowlist', adminController.addAllowlistEntry);
router.delete('/scan-allowlist/:id', adminController.removeAllowlistEntry);
router.post('/scan-blacklist', adminController.addBlacklistEntry);
router.delete('/scan-blacklist/:id', adminController.removeBlacklistEntry);

router.get('/quotas', adminController.listQuotas);
router.put('/quotas/:userId', adminController.setQuota);
router.delete('/quotas/:userId', adminController.clearQuota);

router.get('/audit-logs', adminController.getAuditLogs);
router.get('/users', adminController.listUsers);

module.exports = router;
