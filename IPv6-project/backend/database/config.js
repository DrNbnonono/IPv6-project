require('dotenv').config();
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'linux_db',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'ipv6_project',
});

module.exports = connection;