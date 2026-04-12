const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
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

// 先尝试加载项目根目录的 .env，再加载 backend 目录下的 .env（如果存在，后者会覆盖前者同名变量）
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
// 增加请求体大小限制，支持大型JSON文件处理
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

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

// 更新CORS配置，允许所有来源访问或指定您的域名
app.use(cors({
  origin: '*', // 允许所有来源访问，生产环境建议设置为您的域名
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'] // 允许前端访问Content-Disposition
}));
app.use('/api/docs', docRouter)
// 测试接口
app.get('/api/test', (req, res) => {
  res.send('Hello World!');
});

// 启动服务，同时监听IPv4和IPv6地址
app.listen(PORT, '::', () => {
  console.log(`服务器正在运行在 http://[::]:${PORT}`);
  console.log(`IPv4访问地址: http://0.0.0.0:${PORT}`);
});