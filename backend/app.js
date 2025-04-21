const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const db = require('./database/db');
const addressRouter = require('./routes/address');
const xmapRouter = require('./routes/xmap');
const authRouter = require('./routes/auth');
const docRouter = require('./routes/doc')
const databaseRoutes = require('./routes/database'); 
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
app.use('/api/auth', authRouter);
app.use('/api/database', databaseRoutes);

app.use(cors({
  origin: 'http://localhost:5173', // 前端实际运行的端口地址
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'] // 允许前端访问Content-Disposition
}));
app.use('/api/docs', docRouter)
// 测试接口
app.get('/api/test', (req, res) => {
  res.send('Hello World!');
});

// 启动服务
app.listen(PORT, () => {
  console.log(`服务器正在运行在 http://localhost:${PORT}`);
});