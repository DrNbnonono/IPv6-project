const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const db = require('../database/db');
const { createLogger, format, transports } = require('winston');
const util = require('util');

const execAsync = promisify(exec);
const { DIRECTORIES, TOOLS } = require('../config/paths');

// 配置系统日志和目录
const logDir = DIRECTORIES.backendLogs;
const XMAP_LOG_DIR = DIRECTORIES.xmapLogs;
const XMAP_RESULT_DIR = DIRECTORIES.xmapResults;
const WHITELIST_DIR = DIRECTORIES.whitelists;

const ITEMS_PER_PAGE = 20; //每次查询的页面总数

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

// 确保所有目录存在
[logDir, XMAP_LOG_DIR, XMAP_RESULT_DIR, WHITELIST_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`创建目录: ${dir}`);
  }
});

// 检查和创建XMap容器内目录的函数
const ensureXMapDirectories = async () => {
  const containerName = process.env.XMAP_CONTAINER || 'ipv6-xmap';
  const directories = ['/data/logs', '/data/results', '/data/whitelists'];

  for (const dir of directories) {
    try {
      // 在容器环境中直接使用docker命令
      await execAsync(`docker exec ${containerName} mkdir -p ${dir}`);
    } catch (error) {
      logger.warn(`无法在XMap容器中创建目录 ${dir}: ${error.message}`);
    }
  }
};

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

// 获取宿主机的全局IPv6地址
const getHostIPv6Address = async () => {
  try {
    // 方法1：使用ifconfig获取全局IPv6地址
    const { stdout } = await execAsync('ifconfig | grep "inet6.*global" | head -1 | awk \'{print $2}\'');
    const ipv6 = stdout.trim();

    if (ipv6 && ipv6 !== '' && !ipv6.startsWith('::1') && !ipv6.startsWith('fe80')) {
      logger.info(`检测到宿主机IPv6地址: ${ipv6}`);
      return ipv6;
    }

    // 方法2：备用方法，使用ip命令
    try {
      const { stdout: ipCmd } = await execAsync('ip -6 addr show | grep "inet6.*global" | head -1 | awk \'{print $2}\' | cut -d\'/\' -f1');
      const backupIpv6 = ipCmd.trim();

      if (backupIpv6 && backupIpv6 !== '' && !backupIpv6.startsWith('::1') && !backupIpv6.startsWith('fe80')) {
        logger.info(`使用备用方法检测到IPv6地址: ${backupIpv6}`);
        return backupIpv6;
      }
    } catch (ipError) {
      logger.warn('备用IPv6地址检测失败:', ipError.message);
    }

    // 如果都没有找到，使用已知的测试地址
    logger.warn('未能检测到全局IPv6地址，使用已知的测试地址');
    return '2001:250:200:10:20c:29ff:fe88:8a32';  // 使用我们找到的实际地址
  } catch (error) {
    logger.error('获取IPv6地址失败:', error);
    return '2001:250:200:10:20c:29ff:fe88:8a32';  // 返回已知的测试地址
  }
};

// 获取默认网关的MAC地址
const getGatewayMacAddress = async () => {
  try {
    // 方法1：通过ip route和arp获取网关MAC地址
    const { stdout: routeOutput } = await execAsync('ip route | grep default | head -1');
    const routeMatch = routeOutput.match(/via\s+([^\s]+)/);

    if (routeMatch) {
      const gatewayIP = routeMatch[1];
      logger.info(`检测到默认网关IP: ${gatewayIP}`);

      // 尝试ping网关以确保ARP表中有记录
      try {
        await execAsync(`ping -c 1 -W 2 ${gatewayIP}`, { timeout: 5000 });
      } catch (pingError) {
        logger.warn(`ping网关失败，但继续尝试获取MAC地址: ${pingError.message}`);
      }

      // 从ARP表获取MAC地址
      try {
        const { stdout: arpOutput } = await execAsync(`arp -n ${gatewayIP} | grep ${gatewayIP} | awk '{print $3}'`);
        const macAddress = arpOutput.trim();

        if (macAddress && macAddress !== '(incomplete)' && macAddress.match(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)) {
          logger.info(`检测到网关MAC地址: ${macAddress}`);
          return macAddress;
        }
      } catch (arpError) {
        logger.warn(`从ARP表获取MAC地址失败: ${arpError.message}`);
      }
    }

    // 方法2：通过ip neigh获取网关MAC地址
    try {
      const { stdout: neighOutput } = await execAsync('ip neigh show | grep REACHABLE | head -1');
      const neighMatch = neighOutput.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/);

      if (neighMatch) {
        const macAddress = neighMatch[1];
        logger.info(`通过ip neigh检测到网关MAC地址: ${macAddress}`);
        return macAddress;
      }
    } catch (neighError) {
      logger.warn(`通过ip neigh获取MAC地址失败: ${neighError.message}`);
    }

    // 方法3：尝试从默认路由的接口获取网关信息
    try {
      const { stdout: routeDetail } = await execAsync('ip route get 8.8.8.8 | head -1');
      const viaMatch = routeDetail.match(/via\s+([^\s]+)/);

      if (viaMatch) {
        const gatewayIP = viaMatch[1];
        // 强制刷新ARP表
        await execAsync(`arping -c 2 -I $(ip route get ${gatewayIP} | grep -oP 'dev \\K\\S+') ${gatewayIP}`, { timeout: 5000 }).catch(() => {});

        const { stdout: arpOutput } = await execAsync(`arp -n ${gatewayIP} | awk '{print $3}' | grep ':'`);
        const macAddress = arpOutput.trim();

        if (macAddress && macAddress.match(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)) {
          logger.info(`通过路由详情检测到网关MAC地址: ${macAddress}`);
          return macAddress;
        }
      }
    } catch (routeDetailError) {
      logger.warn(`通过路由详情获取MAC地址失败: ${routeDetailError.message}`);
    }

    // 如果所有方法都失败，返回null，让xmap自动检测
    logger.warn('无法自动检测网关MAC地址，将让xmap自动处理');
    return null;
  } catch (error) {
    logger.error('获取网关MAC地址失败:', error);
    return null;
  }
};

// 验证XMap参数
const validateXmapParams = (params) => {
  const allowedParams = ['ipv6', 'ipv4', 'maxlen', 'rate', 'targetPort', 'targetaddress', 'help', 'whitelistFile', 'max_results', 'maxResults', 'description', 'probeModule'];
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
    whitelistFile, max_results, maxResults, description, probeModule
  } = req.body;

  // 兼容两种参数名称
  const finalMaxResults = max_results || maxResults;

  try {
    validateXmapParams(req.body);
    
    const taskId = Date.now();

    // 后端容器中的路径（用于数据库记录和API访问）
    const logFile = path.join(XMAP_LOG_DIR, `${taskId}.csv`);
    const resultFile = path.join(XMAP_RESULT_DIR, `${taskId}.json`);
    const errorLogFile = path.join(XMAP_LOG_DIR, `${taskId}_error.log`);

    // XMap容器中的路径（根据docker-compose.yml的volume映射）
    // XMap容器volume映射: ./data/xmap_log:/data/logs, ./data/xmap_result:/data/results
    // 这些路径会通过volume映射到宿主机的./data/目录，然后再映射到后端容器的/app/目录
    const xmapLogFile = `/data/logs/${taskId}.csv`;
    const xmapResultFile = `/data/results/${taskId}.json`;

    // 确保后端容器中的目录存在
    if (!fs.existsSync(XMAP_LOG_DIR)) {
      fs.mkdirSync(XMAP_LOG_DIR, { recursive: true });
      logger.info(`创建后端日志目录: ${XMAP_LOG_DIR}`);
    }
    if (!fs.existsSync(XMAP_RESULT_DIR)) {
      fs.mkdirSync(XMAP_RESULT_DIR, { recursive: true });
      logger.info(`创建后端结果目录: ${XMAP_RESULT_DIR}`);
    }

    const args = [];
    if (ipv6) args.push('-6');
    if (ipv4) args.push('-4');
    if (maxlen) args.push('-x', maxlen);
    if (rate) args.push('-B', rate);
    if (targetPort) args.push('-p', targetPort);
    if (probeModule) args.push('-M', probeModule); // 添加扫描模式参数
    if (help) args.push('-h');
    if (finalMaxResults) args.push('-N', finalMaxResults);

    if (whitelistFile) {
      const whitelistPath = path.join(WHITELIST_DIR, whitelistFile);
      if (fs.existsSync(whitelistPath)) {
        // XMap容器中的白名单文件路径
        const xmapWhitelistPath = `/data/whitelists/${whitelistFile}`;
        args.push('-w', xmapWhitelistPath);
      } else {
        throw new Error('白名单文件不存在');
      }
    }

    // 获取宿主机IPv6地址并添加源IP参数
    if (ipv6) {
      const hostIPv6 = await getHostIPv6Address();
      args.push('-S', hostIPv6);
    } else if (ipv4) {
      // IPv4情况下使用宿主机的IPv4地址
      args.push('-S', '127.0.0.1');  // 可以根据需要改为实际的IPv4地址
    }

    // 获取并添加网关MAC地址参数
    try {
      console.log('=== 正式扫描开始获取网关MAC地址 ===');
      let gatewayMac = await getGatewayMacAddress();
      console.log('正式扫描获取到的网关MAC地址:', gatewayMac);

      // 如果无法获取网关MAC地址，使用默认值
      if (!gatewayMac) {
        gatewayMac = '46:23:c0:ed:b6:c4'; // Docker容器内的默认网关MAC地址
        logger.warn(`使用默认网关MAC地址: ${gatewayMac}`);
        console.log(`使用默认网关MAC地址: ${gatewayMac}`);
      }

      args.push('-G', gatewayMac);
      logger.info(`使用网关MAC地址: ${gatewayMac}`);
      console.log(`使用网关MAC地址: ${gatewayMac}`);
    } catch (macError) {
      // 如果出现错误，使用默认网关MAC地址
      const defaultMac = '46:23:c0:ed:b6:c4';
      args.push('-G', defaultMac);
      logger.warn(`获取网关MAC地址失败，使用默认值: ${defaultMac}, 错误: ${macError.message}`);
      console.log(`获取网关MAC地址失败，使用默认值: ${defaultMac}, 错误: ${macError.message}`);
    }

    // 添加输出文件参数
    args.push('-u', xmapLogFile, '-o', xmapResultFile, '-q', '-O', 'json');

    // 最后添加目标地址
    if (targetaddress) {
      args.push(targetaddress);
    }

    // 定义容器名称
    const containerName = process.env.XMAP_CONTAINER || 'ipv6-xmap';
    const fullCommand = `docker exec ${containerName} xmap ${args.join(' ')}`;

    await db.query(
      'INSERT INTO tasks (id, user_id, command,description, status, log_path, output_path,  task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, userId, fullCommand, description, 'running', logFile, resultFile, 'xmap']
    );

    logger.info(`用户 ${userId} 创建新任务 ${taskId}`, {
      command: fullCommand,
      description,
      user: userId
    });

    // 检查XMap容器是否运行
    try {
      const containerCheck = await execAsync(`docker ps --format "{{.Names}}" | grep "^${containerName}$"`);
      if (!containerCheck.stdout.trim()) {
        throw new Error(`XMap容器 ${containerName} 未运行，请先启动容器`);
      }
      logger.info(`XMap容器 ${containerName} 运行正常`);
    } catch (error) {
      logger.error(`XMap容器检查失败: ${error.message}`);
      throw new Error(`无法访问XMap容器: ${error.message}`);
    }

    // 确保XMap容器内目录存在
    await ensureXMapDirectories();

    // 使用docker exec方式执行XMap命令
    const dockerCommand = 'docker';
    const dockerArgs = ['exec', containerName, 'xmap', ...args];

    logger.info(`执行XMap命令: ${dockerCommand} ${dockerArgs.join(' ')}`);

    const xmapProcess = spawn(dockerCommand, dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
  console.log('=== CANCEL TASK FUNCTION CALLED ===');
  const taskId = parseInt(req.params.taskId);
  const userId = req.user.id;

  console.log(`开始取消任务 ${taskId}，用户 ${userId}`);
  logger.info(`开始取消任务 ${taskId}，用户 ${userId}`);

  try {
    if (isNaN(taskId)) {
      logger.error(`无效的任务ID格式: ${req.params.taskId}`);
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
      logger.error(`任务 ${taskId} 不存在或用户 ${userId} 无权访问`);
      return res.status(404).json({
        success: false,
        message: '任务不存在或无权访问'
      });
    }

    const task = tasks[0];
    logger.info(`找到任务 ${taskId}，当前状态: ${task.status}`);

    if (!['pending', 'running'].includes(task.status)) {
      logger.error(`任务 ${taskId} 状态为 ${task.status}，无法终止`);
      return res.status(400).json({
        success: false,
        message: `任务当前状态为 ${task.status}，无法终止`
      });
    }

    logger.info(`检查活跃进程，当前活跃进程数: ${activeProcesses.size}`);
    logger.info(`活跃进程列表: ${Array.from(activeProcesses.keys()).join(', ')}`);
    logger.info(`任务 ${taskId} 是否在活跃进程中: ${activeProcesses.has(taskId)}`);

    if (activeProcesses.has(taskId)) {
      const process = activeProcesses.get(taskId);

      logger.info(`开始终止任务 ${taskId} 的进程`);

      // 1. 先终止后端容器内的docker exec进程
      try {
        process.kill('SIGTERM');
        logger.info(`已发送SIGTERM信号给任务 ${taskId} 的docker exec进程`);
      } catch (killError) {
        logger.error(`终止docker exec进程失败`, { taskId, error: killError.message });
      }

      // 2. 在XMap容器内杀死实际的xmap进程
      const containerName = 'ipv6-xmap'; // 直接使用容器名
      const killCommand = `docker exec ${containerName} pkill -f ${taskId}`;

      logger.info(`执行XMap容器内进程终止命令: ${killCommand}`);
      console.log(`执行XMap容器内进程终止命令: ${killCommand}`);

      // 使用同步方式执行，避免异步问题
      exec(killCommand, (error, stdout, stderr) => {
        if (error) {
          logger.error(`XMap容器内进程终止命令失败`, { taskId, error: error.message });
          console.log(`XMap容器内进程终止命令失败: ${error.message}`);

          // 如果精确匹配失败，尝试杀死所有xmap进程
          const fallbackKillCommand = `docker exec ${containerName} pkill -f xmap`;
          logger.info(`执行备用终止命令: ${fallbackKillCommand}`);
          console.log(`执行备用终止命令: ${fallbackKillCommand}`);

          exec(fallbackKillCommand, (fallbackError, fallbackStdout, fallbackStderr) => {
            if (fallbackError) {
              logger.error(`备用终止命令也失败`, { taskId, error: fallbackError.message });
              console.log(`备用终止命令也失败: ${fallbackError.message}`);
            } else {
              logger.info(`备用XMap进程终止命令完成，任务 ${taskId}`);
              console.log(`备用XMap进程终止命令完成，任务 ${taskId}`);
            }
          });
        } else {
          logger.info(`XMap容器内进程终止命令完成，任务 ${taskId}`, { stdout, stderr });
          console.log(`XMap容器内进程终止命令完成，任务 ${taskId}`);
        }
      });

      // 等待一段时间后强制杀死docker exec进程
      setTimeout(() => {
        try {
          process.kill('SIGKILL');
          logger.info(`已发送SIGKILL信号给任务 ${taskId} 的docker exec进程`);
          console.log(`已发送SIGKILL信号给任务 ${taskId} 的docker exec进程`);
        } catch (killError) {
          logger.error(`强制终止进程失败`, { taskId, error: killError.message });
          console.log(`强制终止进程失败: ${killError.message}`);
        }
      }, 2000); // 2秒后强制杀死

      activeProcesses.delete(taskId);
    } else {
      logger.info(`任务 ${taskId} 没有找到活跃的进程，可能已经完成或未启动`);
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

// 简单的XMap测试功能
exports.testScan = async (req, res) => {
  console.log('=== TESTSCAN FUNCTION CALLED ===');
  logger.info('=== TESTSCAN FUNCTION CALLED ===');

  const userId = req.user.id;
  const { target = '2001::', description = 'XMap测试扫描' } = req.body;
  console.log('testScan参数:', { target, description, userId });
  logger.info('testScan参数:', { target, description, userId });

  try {
    const taskId = Date.now();

    // 后端容器中的路径（用于数据库记录和API访问）
    const logFile = path.join(XMAP_LOG_DIR, `test_${taskId}.csv`);
    const resultFile = path.join(XMAP_RESULT_DIR, `test_${taskId}.json`);

    // XMap容器中的路径
    const xmapLogFile = `/data/logs/test_${taskId}.csv`;
    const xmapResultFile = `/data/results/test_${taskId}.json`;

    // 确保后端容器中的目录存在
    if (!fs.existsSync(XMAP_LOG_DIR)) {
      fs.mkdirSync(XMAP_LOG_DIR, { recursive: true });
      logger.info(`创建后端日志目录: ${XMAP_LOG_DIR}`);
    }
    if (!fs.existsSync(XMAP_RESULT_DIR)) {
      fs.mkdirSync(XMAP_RESULT_DIR, { recursive: true });
      logger.info(`创建后端结果目录: ${XMAP_RESULT_DIR}`);
    }

    // 获取宿主机IPv6地址
    const hostIPv6 = await getHostIPv6Address();

    // 构建简单的测试命令：xmap -x 128 -S <source_ip> -G <gateway_mac> -u <log> -o <result> <target>
    const args = ['-x', '128', '-S', hostIPv6];

    // 获取并添加网关MAC地址参数
    try {
      console.log('=== 开始获取网关MAC地址 ===');
      let gatewayMac = await getGatewayMacAddress();
      console.log('获取到的网关MAC地址:', gatewayMac);

      // 如果无法获取网关MAC地址，使用默认值
      if (!gatewayMac) {
        gatewayMac = '46:23:c0:ed:b6:c4'; // Docker容器内的默认网关MAC地址
        logger.warn(`使用默认网关MAC地址: ${gatewayMac}`);
        console.log(`使用默认网关MAC地址: ${gatewayMac}`);
      }

      args.push('-G', gatewayMac);
      logger.info(`测试扫描使用网关MAC地址: ${gatewayMac}`);
      console.log(`测试扫描使用网关MAC地址: ${gatewayMac}`);
    } catch (macError) {
      // 如果出现错误，使用默认网关MAC地址
      const defaultMac = '46:23:c0:ed:b6:c4';
      args.push('-G', defaultMac);
      logger.warn(`获取网关MAC地址失败，使用默认值: ${defaultMac}, 错误: ${macError.message}`);
      console.log(`获取网关MAC地址失败，使用默认值: ${defaultMac}, 错误: ${macError.message}`);
    }

    args.push('-u', xmapLogFile, '-o', xmapResultFile, '-q', '-O', 'json', target);

    const containerName = process.env.XMAP_CONTAINER || 'ipv6-xmap';
    const fullCommand = `docker exec ${containerName} xmap ${args.join(' ')}`;

    // 保存任务到数据库
    await db.query(
      'INSERT INTO tasks (id, user_id, command, description, status, log_path, output_path, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [taskId, userId, fullCommand, description, 'running', logFile, resultFile, 'xmap']
    );

    logger.info(`用户 ${userId} 创建XMap测试任务 ${taskId}`, {
      command: fullCommand,
      target,
      sourceIP: hostIPv6
    });

    // 检查XMap容器是否运行
    try {
      const containerCheck = await execAsync(`docker ps --format "{{.Names}}" | grep "^${containerName}$"`);
      if (!containerCheck.stdout.trim()) {
        throw new Error(`XMap容器 ${containerName} 未运行，请先启动容器`);
      }
      logger.info(`XMap容器 ${containerName} 运行正常`);
    } catch (error) {
      logger.error(`XMap容器检查失败: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: `无法访问XMap容器: ${error.message}`
      });
    }

    // 确保XMap容器内目录存在
    await ensureXMapDirectories();

    // 使用docker exec方式执行XMap命令
    const dockerCommand = 'docker';
    const dockerArgs = ['exec', containerName, 'xmap', ...args];

    logger.info(`执行XMap测试命令: ${dockerCommand} ${dockerArgs.join(' ')}`);

    const xmapProcess = spawn(dockerCommand, dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 存储进程引用
    activeProcesses.set(taskId, xmapProcess);

    // 监听进程结束
    xmapProcess.on('close', async (code, signal) => {
      try {
        activeProcesses.delete(taskId);

        const status = code === 0 ? 'completed' : 'failed';
        const errorMessage = code !== 0 ? `进程异常终止 - 退出码: ${code}, 信号: ${signal || '无'}` : null;

        await db.query(
          'UPDATE tasks SET status = ?, completed_at = NOW(), exit_code = ?, process_signal = ?, error_message = ? WHERE id = ?',
          [status, code, signal, errorMessage, taskId]
        );

        logger.info(`XMap测试任务 ${taskId} 完成`, { code, signal, status });
      } catch (error) {
        logger.error(`更新XMap测试任务 ${taskId} 状态失败:`, error);
      }
    });

    res.json({
      success: true,
      taskId,
      message: 'XMap测试扫描已开始',
      command: fullCommand,
      target,
      sourceIP: hostIPv6
    });

  } catch (error) {
    logger.error('XMap测试扫描创建失败:', error);
    res.status(500).json({
      success: false,
      message: `测试扫描创建失败: ${error.message}`
    });
  }
};

module.exports = {
  uploadWhitelist: exports.uploadWhitelist,
  scan: exports.scan,
  testScan: exports.testScan,
  getLog: exports.getLog,
  cancelTask: exports.cancelTask,
  deleteTask: exports.deleteTask,
  getTaskDetails: exports.getTaskDetails,
  getTasks: exports.getTasks,
  getResult: exports.getResult,
  getWhitelists: exports.getWhitelists,
  deleteWhitelist: exports.deleteWhitelist
};