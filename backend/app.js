const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const db = require('./database/db');  // 引入数据库连接函数
const addressRouter = require('./routes/address');  // 引入地址管理路由
const xmapRouter = require('./routes/xmap');  // 引入xmap路由
const authRouter = require('./routes/auth');  // 引入认证路由
const { authenticate } = require('./middleware/auth');

//加载环境变量，更加安全
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

//中间件
app.use(cors())

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//地址管理路由
app.use('/api/addresses', addressRouter);
app.use('/api/xmap', xmapRouter);
app.use('/api/auth', authRouter);
app.use('/api/xmap', authenticate);  // 认证中间件
app.use(cors({
  origin: 'http://localhost:8080', // 前端开发地址
  credentials: true
}))

//测试接口
app.get('/api/test', (req, res) => {
  res.send('Hello World!');
});

//启动服务
app.listen(PORT, () => {
  console.log(`服务器正在运行在 http://localhost: ${PORT}`);
});
