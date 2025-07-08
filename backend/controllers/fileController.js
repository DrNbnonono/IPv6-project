const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const db = require('../database/db');
const { createLogger, transports } = require('winston');

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
});

// 配置文件上传


// 默认存储配置（向后兼容）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 这个函数现在主要用于向后兼容，实际使用动态配置
    const uploadDir = '/home/ipv6/IPv6-project/uploads';

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const toolType = req.body.toolType || 'database';
    const fileType = req.body.fileType || 'input';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

    let filePrefix;
    if (toolType === 'database') {
      filePrefix = 'address-';
    } else if (toolType === 'xmap') {
      filePrefix = 'whitelist_';
    } else if (toolType === 'zgrab2') {
      filePrefix = fileType === 'config' ? 'zgrab2_config_' : 'zgrab2_input_';
    } else {
      filePrefix = 'file-';
    }

    cb(null, `${filePrefix}${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// 上传文件 - 参考xmap的简单实现
exports.uploadFile = [
  upload.single('file'), // 添加multer中间件
  async (req, res) => {
    console.log('=== 文件上传开始 ===');
    console.log('请求体:', req.body);
    console.log('请求文件:', req.file);
    console.log('用户信息:', req.user);

    if (!req.file) {
      console.error('错误: 未上传文件');
      return res.status(400).json({
        success: false,
        message: '未上传文件'
      });
    }

    const userId = req.user.id;
    const toolType = req.body.toolType || 'database';
    const fileType = req.body.fileType || 'input';
    const description = req.body.description || '';

    console.log('文件上传参数:', { userId, toolType, fileType, description });
    console.log('原始文件信息:', {
      originalName: req.file.originalname,
      tempPath: req.file.path,
      size: req.file.size
    });

    try {
      // 根据工具类型和文件类型确定目标目录和文件前缀
      let targetDir, filePrefix;

      console.log('开始处理文件路径...');
      switch(toolType) {
        case 'xmap':
          targetDir = '/home/ipv6/IPv6-project/whitelists';
          filePrefix = 'whitelist_';
          break;
        case 'database':
          targetDir = '/home/ipv6/IPv6-project/IPv6_addresses';
          filePrefix = 'address-';
          break;
        case 'zgrab2':
          if (fileType === 'config') {
            targetDir = '/home/ipv6/IPv6-project/zgrab2_configs';
            filePrefix = 'zgrab2_config_';
          } else {
            targetDir = '/home/ipv6/IPv6-project/zgrab2_inputs';
            filePrefix = 'zgrab2_input_';
          }
          break;
        case 'jsonanalysis':
          if (fileType === 'result') {
            targetDir = '/home/ipv6/IPv6-project/jsonanalysis';
            filePrefix = 'json_result_';
          } else {
            targetDir = '/home/ipv6/IPv6-project/jsonanalysis';
            filePrefix = 'json_upload_';
          }
          break;
        default:
          targetDir = '/home/ipv6/IPv6-project/uploads';
          filePrefix = 'file-';
      }

      console.log('目标目录和前缀:', { targetDir, filePrefix });

      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        console.log('创建目标目录:', targetDir);
        fs.mkdirSync(targetDir, { recursive: true });
      } else {
        console.log('目标目录已存在:', targetDir);
      }

      // 生成新文件名（参考xmap的命名方式）
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${filePrefix}${userId}_${Date.now()}${fileExt}`;
      const filePath = path.join(targetDir, fileName);

      console.log('生成文件信息:', { fileName, filePath });

      // 移动文件到目标位置（参考xmap的方式）
      console.log('开始移动文件...');
      fs.renameSync(req.file.path, filePath);

      console.log('文件移动成功:', {
        from: req.file.path,
        to: filePath
      });

      // 获取工具ID
      console.log('查询工具ID...');
      const [tools] = await db.query(
        "SELECT id FROM tools WHERE name = ? LIMIT 1",
        [toolType]
      );

      console.log('工具查询结果:', tools);

      if (tools.length === 0) {
        console.error('工具类型不存在:', toolType);
        // 如果工具不存在，删除已上传的文件
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('已删除上传的文件:', filePath);
        }
        return res.status(400).json({
          success: false,
          message: `工具类型不存在: ${toolType}`
        });
      }

      const toolId = tools[0].id;
      console.log('获取到工具ID:', toolId);

      // 保存文件信息到数据库（参考xmap的方式）
      const query = `
        INSERT INTO whitelists
        (user_id, tool_id, file_name, file_path, description, is_deleted, uploaded_at)
        VALUES (?, ?, ?, ?, ?, 0, NOW())
      `;

      console.log('准备插入数据库:', {
        userId,
        toolId,
        fileName,
        filePath,
        description
      });

      const [result] = await db.query(query, [
        userId,
        toolId,
        fileName,      // 使用生成的文件名
        filePath,      // 使用完整路径
        description
      ]);

      console.log('数据库插入结果:', result);

      const responseData = {
        success: true,
        message: '文件上传成功',
        data: {
          id: result.insertId,
          fileName: req.file.originalname,  // 返回原始文件名给前端显示
          filePath: filePath,
          toolType: toolType,
          fileType: fileType
        }
      };

      console.log('准备返回响应:', responseData);
      res.json(responseData);
      console.log('=== 文件上传成功完成 ===');

    } catch (error) {
      console.error('=== 文件上传失败 ===');
      console.error('错误详情:', error);
      console.error('错误堆栈:', error.stack);
      logger.error('文件上传失败:', error);

      // 如果出错，尝试清理已上传的文件
      try {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('已清理临时文件:', req.file.path);
        }
      } catch (cleanupError) {
        console.error('清理临时文件失败:', cleanupError);
        logger.error('清理临时文件失败:', cleanupError);
      }

      const errorResponse = {
        success: false,
        message: '文件上传失败: ' + error.message
      };
      console.log('返回错误响应:', errorResponse);
      res.status(500).json(errorResponse);
    }
  }
];

// 获取文件列表
exports.getFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const toolType = req.query.toolType;
    const fileType = req.query.fileType;
    const listType = req.query.listType || 'upload'; // 'upload' 或 'task'

    console.log('获取文件列表请求参数:', { userId, toolType, fileType, listType });

    let files = [];

    if (listType === 'upload') {
      // 获取上传的文件列表
      let query = `
        SELECT
          w.id,
          w.file_name,
          w.file_path,
          w.description,
          w.uploaded_at,
          t.name as tool_name,
          'upload' as source_type
        FROM whitelists w
        JOIN tools t ON w.tool_id = t.id
        WHERE w.user_id = ? AND w.is_deleted = 0
      `;

      const params = [userId];

      if (toolType) {
        query += ' AND t.name = ?';
        params.push(toolType);
      }

      // 如果指定了文件类型，则按文件类型筛选
      if (fileType && toolType === 'zgrab2') {
        if (fileType === 'config') {
          query += ` AND (w.file_name LIKE '%config%' OR w.file_name LIKE '%.ini')`;
        } else if (fileType === 'input') {
          query += ` AND w.file_name NOT LIKE '%config%' AND w.file_name NOT LIKE '%.ini'`;
        }
      }

      query += ' ORDER BY w.uploaded_at DESC';

      console.log('执行上传文件查询:', query, params);
      const [uploadFiles] = await db.query(query, params);
      files = uploadFiles;

    } else if (listType === 'task') {
      // 获取任务结果文件列表
      let query = `
        SELECT
          t.id,
          CONCAT(t.description, ' (任务ID: ', t.id, ')') as file_name,
          t.output_path as file_path,
          t.log_path,
          t.description,
          t.created_at as uploaded_at,
          t.completed_at,
          t.task_type as tool_name,
          t.status,
          'task' as source_type
        FROM tasks t
        WHERE t.user_id = ?
      `;

      const params = [userId];

      if (toolType) {
        query += ' AND t.task_type = ?';
        params.push(toolType);
      }

      query += ' ORDER BY t.created_at DESC';

      console.log('执行任务文件查询:', query, params);
      const [taskFiles] = await db.query(query, params);
      files = taskFiles;
    }

    console.log(`查询到 ${files.length} 个文件`);

    // 处理文件信息，添加文件大小等
    const processedFiles = files.map(file => {
      let fileSize = null;
      let logFileSize = null;

      try {
        if (file.file_path && fs.existsSync(file.file_path)) {
          const stats = fs.statSync(file.file_path);
          fileSize = stats.size;
        }

        // 对于任务文件，也获取日志文件大小
        if (file.log_path && fs.existsSync(file.log_path)) {
          const logStats = fs.statSync(file.log_path);
          logFileSize = logStats.size;
        }
      } catch (error) {
        console.error('获取文件大小失败:', error);
      }

      // 根据工具类型和文件路径推断文件类型
      let inferredFileType = null;
      if (file.tool_name === 'zgrab2' && listType === 'upload') {
        if (file.file_path && (file.file_path.includes('zgrab2_configs') || file.file_name.endsWith('.ini'))) {
          inferredFileType = 'config';
        } else if (file.file_path && (file.file_path.includes('zgrab2_inputs') || file.file_name.endsWith('.txt'))) {
          inferredFileType = 'input';
        }
      }

      return {
        ...file,
        tool_type: file.tool_name,
        file_type: inferredFileType,
        file_size: fileSize,
        log_file_size: logFileSize
      };
    });

    res.json({
      success: true,
      data: processedFiles
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

    // 物理删除文件（参考xmap的实现）
    try {
      if (fs.existsSync(files[0].file_path)) {
        fs.unlinkSync(files[0].file_path);
        console.log('物理文件删除成功:', files[0].file_path);
      } else {
        console.log('物理文件不存在:', files[0].file_path);
      }
    } catch (fileError) {
      logger.error('删除物理文件失败:', fileError);
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
    const userId = req.user.id;
    const fileType = req.query.fileType || 'result'; // 'result' 或 'log'

    console.log('下载文件请求:', { fileId, userId, fileType });

    let file = null;
    let filePath = null;
    let fileName = null;

    // 首先尝试从上传文件表查找
    const [uploadFiles] = await db.query(`
      SELECT w.file_name, w.file_path
      FROM whitelists w
      WHERE w.id = ? AND w.user_id = ? AND w.is_deleted = 0
    `, [fileId, userId]);

    if (uploadFiles.length > 0) {
      file = uploadFiles[0];
      filePath = file.file_path;
      fileName = file.file_name;
    } else {
      // 如果不是上传文件，尝试从任务表查找
      const [taskFiles] = await db.query(`
        SELECT t.id, t.description, t.output_path, t.log_path, t.task_type
        FROM tasks t
        WHERE t.id = ? AND t.user_id = ?
      `, [fileId, userId]);

      if (taskFiles.length === 0) {
        return res.status(404).json({
          success: false,
          message: '文件不存在或无权访问'
        });
      }

      const task = taskFiles[0];

      if (fileType === 'log') {
        filePath = task.log_path;
        fileName = `${task.task_type}_task_${task.id}_log.txt`;
      } else {
        filePath = task.output_path;
        // 根据任务类型确定文件扩展名
        let extension = '.txt';
        if (task.task_type === 'zgrab2') {
          extension = '.jsonl';
        } else if (task.task_type === 'xmap') {
          extension = '.json';
        }
        fileName = `${task.task_type}_task_${task.id}_result${extension}`;
      }
    }

    // 检查文件是否存在
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或已被删除'
      });
    }

    console.log('准备下载文件:', { filePath, fileName });

    // 根据文件扩展名设置Content-Type
    let contentType = 'text/plain';
    if (fileName.endsWith('.json') || fileName.endsWith('.jsonl')) {
      contentType = 'application/json';
    } else if (fileName.endsWith('.ini')) {
      contentType = 'text/plain';
    }

    // 设置响应头
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // 创建文件流并发送
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    console.log('文件下载开始:', fileName);
  } catch (error) {
    logger.error('下载文件失败:', error);
    console.error('下载文件详细错误:', error);
    res.status(500).json({
      success: false,
      message: '下载文件失败: ' + error.message
    });
  }
};

// 获取文件内容
exports.getFileContent = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const fileType = req.query.fileType || 'result'; // 'result' 或 'log'

    console.log('获取文件内容请求:', { fileId, userId, fileType });

    let filePath = null;
    let fileName = null;

    // 首先尝试从上传文件表查找
    const [uploadFiles] = await db.query(`
      SELECT file_name, file_path
      FROM whitelists
      WHERE id = ? AND user_id = ? AND is_deleted = 0
    `, [fileId, userId]);

    if (uploadFiles.length > 0) {
      const file = uploadFiles[0];
      filePath = file.file_path;
      fileName = file.file_name;
    } else {
      // 如果不是上传文件，尝试从任务表查找
      const [taskFiles] = await db.query(`
        SELECT t.id, t.description, t.output_path, t.log_path, t.task_type
        FROM tasks t
        WHERE t.id = ? AND t.user_id = ?
      `, [fileId, userId]);

      if (taskFiles.length === 0) {
        return res.status(404).json({
          success: false,
          message: '文件不存在或无权访问'
        });
      }

      const task = taskFiles[0];

      if (fileType === 'log') {
        filePath = task.log_path;
        fileName = `${task.task_type}_task_${task.id}_log.txt`;
      } else {
        filePath = task.output_path;
        fileName = `${task.task_type}_task_${task.id}_result`;
      }
    }

    // 检查文件是否存在
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或已被删除'
      });
    }

    console.log('准备读取文件内容:', { filePath, fileName });

    // 读取文件内容，限制大小以避免内存问题
    const stats = fs.statSync(filePath);
    const maxSize = 10 * 1024 * 1024; // 10MB限制

    if (stats.size > maxSize) {
      return res.status(413).json({
        success: false,
        message: '文件过大，无法在线预览，请下载查看'
      });
    }

    const content = fs.readFileSync(filePath, 'utf8');

    res.json({
      success: true,
      data: {
        fileName: fileName,
        content: content,
        fileSize: stats.size
      }
    });
  } catch (error) {
    logger.error('获取文件内容失败:', error);
    console.error('获取文件内容详细错误:', error);
    res.status(500).json({
      success: false,
      message: '获取文件内容失败: ' + error.message
    });
  }
};