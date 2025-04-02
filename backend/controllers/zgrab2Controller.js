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
    const { module, target, port, outputFormat = 'json', additionalParams = {}, whitelistId } = req.body;
    
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
    const taskId = uuidv4();
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
      (task_type, params, status, created_by, whitelist_id) 
      VALUES (?, ?, ?, ?, ?)
    `, ['zgrab2', JSON.stringify({
      module,
      port: scanPort,
      target,
      command,
      outputFile,
      logFile
    }), 'pending', req.user.id, whitelistId]);

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
      `, [status, errorMessage, result.insertId]);
    });

    res.json({
      success: true,
      taskId: result.insertId
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
    const { config, target, whitelistId } = req.body;
    
    // 生成任务ID和输出文件名
    const taskId = uuidv4();
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
      (task_type, params, status, created_by, whitelist_id) 
      VALUES (?, ?, ?, ?, ?)
    `, ['zgrab2', JSON.stringify({
      module: 'multiple',
      target,
      command,
      outputFile,
      logFile,
      configFile
    }), 'pending', req.user.id, whitelistId]);

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
      `, [status, errorMessage, result.insertId]);
    });

    res.json({
      success: true,
      taskId: result.insertId
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
    const { page = 1, status, module } = req.query;
    const offset = (page - 1) * ITEMS_PER_PAGE;
    
    let query = `
      SELECT 
        id, 
        task_type,
        params,
        status,
        created_at,
        completed_at,
        output_path,
        error_message,
        whitelist_id
      FROM tasks
      WHERE task_type = 'zgrab2'
    `;
    
    const params = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (module) {
      query += ' AND JSON_EXTRACT(params, "$.module") = ?';
      params.push(module);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(ITEMS_PER_PAGE, offset);
    
    const [tasks] = await db.query(query, params);
    
    // 解析params字段
    const parsedTasks = tasks.map(task => ({
      ...task,
      params: JSON.parse(task.params)
    }));
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE task_type = \'zgrab2\'';
    if (status) {
      countQuery += ' AND status = ?';
    }
    if (module) {
      countQuery += ' AND JSON_EXTRACT(params, "$.module") = ?';
    }
    
    const [[{ total }]] = await db.query(countQuery, 
      [status, module].filter(Boolean));
    
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
 * 获取任务详情
 */
exports.getTaskDetails = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [[task]] = await db.query(`
      SELECT 
        id,
        task_type,
        params,
        status,
        created_at,
        completed_at,
        output_path,
        error_message,
        whitelist_id
      FROM tasks
      WHERE id = ? AND task_type = 'zgrab2'
    `, [taskId]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    // 解析params字段
    const params = JSON.parse(task.params);
    
    // 读取结果文件
    let result = null;
    if (params.outputFile && fs.existsSync(params.outputFile)) {
      result = fs.readFileSync(params.outputFile, 'utf8');
      try {
        result = JSON.parse(result);
      } catch (e) {
        // 如果不是JSON格式，保持原样
      }
    }
    
    // 读取日志文件
    let log = null;
    if (params.logFile && fs.existsSync(params.logFile)) {
      log = fs.readFileSync(params.logFile, 'utf8');
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
      SELECT params FROM tasks WHERE id = ? AND task_type = 'zgrab2'
    `, [taskId]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const params = JSON.parse(task.params);
    
    // 删除结果文件和日志文件
    try {
      if (params.outputFile && fs.existsSync(params.outputFile)) {
        fs.unlinkSync(params.outputFile);
      }
      if (params.logFile && fs.existsSync(params.logFile)) {
        fs.unlinkSync(params.logFile);
      }
      if (params.configFile && fs.existsSync(params.configFile)) {
        fs.unlinkSync(params.configFile);
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
      SELECT params FROM tasks WHERE id = ? AND task_type = 'zgrab2'
    `, [taskId]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const params = JSON.parse(task.params);
    
    if (!params.outputFile || !fs.existsSync(params.outputFile)) {
      return res.status(404).json({
        success: false,
        message: '结果文件不存在'
      });
    }
    
    res.download(params.outputFile);
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
      SELECT params FROM tasks WHERE id = ? AND task_type = 'zgrab2'
    `, [taskId]);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const params = JSON.parse(task.params);
    
    if (!params.logFile || !fs.existsSync(params.logFile)) {
      return res.status(404).json({
        success: false,
        message: '日志文件不存在'
      });
    }
    
    res.download(params.logFile);
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