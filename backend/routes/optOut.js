/**
 * 探针说明与退出渠道（/api/opt-out，公开，无需登录）：
 *   GET  /api/opt-out/info  运营方名称、扫描来源地址、联系邮箱、提交限制（来自环境变量）
 *   POST /api/opt-out       提交退出请求 { cidrs, contact, organization?, note? }
 * 提交接口按 IP 限流，并写审计日志（不记录联系邮箱）。
 */

const express = require('express');
const router = express.Router();
const optOutController = require('../controllers/optOutController');
const { optOutLimiter } = require('../middleware/rateLimit');
const { audit } = require('../middleware/audit');

router.get('/info', optOutController.getInfo);

router.post('/', optOutLimiter, audit('optout.submit', {
  resourceType: 'opt_out',
  userId: () => null,
  detail: (req, res, body) => ({ count: body && body.data ? body.data.received : 0 })
}), optOutController.submit);

module.exports = router;
