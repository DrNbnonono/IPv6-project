const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
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

// 更新CORS配置，允许所有来源访问或指定您的域名
app.use(cors({
  origin: '*', // 允许所有来源访问，生产环境建议设置为您的域名
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'] // 允许前端访问Content-Disposition
}));
app.use('/api/docs', docRouter)

// 健康检查和测试接口
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'IPv6项目后端API运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 详细的健康检查接口
app.get('/api/health', async (req, res) => {
  try {
    // 检查数据库连接
    const dbStatus = await new Promise((resolve) => {
      db.getConnection((err, connection) => {
        if (err) {
          resolve({ status: 'error', message: err.message });
        } else {
          connection.release();
          resolve({ status: 'ok', message: '数据库连接正常' });
        }
      });
    });

    // 检查必要目录
    const fs = require('fs');
    const directories = [
      'uploads', 'xmap_result', 'xmap_log', 'zgrab2_results',
      'zgrab2_logs', 'zgrab2_inputs', 'zgrab2_configs',
      'whitelists', 'jsonanalysis', 'temp_files', 'backend_logs'
    ];

    const dirStatus = directories.map(dir => ({
      name: dir,
      exists: fs.existsSync(dir),
      writable: fs.existsSync(dir) ? fs.constants.W_OK : false
    }));

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'ok', message: 'API服务正常' },
        database: dbStatus,
        directories: dirStatus
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: '健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 启动服务，监听所有网络接口
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 IPv6项目后端服务启动成功`);
  console.log(`📡 服务地址: http://0.0.0.0:${PORT}`);
  console.log(`🔗 测试接口: http://0.0.0.0:${PORT}/api/test`);
  console.log(`💚 健康检查: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ 启动时间: ${new Date().toISOString()}`);
});