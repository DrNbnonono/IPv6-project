const mysql = require('mysql2/promise'); // 使用 Promise 版本
const dotenv = require('dotenv');
const { createModuleLogger } = require('../services/loggerService');

// 加载环境变量
dotenv.config();

const logger = createModuleLogger('db');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
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
    logger.info('数据库连接成功');
    connection.release(); // 释放连接回连接池

    // 可选：检查关键表是否存在
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    if (tables.length === 0) {
      logger.warn('数据库中没有 users 表，请运行 SQL 初始化脚本');
    } else {
      logger.info('关键表检测通过');
    }
  } catch (error) {
    logger.error(`数据库连接失败: ${error.message}`);
    // 只输出连接目标，不输出密码
    logger.error(
      `请检查：1. MySQL 服务是否启动；2. 数据库用户权限是否正确；` +
        `3. .env 中 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME 是否完整（当前 ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}）`
    );
    process.exit(1); // 退出进程（避免服务启动后因数据库不可用导致后续错误）
  }
}

// 单元测试使用 mock 的 db，不在导入时连接真实数据库
if (process.env.NODE_ENV !== 'test') {
  testConnection();
}

module.exports = pool;
