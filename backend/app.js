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
const { apiLimiter } = require('./middleware/rateLimit');
const { ensureDirs, PROJECT_ROOT } = require('./services/storageService');
const { createModuleLogger } = require('./services/loggerService');
const taskService = require('./services/taskService');
const scheduler = require('./services/schedulerService');

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
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'] // 允许前端访问Content-Disposition
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
    .finally(() => scheduler.startScheduler());
}

module.exports = app;