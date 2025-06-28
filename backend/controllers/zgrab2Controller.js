const db = require('../database/db');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createLogger, transports } = require('winston');

const logger = createLogger({
  transports: [new transports.Console()]
});

const ITEMS_PER_PAGE = 20;
const ZGRAB2_RESULTS_DIR = path.join(__dirname, '../../zgrab2_results');
const ZGRAB2_LOGS_DIR = path.join(__dirname, '../../zgrab2_logs');

// 确保目录存在
[ZGRAB2_RESULTS_DIR, ZGRAB2_LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 支持的模块和默认端口
const SUPPORTED_MODULES = {
  http: { defaultPort: 80 },
  https: { defaultPort: 443 },
  ssh: { defaultPort: 22 },
  tls: { defaultPort: 443 },
  ftp: { defaultPort: 21 },
  smtp: { defaultPort: 25 },
  dns: { defaultPort: 53 },
  bacnet: { defaultPort: 47808 },
  modbus: { defaultPort: 502 },
  // 其他支持的模块...
};

/**
 * 创建Zgrab2扫描任务
 */
exports.createTask = async (req, res) => {
  try {
    const { module, target, port, outputFormat = 'json', additionalParams = {}, description } = req.body;
    
    // 验证模块是否有效
    if (!SUPPORTED_MODULES[module]) {
      return res.status(400).json({
        success: false,
        message: `无效的zgrab2模块，支持的模块: ${Object.keys(SUPPORTED_MODULES).join(', ')}`
      });
    }

    // 使用默认端口如果未提供
    const scanPort = port || SUPPORTED_MODULES[module].defaultPort;
    
    // 生成任务ID和输出文件名
    const taskId = Date.now();
    const outputFile = path.join(ZGRAB2_RESULTS_DIR, `${taskId}.${outputFormat}`);
    const logFile = path.join(ZGRAB2_LOGS_DIR, `${taskId}.log`);
    
    // 构建zgrab2命令
    let command = `zgrab2 ${module} --port ${scanPort} --output-file=${outputFile} --log-file=${logFile}`;
    
    // 添加额外参数
    Object.entries(additionalParams).forEach(([key, value]) => {
      command += ` --${key}=${value}`;
    });

    // 添加目标
    command += ` ${target}`;

    // 在数据库中创建任务记录
    const [result] = await db.query(`
      INSERT INTO tasks 
      (id, user_id, command, description, task_type, status, log_path, output_path) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [taskId, req.user.id, command, description || `ZGrab2 ${module} scan`, 'zgrab2', 'pending', logFile, outputFile]);

    // 异步执行zgrab2命令
    exec(command, (error, stdout, stderr) => {
      let status = 'completed';
      let errorMessage = null;
      
      if (error) {
        status = 'failed';
        errorMessage = error.message;
        logger.error(`zgrab2执行错误: ${error.message}`);
      }

      // 更新任务状态
      db.query(`
        UPDATE tasks 
        SET status = ?, 
            error_message = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [status, errorMessage, taskId]);
    });

    res.json({
      success: true,
      taskId: taskId
    });
  } catch (error) {
    logger.error('创建zgrab2任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建zgrab2任务失败'
    });
  }
};

/**
 * 创建多模块扫描任务
 */
exports.createMultipleTask = async (req, res) => {
  try {
    const { config, target, description } = req.body;
    
    // 生成任务ID和输出文件名
    const taskId = Date.now();
    const outputFile = path.join(ZGRAB2_RESULTS_DIR, `${taskId}.json`);
    const logFile = path.join(ZGRAB2_LOGS_DIR, `${taskId}.log`);
    
    // 创建临时配置文件
    const configFile = path.join(ZGRAB2_RESULTS_DIR, `${taskId}.ini`);
    fs.writeFileSync(configFile, config);
    
    // 构建zgrab2命令
    const command = `zgrab2 multiple -c ${configFile} -o ${outputFile} --log-file=${logFile} ${target}`;

    // 在数据库中创建任务记录
    const [result] = await db.query(`
      INSERT INTO tasks 
      (id, user_id, command, description, task_type, status, log_path, output_path) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [taskId, req.user.id, command, description || 'ZGrab2 multiple scan', 'zgrab2', 'pending', logFile, outputFile]);

    // 异步执行zgrab2命令
    exec(command, (error, stdout, stderr) => {
      let status = 'completed';
      let errorMessage = null;
      
      if (error) {
        status = 'failed';
        errorMessage = error.message;
        logger.error(`zgrab2 multiple执行错误: ${error.message}`);
      }

      // 删除临时配置文件
      try {
        fs.unlinkSync(configFile);
      } catch (e) {
        logger.error('删除临时配置文件失败:', e);
      }

      // 更新任务状态
      db.query(`
        UPDATE tasks 
        SET status = ?, 
            error_message = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [status, errorMessage, taskId]);
    });

    res.json({
      success: true,
      taskId: taskId
    });
  } catch (error) {
    logger.error('创建zgrab2多模块任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建zgrab2多模块任务失败'
    });
  }
};

/**
 * 获取任务列表
 */
exports.getTasks = async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const offset = (page - 1) * ITEMS_PER_PAGE;
    
    let query = `
      SELECT 
        id, 
        command,
        description,
        task_type,
        status,
        created_at,
        completed_at,
        output_path,
        log_path,
        error_message
      FROM tasks
      WHERE task_type = 'zgrab2' AND user_id = ?
    `;
    
    const params = [req.user.id];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(ITEMS_PER_PAGE, offset);
    
    const [tasks] = await db.query(query, params);
    
    // 解析命令参数
    const parsedTasks = tasks.map(task => {
      const params = parseCommandParams(task.command);
      return {
        ...task,
        params
      };
    });
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE task_type = \'zgrab2\' AND user_id = ?';
    const countParams = [req.user.id];
    
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    const [[{ total }]] = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: parsedTasks,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
      }
    });
  } catch (error) {
    logger.error('获取zgrab2任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取zgrab2任务列表失败'
    });
  }
};

/**
 * 解析命令参数
 */
function parseCommandParams(command) {
  const params = {};
  
  // 提取模块名
  const moduleMatch = command.match(/zgrab2\s+(\w+)/);
  if (moduleMatch) {
    params.module = moduleMatch[1];
  }
  
  // 提取端口
  const portMatch = command.match(/--port\s+(\d+)/);
  if (portMatch) {
    params.port = portMatch[1];
  }
  
  // 提取目标
  const targetMatch = command.match(/([^\s]+)$/);
  if (targetMatch) {
    params.target = targetMatch[1];
  }
  
  return params;
}

/**
 * 获取任务详情
 */
exports.getTaskDetails = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT 
        id,
        command,
        description,
        task_type,
        status,
        created_at,
        completed_at,
        output_path,
        log_path,
        error_message
      FROM tasks
      WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    // 解析命令参数
    const params = parseCommandParams(task.command);
    
    // 读取结果文件
    let result = null;
    if (task.output_path && fs.existsSync(task.output_path)) {
      result = fs.readFileSync(task.output_path, 'utf8');
      try {
        result = JSON.parse(result);
      } catch (e) {
        // 如果不是JSON格式，保持原样
      }
    }
    
    // 读取日志文件
    let log = null;
    if (task.log_path && fs.existsSync(task.log_path)) {
      log = fs.readFileSync(task.log_path, 'utf8');
    }
    
    res.json({
      success: true,
      data: {
        ...task,
        params,
        result,
        log
      }
    });
  } catch (error) {
    logger.error('获取zgrab2任务详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取zgrab2任务详情失败'
    });
  }
};

/**
 * 删除任务
 */
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // 获取任务详情以删除相关文件
    const [[task]] = await db.query(`
      SELECT output_path, log_path FROM tasks WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    // 删除结果文件和日志文件
    try {
      if (task.output_path && fs.existsSync(task.output_path)) {
        fs.unlinkSync(task.output_path);
      }
      if (task.log_path && fs.existsSync(task.log_path)) {
        fs.unlinkSync(task.log_path);
      }
    } catch (e) {
      logger.error('删除任务文件失败:', e);
    }
    
    // 从数据库删除任务
    await db.query('DELETE FROM tasks WHERE id = ?', [taskId]);
    
    res.json({
      success: true,
      message: '任务删除成功'
    });
  } catch (error) {
    logger.error('删除zgrab2任务失败:', error);
    res.status(500).json({
      success: false,
      message: '删除zgrab2任务失败'
    });
  }
};

/**
 * 下载结果文件
 */
exports.downloadResult = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT output_path FROM tasks WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    if (!task.output_path || !fs.existsSync(task.output_path)) {
      return res.status(404).json({
        success: false,
        message: '结果文件不存在'
      });
    }
    
    res.download(task.output_path);
  } catch (error) {
    logger.error('下载zgrab2结果失败:', error);
    res.status(500).json({
      success: false,
      message: '下载zgrab2结果失败'
    });
  }
};

/**
 * 下载日志文件
 */
exports.downloadLog = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT log_path FROM tasks WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    if (!task.log_path || !fs.existsSync(task.log_path)) {
      return res.status(404).json({
        success: false,
        message: '日志文件不存在'
      });
    }
    
    res.download(task.log_path);
  } catch (error) {
    logger.error('下载zgrab2日志失败:', error);
    res.status(500).json({
      success: false,
      message: '下载zgrab2日志失败'
    });
  }
};

/**
 * 获取支持的模块列表
 */
exports.getSupportedModules = async (req, res) => {
  try {
    res.json({
      success: true,
      data: Object.entries(SUPPORTED_MODULES).map(([module, config]) => ({
        module,
        defaultPort: config.defaultPort,
        description: config.description || ''
      }))
    });
  } catch (error) {
    logger.error('获取支持的模块列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取支持的模块列表失败'
    });
  }
};

/**
 * 获取任务状态
 */
exports.getTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT status, created_at, completed_at, error_message
      FROM tasks
      WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('获取zgrab2任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取zgrab2任务状态失败'
    });
  }
};

/**
 * 获取任务进度
 */
exports.getTaskProgress = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT status, created_at, completed_at
      FROM tasks
      WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    // 计算进度百分比
    let progress = 0;
    if (task.status === 'completed') {
      progress = 100;
    } else if (task.status === 'running') {
      // 对于运行中的任务，可以根据时间估算进度
      const startTime = new Date(task.created_at);
      const now = new Date();
      const elapsed = now - startTime;
      // 假设任务平均运行时间为5分钟
      progress = Math.min(Math.floor((elapsed / (5 * 60 * 1000)) * 100), 95);
    }
    
    res.json({
      success: true,
      data: {
        status: task.status,
        progress,
        created_at: task.created_at,
        completed_at: task.completed_at
      }
    });
  } catch (error) {
    logger.error('获取zgrab2任务进度失败:', error);
    res.status(500).json({
      success: false,
      message: '获取zgrab2任务进度失败'
    });
  }
};