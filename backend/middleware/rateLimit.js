const rateLimit = require('express-rate-limit');

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    message
  });
};

/**
 * 登录限流：按 IP 统计失败次数，成功的请求不计入
 * 默认 15 分钟内最多 10 次失败，可通过 LOGIN_RATE_MAX / LOGIN_RATE_WINDOW_MIN 调整
 */
const createLoginLimiter = () => rateLimit({
  windowMs: toPositiveInt(process.env.LOGIN_RATE_WINDOW_MIN, 15) * 60 * 1000,
  limit: toPositiveInt(process.env.LOGIN_RATE_MAX, 10),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('登录尝试过于频繁，请稍后再试')
});

/**
 * 全局 API 限流：按 IP，默认每分钟 600 次，可通过 API_RATE_MAX 调整
 */
const createApiLimiter = () => rateLimit({
  windowMs: 60 * 1000,
  limit: toPositiveInt(process.env.API_RATE_MAX, 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('请求过于频繁，请稍后再试')
});

/**
 * AI 问答限流：按 IP，默认每分钟 20 次，可通过 AI_RATE_MAX 调整。
 * /api/ai/detection/chat 面向未登录访客，每次请求都会消耗服务器配置的大模型额度，
 * 因此单独收紧，不与全局限流（默认 600 次/分钟）共用。
 */
const createAiLimiter = () => rateLimit({
  windowMs: 60 * 1000,
  limit: toPositiveInt(process.env.AI_RATE_MAX, 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('AI 问答请求过于频繁，请稍后再试')
});

/**
 * 退出请求限流：按 IP，默认每小时 5 次提交，可通过 OPT_OUT_RATE_MAX 调整。
 * 接口是匿名的，且每次提交都会写库、占用管理员审核精力。
 */
const createOptOutLimiter = () => rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: toPositiveInt(process.env.OPT_OUT_RATE_MAX, 5),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('提交过于频繁，请稍后再试，或直接邮件联系运营方')
});

const loginLimiter = createLoginLimiter();
const apiLimiter = createApiLimiter();
const aiLimiter = createAiLimiter();
const optOutLimiter = createOptOutLimiter();

module.exports = {
  optOutLimiter,
  createOptOutLimiter,
  loginLimiter,
  apiLimiter,
  aiLimiter,
  createLoginLimiter,
  createApiLimiter,
  createAiLimiter
};
