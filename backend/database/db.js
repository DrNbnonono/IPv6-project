const mysql = require('mysql2/promise'); // 使用 Promise 版本
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'linux_db',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'ipv6_project',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 测试数据库连接
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 数据库连接成功！');
    connection.release(); // 释放连接回连接池

    // 可选：检查关键表是否存在
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    if (tables.length === 0) {
      console.warn('⚠️  数据库中没有 users 表，请运行 SQL 初始化脚本');
    } else {
      console.log('✅ 关键表检测通过');
    }
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    console.error('请检查以下配置：');
    console.error('1. MySQL 服务是否启动');
    console.error('2. 数据库用户权限是否正确');
    console.error('3. .env 配置是否完整:', dbConfig);
    process.exit(1); // 退出进程（避免服务启动后因数据库不可用导致后续错误）
  }
}

// 立即执行连接测试
testConnection();

module.exports = pool;