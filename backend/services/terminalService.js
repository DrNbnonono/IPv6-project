/**
 * 终端服务
 * 支持命令执行、终端会话管理
 */

const { spawn } = require('child_process');
const crypto = require('crypto');

// 终端配置
const TERMINAL_CONFIG = {
  maxConcurrentTerminals: 5,          // 最大并发终端数
  defaultTimeout: 5 * 60 * 1000,     // 默认命令超时5分钟
  maxBufferSize: 10 * 1024 * 1024,   // 最大输出缓冲10MB
  shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
  workingDirectory: process.cwd()     // 默认工作目录
};

// 活跃终端会话
const activeTerminals = new Map();

/**
 * 创建终端会话
 */
const createTerminal = (sessionId, options = {}) => {
  const id = sessionId || crypto.randomUUID();

  // 检查并发限制
  if (activeTerminals.size >= TERMINAL_CONFIG.maxConcurrentTerminals) {
    return {
      success: false,
      error: `终端数量已达上限（${TERMINAL_CONFIG.maxConcurrentTerminals}）`
    };
  }

  const terminal = {
    id,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    workingDirectory: options.workingDirectory || TERMINAL_CONFIG.workingDirectory,
    environment: { ...process.env, ...options.env },
    history: [],
    isActive: true
  };

  activeTerminals.set(id, terminal);

  return {
    success: true,
    terminal: {
      id: terminal.id,
      workingDirectory: terminal.workingDirectory,
      createdAt: terminal.createdAt
    }
  };
};

/**
 * 执行命令
 */
const executeCommand = (terminalId, command, options = {}) => {
  return new Promise((resolve, reject) => {
    const terminal = activeTerminals.get(terminalId);

    if (!terminal) {
      return reject(new Error(`终端 ${terminalId} 不存在`));
    }

    if (!terminal.isActive) {
      return reject(new Error('终端已关闭'));
    }

    const timeout = options.timeout || TERMINAL_CONFIG.defaultTimeout;
    const cwd = options.cwd || terminal.workingDirectory;

    // 记录命令历史
    const cmdRecord = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      command,
      startTime: Date.now(),
      cwd,
      status: 'running'
    };
    terminal.history.push(cmdRecord);
    terminal.lastActivityAt = Date.now();

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    const shell = options.shell || TERMINAL_CONFIG.shell;

    const child = spawn(shell, ['-c', command], {
      cwd,
      env: terminal.environment,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 设置超时
    const timeoutHandle = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // 限制缓冲大小
      if (stdout.length > TERMINAL_CONFIG.maxBufferSize) {
        stdout = stdout.substring(stdout.length - TERMINAL_CONFIG.maxBufferSize);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;

      if (stderr.length > TERMINAL_CONFIG.maxBufferSize) {
        stderr = stderr.substring(stderr.length - TERMINAL_CONFIG.maxBufferSize);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      cmdRecord.status = 'error';
      cmdRecord.endTime = Date.now();
      cmdRecord.error = error.message;
      terminal.lastActivityAt = Date.now();

      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      cmdRecord.endTime = Date.now();
      cmdRecord.status = isTimedOut ? 'timeout' : (code === 0 ? 'success' : 'error');
      cmdRecord.exitCode = code;
      cmdRecord.stdout = stdout;
      cmdRecord.stderr = stderr;
      terminal.lastActivityAt = Date.now();

      if (isTimedOut) {
        stderr += '\n[命令执行超时]';
      }

      resolve({
        success: code === 0 && !isTimedOut,
        command: cmdRecord,
        stdout,
        stderr,
        exitCode: code,
        timedOut: isTimedOut,
        duration: cmdRecord.endTime - cmdRecord.startTime
      });
    });
  });
};

/**
 * 获取终端信息
 */
const getTerminalInfo = (terminalId) => {
  const terminal = activeTerminals.get(terminalId);

  if (!terminal) {
    return { success: false, error: '终端不存在' };
  }

  return {
    success: true,
    terminal: {
      id: terminal.id,
      workingDirectory: terminal.workingDirectory,
      createdAt: terminal.createdAt,
      lastActivityAt: terminal.lastActivityAt,
      isActive: terminal.isActive,
      commandCount: terminal.history.filter(h => h.status !== 'running').length,
      runningCount: terminal.history.filter(h => h.status === 'running').length
    }
  };
};

/**
 * 获取终端命令历史
 */
const getCommandHistory = (terminalId, limit = 50) => {
  const terminal = activeTerminals.get(terminalId);

  if (!terminal) {
    return { success: false, error: '终端不存在' };
  }

  const history = terminal.history.slice(-limit).map(cmd => ({
    id: cmd.id,
    command: cmd.command,
    startTime: cmd.startTime,
    endTime: cmd.endTime,
    status: cmd.status,
    exitCode: cmd.exitCode,
    duration: cmd.endTime ? cmd.endTime - cmd.startTime : null
  }));

  return { success: true, history };
};

/**
 * 关闭终端
 */
const closeTerminal = (terminalId) => {
  const terminal = activeTerminals.get(terminalId);

  if (!terminal) {
    return { success: false, error: '终端不存在' };
  }

  terminal.isActive = false;

  // 延迟删除，允许完成中的命令完成
  setTimeout(() => {
    activeTerminals.delete(terminalId);
  }, 1000);

  return { success: true };
};

/**
 * 获取所有活跃终端
 */
const getAllTerminals = () => {
  const terminals = [];

  for (const [id, terminal] of activeTerminals.entries()) {
    terminals.push({
      id: terminal.id,
      workingDirectory: terminal.workingDirectory,
      createdAt: terminal.createdAt,
      lastActivityAt: terminal.lastActivityAt,
      isActive: terminal.isActive,
      commandCount: terminal.history.filter(h => h.status !== 'running').length
    });
  }

  return {
    success: true,
    terminals,
    count: terminals.length,
    maxAllowed: TERMINAL_CONFIG.maxConcurrentTerminals
  };
};

/**
 * 设置终端工作目录
 */
const setWorkingDirectory = (terminalId, path) => {
  const terminal = activeTerminals.get(terminalId);

  if (!terminal) {
    return { success: false, error: '终端不存在' };
  }

  terminal.workingDirectory = path;
  terminal.lastActivityAt = Date.now();

  return {
    success: true,
    workingDirectory: terminal.workingDirectory
  };
};

/**
 * 清理所有超时或已关闭的终端
 */
const cleanupTerminals = () => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30分钟不活跃则清理

  for (const [id, terminal] of activeTerminals.entries()) {
    if (!terminal.isActive || (now - terminal.lastActivityAt) > timeout) {
      activeTerminals.delete(id);
    }
  }
};

// 定期清理（每5分钟）
setInterval(cleanupTerminals, 5 * 60 * 1000);

/**
 * 安全的命令白名单
 */
const ALLOWED_COMMANDS = {
  // 网络探测相关
  'nmap': { description: '网络扫描工具', args: ['-6', '-Pn', '-T4', '-s'] },
  'ping': { description: 'Ping命令', args: ['-c', '-W'] },
  'ping6': { description: 'IPv6 Ping', args: ['-c', '-W'] },
  'curl': { description: 'HTTP客户端', args: ['-I', '-L', '-s', '-o'] },
  'wget': { description: '文件下载工具', args: ['-O', '-q'] },
  'netstat': { description: '网络状态', args: ['-an', '-tu'] },
  'ss': { description: 'Socket统计', args: ['-tuln'] },
  'traceroute': { description: '路由追踪', args: [] },
  'traceroute6': { description: 'IPv6路由追踪', args: [] },
  'nslookup': { description: 'DNS查询', args: [] },
  'dig': { description: 'DNS查询', args: [] },
  'host': { description: 'DNS查询', args: [] },
  // 系统信息
  'ifconfig': { description: '网络接口配置', args: [] },
  'ip': { description: 'IP配置', args: ['addr', 'link', 'route'] },
  'uname': { description: '系统信息', args: ['-a'] },
  'hostname': { description: '主机名', args: [] },
  'uptime': { description: '运行时间', args: [] },
  'whoami': { description: '当前用户', args: [] },
  'ps': { description: '进程列表', args: ['aux'] },
  'top': { description: '进程监视', args: ['-bn1'] },
  // 文件操作
  'ls': { description: '列出目录', args: ['-la', '-lh'] },
  'cd': { description: '切换目录', args: [] },
  'pwd': { description: '当前目录', args: [] },
  'mkdir': { description: '创建目录', args: ['-p'] },
  'rm': { description: '删除文件', args: ['-rf'] },
  'cp': { description: '复制文件', args: ['-r'] },
  'mv': { description: '移动文件', args: [] },
  'cat': { description: '查看文件', args: [] },
  'head': { description: '查看文件头部', args: ['-n'] },
  'tail': { description: '查看文件尾部', args: ['-n', '-f'] },
  'grep': { description: '文本搜索', args: ['-r', '-i', '-n'] },
  'awk': { description: '文本处理', args: [] },
  'sed': { description: '文本编辑', args: [] },
  'sort': { description: '排序', args: [] },
  'wc': { description: '字数统计', args: ['-l', '-c'] },
  'find': { description: '文件搜索', args: [] },
  'xargs': { description: '参数构建', args: [] },
  // 杂项
  'echo': { description: '输出文本', args: [] },
  'date': { description: '日期时间', args: [] },
  'df': { description: '磁盘使用', args: ['-h'] },
  'du': { description: '目录大小', args: ['-sh'] },
  'free': { description: '内存使用', args: ['-h'] },
  'clear': { description: '清屏', args: [] },
  'history': { description: '命令历史', args: [] }
};

/**
 * 验证命令是否在白名单中
 */
const isCommandAllowed = (command) => {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];

  return ALLOWED_COMMANDS.hasOwnProperty(cmd);
};

/**
 * 获取允许的命令列表
 */
const getAllowedCommands = () => {
  const commands = [];

  for (const [cmd, info] of Object.entries(ALLOWED_COMMANDS)) {
    commands.push({
      command: cmd,
      description: info.description,
      exampleArgs: info.args.slice(0, 3).join(' ')
    });
  }

  return {
    success: true,
    commands,
    total: commands.length
  };
};

module.exports = {
  createTerminal,
  executeCommand,
  getTerminalInfo,
  getCommandHistory,
  closeTerminal,
  getAllTerminals,
  setWorkingDirectory,
  cleanupTerminals,
  isCommandAllowed,
  getAllowedCommands,
  TERMINAL_CONFIG,
  ALLOWED_COMMANDS
};
