const mysql = require('mysql2');

// 创建一个数据库连接
const connection = mysql.createConnection({
  host: 'localhost', // 数据库主机
  user: 'root',   // 数据库用户名
  password: 'root', // 数据库密码
  database: 'ipv6_address' // 需要连接的数据库名称
});

// 连接到数据库
connection.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err.stack);
    return;
  }
  console.log('已连接到数据库');
});

module.exports = connection;  // 导出连接
