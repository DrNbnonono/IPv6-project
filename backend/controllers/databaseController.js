const db = require('../database/db');
const addressModel = require('../models/addressModels');
const { createLogger, transports } = require('winston');
const readline = require('readline');


const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/home/ipv6/IPv6-project/IPv6_addresses';
    // 确保目录存在
    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'address-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});


// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
});

/**
 * 获取数据库统计信息
 */
exports.getDatabaseStats = async (req, res) => {
  try {
    // 获取活跃地址数量
    const [[activeAddresses]] = await db.query(`
      SELECT COUNT(*) as count FROM active_addresses
    `);

    // 获取前缀数量
    const [[prefixes]] = await db.query(`
      SELECT COUNT(*) as count FROM ip_prefixes
    `);

    // 获取国家数量
    const [[countries]] = await db.query(`
      SELECT COUNT(*) as count FROM countries
    `);

    // 获取ASN数量
    const [[asns]] = await db.query(`
      SELECT COUNT(*) as count FROM asns
    `);

    // 获取漏洞数量
    const [[vulnerabilities]] = await db.query(`
      SELECT COUNT(*) as count FROM vulnerabilities
    `);

    res.json({
      success: true,
      activeAddresses: activeAddresses.count,
      prefixes: prefixes.count,
      countries: countries.count,
      asns: asns.count,
      vulnerabilities: vulnerabilities.count
    });
  } catch (error) {
    logger.error('获取数据库统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取数据库统计信息失败'
    });
  }
};



/**
 * 执行高级查询
 */
exports.advancedQuery = async (req, res) => {
  try {
    // 打印接收到的请求体
    console.log('高级查询接收到的请求体:', JSON.stringify(req.body, null, 2));
    
    const query = req.body.query || req.body.sql;
    const params = req.body.params || [];
    
    if (!query) {
      console.log('错误: 缺少查询语句');
      return res.status(400).json({
        success: false,
        message: '缺少查询语句'
      });
    }

    // 验证查询语句，防止SQL注入
    if (!isValidSqlQuery(query)) {
      console.log('错误: 无效的查询语句:', query);
      return res.status(400).json({
        success: false,
        message: '无效的查询语句'
      });
    }

    // 打印将要执行的SQL和参数
    console.log('执行SQL查询:', query);
    console.log('查询参数:', params);

    // 执行查询
    const [results] = await db.query(query, params);
    
    // 打印查询结果的行数
    console.log(`查询完成，返回 ${results.length} 条记录`);
    
    // 如果结果为空，打印提示信息
    if (results.length === 0) {
      console.log('查询结果为空，没有符合条件的数据');
    } else {
      // 打印第一条记录的结构（不打印具体内容以避免日志过大）
      console.log('结果第一条记录的字段:', Object.keys(results[0]));
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error(`高级查询失败: ${error.message}`);
    console.error('高级查询执行错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: `查询失败: ${error.message}`
    });
  }
};

/**
 * 获取国家统计信息
 */
exports.getCountryStats = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT * FROM countries
    `);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('获取国家统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取国家统计信息失败'
    });
  }
};

/**
 * 获取漏洞统计信息
 */
exports.getVulnerabilityStats = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT * FROM vulnerability_stats_view
    `);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('获取漏洞统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取漏洞统计信息失败'
    });
  }
};

/**
 * 批量删除IPv6地址
 */
exports.deleteAddresses = async (req, res) => {
  try {
    const { addressIds } = req.body;
    
    if (!addressIds || !Array.isArray(addressIds) || addressIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '缺少要删除的地址ID列表'
      });
    }

    // 开始事务
    await db.query('START TRANSACTION');

    // 获取地址所属的国家和ASN信息
    const [addressInfo] = await db.query(`
      SELECT 
        aa.address_id,
        ip.country_id,
        ip.asn
      FROM 
        active_addresses aa
      JOIN 
        ip_prefixes ip ON aa.prefix_id = ip.prefix_id
      WHERE 
        aa.address_id IN (?)
    `, [addressIds]);

    // 删除地址
    const [deleteResult] = await db.query(`
      DELETE FROM active_addresses 
      WHERE address_id IN (?)
    `, [addressIds]);

    // 更新国家统计信息
    const countryUpdates = {};
    addressInfo.forEach(info => {
      if (!countryUpdates[info.country_id]) {
        countryUpdates[info.country_id] = true;
      }
    });

    for (const countryId of Object.keys(countryUpdates)) {
      await db.query(`
        UPDATE countries 
        SET 
          total_active_ipv6 = (
            SELECT COUNT(*) FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.country_id = ?
          ),
          last_updated = NOW()
        WHERE country_id = ?
      `, [countryId, countryId]);
    }

    // 更新ASN统计信息
    const asnUpdates = {};
    addressInfo.forEach(info => {
      if (!asnUpdates[info.asn]) {
        asnUpdates[info.asn] = true;
      }
    });

    for (const asn of Object.keys(asnUpdates)) {
      await db.query(`
        UPDATE asns
        SET 
          total_active_ipv6 = (
            SELECT COUNT(*) FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.asn = ?
          ),
          last_updated = NOW()
        WHERE asn = ?
      `, [asn, asn]);
    }

    // 提交事务
    await db.query('COMMIT');

    res.json({
      success: true,
      message: `成功删除${deleteResult.affectedRows}个IPv6地址`,
      deletedCount: deleteResult.affectedRows
    });
  } catch (error) {
    // 回滚事务
    await db.query('ROLLBACK');
    logger.error('删除地址失败:', error);
    res.status(500).json({
      success: false,
      message: `删除地址失败: ${error.message}`
    });
  }
};

/**
 * 获取漏洞类型列表
 */
exports.getVulnerabilityTypes = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM vulnerabilities');
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('获取漏洞类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取漏洞类型失败'
    });
  }
};

/**
 * 获取协议类型列表
 */
exports.getProtocolTypes = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM protocols');
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('获取协议类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取协议类型失败'
    });
  }
};

// 辅助函数：验证SQL查询语句
function isValidSqlQuery(query) {
  // 只允许SELECT查询
  if (!query.trim().toUpperCase().startsWith('SELECT')) {
    return false;
  }

  // 禁止危险操作
  const forbiddenKeywords = ['DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'GRANT', 'REVOKE'];
  const upperQuery = query.toUpperCase();
  for (const keyword of forbiddenKeywords) {
    if (upperQuery.includes(keyword)) {
      return false;
    }
  }

  return true;
}









// 获取IID类型列表
exports.getIIDTypes = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [rows] = await connection.query(`
      SELECT 
        type_id, 
        type_name, 
        description, 
        is_risky, 
        example
      FROM 
        address_types
      ORDER BY 
        type_name
    `);
    
    connection.release();
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取IID类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取IID类型失败',
      error: error.message
    });
  }
};



/**
 * 获取地址类型列表
 */
exports.getAddressTypes = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        type_id, 
        type_name, 
        description, 
        is_risky, 
        example
      FROM 
        address_types
      ORDER BY 
        type_name
    `);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    logger.error('获取地址类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取地址类型失败',
      error: error.message
    });
  }
};

/**
 * 更新地址 IID 类型
 */
exports.updateIIDTypes = async (req, res) => {
  const { iidTypeId, isDetected, countryId, asn, addresses } = req.body;
  
  if (!iidTypeId || !addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({
      success: false,
      message: '参数错误: 缺少必要参数或地址列表为空'
    });
  }
  
  let connection;
  try {
    // 获取数据库连接
    connection = await db.getConnection();
    await connection.beginTransaction();
    
    // 创建临时表存储地址列表
    await connection.query(`
      CREATE TEMPORARY TABLE IF NOT EXISTS temp_address_list (
        address VARCHAR(128) NOT NULL,
        PRIMARY KEY (address)
      )
    `);
    
    // 清空临时表
    await connection.query(`TRUNCATE TABLE temp_address_list`);
    
    // 插入地址到临时表
    const addressValues = addresses.map(addr => [addr]);
    await connection.query(`
      INSERT IGNORE INTO temp_address_list (address) VALUES ?
    `, [addressValues]);
    
    // 调用存储过程更新IID类型
    await connection.query(`SET @updated_count = 0, @inserted_count = 0, @skipped_count = 0, @total_count = 0`);
    await connection.query(`
      CALL update_address_iid_types(?, ?, ?, ?, @updated_count, @inserted_count, @skipped_count, @total_count)
    `, [
      iidTypeId,
      isDetected ? 1 : 0,
      countryId || null,
      asn || null
    ]);
    
    // 获取统计结果
    const [stats] = await connection.query(`
      SELECT 
        @updated_count AS updated_count, 
        @inserted_count AS inserted_count, 
        @skipped_count AS skipped_count, 
        @total_count AS total_addresses
    `);
    
    // 清理临时表
    await connection.query(`DROP TEMPORARY TABLE IF EXISTS temp_address_list`);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `成功处理${stats[0].total_addresses}个地址的IID类型`,
      data: {
        total: stats[0].total_addresses,
        updated: stats[0].updated_count,
        inserted: stats[0].inserted_count,
        skipped: stats[0].skipped_count
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新IID类型失败:', error);
    res.status(500).json({
      success: false,
      message: '更新IID类型失败',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

//---------------国家管理相关的API----------------//

exports.createCountry = async (req, res) => {
  try {
    const { country_id, country_name, country_name_zh, region, subregion } = req.body;
    
    // 验证必填字段
    if (!country_id || !country_name || !country_name_zh) {
      return res.status(400).json({
        success: false,
        message: '国家ID、英文名称和中文名称为必填项'
      });
    }

    // 检查国家ID是否已存在
    const [existing] = await db.query(
      'SELECT country_id FROM countries WHERE country_id = ?',
      [country_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该国家ID已存在'
      });
    }

    // 插入新国家
    await db.query(
      `INSERT INTO countries (country_id, country_name, country_name_zh, region, subregion)
       VALUES (?, ?, ?, ?, ?)`,
      [country_id, country_name, country_name_zh, region, subregion]
    );

    res.json({ success: true, message: '国家创建成功' });
  } catch (error) {
    logger.error('创建国家失败:', error);
    res.status(500).json({ success: false, message: '创建国家失败' });
  }
};

exports.updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { country_name, country_name_zh, region, subregion } = req.body;

    // 验证必填字段
    if (!country_name || !country_name_zh) {
      return res.status(400).json({
        success: false,
        message: '英文名称和中文名称为必填项'
      });
    }

    // 更新国家信息
    await db.query(
      `UPDATE countries 
       SET country_name = ?, country_name_zh = ?, region = ?, subregion = ?
       WHERE country_id = ?`,
      [country_name, country_name_zh, region, subregion, id]
    );

    res.json({ success: true, message: '国家信息更新成功' });
  } catch (error) {
    logger.error('更新国家信息失败:', error);
    res.status(500).json({ success: false, message: '更新国家信息失败' });
  }
};

exports.deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有相关数据
    const [relatedData] = await db.query(
      'SELECT COUNT(*) as count FROM active_addresses WHERE country_id = ?',
      [id]
    );

    if (relatedData[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: '该国家下存在地址数据，无法删除'
      });
    }

    // 删除国家
    await db.query('DELETE FROM countries WHERE country_id = ?', [id]);
    res.json({ success: true, message: '国家删除成功' });
  } catch (error) {
    logger.error('删除国家失败:', error);
    res.status(500).json({ success: false, message: '删除国家失败' });
  }
};

//---------------ASN管理相关的API----------------//

exports.createAsn = async (req, res) => {
  try {
    const { asn, as_name, as_name_zh, country_id, organization } = req.body;
    
    // 验证必填字段
    if (!asn || !as_name || !country_id) {
      return res.status(400).json({
        success: false,
        message: 'ASN、AS名称和所属国家为必填项'
      });
    }

    // 检查ASN是否已存在
    const [existing] = await db.query(
      'SELECT asn FROM asns WHERE asn = ?',
      [asn]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该ASN已存在'
      });
    }

    // 插入新ASN
    await db.query(
      `INSERT INTO asns (asn, as_name, as_name_zh, country_id, organization)
       VALUES (?, ?, ?, ?, ?)`,
      [asn, as_name, as_name_zh, country_id, organization]
    );

    res.json({ success: true, message: 'ASN创建成功' });
  } catch (error) {
    logger.error('创建ASN失败:', error);
    res.status(500).json({ success: false, message: '创建ASN失败' });
  }
};

exports.updateAsn = async (req, res) => {
  try {
    const { id } = req.params;
    const { as_name, as_name_zh, country_id, organization } = req.body;

    // 验证必填字段
    if (!as_name || !country_id) {
      return res.status(400).json({
        success: false,
        message: 'AS名称和所属国家为必填项'
      });
    }

    // 更新ASN信息
    await db.query(
      `UPDATE asns 
       SET as_name = ?, as_name_zh = ?, country_id = ?, organization = ?
       WHERE asn = ?`,
      [as_name, as_name_zh, country_id, organization, id]
    );

    res.json({ success: true, message: 'ASN信息更新成功' });
  } catch (error) {
    logger.error('更新ASN信息失败:', error);
    res.status(500).json({ success: false, message: '更新ASN信息失败' });
  }
};

exports.deleteAsn = async (req, res) => {
  try {
    const { id } = req.params;

    // 检查是否有相关数据
    const [relatedData] = await db.query(
      'SELECT COUNT(*) as count FROM ip_prefixes WHERE asn = ?',
      [id]
    );

    if (relatedData[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: '该ASN下存在前缀数据，无法删除'
      });
    }

    // 删除ASN
    await db.query('DELETE FROM asns WHERE asn = ?', [id]);
    res.json({ success: true, message: 'ASN删除成功' });
  } catch (error) {
    logger.error('删除ASN失败:', error);
    res.status(500).json({ success: false, message: '删除ASN失败' });
  }
};


//---------------前缀管理相关的API----------------//
exports.getPrefixes = async (req, res) => {
  try {
    const prefixes = await Prefix.findAll();
    res.json(prefixes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.createPrefix = async (req, res) => {
  try {
    const prefix = await Prefix.create(req.body);
    res.json(prefix);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.updatePrefix = async (req, res) => {
  try {
    const { id } = req.params;
    await Prefix.update(req.body, { where: { prefix: id } });
    res.json({ message: 'Prefix updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.deletePrefix = async (req, res) => {
  try {
    const { id } = req.params;
    await Prefix.destroy({ where: { prefix: id } });
    res.json({ message: 'Prefix deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//---------------文件管理相关的API----------------//
// 上传地址文件
exports.uploadAddressFile = async (req, res) => {
  try {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: '文件上传失败: ' + err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '未找到上传的文件'
        });
      }

      // 保存文件信息到数据库
      const [result] = await db.query(`
        INSERT INTO whitelists (user_id, tool_id, file_name, file_path, description)
        VALUES (?, ?, ?, ?, ?)
      `, [
        req.user.id,
        1, // database tool_id
        req.file.originalname,
        req.file.path,
        req.body.description || null
      ]);

      res.json({
        success: true,
        message: '文件上传成功',
        data: {
          id: result.insertId,
          fileName: req.file.originalname,
          filePath: req.file.path
        }
      });
    });
  } catch (error) {
    logger.error('文件上传失败:', error);
    res.status(500).json({
      success: false,
      message: '文件上传失败: ' + error.message
    });
  }
};

// 获取地址文件列表
exports.getAddressFiles = async (req, res) => {
  try {
    const [files] = await db.query(`
      SELECT id, file_name, file_path, description, uploaded_at, username
      FROM whitelists w
      JOIN users u ON w.user_id = u.id
      WHERE w.tool_id = 1 AND w.is_deleted = 0
      ORDER BY uploaded_at DESC
    `);

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    logger.error('获取文件列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文件列表失败'
    });
  }
};

// 删除地址文件
exports.deleteAddressFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // 检查文件是否存在且属于当前用户
    const [files] = await db.query(`
      SELECT file_path 
      FROM whitelists 
      WHERE id = ? AND user_id = ? AND tool_id = 1 AND is_deleted = 0
    `, [fileId, req.user.id]);

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或无权删除'
      });
    }

    // 软删除文件记录
    await db.query(`
      UPDATE whitelists 
      SET is_deleted = 1 
      WHERE id = ?
    `, [fileId]);

    // 尝试删除物理文件
    try {
      await fs.unlink(files[0].file_path);
    } catch (error) {
      logger.warn('物理文件删除失败:', error);
      // 继续执行，因为数据库记录已经标记为删除
    }

    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    logger.error('删除文件失败:', error);
    res.status(500).json({
      success: false,
      message: '删除文件失败: ' + error.message
    });
  }
};

// 下载地址文件
exports.downloadAddressFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // 获取文件信息
    const [files] = await db.query(`
      SELECT file_name, file_path 
      FROM whitelists 
      WHERE id = ? AND tool_id = 1 AND is_deleted = 0
    `, [fileId]);

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    const file = files[0];
    
    // 检查文件是否存在
    try {
      await fs.access(file.file_path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或已被删除'
      });
    }

    // 设置响应头
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    
    // 创建文件流并发送
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('下载文件失败:', error);
    res.status(500).json({
      success: false,
      message: '下载文件失败: ' + error.message
    });
  }
};

//---------------任务创建相关的API----------------//
// 创建导入任务
exports.createImportTask = async (req, res) => {
  try {
    const { countryId, asn, prefix, fileId } = req.body;

    // 创建任务记录
    const [taskResult] = await db.query(`
      INSERT INTO tasks (user_id, command, description, task_type, status)
      VALUES (?, ?, ?, 'database', 'pending')
    `, [
      req.user.id,
      'import-addresses',
      `导入IPv6地址: ${countryId}, AS${asn}, ${prefix}`
    ]);

    const taskId = taskResult.insertId;

    // 异步处理导入任务
    processImportTask(taskId, countryId, asn, prefix, fileId).catch(error => {
      logger.error('导入任务处理失败:', error);
    });

    res.json({
      success: true,
      message: '导入任务已创建',
      data: { taskId }
    });
  } catch (error) {
    logger.error('创建导入任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建导入任务失败: ' + error.message
    });
  }
};

// 获取导入任务状态
exports.getImportTaskStatus = async (req, res) => {
  try {
    const [tasks] = await db.query(`
      SELECT id, status, error_message, created_at, completed_at
      FROM tasks
      WHERE id = ? AND task_type = 'database'
    `, [req.params.id]);

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    res.json({
      success: true,
      data: tasks[0]
    });
  } catch (error) {
    logger.error('获取任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务状态失败'
    });
  }
};

// 获取导入任务列表
exports.getImportTasks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // 获取任务总数
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total
      FROM tasks
      WHERE task_type = 'database' AND user_id = ?
    `, [req.user.id]);

    const total = countResult[0].total;

    // 获取分页任务列表
    const [tasks] = await db.query(`
      SELECT 
        t.id,
        t.command,
        t.description,
        t.status,
        t.error_message,
        t.created_at,
        t.completed_at,
        t.exit_code,
        t.process_signal,
        u.username as created_by
      FROM tasks t
      JOIN users u ON t.user_id = u.id
      WHERE t.task_type = 'database' AND t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, pageSize, offset]);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('获取导入任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取导入任务列表失败: ' + error.message
    });
  }
};

// 取消导入任务
exports.cancelImportTask = async (req, res) => {
  try {
    const taskId = req.params.id;

    // 检查任务是否存在且属于当前用户
    const [tasks] = await db.query(`
      SELECT id, status, process_id
      FROM tasks
      WHERE id = ? AND user_id = ? AND task_type = 'database'
    `, [taskId, req.user.id]);

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在或无权取消'
      });
    }

    const task = tasks[0];

    // 只能取消待处理或运行中的任务
    if (task.status !== 'pending' && task.status !== 'running') {
      return res.status(400).json({
        success: false,
        message: '只能取消待处理或运行中的任务'
      });
    }

    // 如果任务正在运行，尝试终止进程
    if (task.status === 'running' && task.process_id) {
      try {
        process.kill(task.process_id, 'SIGTERM');
      } catch (error) {
        logger.warn('终止进程失败:', error);
        // 继续执行，因为我们要更新任务状态
      }
    }

    // 更新任务状态
    await db.query(`
      UPDATE tasks
      SET 
        status = 'canceled',
        completed_at = NOW(),
        error_message = '任务被用户取消'
      WHERE id = ?
    `, [taskId]);

    res.json({
      success: true,
      message: '任务已取消'
    });
  } catch (error) {
    logger.error('取消任务失败:', error);
    res.status(500).json({
      success: false,
      message: '取消任务失败: ' + error.message
    });
  }
};

// 异步处理导入任务
async function processImportTask(taskId, countryId, asn, prefix, fileId) {
  try {
    // 获取文件路径
    const [files] = await db.query(`
      SELECT file_path
      FROM whitelists
      WHERE id = ? AND tool_id = 1 AND is_deleted = 0
    `, [fileId]);

    if (files.length === 0) {
      throw new Error('文件不存在');
    }

    const filePath = files[0].file_path;

    // 读取文件内容
    const fileContent = await fs.readFile(filePath, 'utf8');
    const addresses = fileContent.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line);

    // 创建临时表并插入地址
    await db.query('START TRANSACTION');
    
    await db.query(`
      CREATE TEMPORARY TABLE temp_addresses (
        address VARCHAR(128) NOT NULL,
        is_processed BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (address)
      )
    `);

    const insertValues = addresses.map(addr => [addr]);
    if (insertValues.length > 0) {
      await db.query(`
        INSERT INTO temp_addresses (address) VALUES ?
      `, [insertValues]);
    }

    // 调用存储过程
    await db.query(`SET @imported = 0, @errors = 0`);
    await db.query(`
      CALL batch_import_ipv6_addresses(?, ?, ?, @imported, @errors)
    `, [countryId, asn, prefix]);

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.query('DROP TEMPORARY TABLE IF EXISTS temp_addresses');
  }
}


//---------------搜索相关的API----------------//


//获取所有国家列表
exports.getCountries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    // 构建查询条件
    let whereClause = '';
    let params = [];
    
    if (search) {
      whereClause = `WHERE country_name LIKE ? OR country_name_zh LIKE ? OR country_id LIKE ?`;
      const searchTerm = `%${search}%`;
      params = [searchTerm, searchTerm, searchTerm];
    }

    // 获取总数
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM countries ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取分页数据
    const [countries] = await db.query(
      `SELECT country_id, country_name, country_name_zh, region, subregion 
       FROM countries 
       ${whereClause}
       ORDER BY country_name_zh, country_name
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: countries,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('获取国家列表失败:', error);
    res.status(500).json({ success: false, message: '获取国家列表失败' });
  }
};

//获取所有的ASN列表
exports.getAllAsns = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000; // 默认限制100条
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    
    console.log(`[getAllAsns] 请求获取ASN列表: 页码=${page}, 每页数量=${limit}, 偏移量=${offset}`);
    
    // 获取总数
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM asns');
    const total = countResult[0].total;
    console.log(`[getAllAsns] 数据库中ASN总数: ${total}`);
    
    // 获取分页数据
    const [asns] = await db.query(`
      SELECT asn, as_name, as_name_zh, country_id, organization
      FROM asns
      ORDER BY asn
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    console.log(`[getAllAsns] 成功获取ASN数据，返回数量: ${asns.length}`);
    if (asns.length > 0) {
      console.log(`[getAllAsns] 第一个ASN: ${asns[0].asn}, 名称: ${asns[0].as_name || asns[0].as_name_zh}`);
    } else {
      console.warn('[getAllAsns] 警告: 查询返回空结果集');
    }

    // 构建响应数据
    const responseData = {
      success: true,
      data: asns,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };

    // 记录发送的响应数据
    console.log('[getAllAsns] 发送响应数据:', {
      success: responseData.success,
      dataLength: responseData.data.length,
      pagination: responseData.pagination
    });
    
    res.json(responseData);
  } catch (error) {
    console.error('[getAllAsns] 获取ASN列表失败:', error);
    logger.error('获取ASN列表失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取ASN列表失败', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

//搜索ASN
exports.getAsnsByCountry = async (req, res) => {
  try {
    const { countryId } = req.params;
    const { query } = req.query;
    
    console.log(`后端: 收到根据国家获取ASN请求, 国家ID: ${countryId}, 查询: ${query}`);
    
    // 验证国家ID
    if (!countryId || countryId.length !== 2) {
      return res.status(400).json({ success: false, message: '无效的国家ID' });
    }
    
    let sql = `
      SELECT asn, as_name, as_name_zh, country_id
      FROM asns
      WHERE country_id = ?
    `;
    
    const params = [countryId];
    
    if (query) {
      sql += ` AND (asn LIKE ? OR as_name LIKE ? OR as_name_zh LIKE ?)`;
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    sql += ` ORDER BY asn LIMIT 20`;
    
    const [asns] = await db.query(sql, params);
    console.log(`后端: 查询到 ${asns.length} 个ASN`);
    
    res.json({ success: true, data: asns });
  } catch (error) {
    logger.error(`获取国家(${req.params.countryId})的ASN列表失败:`, error);
    console.error(`获取国家ASN列表详细错误:`, error);
    res.status(500).json({ success: false, message: '获取ASN列表失败', error: error.message });
  }
};

// 搜索ASN
exports.searchAsns = async (req, res) => {
  try {
    const { query } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    
    console.log(`[ASN Search] 收到搜索请求，查询词: '${query}', 限制: ${limit}`);
    
    if (!query || query.length < 2) {
      console.log('[ASN Search] 搜索词过短，至少需要2个字符');
      return res.status(400).json({ 
        success: false, 
        message: '搜索词至少需要2个字符' 
      });
    }

    const searchTerm = `%${query}%`;
    console.log(`[ASN Search] 构建的搜索模式: '${searchTerm}'`);
    
    const [asns] = await db.query(`
      SELECT 
        asn, 
        as_name, 
        as_name_zh, 
        country_id,
        organization
      FROM asns
      WHERE 
        asn LIKE ? OR 
        as_name LIKE ? OR 
        as_name_zh LIKE ? OR
        organization LIKE ?
      ORDER BY asn
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, searchTerm, limit]);

    console.log(`[ASN Search] 查询结果数量: ${asns.length}`);
    if (asns.length === 0) {
      console.log('[ASN Search] 未找到匹配的ASN');
    } else {
      console.log(`[ASN Search] 找到匹配的ASN，第一个结果: ASN=${asns[0].asn}, 名称=${asns[0].as_name || asns[0].as_name_zh}`);
    }

    res.json({ 
      success: true, 
      data: asns 
    });
  } catch (error) {
    console.error('[ASN Search] 搜索ASN失败:', error);
    logger.error('搜索ASN失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '搜索ASN失败',
      error: error.message 
    });
  }
};

// 搜索前缀
exports.searchPrefixes = async (req, res) => {
  try {
    const query = req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;
    
    if (!query) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // 搜索前缀
    const [results] = await db.query(`
      SELECT prefix_id, prefix, country_id, asn, version, prefix_length
      FROM ip_prefixes
      WHERE prefix LIKE ?
      ORDER BY 
        CASE 
          WHEN prefix = ? THEN 0
          WHEN prefix LIKE ? THEN 1
          ELSE 2
        END,
        prefix
      LIMIT ?
    `, [`%${query}%`, query, `${query}%`, limit]);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('搜索前缀失败:', error);
    res.status(500).json({
      success: false,
      message: '搜索前缀失败'
    });
  }
};

//获取特定ASN的前缀列表
exports.getPrefixesByAsn = async (req, res) => {
  try {
    const asn = req.params.asn;
    
    // 验证ASN
    if (!asn || isNaN(parseInt(asn))) {
      return res.status(400).json({
        success: false,
        message: '无效的ASN'
      });
    }
    
    // 查询特定ASN的前缀
    const [results] = await db.query(`
      SELECT prefix_id, prefix, country_id, asn, version, prefix_length
      FROM ip_prefixes
      WHERE asn = ?
      ORDER BY prefix
    `, [asn]);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error(`获取ASN ${req.params.asn} 的前缀列表失败:`, error);
    res.status(500).json({
      success: false,
      message: '获取前缀列表失败'
    });
  }
};


//---------------协议管理相关API----------------//
//获取所有协议定义
exports.getProtocols = async (req, res) => {
  try {
    const [protocols] = await db.query('SELECT * FROM protocols ORDER BY protocol_name ASC');
    res.json({ success: true, data: protocols });
  } catch (error) {
    logger.error('获取协议定义列表失败:', error);
    res.status(500).json({ success: false, message: '获取协议定义列表失败' });
  }
};

//创建新的协议定义
exports.createProtocol = async (req, res) => {
  const { protocol_name, protocol_number, description, is_common, risk_level } = req.body;
  if (!protocol_name) {
    return res.status(400).json({ success: false, message: '缺少必要参数 (protocol_name)' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO protocols (protocol_name, protocol_number, description, is_common, risk_level) VALUES (?, ?, ?, ?, ?)',
      [protocol_name, protocol_number || null, description || null, is_common || false, risk_level || 'low']
    );
    res.status(201).json({ success: true, message: '协议定义创建成功', id: result.insertId });
  } catch (error) {
    logger.error('创建协议定义失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '协议名称已存在' });
    }
    res.status(500).json({ success: false, message: '创建协议定义失败' });
  }
};

// 更新现有协议定义
exports.updateProtocol = async (req, res) => {
  const { id } = req.params;
  const { protocol_name, protocol_number, description, is_common, risk_level } = req.body;

  if (!protocol_name && !protocol_number && !description && is_common === undefined && !risk_level) {
    return res.status(400).json({ success: false, message: '没有提供任何更新字段' });
  }

  // 构建更新语句和参数数组
  let query = 'UPDATE protocols SET ';
  const params = [];
  if (protocol_name !== undefined) { query += 'protocol_name = ?, '; params.push(protocol_name); }
  if (protocol_number !== undefined) { query += 'protocol_number = ?, '; params.push(protocol_number); }
  if (description !== undefined) { query += 'description = ?, '; params.push(description); }
  if (is_common !== undefined) { query += 'is_common = ?, '; params.push(is_common); }
  if (risk_level !== undefined) { query += 'risk_level = ?, '; params.push(risk_level); }
  
  query = query.slice(0, -2) + ' WHERE protocol_id = ?';
  params.push(id);

  try {
    const [result] = await db.query(query, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定ID的协议定义' });
    }
    res.json({ success: true, message: '协议定义更新成功' });
  } catch (error) {
    logger.error(`更新协议定义ID ${id} 失败:`, error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '协议名称已存在' });
    }
    res.status(500).json({ success: false, message: '更新协议定义失败' });
  }
};

//删除协议定义
exports.deleteProtocol = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 检查是否有 asn_protocol_stats 依赖
    const [statsReferences] = await connection.query('SELECT COUNT(*) as count FROM asn_protocol_stats WHERE protocol_id = ?', [id]);
    if (statsReferences[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '无法删除：此协议在ASN协议统计中仍被引用。请先移除相关统计数据。' });
    }

    const [result] = await connection.query('DELETE FROM protocols WHERE protocol_id = ?', [id]);
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '未找到指定ID的协议定义' });
    }

    await connection.commit();
    res.json({ success: true, message: '协议定义删除成功' });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(`删除协议定义ID ${id} 失败:`, error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
         return res.status(400).json({ success: false, message: '无法删除：此协议信息被其他数据表引用。' });
    }
    res.status(500).json({ success: false, message: '删除协议定义失败' });
  } finally {
    if (connection) connection.release();
  }
};

// 批量更新ASN协议受影响地址数
exports.batchUpdateAsnProtocolStats = async (req, res) => {
  const { operations } = req.body; // operations: [{ protocolId, asn, updateAction, value }]

  console.log(`[批量更新] 收到批量更新请求，操作数量: ${operations?.length || 0}`);
  if (operations && operations.length > 0) {
    console.log(`[批量更新] 第一个操作: 协议ID=${operations[0].protocolId}, ASN=${operations[0].asn}, 操作=${operations[0].updateAction}, 值=${operations[0].value}`);
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    console.log('[批量更新] 请求缺少有效的操作列表');
    return res.status(400).json({ success: false, message: '缺少有效的操作列表' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const results = [];
    let overallSuccess = true;

    for (const op of operations) {
      const { protocolId, asn, updateAction, value } = op;

      if (protocolId === undefined || asn === undefined || updateAction === undefined || value === undefined) {
        results.push({ ...op, success: false, message: '操作项缺少必要字段 (protocolId, asn, updateAction, value)' });
        overallSuccess = false;
        continue;
      }
      if (!['set', 'increment', 'decrement'].includes(updateAction)) {
        results.push({ ...op, success: false, message: `无效的操作类型: ${updateAction}` });
        overallSuccess = false;
        continue;
      }
      if (typeof value !== 'number' || value < 0) {
         results.push({ ...op, success: false, message: `更新数值必须为非负数: ${value}` });
        overallSuccess = false;
        continue;
      }


      // 获取ASN的当前总活跃IPv6地址数
      const [[asnDetails]] = await connection.query('SELECT total_active_ipv6 FROM asns WHERE asn = ?', [asn]);
      const totalActiveIpv6ForAsn = asnDetails ? asnDetails.total_active_ipv6 : 0;

      // 检查记录是否存在
      const [[existingStat]] = await connection.query(
        'SELECT affected_addresses FROM asn_protocol_stats WHERE asn = ? AND protocol_id = ?',
        [asn, protocolId]
      );

      let newAffectedAddresses;
      let query;
      let queryParams;

      if (existingStat) { // 记录存在，更新
        switch (updateAction) {
          case 'set':
            newAffectedAddresses = value;
            break;
          case 'increment':
            newAffectedAddresses = existingStat.affected_addresses + value;
            break;
          case 'decrement':
            newAffectedAddresses = Math.max(0, existingStat.affected_addresses - value);
            break;
        }
        query = `UPDATE asn_protocol_stats 
                   SET affected_addresses = ?, 
                       total_active_ipv6 = ?, 
                       affected_percentage = IF(? > 0, ROUND(? * 100.0 / ?, 2), 0),
                       last_updated = NOW()
                   WHERE asn = ? AND protocol_id = ?`;
        queryParams = [newAffectedAddresses, totalActiveIpv6ForAsn, totalActiveIpv6ForAsn, newAffectedAddresses, totalActiveIpv6ForAsn, asn, protocolId];
      } else { // 记录不存在，插入
        if (updateAction === 'decrement') {
          // 对于不存在的记录，减少操作没有意义，或者视为0
          newAffectedAddresses = 0;
        } else {
          newAffectedAddresses = value; // set 或 increment 视为从0开始
        }
        query = `INSERT INTO asn_protocol_stats 
                   (asn, protocol_id, affected_addresses, total_active_ipv6, affected_percentage, last_updated) 
                   VALUES (?, ?, ?, ?, IF(? > 0, ROUND(? * 100.0 / ?, 2), 0), NOW())`;
        queryParams = [asn, protocolId, newAffectedAddresses, totalActiveIpv6ForAsn, totalActiveIpv6ForAsn, newAffectedAddresses, totalActiveIpv6ForAsn];
      }
      
      try {
        await connection.query(query, queryParams);
        console.log(`[批量更新] 操作成功: 协议ID=${protocolId}, ASN=${asn}`);
        results.push({ ...op, success: true, message: '更新成功' });
      } catch (error) {
        console.error(`[批量更新] 处理ASN ${asn} 协议 ${protocolId} 更新失败:`, error);
        logger.error(`处理ASN ${asn} 协议 ${protocolId} 更新失败:`, error);
        results.push({ ...op, success: false, message: `数据库操作失败: ${error.message}` });
        overallSuccess = false;
      }
    }

    if (overallSuccess) {
      await connection.commit();
      console.log(`[批量更新] 所有操作成功完成，提交事务`);
      res.json({
        data: {
          success: true,
          message: '批量更新完成',
          results
        }
      });
    } else {
      await connection.rollback();
      console.log(`[批量更新] 部分操作失败，回滚事务`);
      // 即便部分失败也返回207 Multi-Status，让前端处理各个操作的结果
      res.status(207).json({
        data: {
          success: false,
          message: '批量更新部分失败',
          results
        }
      });
    }

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[批量更新] 批量更新ASN协议统计失败:', error);
    logger.error('批量更新ASN协议统计失败:', error);
    res.status(500).json({
      data: {
        success: false,
        message: `批量更新ASN协议统计失败: ${error.message}`
      }
    });
  } finally {
    if (connection) connection.release();
  }
};

//---------------漏洞管理相关API----------------//
//获取所有漏洞定义
exports.getVulnerabilities = async (req, res) => {
  try {
    const [vulnerabilities] = await db.query('SELECT * FROM vulnerabilities ORDER BY published_date DESC, name ASC');
    res.json({ success: true, data: vulnerabilities });
  } catch (error) {
    logger.error('获取漏洞定义列表失败:', error);
    res.status(500).json({ success: false, message: '获取漏洞定义列表失败' });
  }
};


//创建新的漏洞定义
exports.createVulnerability = async (req, res) => {
  const { cve_id, name, description, severity, affected_protocols, detection_method, published_date } = req.body;
  if (!cve_id || !name || !severity) {
    return res.status(400).json({ success: false, message: '缺少必要参数 (cve_id, name, severity)' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method, published_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [cve_id, name, description, severity, affected_protocols, detection_method, published_date || null]
    );
    res.status(201).json({ success: true, message: '漏洞定义创建成功', id: result.insertId });
  } catch (error) {
    logger.error('创建漏洞定义失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'CVE ID 已存在' });
    }
    res.status(500).json({ success: false, message: '创建漏洞定义失败' });
  }
};

// 更新现有漏洞定义
exports.updateVulnerability = async (req, res) => {
  const { id } = req.params;
  const { cve_id, name, description, severity, affected_protocols, detection_method, published_date } = req.body;

  if (!cve_id && !name && !description && !severity && !affected_protocols && !detection_method && !published_date) {
    return res.status(400).json({ success: false, message: '没有提供任何更新字段' });
  }

  // 构建更新语句和参数数组
  let query = 'UPDATE vulnerabilities SET ';
  const params = [];
  if (cve_id !== undefined) { query += 'cve_id = ?, '; params.push(cve_id); }
  if (name !== undefined) { query += 'name = ?, '; params.push(name); }
  if (description !== undefined) { query += 'description = ?, '; params.push(description); }
  if (severity !== undefined) { query += 'severity = ?, '; params.push(severity); }
  if (affected_protocols !== undefined) { query += 'affected_protocols = ?, '; params.push(affected_protocols); }
  if (detection_method !== undefined) { query += 'detection_method = ?, '; params.push(detection_method); }
  if (published_date !== undefined) { query += 'published_date = ?, '; params.push(published_date); }
  
  query += 'last_updated = NOW() WHERE vulnerability_id = ?';
  params.push(id);

  try {
    const [result] = await db.query(query, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定ID的漏洞定义' });
    }
    res.json({ success: true, message: '漏洞定义更新成功' });
  } catch (error) {
    logger.error(`更新漏洞定义ID ${id} 失败:`, error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'CVE ID 已存在' });
    }
    res.status(500).json({ success: false, message: '更新漏洞定义失败' });
  }
};


//删除漏洞定义
exports.deleteVulnerability = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 检查是否有 asn_vulnerability_stats 依赖
    const [statsReferences] = await connection.query('SELECT COUNT(*) as count FROM asn_vulnerability_stats WHERE vulnerability_id = ?', [id]);
    if (statsReferences[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: '无法删除：此漏洞在ASN漏洞统计中仍被引用。请先移除相关统计数据。' });
    }
    // 检查是否有 address_vulnerabilities 依赖 (如果旧表还可能存在数据)
    // const [addrReferences] = await connection.query('SELECT COUNT(*) as count FROM address_vulnerabilities WHERE vulnerability_id = ?', [id]);
    // if (addrReferences[0].count > 0) {
    //   await connection.rollback();
    //   return res.status(400).json({ success: false, message: '无法删除：此漏洞在地址漏洞关联中仍被引用。' });
    // }


    const [result] = await connection.query('DELETE FROM vulnerabilities WHERE vulnerability_id = ?', [id]);
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '未找到指定ID的漏洞定义' });
    }

    await connection.commit();
    res.json({ success: true, message: '漏洞定义删除成功' });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(`删除漏洞定义ID ${id} 失败:`, error);
    // ER_ROW_IS_REFERENCED_2: 检查外键约束
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
         return res.status(400).json({ success: false, message: '无法删除：此漏洞信息被其他数据表引用。' });
    }
    res.status(500).json({ success: false, message: '删除漏洞定义失败' });
  } finally {
    if (connection) connection.release();
  }
};

// 批量更新ASN漏洞受影响地址数
exports.batchUpdateAsnVulnerabilityStats = async (req, res) => {
  const { operations } = req.body; // operations: [{ vulnerabilityId, countryId, asn, updateAction, value }]

  console.log(`[批量更新] 收到批量更新请求，操作数量: ${operations?.length || 0}`);
  if (operations && operations.length > 0) {
    console.log(`[批量更新] 第一个操作: 漏洞ID=${operations[0].vulnerabilityId}, ASN=${operations[0].asn}, 操作=${operations[0].updateAction}, 值=${operations[0].value}`);
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    console.log('[批量更新] 请求缺少有效的操作列表');
    return res.status(400).json({ success: false, message: '缺少有效的操作列表' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const results = [];
    let overallSuccess = true;

    for (const op of operations) {
      const { vulnerabilityId, asn, updateAction, value } = op;

      if (vulnerabilityId === undefined || asn === undefined || updateAction === undefined || value === undefined) {
        results.push({ ...op, success: false, message: '操作项缺少必要字段 (vulnerabilityId, asn, updateAction, value)' });
        overallSuccess = false;
        continue;
      }
      if (!['set', 'increment', 'decrement'].includes(updateAction)) {
        results.push({ ...op, success: false, message: `无效的操作类型: ${updateAction}` });
        overallSuccess = false;
        continue;
      }
      if (typeof value !== 'number' || value < 0) {
         results.push({ ...op, success: false, message: `更新数值必须为非负数: ${value}` });
        overallSuccess = false;
        continue;
      }


      // 获取ASN的当前总活跃IPv6地址数
      const [[asnDetails]] = await connection.query('SELECT total_active_ipv6 FROM asns WHERE asn = ?', [asn]);
      const totalActiveIpv6ForAsn = asnDetails ? asnDetails.total_active_ipv6 : 0;

      // 检查记录是否存在
      const [[existingStat]] = await connection.query(
        'SELECT affected_addresses FROM asn_vulnerability_stats WHERE asn = ? AND vulnerability_id = ?',
        [asn, vulnerabilityId]
      );

      let newAffectedAddresses;
      let query;
      let queryParams;

      if (existingStat) { // 记录存在，更新
        switch (updateAction) {
          case 'set':
            newAffectedAddresses = value;
            break;
          case 'increment':
            newAffectedAddresses = existingStat.affected_addresses + value;
            break;
          case 'decrement':
            newAffectedAddresses = Math.max(0, existingStat.affected_addresses - value);
            break;
        }
        query = `UPDATE asn_vulnerability_stats 
                   SET affected_addresses = ?, 
                       total_active_ipv6 = ?, 
                       affected_percentage = IF(? > 0, ROUND(? * 100.0 / ?, 2), 0),
                       last_updated = NOW()
                   WHERE asn = ? AND vulnerability_id = ?`;
        queryParams = [newAffectedAddresses, totalActiveIpv6ForAsn, totalActiveIpv6ForAsn, newAffectedAddresses, totalActiveIpv6ForAsn, asn, vulnerabilityId];
      } else { // 记录不存在，插入
        if (updateAction === 'decrement') {
          // 对于不存在的记录，减少操作没有意义，或者视为0
          newAffectedAddresses = 0;
        } else {
          newAffectedAddresses = value; // set 或 increment 视为从0开始
        }
        query = `INSERT INTO asn_vulnerability_stats 
                   (asn, vulnerability_id, affected_addresses, total_active_ipv6, affected_percentage, last_updated) 
                   VALUES (?, ?, ?, ?, IF(? > 0, ROUND(? * 100.0 / ?, 2), 0), NOW())`;
        queryParams = [asn, vulnerabilityId, newAffectedAddresses, totalActiveIpv6ForAsn, totalActiveIpv6ForAsn, newAffectedAddresses, totalActiveIpv6ForAsn];
      }
      
      try {
        await connection.query(query, queryParams);
        console.log(`[批量更新] 操作成功: 漏洞ID=${vulnerabilityId}, ASN=${asn}`);
        results.push({ ...op, success: true, message: '更新成功' });
      } catch (error) {
        console.error(`[批量更新] 处理ASN ${asn} 漏洞 ${vulnerabilityId} 更新失败:`, error);
        logger.error(`处理ASN ${asn} 漏洞 ${vulnerabilityId} 更新失败:`, error);
        results.push({ ...op, success: false, message: `数据库操作失败: ${error.message}` });
        overallSuccess = false;
      }
    }

    if (overallSuccess) {
      await connection.commit();
      console.log(`[批量更新] 所有操作成功完成，提交事务`);
      res.json({
        data: {
          success: true,
          message: '批量更新完成',
          results
        }
      });
    } else {
      await connection.rollback();
      console.log(`[批量更新] 部分操作失败，回滚事务`);
      // 即便部分失败也返回207 Multi-Status，让前端处理各个操作的结果
      res.status(207).json({
        data: {
          success: false,
          message: '批量更新部分失败',
          results
        }
      });
    }

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[批量更新] 批量更新ASN漏洞统计失败:', error);
    logger.error('批量更新ASN漏洞统计失败:', error);
    res.status(500).json({
      data: {
        success: false,
        message: `批量更新ASN漏洞统计失败: ${error.message}`
      }
    });
  } finally {
    if (connection) connection.release();
  }
};

//---------------IPv6地址导入相关的API----------------//

/**
 * 导入IPv6地址
 */
exports.importAddresses = async (req, res) => {
  try {
    console.log('接收到导入请求:', JSON.stringify({
      countryId: req.body.countryId,
      asn: req.body.asn,
      prefix: req.body.prefix,
      addressCount: req.body.addresses ? req.body.addresses.length : 0
    }));
    
    // 验证必要参数
    if (!req.body.countryId || !req.body.asn || !req.body.prefix || !req.body.addresses || !Array.isArray(req.body.addresses)) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数或参数格式不正确'
      });
    }
    
    // 开始事务
    await db.query('START TRANSACTION');
    
    // 创建临时表
    await db.query(`
      CREATE TEMPORARY TABLE temp_addresses (
        address VARCHAR(128) NOT NULL,
        is_processed BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (address)
      )
    `);
    
    // 批量插入地址到临时表
    const insertValues = req.body.addresses.map(addr => [addr]);
    if (insertValues.length > 0) {
      await db.query(`
        INSERT INTO temp_addresses (address) VALUES ?
      `, [insertValues]);
    }
    
    // 调用存储过程 - 分两步执行
    // 1. 首先设置输出变量
    await db.query(`SET @imported = 0, @errors = 0`);
    
    // 2. 调用存储过程
    await db.query(`
      CALL batch_import_ipv6_addresses(?, ?, ?, @imported, @errors)
    `, [req.body.countryId, req.body.asn, req.body.prefix]);
    
    // 3. 单独查询输出变量的值
    const [resultSet] = await db.query(`
      SELECT @imported as imported_count, @errors as error_count
    `);
    
    // 获取导入结果
    const result = resultSet[0];
    
    // 提交事务
    await db.query('COMMIT');
    
    // 返回结果
    res.json({
      success: true,
      message: `成功导入${result.imported_count}个IPv6地址`,
      importedCount: result.imported_count,
      errorCount: result.error_count
    });
    
  } catch (error) {
    // 回滚事务
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('回滚事务失败:', rollbackError);
    }
    
    logger.error('导入地址过程中发生错误:', error);
    res.status(500).json({
      success: false,
      message: `导入地址失败: ${error.message}`
    });
  } finally {
    // 确保清理临时表
    try {
      await db.query('DROP TEMPORARY TABLE IF EXISTS temp_addresses');
    } catch (cleanupError) {
      console.error('清理临时表失败:', cleanupError);
    }
  }
};