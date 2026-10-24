const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const util = require('util');
// 配置系统日志和目录
const { DIRS, safeJoin } = require('../services/storageService');
const { buildXmapInvocation, buildPrivileged } = require('../services/xmapCommandService');
const taskService = require('../services/taskService');
const scheduler = require('../services/schedulerService');
const scanPolicy = require('../services/scanPolicyService');
const logDir = DIRS.backendLogs;
const XMAP_LOG_DIR = DIRS.xmapLog;
const XMAP_RESULT_DIR = DIRS.xmapResult;
const WHITELIST_DIR = DIRS.whitelists;

const ITEMS_PER_PAGE = 20; //每次查询的页面总数

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

// 数据目录由 storageService.ensureDirs() 在服务启动时统一创建

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

const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('xmap');


// 终止进程等辅助命令：启用 sudo 时经 sudo 执行
const spawnPrivileged = (command, args, options) => {
  const inv = buildPrivileged(command, args);
  return spawn(inv.command, inv.args, options);
};


// 按命令行匹配终止某任务的 xmap 进程（xmap 经 sudo 以 root 运行，需要同样经 sudo 的 pkill）
const killXmapBySystem = (taskId) => {
  const killByName = spawnPrivileged('pkill', ['-f', `xmap.*${taskId}`]);
  killByName.on('close', (code) => {
    logger.info(`系统级终止任务 ${taskId} 的 xmap 进程，退出码: ${code}`);
  });
  killByName.on('error', (error) => {
    logger.error(`系统级终止任务 ${taskId} 失败`, { error: error.message });
  });
};

// 任务进程存储对象
const activeProcesses = new Map();

// 验证XMap参数
// xmap 通过 sudo 运行，参数值不能以 - 开头（否则会被当作选项），并按字段限定格式
const XMAP_VALUE_RULES = {
  maxlen: /^\d{1,4}$/,
  rate: /^\d{1,6}(\.\d{1,3})?[KkMmGg]?$/,
  targetPort: /^[0-9][0-9,\-]{0,63}$/,
  targetaddress: /^[0-9A-Za-z:][0-9A-Za-z:.\/,_-]{0,254}$/,
  max_results: /^\d{1,12}$/,
  probeModule: /^[A-Za-z0-9_]{1,32}$/
};

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

    const rule = XMAP_VALUE_RULES[key];
    if (rule && value !== undefined && value !== null && value !== '') {
      if (!rule.test(String(value))) {
        throw new Error(`参数 ${key} 格式无效`);
      }
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


/**
 * 构造 xmap 参数数组（不含 sudo / 程序名）。调用前须已通过 validateXmapParams。
 * 白名单只接受白名单目录下的纯文件名。
 */
const buildXmapArgs = (body, { logFile, resultFile }) => {
  const {
    ipv6, ipv4, maxlen, rate,
    targetPort, targetaddress, help,
    whitelistFile, max_results, probeModule
  } = body;

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
    // 只接受白名单目录下的纯文件名，拒绝 ../ 等路径
    const whitelistPath = safeJoin(WHITELIST_DIR, String(whitelistFile));
    if (fs.existsSync(whitelistPath)) {
      args.push('-w', whitelistPath);
    } else {
      throw new Error('白名单文件不存在');
    }
  }

  args.push('-u', logFile, '-o', resultFile, '-q', '-O', 'json', '-f', `*`);

  /*
  if (ipv6){
    args.push('-S', '2001:250:200:10:20c:29ff:fe88:8a32');
  }
  else if (ipv4){
    args.push('-S', '192.168.1.1', '-G', '00:00:5e:00:01:08');
  }*/

  return args;
};

/**
 * 创建扫描任务：只做校验并入队（pending），由调度器按并发上限启动
 * POST /api/xmap
 */
/**
 * 按扫描策略审查请求，返回要实际使用的 body；不通过时抛出带 status 的错误。
 * - help（-h）只打印帮助，不发包：忽略目标与白名单，不占用每日配额；
 * - 否则必须给出目标（targetaddress 或自己的白名单文件），目标需落在策略白名单内，速率不得超过上限；
 * - 白名单文件必须是当前用户自己上传、未删除的文件（N7：此前任何登录用户都可以按文件名使用他人的文件），
 *   并且文件内每一行都要通过策略检查。
 */
const applyScanPolicy = async (user, body) => {
  if (body.help) {
    return { help: true, description: body.description };
  }

  const denied = (reason) => Object.assign(new Error(reason), { status: 403 });
  const hasWhitelist = Boolean(body.whitelistFile);
  const hasTarget = Boolean(body.targetaddress);

  const verdict = await scanPolicy.validateScanRequest({
    user,
    taskType: 'xmap',
    targets: hasTarget ? body.targetaddress : [],
    rate: body.rate,
    requireTargets: !hasWhitelist
  });
  if (!verdict.allowed) throw denied(verdict.reason);

  if (hasWhitelist) {
    const [owned] = await db.query(
      'SELECT id FROM whitelists WHERE file_name = ? AND user_id = ? AND is_deleted = 0 LIMIT 1',
      [String(body.whitelistFile), user.id]
    );
    if (!owned || owned.length === 0) throw denied('白名单文件不存在或不属于你');

    const whitelistPath = safeJoin(WHITELIST_DIR, String(body.whitelistFile));
    if (!fs.existsSync(whitelistPath)) throw new Error('白名单文件不存在');
    const fileVerdict = await scanPolicy.validateTargetFile({ user, filePath: whitelistPath });
    if (!fileVerdict.allowed) throw denied(`白名单${fileVerdict.reason}`);
  }

  const next = { ...body, rate: verdict.normalized.rate };
  if (verdict.normalized.targets.length > 0) next.targetaddress = verdict.normalized.targets.join(',');
  return next;
};

exports.scan = async (req, res) => {
  const userId = req.user.id;
  const { description } = req.body;

  try {
    validateXmapParams(req.body);
    const body = await applyScanPolicy(req.user, req.body);

    const taskId = taskService.nextTaskId();
    const logFile = path.join(XMAP_LOG_DIR, `${taskId}.csv`);
    const resultFile = path.join(XMAP_RESULT_DIR, `${taskId}.json`);
    const args = buildXmapArgs(body, { logFile, resultFile });

    // 这里的 display 只用于任务记录里展示命令；真正启动时由 runXmapTask 按当时的 XMAP_BIN / XMAP_USE_SUDO 重新生成
    const invocation = buildXmapInvocation(args);

    await taskService.createTaskRecord({
      taskId,
      userId,
      taskType: 'xmap',
      command: invocation.display,
      description,
      logPath: logFile,
      outputPath: resultFile,
      params: { args }
    });

    logger.info(`用户 ${userId} 创建新任务 ${taskId}`, {
      command: invocation.display,
      description,
      user: userId
    });

    scheduler.requestTick();

    res.status(202).json({
      success: true,
      taskId,
      message: '扫描任务已提交'
    });

  } catch (error) {
    logger.error('任务创建失败', {
      error: error.message,
      stack: error.stack,
      user: userId,
      params: req.body
    });

    res.status(error.status || 400).json({
      success: false,
      message: '任务创建失败: ' + error.message
    });
  }
};

/**
 * 启动 xmap 进程（由调度器调用，任务已被领取）。进程启动后即返回；结束时在 close 事件里写入状态。
 */
const runXmapTask = async (task) => {
  const taskId = task.id;
  const args = task.params && Array.isArray(task.params.args) ? task.params.args : null;
  if (!args) {
    throw new Error('任务缺少 xmap 参数');
  }

  const invocation = buildXmapInvocation(args);
  const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);

  const xmapProcess = spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true, // 创建新的进程组，便于管理子进程
  });

  // 不要让Node.js等待这个子进程
  xmapProcess.unref();

  activeProcesses.set(taskId, xmapProcess);
  const errorStream = fs.createWriteStream(errorLogFile);
  xmapProcess.stderr.pipe(errorStream);

  // 找不到 sudo / xmap 等启动失败会触发 error 事件；没有监听器时 Node 会抛出未捕获异常，使整个后端退出。
  // 监听器必须在任何 await 之前挂上：error 事件在 spawn 之后的下一个 tick 就会触发。
  xmapProcess.on('error', async (spawnError) => {
    activeProcesses.delete(taskId);
    logger.error(`任务 ${taskId} 启动失败`, { error: spawnError.message });
    try {
      await taskService.markTaskFinished(taskId, {
        status: 'failed',
        errorMessage: `无法启动 ${invocation.command}: ${spawnError.message}`
      });
    } catch (dbError) {
      logger.error(`更新任务 ${taskId} 状态失败`, { error: dbError.message });
    }
    scheduler.requestTick();
  });

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
      // 已被用户取消的任务保持 canceled，不会被改写
      await taskService.markTaskFinished(taskId, { status, errorMessage: errorMsg, exitCode: code, signal });
    } catch (dbError) {
      logger.error(`更新任务 ${taskId} 状态失败`, {
        error: dbError.message
      });
    }
    scheduler.requestTick();
  });

  // 记录 pid。若任务在“被领取”到“进程启动”之间被取消，进程不应继续运行
  const stillWanted = await taskService.markTaskRunning(taskId, xmapProcess.pid);
  if (!stillWanted) {
    logger.warn(`任务 ${taskId} 在启动前已被取消，终止刚启动的进程`);
    killXmapBySystem(taskId);
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

    // 先把状态置为 canceled 再发信号：进程被终止后触发的 close 事件不会再把它改写成 failed
    await taskService.markTaskCanceled(taskId);

    if (activeProcesses.has(taskId)) {
      const process = activeProcesses.get(taskId);

      logger.info(`开始终止任务 ${taskId}，进程PID: ${process.pid}`);

      // 由于使用sudo启动，需要更强力的终止方式
      try {
        // 1. 首先尝试优雅终止主进程
        process.kill('SIGTERM');

        // 2. 等待一段时间后强制终止
        setTimeout(() => {
          if (!process.killed) {
            logger.warn(`任务 ${taskId} 未响应SIGTERM，使用SIGKILL强制终止`);
            process.kill('SIGKILL');
          }
        }, 3000); // 3秒后强制终止

        // 3. 使用系统命令终止所有相关的xmap进程
        // 查找并终止包含任务ID的xmap进程
        const killXmapCommand = spawnPrivileged('pkill', ['-f', `xmap.*${taskId}`]);

        killXmapCommand.on('close', (code) => {
          logger.info(`终止任务 ${taskId} 相关xmap进程，退出码: ${code}`);
        });

        killXmapCommand.on('error', (error) => {
          logger.error(`终止任务 ${taskId} 相关xmap进程失败`, { error: error.message });
        });

        // 4. 通过进程组终止（由于使用了detached: true）
        try {
          // 终止整个进程组，使用负PID
          process.kill(-process.pid, 'SIGTERM');
          logger.info(`发送SIGTERM到进程组 ${process.pid}`);

          setTimeout(() => {
            try {
              // 强制终止整个进程组
              process.kill(-process.pid, 'SIGKILL');
              logger.info(`发送SIGKILL到进程组 ${process.pid}`);
            } catch (e) {
              logger.debug(`进程组 ${process.pid} 可能已经终止`, { error: e.message });
            }
          }, 2000);
        } catch (pgError) {
          logger.warn(`无法终止进程组 ${process.pid}`, { error: pgError.message });
        }

        // 5. 使用更精确的系统命令终止xmap进程
        try {
          // 查找所有xmap进程并终止
          const killAllXmapCommand = spawnPrivileged('bash', ['-c', `ps aux | grep '[x]map' | grep '${taskId}' | awk '{print $2}' | xargs -r kill -TERM`]);

          killAllXmapCommand.on('close', (code) => {
            logger.info(`系统级终止xmap进程命令执行完成，退出码: ${code}`);

            // 如果TERM信号无效，使用KILL信号
            setTimeout(() => {
              const forceKillCommand = spawnPrivileged('bash', ['-c', `ps aux | grep '[x]map' | grep '${taskId}' | awk '{print $2}' | xargs -r kill -KILL`]);
              forceKillCommand.on('close', (forceCode) => {
                logger.info(`强制终止xmap进程命令执行完成，退出码: ${forceCode}`);
              });
            }, 3000);
          });

          killAllXmapCommand.on('error', (error) => {
            logger.error(`系统级终止xmap进程失败`, { error: error.message });
          });
        } catch (sysError) {
          logger.error(`执行系统级终止命令失败`, { error: sysError.message });
        }

      } catch (killError) {
        logger.error(`终止任务 ${taskId} 进程失败`, { error: killError.message });
      }

      // 延迟删除进程记录，并验证进程是否真的被终止
      setTimeout(async () => {
        // 验证进程是否还在运行
        try {
          const checkCommand = spawn('bash', ['-c', `ps aux | grep '[x]map' | grep '${taskId}' | wc -l`]);
          let output = '';

          checkCommand.stdout.on('data', (data) => {
            output += data.toString();
          });

          checkCommand.on('close', (code) => {
            const processCount = parseInt(output.trim());
            if (processCount > 0) {
              logger.warn(`任务 ${taskId} 仍有 ${processCount} 个相关进程在运行，尝试强制终止`);

              // 最后的强制终止尝试
              spawnPrivileged('bash', ['-c', `ps aux | grep '[x]map' | grep '${taskId}' | awk '{print $2}' | xargs -r kill -KILL`]);
            } else {
              logger.info(`任务 ${taskId} 所有相关进程已成功终止`);
            }
          });
        } catch (checkError) {
          logger.error(`检查任务 ${taskId} 进程状态失败`, { error: checkError.message });
        }

        activeProcesses.delete(taskId);
        logger.info(`任务 ${taskId} 进程记录已清理`);
      }, 8000); // 增加到8秒，给进程更多时间终止
    } else if (task.status === 'running') {
      // 服务重启后没有子进程句柄（进程是 detached 的，仍可能在运行），改用按命令行匹配的系统级终止
      logger.warn(`任务 ${taskId} 在活动进程列表中未找到，使用系统级终止`);
      killXmapBySystem(taskId);
    }
    // pending 的任务还没有进程，置为 canceled 即可：调度器领取时是条件更新，不会再启动它

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
  logger.debug(`尝试获取任务 ${taskId} 的结果文件`); // 调试日志

  try {
    // 只能下载自己的 xmap 任务结果（任务 ID 是时间戳，很容易被猜到）
    const [tasks] = await db.query(
      `SELECT output_path FROM tasks WHERE id = ? AND user_id = ? AND task_type = 'xmap'`,
      [taskId, req.user.id]
    );
    
    if (!tasks.length) {
      logger.warn('任务不存在');
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const resultPath = tasks[0].output_path;
    logger.debug('文件路径:', resultPath); // 打印实际路径

    if (!fs.existsSync(resultPath)) {
      logger.warn('文件不存在:', resultPath);
      return res.status(404).json({ success: false, message: '结果文件不存在' });
    }

    // 关键设置：正确的Content-Type和Content-Disposition
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=xmap_result_${taskId}.json`);
    
    // 流式传输文件
    const fileStream = fs.createReadStream(resultPath);
    fileStream.pipe(res);

  } catch (error) {
    logger.error('文件下载错误:', error);
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

exports.runXmapTask = runXmapTask;
exports.buildXmapArgs = buildXmapArgs;
scheduler.registerRunner('xmap', runXmapTask);
