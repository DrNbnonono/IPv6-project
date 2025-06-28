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
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 路由
app.use('/api/addresses', addressRouter);
app.use('/api/xmap', xmapRouter);
app.use('/api/zgrab2', zgrab2Router);
app.use('/api/auth', authRouter);
app.use('/api/database', databaseRoutes);
app.use('/api/files', fileRouter);

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

// 启动服务，监听所有网络接口
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器正在运行在 http://0.0.0.0:${PORT}`);
});