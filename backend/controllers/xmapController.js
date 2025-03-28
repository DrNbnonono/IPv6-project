const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const { createLogger, format, transports } = require('winston');

// 配置系统日志
const logDir = path.join(__dirname, '../../backend_logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

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

// 确保日志和结果目录存在
const XMAP_LOG_DIR = path.join(__dirname, '../../xmap_log');
const XMAP_RESULT_DIR = path.join(__dirname, '../../xmap_result');

[logDir, XMAP_LOG_DIR, XMAP_RESULT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 验证任务参数的辅助函数
const validateXmapParams = (params) => {
  const allowedParams = ['ipv6', 'ipv4', 'maxlen', 'rate', 'targetPort', 'targetaddress', 'help'];
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

// 创建新扫描任务
exports.scan = async (req, res) => {
  const userId = req.user.id;
  const { ipv6, ipv4, maxlen, rate, targetPort, targetaddress, help } = req.body;

  try {
    // 参数验证
    validateXmapParams(req.body);
    
    // 生成唯一任务ID
    const taskId = Date.now();
    const logFile = path.join(XMAP_LOG_DIR, `${taskId}.csv`);
    const resultFile = path.join(XMAP_RESULT_DIR, `${taskId}.json`);
    const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);

    // 构建 xmap 命令参数
    const args = [];
    if (ipv6) args.push('-6');
    if (ipv4) args.push('-4');
    if (maxlen) args.push('-m', maxlen.toString());
    if (rate) args.push('-B', rate.toString());
    if (targetPort) args.push('-p', targetPort.toString());
    if (targetaddress) args.push('-a', targetaddress.toString());
    if (help) args.push('-h');
    
    args.push('-u', logFile, '-o', resultFile, '-q');

    // 记录任务到数据库
    await db.query(
      'INSERT INTO tasks (id, user_id, command, status, log_path, output_path) VALUES (?, ?, ?, ?, ?, ?)',
      [taskId, userId, `sudo xmap ${args.join(' ')}`, 'running', logFile, resultFile]
    );

    logger.info(`用户 ${userId} 创建新任务 ${taskId}`, { 
      command: `sudo xmap ${args.join(' ')}`,
      user: userId 
    });

    // 使用spawn执行命令
    const xmapProcess = spawn('sudo', ['xmap', ...args], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    // 存储进程引用
    activeProcesses.set(taskId, xmapProcess);

    // 捕获错误输出
    const errorStream = fs.createWriteStream(errorLogFile);
    xmapProcess.stderr.pipe(errorStream);

    // 进程结束处理
    xmapProcess.on('close', async (code, signal) => {
      activeProcesses.delete(taskId);
      
      let status = 'completed';
      let errorMsg = null;
      
      if (code !== 0 || signal) {
        status = 'failed';
        errorMsg = `进程异常终止 - 退出码: ${code}, 信号: ${signal || '无'}`;
        
        // 读取错误日志
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

      // 更新数据库状态
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
        
        logger.info(`任务 ${taskId} 完成`, { 
          status, 
          exitCode: code, 
          signal,
          error: errorMsg 
        });
      } catch (dbError) {
        logger.error(`更新任务 ${taskId} 状态失败`, {
          error: dbError.message
        });
      }
    });

    // 立即返回任务ID给前端
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

// 终止正在运行的任务
exports.cancelTask = async (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.user.id;

  try {
    // 验证任务ID是否为数字
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    // 验证任务属于当前用户且正在运行
    const [tasks] = await db.query(
      'SELECT id, status FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (tasks.length === 0) {
      logger.warn(`任务访问被拒绝 - 任务ID: ${taskId} 用户ID: ${userId}`);
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

    // 终止进程
    if (activeProcesses.has(parseInt(taskId))) {
      const process = activeProcesses.get(parseInt(taskId));
      process.kill('SIGTERM');
      activeProcesses.delete(parseInt(taskId));
      
      logger.info(`用户 ${userId} 终止任务 ${taskId}`);
    }

    // 更新数据库状态
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
  const taskId = req.params.taskId;
  const userId = req.user.id;

  try {
    // 验证任务ID是否为数字
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    // 验证任务属于当前用户
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

    // 如果任务正在运行，不能删除
    if (task.status === 'running') {
      return res.status(400).json({
        success: false,
        message: '任务正在运行中，请先终止任务'
      });
    }

    // 删除相关文件
    try {
      if (task.log_path && fs.existsSync(task.log_path)) {
        fs.unlinkSync(task.log_path);
      }
      if (task.output_path && fs.existsSync(task.output_path)) {
        fs.unlinkSync(task.output_path);
      }
      const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);
      if (fs.existsSync(errorLogFile)) {
        fs.unlinkSync(errorLogFile);
      }
    } catch (fileError) {
      logger.warn(`删除任务 ${taskId} 文件失败`, {
        error: fileError.message
      });
    }

    // 从数据库删除任务记录
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
exports.getTaskDetails = async (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.user.id;

  try {
    // 验证任务ID是否为数字
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    const [tasks] = await db.query(
      `SELECT 
        id, command, status, 
        created_at, completed_at, 
        error_message, log_path, output_path,
        exit_code, process_signal
      FROM tasks 
      WHERE id = ? AND user_id = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      logger.warn(`任务详情访问被拒绝 - 任务ID: ${taskId} 用户ID: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在或无权访问' 
      });
    }

    const task = tasks[0];
    let errorLog = null;
    let progress = null;

    // 读取错误日志
    if (['failed', 'canceled'].includes(task.status)) {
      const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);
      if (fs.existsSync(errorLogFile)) {
        errorLog = fs.readFileSync(errorLogFile, 'utf-8');
      }
    }

    // 读取进度日志
    if (task.log_path && fs.existsSync(task.log_path)) {
      try {
        const data = fs.readFileSync(task.log_path, 'utf-8');
        const lines = data.trim().split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(',');
          const values = lines[lines.length-1].split(',');
          progress = {};
          headers.forEach((h, i) => {
            progress[h.trim()] = values[i]?.trim();
          });
        }
      } catch (e) {
        logger.warn(`读取任务 ${taskId} 进度日志失败`, { error: e.message });
      }
    }

    res.json({
      success: true,
      task: {
        ...task,
        errorLog,
        progress
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

// 获取用户任务列表（可按状态筛选）
exports.getTasks = async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query; // 可选参数，用于筛选任务状态

  try {
    let query = `SELECT 
      id, command, status, 
      created_at, completed_at,
      exit_code, process_signal
    FROM tasks 
    WHERE user_id = ?`;
    
    const params = [userId];

    // 添加状态筛选条件
    if (status && ['pending', 'running', 'completed', 'failed', 'canceled'].includes(status)) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const [tasks] = await db.query(query, params);

    res.json({
      success: true,
      tasks
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
  const userId = req.user.id;

  try {
    // 验证任务ID是否为数字
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: '无效的任务ID格式'
      });
    }

    // 验证任务属于当前用户且已完成
    const [tasks] = await db.query(
      `SELECT output_path 
       FROM tasks 
       WHERE id = ? AND user_id = ? AND status != 'completed'`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      logger.warn(`结果文件访问被拒绝 - 任务ID: ${taskId} 用户ID: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: '任务不存在、未完成或无权访问' 
      });
    }

    const resultPath = tasks[0].output_path;
    
    if (!fs.existsSync(resultPath)) {
      return res.status(404).json({
        success: false,
        message: '结果文件不存在'
      });
    }

    // 设置文件下载头
    res.download(resultPath, `xmap_result_${taskId}.json`, (err) => {
      if (err) {
        logger.error(`下载任务 ${taskId} 结果失败`, {
          error: err.message,
          stack: err.stack
        });
      }
    });

  } catch (error) {
    logger.error(`获取任务 ${taskId} 结果失败`, {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: '获取结果失败: ' + error.message
    });
  }
};