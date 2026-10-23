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

const loginLimiter = createLoginLimiter();
const apiLimiter = createApiLimiter();

module.exports = {
  loginLimiter,
  apiLimiter,
  createLoginLimiter,
  createApiLimiter
};
