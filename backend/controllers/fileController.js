const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../database/db');
const { createLogger, transports } = require('winston');

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
});

// 配置文件上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // 根据工具类型选择不同的上传目录
    const toolType = req.body.toolType || 'database';
    let uploadDir = '/home/ipv6/IPv6-project/uploads';
    
    // 根据工具类型设置不同的目录
    switch(toolType) {
      case 'xmap':
        uploadDir = '/home/ipv6/IPv6-project/whitelists';
        break;
      case 'database':
        uploadDir = '/home/ipv6/IPv6-project/IPv6_addresses';
        break;
      case 'zgrab2':
        uploadDir = '/home/ipv6/IPv6-project/zgrab2_inputs';
        break;
      default:
        uploadDir = '/home/ipv6/IPv6-project/uploads';
    }
    
    console.log(`文件上传目录: ${uploadDir}, 工具类型: ${toolType}`);
    
    // 确保目录存在
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const toolType = req.body.toolType || 'database';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filePrefix = toolType === 'database' ? 'address-' : 
                       toolType === 'xmap' ? 'whitelist_' : 
                       toolType === 'zgrab2' ? 'zgrab2-' : 'file-';
    
    cb(null, `${filePrefix}${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// 上传文件
exports.uploadFile = async (req, res) => {
  console.log('接收到文件上传请求，参数:', req.body);
  
  try {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        logger.error('文件上传失败:', err);
        return res.status(400).json({
          success: false,
          message: '文件上传失败: ' + err.message
        });
      }

      if (!req.file) {
        logger.error('未找到上传的文件');
        return res.status(400).json({
          success: false,
          message: '未找到上传的文件'
        });
      }

      console.log('文件上传成功:', {
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        toolType: req.body.toolType,
        description: req.body.description
      });

      // 获取工具ID
      const toolType = req.body.toolType || 'database';
      const [tools] = await db.query(
        "SELECT id FROM tools WHERE name = ? LIMIT 1",
        [toolType]
      );
      
      if (tools.length === 0) {
        logger.error(`工具类型不存在: ${toolType}`);
        return res.status(400).json({
          success: false,
          message: `工具类型不存在: ${toolType}`
        });
      }
      
      const toolId = tools[0].id;
      
      // 保存文件信息到数据库
      const [result] = await db.query(`
        INSERT INTO whitelists (user_id, tool_id, file_name, file_path, description)
        VALUES (?, ?, ?, ?, ?)
      `, [
        req.user.id,
        toolId,
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
          filePath: req.file.path,
          toolType: toolType
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

// 获取文件列表
exports.getFiles = async (req, res) => {
  try {
    const toolType = req.query.toolType;
    let query = `
      SELECT w.id, w.file_name, w.file_path, w.description, w.uploaded_at, 
             u.username, t.name as tool_name
      FROM whitelists w
      JOIN users u ON w.user_id = u.id
      JOIN tools t ON w.tool_id = t.id
      WHERE w.is_deleted = 0
    `;
    
    const params = [];
    
    // 如果指定了工具类型，则按工具类型筛选
    if (toolType) {
      query += ` AND t.name = ?`;
      params.push(toolType);
    }
    
    query += ` ORDER BY w.uploaded_at DESC`;
    
    console.log('执行查询:', query, params);
    const [files] = await db.query(query, params);
    console.log(`查询到 ${files.length} 个文件`);

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    logger.error('获取文件列表失败:', error);
    console.error('获取文件列表详细错误:', error);
    res.status(500).json({
      success: false,
      message: '获取文件列表失败: ' + error.message
    });
  }
};

// 删除文件
exports.deleteFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // 检查文件是否存在且属于当前用户
    const [files] = await db.query(`
      SELECT file_path 
      FROM whitelists 
      WHERE id = ? AND user_id = ? AND is_deleted = 0
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

// 下载文件
exports.downloadFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // 获取文件信息
    const [files] = await db.query(`
      SELECT file_name, file_path 
      FROM whitelists 
      WHERE id = ? AND is_deleted = 0
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