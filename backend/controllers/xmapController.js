const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const { createLogger, format, transports } = require('winston');
const util = require('util');
// 配置系统日志和目录
const logDir = path.join(__dirname, '../../backend_logs');
const XMAP_LOG_DIR = path.join(__dirname, '../../xmap_log');
const XMAP_RESULT_DIR = path.join(__dirname, '../../xmap_result');
const WHITELIST_DIR = path.join(__dirname, '../../whitelists');

const ITEMS_PER_PAGE = 20; //每次查询的页面总数

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

// 确保所有目录存在
[logDir, XMAP_LOG_DIR, XMAP_RESULT_DIR, WHITELIST_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 添加获取文件大小的辅助函数
const getFileSize = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return stats.size;
    }
    return 0;
  } catch (error) {
    logger.error(`获取文件大小失败: ${filePath}`, error);
    return 0;
  }
};

// 日志配置
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    new transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    )
  }));
}

// 任务进程存储对象
const activeProcesses = new Map();

// 验证XMap参数
const validateXmapParams = (params) => {
  const allowedParams = ['ipv6', 'ipv4', 'maxlen', 'rate', 'targetPort', 'targetaddress', 'help', 'whitelistFile', 'max_results', 'description', 'probeModule'];
  const forbiddenChars = /[;&|<>]/;
  
  for (const [key, value] of Object.entries(params)) {
    if (!allowedParams.includes(key)) {
      throw new Error(`非法参数: ${key}`);
    }
    
    if (value && typeof value === 'string' && forbiddenChars.test(value)) {
      throw new Error(`参数 ${key} 包含非法字符`);
    }
  }
};

// 添加读取文件最后几行的辅助函数
// 优化读取CSV文件的逻辑，只读取头部和最新的几行
async function readLastLines(filePath, numLines) {
  return new Promise((resolve, reject) => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        return resolve('');
      }

      // 使用更高效的方式读取大文件
      // 1. 首先读取文件头部获取列名
      const headerStream = fs.createReadStream(filePath, {
        encoding: 'utf8',
        start: 0,
        end: 1024 // 假设头部不超过1KB
      });
      
      let headerContent = '';
      headerStream.on('data', chunk => {
        headerContent += chunk;
      });
      
      headerStream.on('end', () => {
        // 提取头部行（列名）
        const headerEnd = headerContent.indexOf('\n');
        if (headerEnd === -1) {
          return resolve(headerContent);
        }
        
        const header = headerContent.substring(0, headerEnd);
        
        // 2. 然后读取文件末尾的几行
        // 对于大文件，我们只读取末尾的一小部分
        const tailSize = Math.min(10 * 1024, stats.size); // 最多读取末尾10KB
        const tailStream = fs.createReadStream(filePath, {
          encoding: 'utf8',
          start: Math.max(0, stats.size - tailSize)
        });
        
        let tailContent = '';
        tailStream.on('data', chunk => {
          tailContent += chunk;
        });
        
        tailStream.on('end', () => {
          // 分割成行并过滤空行
          const allLines = tailContent.split('\n').filter(line => line.trim());
          
          // 只保留最后几行
          const lastLines = allLines.slice(-numLines);
          
          // 合并头部和最后几行
          resolve(header + '\n' + lastLines.join('\n'));
        });
        
        tailStream.on('error', err => {
          reject(err);
        });
      });
      
      headerStream.on('error', err => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}


// 验证白名单文件格式
const validateWhitelistFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    // 匹配纯IPv6地址或IPv6 CIDR
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:){0,7}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,7}[0-9a-fA-F]{1,4})?(\/\d{1,3})?$/;
    
    // 匹配纯IPv4地址或IPv4 CIDR
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;

    for (const line of lines) {
      if (!ipv6Regex.test(line) && !ipv4Regex.test(line)) {
        throw new Error(`无效的IP格式: ${line}。可接受的格式示例: "2001:db8::1", "2001:db8::/32", "192.168.1.1", "192.168.1.0/24"`);
      }
    }
    
    return true;
  } catch (error) {
    logger.error('白名单文件验证失败', { error: error.message });
    throw error;
  }
};
// 上传白名单文件
exports.uploadWhitelist = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: '未上传文件'
    });
  }

  const userId = req.user.id;
  const { description, tool } = req.body; // 新增获取描述和工具
  const originalName = req.file.originalname;
  const fileExt = path.extname(originalName);
  const fileName = `whitelist_${userId}_${Date.now()}${fileExt}`;
  const filePath = path.join(WHITELIST_DIR, fileName);

  try {
    fs.renameSync(req.file.path, filePath);
    validateWhitelistFile(filePath);
    
    const [tools] = await db.query(
      "SELECT id FROM tools WHERE name = ? LIMIT 1",
      [tool || 'xmap'] // 默认为xmap
    );
    
    if (tools.length === 0) {
      throw new Error('工具不存在');
    }
    
    // 保存到数据库
    await db.query(
      `INSERT INTO whitelists 
       (user_id, tool_id, file_name, file_path, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tools[0].id, fileName, filePath, description]
    );

    res.json({
      success: true,
      message: '白名单文件上传成功',
      fileName: fileName
    });
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(400).json({
      success: false,
      message: '白名单文件验证失败: ' + error.message
    });
  }
};

// 获取用户上传的白名单文件列表
exports.getWhitelists = async (req, res) => {
  const userId = req.user.id;
  const { tool, page = 1, pageSize = 10 } = req.query;
  
  try {
    // 基础查询
    let query = `
      SELECT w.id, w.file_name, w.description, w.uploaded_at, t.name as tool_name
      FROM whitelists w
      JOIN tools t ON w.tool_id = t.id
      WHERE w.user_id = ? AND w.is_deleted = 0
    `;
    
    const params = [userId];
    
    // 按工具筛选
    if (tool) {
      query += ' AND t.name = ?';
      params.push(tool);
    }
    
    // 分页
    const offset = (page - 1) * pageSize;
    query += ' ORDER BY w.uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), offset);
    
    // 获取数据
    const [whitelists] = await db.query(query, params);
    
    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM whitelists w
      JOIN tools t ON w.tool_id = t.id
      WHERE w.user_id = ? AND w.is_deleted = 0
    `;
    const countParams = [userId];
    
    if (tool) {
      countQuery += ' AND t.name = ?';
      countParams.push(tool);
    }
    
    const [[{ total }]] = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: whitelists,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    logger.error('获取白名单列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取白名单列表失败'
    });
  }
};

// 添加删除白名单方法
exports.deleteWhitelist = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  
  try {
    // 验证文件属于当前用户
    const [files] = await db.query(
      'SELECT file_path FROM whitelists WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [id, userId]
    );
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或无权操作'
      });
    }
    
    // 软删除（标记为已删除）
    await db.query(
      'UPDATE whitelists SET is_deleted = 1 WHERE id = ?',
      [id]
    );
    
    // 物理删除文件（可选）
    try {
      if (fs.existsSync(files[0].file_path)) {
        fs.unlinkSync(files[0].file_path);
      }
    } catch (fileError) {
      logger.error('删除物理文件失败:', fileError);
    }
    
    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    logger.error('删除白名单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除白名单失败'
    });
  }
};

// 修改上传白名单方法
exports.uploadWhitelist = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: '未上传文件'
    });
  }

  const userId = req.user.id;
  const { description = '', tool = 'xmap' } = req.body; // 默认值和解构
  const originalName = req.file.originalname;
  const fileExt = path.extname(originalName);
  const fileName = `whitelist_${userId}_${Date.now()}${fileExt}`;
  const filePath = path.join(WHITELIST_DIR, fileName);

  try {
    // 验证前先移动文件
    fs.renameSync(req.file.path, filePath);
    validateWhitelistFile(filePath);
    
    // 获取工具ID
    const [tools] = await db.query(
      "SELECT id FROM tools WHERE name = ? LIMIT 1",
      [tool]
    );
    
    if (tools.length === 0) {
      throw new Error('指定的工具不存在');
    }

    // 明确的列名和值对应
    const query = `
      INSERT INTO whitelists 
      (user_id, tool_id, file_name, file_path, description, is_deleted, uploaded_at)
      VALUES (?, ?, ?, ?, ?, 0, NOW())
    `;
    
    await db.query(query, [
      userId,
      tools[0].id,
      fileName,
      filePath,
      description
    ]);
    
    res.json({
      success: true,
      message: '白名单文件上传成功',
      data: {
        fileName,
        description
      }
    });
  } catch (error) {
    // 错误时清理文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    logger.error('白名单上传错误:', error);
    res.status(500).json({
      success: false,
      message: `白名单上传失败: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


// 创建扫描任务
exports.scan = async (req, res) => {
  const userId = req.user.id;
  const { 
    ipv6, ipv4, maxlen, rate, 
    targetPort, targetaddress, help,
    whitelistFile, max_results, description, probeModule 
  } = req.body;

  try {
    validateXmapParams(req.body);
    
    const taskId = Date.now();
    const logFile = path.join(XMAP_LOG_DIR, `${taskId}.csv`);
    const resultFile = path.join(XMAP_RESULT_DIR, `${taskId}.json`);
    const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);

    const args = [];
    if (ipv6) args.push('-6');
    if (ipv4) args.push('-4');
    if (maxlen) args.push('-x', maxlen);
    if (rate) args.push('-B', rate);
    if (targetPort) args.push('-p', targetPort);
    if (probeModule) args.push('-M', probeModule); // 添加扫描模式参数
    if (targetaddress) args.push(targetaddress);
    if (help) args.push('-h');
    if (max_results) args.push('-N', max_results);
    
    if (whitelistFile) {
      const whitelistPath = path.join(WHITELIST_DIR, whitelistFile);
      if (fs.existsSync(whitelistPath)) {
        args.push('-w', whitelistPath);
      } else {
        throw new Error('白名单文件不存在');
      }
    }
    
    args.push('-u', logFile, '-o', resultFile, '-q', '-O', 'json' , '-f', `*`);

    /*
    if (ipv6){
      args.push('-S', '2001:250:200:10:20c:29ff:fe88:8a32');
    }
    else if (ipv4){
      args.push('-S', '192.168.1.1', '-G', '00:00:5e:00:01:08');
    }*/

    await db.query(
      'INSERT INTO tasks (id, user_id, command,description, status, log_path, output_path,  task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, userId, `sudo xmap ${args.join(' ')}`, description, 'running', logFile, resultFile, 'xmap']
    );

    logger.info(`用户 ${userId} 创建新任务 ${taskId}`, { 
      command: `sudo xmap ${args.join(' ')}`,
      description,
      user: userId 
    });

    const xmapProcess = spawn('sudo', ['xmap', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // xmapProcess.stdin.write('NKU@ipv6!218\n');
    // xmapProcess.stdin.end();

    activeProcesses.set(taskId, xmapProcess);
    const errorStream = fs.createWriteStream(errorLogFile);
    xmapProcess.stderr.pipe(errorStream);

    xmapProcess.on('close', async (code, signal) => {
      activeProcesses.delete(taskId);
      
      let status = 'completed';
      let errorMsg = null;
      
      if (code !== 0 || signal) {
        status = 'failed';
        errorMsg = `进程异常终止 - 退出码: ${code}, 信号: ${signal || '无'}`;
        
        try {
          const errorData = fs.readFileSync(errorLogFile, 'utf-8');
          const errorLines = errorData.split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/sudo:\s*/, ''));
          
          if (errorLines.length > 0) {
            errorMsg += `\n最后错误:\n${errorLines.slice(-5).join('\n')}`;
          }
        } catch (readError) {
          errorMsg += ` | 无法读取错误日志: ${readError.message}`;
        }
      }

      try {
        await db.query(
          `UPDATE tasks 
           SET status = ?, 
               error_message = ?,
               exit_code = ?,
               process_signal = ?,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, errorMsg, code, signal, taskId]
        );
      } catch (dbError) {
        logger.error(`更新任务 ${taskId} 状态失败`, {
          error: dbError.message
        });
      }
    });

    res.status(202).json({
      success: true,
      taskId,
      message: '扫描任务已开始'
    });

  } catch (error) {
    logger.error('任务创建失败', { 
      error: error.message,
      stack: error.stack,
      user: userId,
      params: req.body
    });
    
    res.status(400).json({
      success: false,
      message: '任务创建失败: ' + error.message
    });
  }
};

// 终止任务
exports.cancelTask = async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const userId = req.user.id;

  try {
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    const [tasks] = await db.query(
      'SELECT id, status FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在或无权访问' 
      });
    }

    const task = tasks[0];
    
    if (!['pending', 'running'].includes(task.status)) {
      return res.status(400).json({
        success: false,
        message: `任务当前状态为 ${task.status}，无法终止`
      });
    }

    if (activeProcesses.has(taskId)) {
      const process = activeProcesses.get(taskId);
      
      // 先尝试终止进程
      process.kill('SIGTERM');
      
      // 确保子进程也被终止（因为使用sudo启动的进程可能有子进程）
      try {
        // 使用系统命令查找并杀死相关的xmap进程
        const killCommand = spawn('pkill', ['-f', `xmap.*${taskId}`]);
        
        killCommand.on('close', (code) => {
          logger.info(`尝试终止任务 ${taskId} 相关进程，退出码: ${code}`);
        });
      } catch (killError) {
        logger.error(`尝试终止任务 ${taskId} 相关进程失败`, { error: killError.message });
      }
      
      activeProcesses.delete(taskId);
    }

    await db.query(
      `UPDATE tasks 
       SET status = 'canceled', 
           error_message = '用户手动终止',
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [taskId]
    );

    res.json({
      success: true,
      message: '任务已终止'
    });

  } catch (error) {
    logger.error(`终止任务 ${taskId} 失败`, { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '终止任务失败: ' + error.message
    });
  }
};

// 删除任务
exports.deleteTask = async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const userId = req.user.id;

  try {
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    const [tasks] = await db.query(
      'SELECT id, status, log_path, output_path FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在或无权访问' 
      });
    }

    const task = tasks[0];

    if (task.status === 'running') {
      return res.status(400).json({
        success: false,
        message: '任务正在运行中，请先终止任务'
      });
    }

    // 删除相关文件
    const filesToDelete = [
      task.log_path,
      task.output_path,
      path.join(XMAP_LOG_DIR, `${taskId}_error.log`)
    ];

    for (const filePath of filesToDelete) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fileError) {
          logger.warn(`删除任务 ${taskId} 文件 ${filePath} 失败`, {
            error: fileError.message
          });
        }
      }
    }

    await db.query(
      'DELETE FROM tasks WHERE id = ?',
      [taskId]
    );

    res.json({
      success: true,
      message: '任务已删除'
    });

  } catch (error) {
    logger.error(`删除任务 ${taskId} 失败`, {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '删除任务失败: ' + error.message
    });
  }
};

// 获取任务详情
// 修改getTaskDetails方法，增强CSV文件解析
// 修改getTaskDetails方法，添加文件大小和实时读取功能
exports.getTaskDetails = async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const userId = req.user.id;

  try {
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    const [tasks] = await db.query(
      `SELECT 
        id, command, description, status, 
        created_at, completed_at, 
        error_message, log_path, output_path,
        exit_code, process_signal
      FROM tasks 
      WHERE id = ? AND user_id = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在或无权访问' 
      });
    }

    const task = tasks[0];
    let errorLog = null;
    let progress = null;
    let resultFileSize = 0;
    let hasResultFile = false;
    let hasProgressFile = false;

    // 检查结果文件
    if (task.output_path) {
      try {
        hasResultFile = fs.existsSync(task.output_path);
        resultFileSize = hasResultFile ? getFileSize(task.output_path) : 0;
      } catch (error) {
        logger.warn(`检查结果文件失败: ${task.output_path}`, error);
      }
    }

    // 读取扫描进度
    if (task.log_path && fs.existsSync(task.log_path)) {
      try {
        // 只读取最后2行进度数据，提高大文件处理效率
        const data = await readLastLines(task.log_path, 2);
        const lines = data.trim().split('\n');
        
        if (lines.length > 1) {
          const headers = lines[0].split(',');
          const stats = [];
          
          // 只处理最后一行，这是最新的进度数据
          const lastLine = lines[lines.length - 1];
          if (lastLine.trim()) {
            const values = lastLine.split(',');
            const entry = headers.reduce((obj, header, index) => {
              obj[header] = values[index]?.trim();
              return obj;
            }, {});
            
            stats.push(entry);
          }
          
          if (stats.length > 0) {
            progress = {
              latest: stats[0],
              history: stats
            };
            hasProgressFile = true;
          }
        }
      } catch (error) {
        logger.warn(`读取任务 ${taskId} 进度日志失败`, { 
          error: error.message,
          stack: error.stack
        });
      }
    }
  

    // 读取错误日志
    if (['failed', 'canceled'].includes(task.status)) {
      const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);
      try {
        if (fs.existsSync(errorLogFile)) {
          errorLog = fs.readFileSync(errorLogFile, 'utf-8');
        }
      } catch (error) {
        logger.warn(`读取错误日志失败: ${errorLogFile}`, error);
      }
    }

    res.json({
      success: true,
      task: {
        ...task,
        errorLog,
        progress,
        hasResultFile,
        resultFileSize,
        hasProgressFile
      }
    });

  } catch (error) {
    logger.error(`获取任务 ${taskId} 详情失败`, { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '获取任务详情失败: ' + error.message
    });
  }
};


//获取任务列表
exports.getTasks = async (req, res) => {
  const userId = req.user.id;
  const { status, page = 1 } = req.query;

  try {
    let query = `SELECT 
      id, command, description, status, 
      created_at, completed_at,
      exit_code, process_signal
    FROM tasks 
    WHERE user_id = ? AND task_type = 'xmap'`;
    
    const params = [userId];
    let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE user_id = ? AND task_type = \'xmap\'';

    if (status && ['pending', 'running', 'completed', 'failed', 'canceled'].includes(status)) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    // 计算分页
    const offset = (page - 1) * ITEMS_PER_PAGE;
    params.push(ITEMS_PER_PAGE, offset);

    // 执行查询
    const [tasks] = await db.query(query, params);
    const [[{ total }]] = await db.query(countQuery, params.slice(0, -2)); // 移除LIMIT和OFFSET参数

    res.json({
      success: true,
      tasks,
      pagination: {
        total: parseInt(total),
        page: parseInt(page),
        perPage: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
      }
    });

  } catch (error) {
    logger.error(`获取用户 ${userId} 任务列表失败`, {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '获取任务列表失败: ' + error.message
    });
  }
};

// 获取任务结果文件
exports.getResult = async (req, res) => {
  const taskId = req.params.taskId;
  console.log(`尝试获取任务 ${taskId} 的结果文件`); // 调试日志

  try {
    const [tasks] = await db.query(
      `SELECT output_path FROM tasks WHERE id = ?`, 
      [taskId]
    );
    
    if (!tasks.length) {
      console.log('任务不存在');
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const resultPath = tasks[0].output_path;
    console.log('文件路径:', resultPath); // 打印实际路径

    if (!fs.existsSync(resultPath)) {
      console.log('文件不存在:', resultPath);
      return res.status(404).json({ success: false, message: '结果文件不存在' });
    }

    // 关键设置：正确的Content-Type和Content-Disposition
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=xmap_result_${taskId}.json`);
    
    // 流式传输文件
    const fileStream = fs.createReadStream(resultPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('文件下载错误:', error);
    res.status(500).json({ success: false, message: '文件下载失败' });
  }
};

// 获取任务日志文件
exports.getLog = async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const userId = req.user.id;

  try {
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    // 验证任务属于当前用户
    const [tasks] = await db.query(
      'SELECT id, status FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在或无权访问' 
      });
    }

    const logFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);
    
    if (!fs.existsSync(logFile)) {
      return res.status(404).json({
        success: false,
        message: '日志文件不存在'
      });
    }

    // 设置文件下载头
    res.download(logFile, `${taskId}_error.log`, (err) => {
      if (err) {
        logger.error(`下载任务 ${taskId} 日志失败`, {
          error: err.message,
          stack: err.stack
        });
      }
    });

  } catch (error) {
    logger.error(`获取任务 ${taskId} 日志失败`, {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '获取日志失败: ' + error.message
    });
  }
};