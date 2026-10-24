/**
 * Agent核心服务
 * 意图识别、工具调用编排
 */

const llmService = require('./llmService');
const toolService = require('./toolService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('agent-service');

// Agent欢迎消息
const WELCOME_MESSAGE = `您好！我是ObserV6 Agent，您的IPv6网络探测智能助手。

我可以帮您：

🔍 **地址扫描** - 使用XMap检测IPv6地址活跃性
🌐 **服务探测** - 使用ZGrab2探测IPv6服务端口
📚 **知识问答** - 解答IPv6相关技术问题
⚙️ **工作流设计** - 根据需求生成探测工作流

请告诉我您需要什么帮助？`;

/**
 * 执行一次工具调用并整理成响应。
 * 大模型识别出的调用永远不能自行确认：confirmed 只能由用户通过 /tools/execute 显式提供。
 * 有副作用的工具（扫描、终端）只返回待确认请求，等待用户在界面上确认。
 */
const handleToolCall = async (userMessage, toolName, toolParams, context) => {
  const toolResult = await toolService.executeTool(toolName, toolParams, { ...context, confirmed: false });

  if (toolResult.needsConfirmation) {
    return {
      success: true,
      type: 'confirmation_required',
      message: `我准备执行「${toolResult.tool}」，参数如下，请确认后再执行。`,
      pendingToolCall: {
        tool: toolResult.tool,
        params: toolResult.params
      }
    };
  }

  // 生成工具执行结果的解释
  const explanationPrompt = `用户请求：${userMessage}
工具名称：${toolName}
工具参数：${JSON.stringify(toolParams)}
工具执行结果：${JSON.stringify(toolResult)}

请用简洁的语言解释工具执行结果，并给出后续建议。用Markdown格式输出。`;

  const explanation = await llmService.chat(explanationPrompt, [], {
    temperature: 0.7,
    max_tokens: 1024
  });

  return {
    success: true,
    type: 'tool_execution',
    message: explanation.message,
    toolCall: {
      tool: toolName,
      params: toolParams,
      result: toolResult
    },
    suggestions: generateSuggestions(toolName, toolResult)
  };
};

// 提供商以 4xx 拒绝带 tools 的请求（不支持或格式不兼容）时退回关键词意图识别；网络错误、鉴权失败等不退回
const TOOL_UNSUPPORTED_STATUSES = new Set([400, 404, 422]);

/**
 * 原生工具调用：把工具定义随请求发给模型，由模型决定是否调用、调用哪个、参数是什么。
 * 一次调用同时完成“要不要用工具”和“直接回答”，比旧的“意图识别 + 回答”少一次模型调用。
 * 单轮只处理模型给出的第一个调用；调用次数上限与结果回灌见 P4-3。
 */
const processWithNativeTools = async (userMessage, history, context) => {
  const response = await llmService.chat(userMessage, history, {
    temperature: 0.5,
    max_tokens: 2048,
    tools: toolService.getToolDefinitions(context)
  });

  const call = Array.isArray(response.toolCalls) ? response.toolCalls[0] : null;
  if (!call) {
    return {
      success: true,
      type: 'text',
      message: response.message,
      model: response.model,
      provider: response.provider
    };
  }

  // 参数不是合法 JSON、未知工具、缺参数或类型不对：不执行，直接告诉用户缺什么
  const checked = call.argumentsError
    ? { valid: false, errors: [call.argumentsError] }
    : toolService.validateToolParams(call.name, call.arguments);
  if (!checked.valid) {
    logger.warn(`模型给出的工具调用无效: ${String(call.name).slice(0, 40)}: ${checked.errors.join('; ')}`);
    return {
      success: true,
      type: 'text',
      message: `我想调用「${call.name}」，但参数还不完整或不正确：${checked.errors.join('；')}。请补充信息后再试一次。`,
      model: response.model,
      provider: response.provider
    };
  }

  return handleToolCall(userMessage, call.name, call.arguments, context);
};

/**
 * 处理用户消息
 * 默认走原生工具调用；AGENT_NATIVE_TOOLS=false、未配置密钥或提供商不接受 tools 时，用关键词 + 正则的意图识别。
 */
const processMessage = async (userMessage, history = [], context = {}) => {
  try {
    if (llmService.supportsNativeTools()) {
      try {
        return await processWithNativeTools(userMessage, history, context);
      } catch (error) {
        const status = error && error.response && error.response.status;
        if (!TOOL_UNSUPPORTED_STATUSES.has(status)) throw error;
        logger.warn(`提供商拒绝了工具调用请求（HTTP ${status}），退回关键词意图识别`);
      }
    }

    // 意图识别：分析用户是否需要使用工具
    const intentResult = await detectIntent(userMessage, history);

    if (intentResult.shouldUseTool && intentResult.toolName) {
      return await handleToolCall(userMessage, intentResult.toolName, intentResult.toolParams, context);
    }

    // 直接回答
    const response = await llmService.chat(userMessage, history, {
      temperature: 0.7,
      max_tokens: 2048
    });

    return {
      success: true,
      type: 'text',
      message: response.message,
      model: response.model,
      provider: response.provider
    };

  } catch (error) {
    logger.error('Agent处理消息错误:', error.message);
    throw error;
  }
};

/**
 * 意图识别
 */
const detectIntent = async (userMessage, history = []) => {
  // 构建意图识别提示词
  const intentPrompt = `分析用户消息，判断是否需要使用工具。

用户消息：${userMessage}

可用工具：
- xmap: IPv6地址活跃性扫描，用于检测地址是否在线
- zgrab2: IPv6服务探测，用于检测端口和服务
- knowledge: IPv6知识问答
- workflow: 工作流生成

判断标准：
- 消息包含"扫描"、"检测"、"探测"、"检查在线"等词 → 使用xmap
- 消息包含"端口"、"服务"、"HTTP"、"SSH"等词 → 使用zgrab2
- 消息询问IPv6概念、原理、技术等 → 使用knowledge
- 消息要求"设计工作流"、"生成流程"、"怎么做" → 使用workflow
- 其他情况 → 不使用工具，直接回答

请以JSON格式返回：
{
  "shouldUseTool": true/false,
  "toolName": "工具名称或null",
  "toolParams": { "参数对象" },
  "reason": "判断理由"
}`;

  try {
    const response = await llmService.chat(intentPrompt, history, {
      temperature: 0.3,
      max_tokens: 512
    });

    // 解析LLM返回的意图
    let intent;
    try {
      const jsonMatch = response.message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        intent = JSON.parse(jsonMatch[0]);
      } else {
        // 默认不使用工具
        intent = { shouldUseTool: false, toolName: null, toolParams: {}, reason: '无法解析意图' };
      }
    } catch (parseError) {
      intent = { shouldUseTool: false, toolName: null, toolParams: {}, reason: '解析错误' };
    }

    // 进一步处理：从消息中提取参数
    if (intent.shouldUseTool && intent.toolName) {
      intent.toolParams = extractParams(userMessage, intent.toolName, intent.toolParams);
    }

    return intent;

  } catch (error) {
    logger.error('意图识别错误:', error.message);
    // 出错时默认不使用工具
    return {
      shouldUseTool: false,
      toolName: null,
      toolParams: {},
      reason: error.message
    };
  }
};

/**
 * 从用户消息中提取 IPv4/IPv6 地址和网段，按出现顺序返回并去重。
 * 先按"十六进制数字、冒号、点、斜杠"切出候选，再校验形态；
 * 句末的标点（如 "2001:db8::1。"）不会被带入。
 */
const extractTargets = (message) => {
  const candidates = String(message).match(/[0-9A-Fa-f:.]+(?:\/\d{1,3})?/g) || [];
  const result = [];

  for (const raw of candidates) {
    // 去掉句末的点，以及只有单个冒号的结尾（"::" 结尾是合法的压缩写法，保留）
    let item = raw.replace(/\.+$/, '');
    if (item.endsWith(':') && !item.endsWith('::')) {
      item = item.slice(0, -1);
    }
    const [address, prefix] = item.split('/');

    let valid = false;
    if (address.includes(':')) {
      // IPv6：至少两个冒号，每段最多 4 位十六进制，最多一处 ::
      const colonCount = (address.match(/:/g) || []).length;
      const compressed = (address.match(/::/g) || []).length;
      const groups = address.split(':').filter(Boolean);
      valid = colonCount >= 2 && compressed <= 1 && groups.length <= 8
        && groups.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))
        && (compressed === 1 || groups.length === 8)
        && (prefix === undefined || Number(prefix) <= 128);
    } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
      valid = address.split('.').every((part) => Number(part) <= 255)
        && (prefix === undefined || Number(prefix) <= 32);
    }

    if (valid && !result.includes(item)) {
      result.push(item);
    }
  }

  return result;
};

/**
 * 从用户消息中提取工具参数
 */
const extractParams = (userMessage, toolName, suggestedParams = {}) => {
  const params = { ...suggestedParams };

  const targets = extractTargets(userMessage);

  if (toolName === 'xmap') {
    // XMap参数提取
    // 优先网段，其次第一个地址
    const firstTarget = targets.find((item) => item.includes('/')) || targets[0];
    if (firstTarget) {
      params.target = firstTarget;
      if (!firstTarget.includes(':')) {
        params.protocol = 'ipv4';
      }
    }

    // 提取带宽，如 10M
    const bandwidthMatch = userMessage.match(/(\d{1,6})\s*([KkMmGg])(?:bps|b\/s)?/);
    if (bandwidthMatch) {
      params.rate = `${bandwidthMatch[1]}${bandwidthMatch[2].toUpperCase()}`;
    }

    // 判断协议
    if (userMessage.includes('IPv4') || userMessage.includes('ipv4')) {
      params.protocol = 'ipv4';
    } else {
      params.protocol = params.protocol || 'ipv6';
    }

  } else if (toolName === 'zgrab2') {
    // ZGrab2 的目标：消息里的地址/网段列表，或已上传的输入文件名
    delete params.target;
    if (targets.length > 0 && !params.targets && !params.inputFile) {
      params.targets = targets.join(',');
    }
    const fileMatch = userMessage.match(/[\w.\-\u4e00-\u9fa5]+\.(?:txt|csv|list)/i);
    if (fileMatch && !params.inputFile && !params.targets) {
      params.inputFile = fileMatch[0];
    }

    // 提取端口
    const portMatch = userMessage.match(/端口[：:]?\s*(\d+)|port[：:]?\s*(\d+)/i);
    if (portMatch) {
      params.port = parseInt(portMatch[1] || portMatch[2]);
    }

    // 提取模块
    const modules = ['http', 'https', 'ssh', 'ftp', 'smtp', 'dns', 'telnet', 'mysql', 'postgres', 'mongodb'];
    for (const mod of modules) {
      if (userMessage.toLowerCase().includes(mod)) {
        params.module = mod;
        break;
      }
    }

    // 默认模块
    if (!params.module) {
      params.module = 'http';
    }

  } else if (toolName === 'knowledge') {
    // Knowledge参数提取
    const questionMatch = userMessage.match(/^(?:什么是|如何|怎么|怎样|为什么|请问)(.+)/);
    if (questionMatch) {
      params.question = questionMatch[1];
    } else {
      params.question = userMessage;
    }

    // 提取主题
    const topics = ['地址', '协议', 'ICMPv6', 'NDP', '路由', '安全', '过渡', '隧道', '双栈', 'NAT64', 'SLAAC', 'DHCPv6'];
    for (const topic of topics) {
      if (userMessage.includes(topic)) {
        params.topic = topic;
        break;
      }
    }

  } else if (toolName === 'workflow') {
    // Workflow参数提取
    params.goal = userMessage.replace(/生成|设计|创建/gi, '').trim();

    // 提取约束
    const constraintMatch = userMessage.match(/(?:限制|约束|条件|时间)[:：]?\s*(.+?)(?:\.|$)/i);
    if (constraintMatch) {
      params.constraints = constraintMatch[1];
    }
  }

  return params;
};

/**
 * 生成后续建议
 */
const generateSuggestions = (toolName, toolResult) => {
  const suggestions = [];

  if (toolName === 'xmap') {
    suggestions.push('查看扫描任务详情');
    suggestions.push('导出扫描结果');
    suggestions.push('进行更深入的ZGrab2服务探测');
  } else if (toolName === 'zgrab2') {
    suggestions.push('分析探测结果');
    suggestions.push('查看服务详细信息');
    suggestions.push('设计后续工作流');
  } else if (toolName === 'query_database') {
    suggestions.push('换个条件继续筛选');
    suggestions.push('对这些地址做 ZGrab2 服务探测');
  } else if (toolName === 'apd_detect') {
    suggestions.push('查询这个任务的状态');
    suggestions.push('检测完成后过滤别名前缀下的地址');
  } else if (toolName === 'generate_targets') {
    suggestions.push('查询这个任务的状态');
    suggestions.push('用生成的目标做 XMap 扫描');
  } else if (toolName === 'enrich') {
    suggestions.push('查询这个任务的状态');
  } else if (toolName === 'task_status') {
    suggestions.push('查看任务的详细结果');
  } else if (toolName === 'knowledge') {
    suggestions.push('继续提问相关问题');
    suggestions.push('了解相关技术细节');
  } else if (toolName === 'workflow') {
    suggestions.push('执行生成的工作流');
    suggestions.push('调整工作流参数');
    suggestions.push('保存为模板');
  }

  return suggestions;
};

/**
 * 生成工作流
 */
const generateWorkflow = async (goal, constraints, context = {}) => {
  const llmService = require('./llmService');

  const workflowPrompt = `请为以下探测目标设计一个完整的工作流：

目标：${goal}
约束：${constraints || '无'}

工作流应该包括：
1. 探测步骤（XMap活跃性扫描 → ZGrab2服务探测）
2. 每一步的具体参数
3. 预期的探测结果

请用JSON格式返回工作流配置：
{
  "name": "工作流名称",
  "description": "工作流描述",
  "steps": [
    {
      "order": 1,
      "name": "步骤名称",
      "tool": "xmap或zgrab2",
      "params": { "参数对象" },
      "description": "步骤说明"
    }
  ]
}`;

  try {
    const response = await llmService.chat(workflowPrompt, [], {
      temperature: 0.5,
      max_tokens: 2048
    });

    // 尝试解析JSON
    let workflow;
    try {
      const jsonMatch = response.message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        workflow = JSON.parse(jsonMatch[0]);
      } else {
        workflow = { raw: response.message };
      }
    } catch (parseError) {
      workflow = { raw: response.message };
    }

    return {
      success: true,
      workflow: workflow,
      message: response.message
    };

  } catch (error) {
    logger.error('工作流生成错误:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取欢迎消息
 */
const getWelcomeMessage = () => {
  return {
    success: true,
    message: WELCOME_MESSAGE,
    type: 'welcome'
  };
};

module.exports = {
  extractTargets,
  processMessage,
  detectIntent,
  generateWorkflow,
  getWelcomeMessage,
  extractParams,
  WELCOME_MESSAGE
};
