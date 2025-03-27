const express = require('express');
const router = express.Router();
const connection = require('../database/db'); //引入数据库连接

// 查询IPv6地址
router.post('/active', (req, res) => {
    const sql = 'SELECT * FROM active_address';
    connection.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result);
    });
});

module.exports = router; //导出路由
