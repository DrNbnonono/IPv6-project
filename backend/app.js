const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const db = require('./database/db');  // 引入数据库连接函数
const addressRouter = require('./routes/address');  // 引入地址管理路由

//加载环境变量，更加安全
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

//中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//地址管理路由
app.use('/api/addresses', addressRouter);

//启动服务
app.listen(PORT, () => {
  console.log(`服务器正在运行在 http://localhost: ${PORT}`);
});
