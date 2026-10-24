/**
 * 公开接口：扫描说明与退出请求提交。路由见 routes/optOut.js。
 */

const optOut = require('../services/optOutService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('opt-out');

exports.getInfo = (req, res) => {
  res.json({ success: true, data: optOut.publicInfo() });
};

exports.submit = async (req, res) => {
  try {
    const result = await optOut.submit(req.body, req.ip);
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.status(201).json({
      success: true,
      message: '已收到你的请求。审核期间我们已暂停扫描这些网段，并会通过你填写的邮箱联系你',
      data: { received: result.received }
    });
  } catch (error) {
    logger.error('提交退出请求失败:', error.message);
    res.status(500).json({ success: false, message: '提交失败，请稍后重试或直接邮件联系运营方' });
  }
};
