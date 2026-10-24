const express = require('express');
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

router.post('/', audit('report.generate', {
  resourceType: 'task',
  resourceId: (req) => req.body && req.body.taskId,
  detail: (req, res, body) => ({ format: req.body && req.body.format, reportId: body && body.data && body.data.reportId })
}), reportController.generateTaskReport);

router.get('/:id/download', audit('report.download', {
  resourceType: 'report',
  resourceId: (req) => req.params.id
}), reportController.downloadReport);

module.exports = router;
