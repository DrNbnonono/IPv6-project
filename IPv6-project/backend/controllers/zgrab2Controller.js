const db = require('../database/db');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createLogger, transports } = require('winston');

const logger = createLogger({
  transports: [new transports.Console()]
});

const { DIRECTORIES, TOOLS } = require('../config/paths');

const ITEMS_PER_PAGE = 20;
// 使用统一的路径配置
const PROJECT_ROOT = DIRECTORIES.root;
const ZGRAB2_RESULTS_DIR = DIRECTORIES.zgrab2Results;
const ZGRAB2_LOGS_DIR = DIRECTORIES.zgrab2Logs;
const ZGRAB2_INPUTS_DIR = DIRECTORIES.zgrab2Inputs;
const ZGRAB2_CONFIGS_DIR = DIRECTORIES.zgrab2Configs;

// 确保目录存在
console.log('ZGrab2目录配置:', {
  ZGRAB2_RESULTS_DIR,
  ZGRAB2_LOGS_DIR,
  ZGRAB2_INPUTS_DIR,
  ZGRAB2_CONFIGS_DIR
});

[ZGRAB2_RESULTS_DIR, ZGRAB2_LOGS_DIR, ZGRAB2_INPUTS_DIR, ZGRAB2_CONFIGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log('创建目录:', dir);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log('目录已存在:', dir);
  }
});

// 支持的模块和默认端口
const SUPPORTED_MODULES = {
  amqp091: { defaultPort: 5672, description: 'AMQP 0.9.1' },
  bacnet: { defaultPort: 47808, description: 'BACnet' },
  banner: { defaultPort: 80, description: 'Banner grab' },
  dnp3: { defaultPort: 20000, description: 'DNP3' },
  fox: { defaultPort: 1911, description: 'Fox' },
  ftp: { defaultPort: 21, description: 'FTP' },
  http: { defaultPort: 80, description: 'HTTP Banner Grab' },
  imap: { defaultPort: 143, description: 'IMAP' },
  ipp: { defaultPort: 631, description: 'IPP' },
  jarm: { defaultPort: 443, description: 'JARM' },
  modbus: { defaultPort: 502, description: 'Modbus' },
  mongodb: { defaultPort: 27017, description: 'MongoDB' },
  mqtt: { defaultPort: 1883, description: 'MQTT' },
  mssql: { defaultPort: 1433, description: 'MSSQL' },
  mysql: { defaultPort: 3306, description: 'MySQL' },
  ntp: { defaultPort: 123, description: 'NTP' },
  oracle: { defaultPort: 1521, description: 'Oracle' },
  pop3: { defaultPort: 110, description: 'POP3' },
  postgres: { defaultPort: 5432, description: 'Postgres' },
  pptp: { defaultPort: 1723, description: 'PPTP' },
  redis: { defaultPort: 6379, description: 'Redis' },
  siemens: { defaultPort: 102, description: 'Siemens' },
  smb: { defaultPort: 445, description: 'SMB' },
  smtp: { defaultPort: 25, description: 'SMTP' },
  socks5: { defaultPort: 1080, description: 'SOCKS5' },
  ssh: { defaultPort: 22, description: 'SSH Banner Grab' },
  telnet: { defaultPort: 23, description: 'Telnet' },
  tls: { defaultPort: 443, description: 'TLS Banner Grab' }
};

/**
 * 创建Zgrab2扫描任务 - 使用输入文件
 */
exports.createTask = async (req, res) => {
  console.log('\n=== ZGrab2 任务创建开始 ===');
  const userId = req.user.id;
  const {
    module,
    port,
    inputFile,
    inputFilePath, // 工作流传递的完整文件路径
    fileId, // 工作流传递的文件ID
    configFile,
    description,
    additionalParams = {}
  } = req.body;

  console.log('请求参数:', {
    userId,
    module,
    port,
    inputFile,
    configFile,
    description,
    additionalParams
  });

  try {
    // 验证必要参数
    console.log('开始参数验证...');
    if (!module) {
      console.log('错误: 未选择扫描模块');
      return res.status(400).json({
        success: false,
        message: '请选择扫描模块'
      });
    }

    if (!inputFile) {
      console.log('错误: 未选择输入文件');
      return res.status(400).json({
        success: false,
        message: '请选择输入文件'
      });
    }

    // 验证模块是否有效
    if (!SUPPORTED_MODULES[module]) {
      console.log('错误: 无效的模块', module);
      return res.status(400).json({
        success: false,
        message: `无效的zgrab2模块，支持的模块: ${Object.keys(SUPPORTED_MODULES).join(', ')}`
      });
    }

    console.log('参数验证通过');

    const taskId = Date.now();
    // 使用绝对路径存储到数据库
    const outputFile = path.join(ZGRAB2_RESULTS_DIR, `${taskId}.jsonl`);
    const logFile = path.join(ZGRAB2_LOGS_DIR, `${taskId}.log`);

    console.log('生成任务ID和文件路径:', {
      taskId,
      outputFile,
      logFile,
      'outputFile绝对路径': path.isAbsolute(outputFile),
      'logFile绝对路径': path.isAbsolute(logFile)
    });

    // 获取zgrab2工具ID
    console.log('查询zgrab2工具ID...');
    const [tools] = await db.query(
      "SELECT id FROM tools WHERE name = ? LIMIT 1",
      ['zgrab2']
    );

    console.log('工具查询结果:', tools);

    if (tools.length === 0) {
      console.log('错误: Zgrab2工具未配置');
      return res.status(400).json({
        success: false,
        message: 'Zgrab2工具未配置'
      });
    }

    const toolId = tools[0].id;
    console.log('获取到工具ID:', toolId);

    // 查找输入文件路径 - 支持工作流传递的文件
    console.log('查找输入文件路径...', { userId, toolId, inputFile, fileId, inputFilePath });

    let inputFilePathResolved;

    // 如果工作流传递了完整的文件路径，直接使用
    if (inputFilePath && fs.existsSync(inputFilePath)) {
      inputFilePathResolved = inputFilePath;
      console.log('使用工作流传递的文件路径:', inputFilePathResolved);
    } else if (fileId) {
      // 如果有文件ID，通过ID查询
      const [fileRecords] = await db.query(
        'SELECT file_path FROM whitelists WHERE id = ? AND user_id = ? AND is_deleted = 0',
        [fileId, userId]
      );

      if (fileRecords.length > 0) {
        inputFilePathResolved = fileRecords[0].file_path;
        console.log('通过文件ID查询到路径:', inputFilePathResolved);
      }
    }

    // 如果还没找到，尝试通过文件名查询
    if (!inputFilePathResolved) {
      const [inputFileRecords] = await db.query(
        'SELECT file_path FROM whitelists WHERE user_id = ? AND file_name = ? AND is_deleted = 0',
        [userId, inputFile]
      );

      console.log('通过文件名查询结果:', inputFileRecords);

      if (inputFileRecords.length === 0) {
        console.log('错误: 输入文件不存在');
        return res.status(400).json({
          success: false,
          message: '输入文件不存在'
        });
      }

      inputFilePathResolved = inputFileRecords[0].file_path;
    }

    console.log('最终输入文件路径:', inputFilePathResolved);

    // 检查输入文件是否存在
    if (!fs.existsSync(inputFilePathResolved)) {
      console.log('错误: 输入文件物理路径不存在:', inputFilePathResolved);
      return res.status(400).json({
        success: false,
        message: '输入文件不存在'
      });
    }

    console.log('输入文件验证通过');

    let command;

    if (configFile) {
      console.log('使用配置文件模式，查找配置文件路径...', configFile);
      // 查找配置文件路径
      const [configFileRecords] = await db.query(
        'SELECT file_path FROM whitelists WHERE user_id = ? AND tool_id = ? AND file_name = ? AND is_deleted = 0',
        [userId, toolId, configFile]
      );

      console.log('配置文件查询结果:', configFileRecords);

      if (configFileRecords.length === 0) {
        console.log('错误: 配置文件不存在');
        return res.status(400).json({
          success: false,
          message: '配置文件不存在'
        });
      }

      const configFilePath = configFileRecords[0].file_path;
      console.log('配置文件路径:', configFilePath);

      if (!fs.existsSync(configFilePath)) {
        console.log('错误: 配置文件物理路径不存在:', configFilePath);
        return res.status(400).json({
          success: false,
          message: '配置文件不存在'
        });
      }

      command = `${TOOLS.zgrab2} multiple -c ${configFilePath} -f ${inputFilePathResolved} -o ${outputFile} -l ${logFile}`;
      console.log('配置文件模式命令:', command);
    } else {
      console.log('使用单模块模式');
      // 单模块模式
      const scanPort = port || SUPPORTED_MODULES[module].defaultPort;
      console.log('扫描端口:', scanPort);

      command = `${TOOLS.zgrab2} ${module} --port ${scanPort} -f ${inputFilePathResolved} -o ${outputFile} -l ${logFile}`;

      // 添加额外参数
      Object.entries(additionalParams).forEach(([key, value]) => {
        if (value) {
          command += ` --${key}=${value}`;
          console.log('添加额外参数:', `--${key}=${value}`);
        }
      });

      console.log('单模块模式命令:', command);
    }

    // 在数据库中创建任务记录
    console.log('创建数据库任务记录...');
    const taskData = [taskId, userId, command, description || `ZGrab2 ${module} scan`, 'zgrab2', 'running', logFile, outputFile];
    console.log('任务数据:', taskData);

    await db.query(`
      INSERT INTO tasks
      (id, user_id, command, description, task_type, status, log_path, output_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, taskData);

    console.log('数据库任务记录创建成功');

    // 检查zgrab2二进制文件是否存在
    const zgrab2Path = TOOLS.zgrab2;
    if (!fs.existsSync(zgrab2Path)) {
      console.log('错误: zgrab2二进制文件不存在:', zgrab2Path);
      return res.status(500).json({
        success: false,
        message: 'zgrab2工具未安装或路径不正确'
      });
    }

    console.log('开始执行zgrab2命令:', command);

    // 异步执行zgrab2命令
    const childProcess = exec(command, (error, stdout, stderr) => {
      let status = 'completed';
      let errorMessage = null;

      console.log('zgrab2命令执行完成');
      console.log('stdout:', stdout);
      console.log('stderr:', stderr);

      if (error) {
        status = 'failed';
        errorMessage = error.message;
        console.log('zgrab2执行错误:', error.message);
        logger.error(`zgrab2执行错误: ${error.message}`);
      }

      // 更新任务状态
      console.log('更新任务状态:', { status, errorMessage, taskId });
      db.query(`
        UPDATE tasks
        SET status = ?,
            error_message = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [status, errorMessage, taskId]).catch(err => {
        console.log('更新任务状态失败:', err);
        logger.error('更新任务状态失败:', err);
      });
    });

    // 存储进程引用以便后续取消
    if (!global.zgrab2Processes) {
      global.zgrab2Processes = new Map();
    }
    global.zgrab2Processes.set(taskId.toString(), childProcess);

    console.log('任务创建成功，返回响应');
    res.json({
      success: true,
      message: 'Zgrab2扫描任务已启动',
      taskId: taskId
    });

    console.log('=== ZGrab2 任务创建完成 ===\n');
  } catch (error) {
    console.log('=== ZGrab2 任务创建失败 ===');
    console.log('错误详情:', error);
    console.log('错误堆栈:', error.stack);
    logger.error('创建zgrab2任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建zgrab2任务失败: ' + error.message
    });
  }
};

/**
 * 取消扫描任务
 */
exports.cancelTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    console.log('取消任务请求，taskId:', taskId, 'userId:', userId);

    // 检查任务是否存在且属于当前用户
    const [tasks] = await db.query(`
      SELECT status FROM tasks
      WHERE id = ? AND user_id = ? AND task_type = 'zgrab2'
    `, [taskId, userId]);

    console.log('任务查询结果:', tasks);

    if (!tasks || tasks.length === 0) {
      console.log('任务不存在');
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const task = tasks[0];
    console.log('任务状态:', task.status);

    if (task.status !== 'running') {
      console.log('任务不在运行状态，无法取消');
      return res.status(400).json({
        success: false,
        message: '任务不在运行状态，无法取消'
      });
    }

    // 终止进程
    console.log('检查进程是否存在，taskId:', taskId);
    if (global.zgrab2Processes && global.zgrab2Processes.has(taskId)) {
      console.log('找到进程，正在终止...');
      const process = global.zgrab2Processes.get(taskId);
      process.kill('SIGTERM');
      global.zgrab2Processes.delete(taskId);
      console.log('进程已终止');
    } else {
      console.log('未找到运行中的进程');
    }

    // 更新任务状态
    console.log('更新任务状态为cancelled');
    await db.query(`
      UPDATE tasks
      SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [taskId]);

    console.log('任务取消成功');
    res.json({
      success: true,
      message: '任务已取消'
    });
  } catch (error) {
    console.log('取消zgrab2任务失败:', error);
    logger.error('取消zgrab2任务失败:', error);
    res.status(500).json({
      success: false,
      message: '取消zgrab2任务失败: ' + error.message
    });
  }
};

// 删除了uploadConfig方法 - 使用统一的文件上传接口 /files/upload

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

    console.log('获取任务详情，任务ID:', taskId, '用户ID:', req.user.id);

    const [tasks] = await db.query(`
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

    console.log('任务查询结果:', tasks);

    if (!tasks || tasks.length === 0) {
      console.log('任务不存在');
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const task = tasks[0];
    
    // 解析命令参数
    const params = parseCommandParams(task.command);

    console.log('任务文件路径:', {
      output_path: task.output_path,
      log_path: task.log_path
    });

    // 处理文件路径（如果是相对路径，转换为绝对路径）
    let outputPath = task.output_path;
    let logPath = task.log_path;

    if (outputPath && !path.isAbsolute(outputPath)) {
      // 相对路径基于项目根目录
      outputPath = path.resolve(PROJECT_ROOT, outputPath);
      console.log('转换输出文件为绝对路径:', outputPath);
    }

    if (logPath && !path.isAbsolute(logPath)) {
      // 相对路径基于项目根目录
      logPath = path.resolve(PROJECT_ROOT, logPath);
      console.log('转换日志文件为绝对路径:', logPath);
    }

    // 读取结果文件
    let result = null;
    if (outputPath) {
      console.log('检查输出文件是否存在:', outputPath, fs.existsSync(outputPath));
      if (fs.existsSync(outputPath)) {
        try {
          result = fs.readFileSync(outputPath, 'utf8');
          console.log('读取输出文件成功，长度:', result.length);
          // 尝试解析为JSON
          if (result.trim()) {
            try {
              result = JSON.parse(result);
            } catch (e) {
              // 如果不是JSON格式，保持原样
              console.log('输出文件不是JSON格式，保持原文本');
            }
          }
        } catch (e) {
          console.log('读取输出文件失败:', e.message);
        }
      } else {
        console.log('输出文件不存在');
      }
    }

    // 读取日志文件
    let log = null;
    if (logPath) {
      console.log('检查日志文件是否存在:', logPath, fs.existsSync(logPath));
      if (fs.existsSync(logPath)) {
        try {
          log = fs.readFileSync(logPath, 'utf8');
          console.log('读取日志文件成功，长度:', log.length);
        } catch (e) {
          console.log('读取日志文件失败:', e.message);
        }
      } else {
        console.log('日志文件不存在');
      }
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

    console.log('下载结果文件，任务ID:', taskId);

    const [tasks] = await db.query(`
      SELECT output_path FROM tasks WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);

    if (!tasks || tasks.length === 0) {
      console.log('任务不存在');
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const task = tasks[0];
    let outputPath = task.output_path;

    console.log('原始输出路径:', outputPath);

    // 处理相对路径
    if (outputPath && !path.isAbsolute(outputPath)) {
      outputPath = path.resolve(PROJECT_ROOT, outputPath);
      console.log('转换为绝对路径:', outputPath);
    }

    if (!outputPath || !fs.existsSync(outputPath)) {
      console.log('结果文件不存在:', outputPath);
      return res.status(404).json({
        success: false,
        message: '结果文件不存在'
      });
    }

    console.log('开始下载文件:', outputPath);

    // 使用express的download方法
    res.download(outputPath, `zgrab2_result_${taskId}.jsonl`, (err) => {
      if (err) {
        console.log('文件下载失败:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '文件下载失败'
          });
        }
      } else {
        console.log('文件下载完成');
      }
    });
  } catch (error) {
    console.log('下载zgrab2结果失败:', error);
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

    console.log('获取日志内容，任务ID:', taskId);

    const [tasks] = await db.query(`
      SELECT log_path FROM tasks WHERE id = ? AND task_type = 'zgrab2' AND user_id = ?
    `, [taskId, req.user.id]);

    if (!tasks || tasks.length === 0) {
      console.log('任务不存在');
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const task = tasks[0];
    let logPath = task.log_path;

    console.log('原始日志路径:', logPath);

    // 处理相对路径
    if (logPath && !path.isAbsolute(logPath)) {
      logPath = path.resolve(PROJECT_ROOT, logPath);
      console.log('转换为绝对路径:', logPath);
    }

    if (!logPath || !fs.existsSync(logPath)) {
      console.log('日志文件不存在:', logPath);
      return res.status(404).json({
        success: false,
        message: '日志文件不存在'
      });
    }

    // 读取日志内容并返回JSON格式（在线预览）
    try {
      const logContent = fs.readFileSync(logPath, 'utf8');
      console.log('读取日志文件成功，长度:', logContent.length);

      res.json({
        success: true,
        data: {
          content: logContent,
          size: logContent.length,
          path: logPath
        }
      });
    } catch (readError) {
      console.log('读取日志文件失败:', readError);
      res.status(500).json({
        success: false,
        message: '读取日志文件失败'
      });
    }
  } catch (error) {
    console.log('获取zgrab2日志失败:', error);
    logger.error('获取zgrab2日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取zgrab2日志失败'
    });
  }
};

/**
 * 获取支持的模块列表
 */
exports.getSupportedModules = (req, res) => {
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

// 删除了getConfigs方法 - 使用统一的文件管理接口

// 删除了getInputFiles方法 - 使用统一的文件管理接口

// 删除了deleteFile方法 - 使用统一的文件管理接口

// 删除了getFileContent方法 - 使用统一的文件管理接口

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