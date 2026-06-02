/**
 * Agent控制器
 * 处理Agent相关的HTTP请求
 */

const agentService = require('../services/agentService');
const toolService = require('../services/toolService');
const llmService = require('../services/llmService');
const memoryService = require('../services/memoryService');
const terminalService = require('../services/terminalService');

const ensureTerminalAdmin = (req, res) => {
  if (req.user?.role === 'admin') {
    return true;
  }

  res.status(403).json({
    success: false,
    message: '仅管理员可使用终端功能'
  });

  return false;
};

/**
 * 处理Agent对话
 * POST /api/agent/chat
 */
exports.chat = async (req, res) => {
  const { message, history, sessionId } = req.body;

  console.log('收到Agent对话请求:', {
    message: message?.substring(0, 50) + '...',
    historyLength: history?.length || 0
  });

  // 参数验证
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      success: false,
      message: '请提供有效的消息内容'
    });
  }

  try {
    const userId = req.user?.id || 'anonymous';
    const context = { user: req.user };

    // 获取或创建会话
    const session = memoryService.getOrCreateSession(sessionId || userId);

    // 添加用户消息到短期记忆
    session.addMessage('user', message);

    // 处理消息
    const result = await agentService.processMessage(message.trim(), session.getRecentMessages(20), context);

    // 添加AI响应到短期记忆
    session.addMessage('assistant', result.message);

    console.log('Agent响应成功:', {
      type: result.type,
      preview: result.message?.substring(0, 100)
    });

    res.json({
      ...result,
      sessionId: session.sessionId
    });

  } catch (error) {
    console.error('Agent对话错误:', error.message);

    let errorMessage = 'Agent服务暂时不可用，请稍后再试。';
    let statusCode = 500;

    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        errorMessage = 'AI API密钥无效，请检查配置。';
        statusCode = 401;
      } else if (status === 429) {
        errorMessage = 'AI请求过于频繁，请稍后再试。';
        statusCode = 429;
      } else if (status === 400) {
        errorMessage = '请求格式错误：' + (error.response.data?.error?.message || '未知错误');
        statusCode = 400;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'AI响应超时，请稍后再试。';
      statusCode = 504;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取可用工具列表
 * GET /api/agent/tools
 */
exports.getTools = async (req, res) => {
  try {
    const tools = toolService.getTools();

    console.log('获取工具列表:', { count: tools.length });

    res.json({
      success: true,
      data: {
        tools: tools,
        count: tools.length
      }
    });

  } catch (error) {
    console.error('获取工具列表错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取工具列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 执行工具
 * POST /api/agent/tools/execute
 */
exports.executeTool = async (req, res) => {
  const { toolName, params } = req.body;

  console.log('收到工具执行请求:', { toolName, params });

  // 参数验证
  if (!toolName || typeof toolName !== 'string') {
    return res.status(400).json({
      success: false,
      message: '请提供工具名称'
    });
  }

  try {
    const context = { user: req.user };
    const result = await toolService.executeTool(toolName, params || {}, context);

    console.log('工具执行完成:', { toolName, success: result.success });

    if (result.success) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || '工具执行失败',
        data: result
      });
    }

  } catch (error) {
    console.error('工具执行错误:', error.message);

    res.status(500).json({
      success: false,
      message: '工具执行失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 生成工作流
 * POST /api/agent/workflow/generate
 */
exports.generateWorkflow = async (req, res) => {
  const { goal, constraints } = req.body;

  console.log('收到工作流生成请求:', { goal, constraints });

  // 参数验证
  if (!goal || typeof goal !== 'string' || goal.trim() === '') {
    return res.status(400).json({
      success: false,
      message: '请提供有效的探测目标'
    });
  }

  try {
    const context = { user: req.user };
    const result = await agentService.generateWorkflow(goal.trim(), constraints || '', context);

    console.log('工作流生成完成:', { success: result.success });

    res.json(result);

  } catch (error) {
    console.error('工作流生成错误:', error.message);

    res.status(500).json({
      success: false,
      message: '工作流生成失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取Agent状态
 * GET /api/agent/status
 */
exports.getStatus = async (req, res) => {
  try {
    const llmStatus = llmService.getStatus();
    const tools = toolService.getTools();
    const terminals = terminalService.getAllTerminals();

    res.json({
      success: true,
      data: {
        agent: {
          enabled: true,
          version: '1.0.0'
        },
        llm: llmStatus.data,
        tools: {
          enabled: true,
          count: tools.length,
          list: tools.map(t => ({ id: t.id, name: t.name }))
        },
        terminals: terminals
      }
    });

  } catch (error) {
    console.error('获取Agent状态错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取Agent状态失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取欢迎消息
 * GET /api/agent/welcome
 */
exports.getWelcome = async (req, res) => {
  try {
    const welcome = agentService.getWelcomeMessage();
    res.json(welcome);
  } catch (error) {
    console.error('获取欢迎消息错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取欢迎消息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ 记忆管理接口 ============

/**
 * 获取用户记忆摘要
 * GET /api/agent/memory/summary
 */
exports.getMemorySummary = async (req, res) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const summary = await memoryService.longTermMemory.getMemorySummary(userId);

    res.json(summary);
  } catch (error) {
    console.error('获取记忆摘要错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取记忆摘要失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 保存用户偏好
 * POST /api/agent/memory/preferences
 */
exports.savePreferences = async (req, res) => {
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({
      success: false,
      message: '请提供有效的偏好设置'
    });
  }

  try {
    const userId = req.user?.id || 'anonymous';
    const result = await memoryService.longTermMemory.saveUserPreference(userId, preferences);

    res.json(result);
  } catch (error) {
    console.error('保存偏好错误:', error.message);

    res.status(500).json({
      success: false,
      message: '保存偏好失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取用户偏好
 * GET /api/agent/memory/preferences
 */
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const result = await memoryService.longTermMemory.getUserPreference(userId);

    res.json(result);
  } catch (error) {
    console.error('获取偏好错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取偏好失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 清空用户记忆
 * DELETE /api/agent/memory
 */
exports.clearMemory = async (req, res) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const result = await memoryService.longTermMemory.clearAllMemory(userId);

    res.json(result);
  } catch (error) {
    console.error('清空记忆错误:', error.message);

    res.status(500).json({
      success: false,
      message: '清空记忆失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ 终端管理接口 ============

/**
 * 创建终端会话
 * POST /api/agent/terminal
 */
exports.createTerminal = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  try {
    const userId = req.user?.id || 'anonymous';
    const result = terminalService.createTerminal(null, { userId });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('创建终端错误:', error.message);

    res.status(500).json({
      success: false,
      message: '创建终端失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 执行终端命令
 * POST /api/agent/terminal/execute
 */
exports.executeCommand = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  const { terminalId, command, timeout } = req.body;

  if (!terminalId || !command) {
    return res.status(400).json({
      success: false,
      message: '请提供终端ID和命令'
    });
  }

  try {
    const result = await terminalService.executeCommand(terminalId, command, { timeout });

    res.json(result);
  } catch (error) {
    console.error('执行命令错误:', error.message);

    res.status(500).json({
      success: false,
      message: '执行命令失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取终端信息
 * GET /api/agent/terminal/:id
 */
exports.getTerminal = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  const { id } = req.params;

  try {
    const result = terminalService.getTerminalInfo(id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('获取终端信息错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取终端信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 关闭终端
 * DELETE /api/agent/terminal/:id
 */
exports.closeTerminal = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  const { id } = req.params;

  try {
    const result = terminalService.closeTerminal(id);

    res.json(result);
  } catch (error) {
    console.error('关闭终端错误:', error.message);

    res.status(500).json({
      success: false,
      message: '关闭终端失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取所有终端
 * GET /api/agent/terminals
 */
exports.getAllTerminals = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  try {
    const result = terminalService.getAllTerminals();

    res.json(result);
  } catch (error) {
    console.error('获取终端列表错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取终端列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取终端命令历史
 * GET /api/agent/terminal/:id/history
 */
exports.getTerminalHistory = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  const { id } = req.params;

  try {
    const result = terminalService.getCommandHistory(id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('获取命令历史错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取命令历史失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取允许执行的命令列表
 * GET /api/agent/terminal/allowed-commands
 */
exports.getAllowedCommands = async (req, res) => {
  if (!ensureTerminalAdmin(req, res)) {
    return;
  }

  try {
    const result = terminalService.getAllowedCommands();

    res.json(result);
  } catch (error) {
    console.error('获取允许命令列表错误:', error.message);

    res.status(500).json({
      success: false,
      message: '获取允许命令列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
