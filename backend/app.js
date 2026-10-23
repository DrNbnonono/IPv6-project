const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
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
const { apiLimiter } = require('./middleware/rateLimit');
const { ensureDirs, PROJECT_ROOT } = require('./services/storageService');

// 先尝试加载项目根目录的 .env，再加载 backend 目录下的 .env（如果存在，后者会覆盖前者同名变量）
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// 启动前检查必需的环境变量：JWT 密钥不再提供默认值
if (!process.env.JWT_SECRET) {
  console.error('❌ 未配置 JWT_SECRET，请在 .env 中设置后再启动');
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
  console.warn('⚠️ 未配置 CORS_ORIGINS，当前允许所有来源跨域访问，生产环境请设置');
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
app.use('/api/docs', docRouter)
// 测试接口
app.get('/api/test', (req, res) => {
  res.send('Hello World!');
});

// 启动服务，同时监听IPv4和IPv6地址（被测试 require 时不启动监听）
if (require.main === module) {
  ensureDirs();
  console.log(`数据目录根: ${PROJECT_ROOT}`);
  app.listen(PORT, '::', () => {
    console.log(`服务器正在运行在 http://[::]:${PORT}`);
    console.log(`IPv4访问地址: http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;