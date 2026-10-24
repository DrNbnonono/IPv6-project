const dotenv = require('dotenv');
const path = require('path');

// 必须最先加载环境变量：后面 require 的模块（日志级别、数据目录、数据库等）在导入时就会读取它们。
// 先尝试加载项目根目录的 .env，再加载 backend 目录下的 .env（如果存在，后者会覆盖前者同名变量）
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./database/db');
const addressRouter = require('./routes/address');
const xmapRouter = require('./routes/xmap');
const zgrab2Router = require('./routes/zgrab2');
const authRouter = require('./routes/auth');
const docRouter = require('./routes/doc')
const databaseRoutes = require('./routes/database');
const fileRouter = require('./routes/file'); // 新增文件路由
const jsonanalysisRouter = require('./routes/jsonanalysis'); // JSON分析路由
const workflowRouter = require('./routes/workflows'); // 工作流路由
const aichatRouter = require('./routes/aichat'); // AI聊天路由
const agentRouter = require('./routes/agent'); // Agent路由
const adminRouter = require('./routes/admin'); // 管理员路由（扫描策略/配额/审计）
const apdRouter = require('./routes/apd'); // 别名前缀检测
const tgaRouter = require('./routes/tga'); // 目标生成
const reportRouter = require('./routes/report'); // 任务报告
const openRouter = require('./routes/open'); // 开放只读 API（API 密钥）
const optOutRouter = require('./routes/optOut'); // 探针说明与退出渠道（公开）
const mcpRouter = require('./routes/mcp'); // MCP 只读入口（API 密钥）
const { apiLimiter } = require('./middleware/rateLimit');
const { ensureDirs, PROJECT_ROOT } = require('./services/storageService');
const { createModuleLogger } = require('./services/loggerService');
const taskService = require('./services/taskService');
const scheduler = require('./services/schedulerService');
const statsSnapshot = require('./services/statsSnapshotService');

const logger = createModuleLogger('app');

// 启动前检查必需的环境变量：JWT 密钥不再提供默认值
if (!process.env.JWT_SECRET) {
  logger.error('未配置 JWT_SECRET，请在 .env 中设置后再启动');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// 反向代理后需要配置 TRUST_PROXY（如 1），否则限流会把所有请求算作同一个 IP
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

// 中间件
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS：CORS_ORIGINS 为逗号分隔的允许来源；未配置时放行所有来源（仅建议开发环境）
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  logger.warn('未配置 CORS_ORIGINS，当前允许所有来源跨域访问，生产环境请设置');
}

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['Content-Disposition', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'] // 允许前端访问Content-Disposition 与开放 API 的限流头
}));

app.use('/api', apiLimiter);

// 请求体大小：JSON 分析接口需要处理大文件，单独放宽；其余接口使用较小的默认值（BODY_LIMIT 可调）
const defaultBodyLimit = process.env.BODY_LIMIT || '2mb';
const largeBodyLimit = process.env.LARGE_BODY_LIMIT || '50mb';
app.use('/api/jsonanalysis', bodyParser.json({ limit: largeBodyLimit }));
app.use(bodyParser.json({ limit: defaultBodyLimit }));
app.use(bodyParser.urlencoded({ extended: true, limit: defaultBodyLimit }));

// 路由
app.use('/api/addresses', addressRouter);
app.use('/api/xmap', xmapRouter);
app.use('/api/zgrab2', zgrab2Router);
app.use('/api/auth', authRouter);
app.use('/api/database', databaseRoutes);
app.use('/api/files', fileRouter);
app.use('/api/jsonanalysis', jsonanalysisRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/ai', aichatRouter); // AI聊天路由
app.use('/api/agent', agentRouter); // Agent路由
app.use('/api/admin', adminRouter);
app.use('/api/apd', apdRouter);
app.use('/api/tga', tgaRouter);
app.use('/api/reports', reportRouter);
app.use('/api/open/v1', openRouter);
app.use('/api/opt-out', optOutRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/docs', docRouter)
// 测试接口
app.get('/api/test', (req, res) => {
  res.send('Hello World!');
});

// 健康检查（容器/反向代理探活用）：进程在运行且数据库可连接
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('健康检查失败: 数据库不可用', error.message);
    res.status(503).json({ status: 'error' });
  }
});

// 未匹配的 /api 路径：统一返回 JSON
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 统一错误出口：只返回 JSON，不回传堆栈与内部信息。
// Express 默认的错误处理器在非 production 环境下会把堆栈（含服务器文件路径）原样返回，
// 请求体不是合法 JSON 时就会触发（安全回归 SR-10 发现）。
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: '请求体不是合法的 JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: '请求体过大' });
  }
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: '请求无效' });
  }
  logger.error(`未处理的请求错误: ${req.method} ${req.path}`, err.message);
  return res.status(500).json({ success: false, message: '服务器内部错误' });
});

/**
 * 监听 host（默认 ::，同时覆盖 IPv4/IPv6）。内核或容器网络不支持 IPv6 时
 * （EAFNOSUPPORT/EADDRNOTAVAIL）退回 0.0.0.0，而不是直接启动失败。
 */
function listen(port, host = process.env.LISTEN_HOST || '::') {
  const server = app.listen(port, host, () => {
    logger.info(`服务器正在监听 ${host.includes(':') ? `[${host}]` : host}:${port}`);
  });
  server.on('error', (err) => {
    if (host !== '0.0.0.0' && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
      logger.warn(`无法监听 ${host}（${err.code}），改为监听 0.0.0.0`);
      listen(port, '0.0.0.0');
      return;
    }
    logger.error('服务器启动失败:', err);
    process.exit(1);
  });
  return server;
}

// 启动服务（被测试 require 时不启动监听）
if (require.main === module) {
  ensureDirs();
  logger.info(`数据目录根: ${PROJECT_ROOT}`);
  listen(PORT);
  // 先对账重启前遗留的 running 任务（进程已不在 → failed；仍在运行 → 继续监听），再启动调度器：
  // 调度器领取任务时会把状态置为 running（pid 稍后才写入），不能被对账当成“丢失”的任务
  taskService.reconcileTasksOnStartup()
    .catch((err) => {
      logger.error('启动时任务对账失败:', err.message);
    })
    .finally(() => {
      scheduler.startScheduler();
      statsSnapshot.startDailySnapshot();
    });
}

module.exports = app;