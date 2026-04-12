/**
 * Agent核心服务
 * 意图识别、工具调用编排
 */

const llmService = require('./llmService');
const toolService = require('./toolService');

// Agent欢迎消息
const WELCOME_MESSAGE = `您好！我是ObserV6 Agent，您的IPv6网络探测智能助手。

我可以帮您：

🔍 **地址扫描** - 使用XMap检测IPv6地址活跃性
🌐 **服务探测** - 使用ZGrab2探测IPv6服务端口
📚 **知识问答** - 解答IPv6相关技术问题
⚙️ **工作流设计** - 根据需求生成探测工作流

请告诉我您需要什么帮助？`;

/**
 * 处理用户消息
 */
const processMessage = async (userMessage, history = [], context = {}) => {
  try {
    // 意图识别：分析用户是否需要使用工具
    const intentResult = await detectIntent(userMessage, history);

    // 如果识别到需要使用工具
    if (intentResult.shouldUseTool && intentResult.toolName) {
      const toolResult = await toolService.executeTool(
        intentResult.toolName,
        intentResult.toolParams,
        context
      );

      // 生成工具执行结果的解释
      const explanationPrompt = `用户请求：${userMessage}
工具名称：${intentResult.toolName}
工具参数：${JSON.stringify(intentResult.toolParams)}
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
          tool: intentResult.toolName,
          params: intentResult.toolParams,
          result: toolResult
        },
        suggestions: generateSuggestions(intentResult.toolName, toolResult)
      };
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
    console.error('Agent处理消息错误:', error.message);
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
    console.error('意图识别错误:', error.message);
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
 * 从用户消息中提取工具参数
 */
const extractParams = (userMessage, toolName, suggestedParams = {}) => {
  const params = { ...suggestedParams };

  // 提取IPv6地址/网段
  const ipv6Pattern = /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])/g;
  const ipv6Matches = userMessage.match(ipv6Pattern);

  // 提取IPv4地址
  const ipv4Pattern = /(\d{1,3}\.){3}\d{1,3}/g;
  const ipv4Matches = userMessage.match(ipv4Pattern);

  // 提取网段（如 2001:db8::/32）
  const cidrPattern = /([0-9a-fA-F:]+)\/(\d+)/g;
  const cidrMatches = userMessage.match(cidrPattern);

  if (toolName === 'xmap') {
    // XMap参数提取
    if (cidrMatches && cidrMatches.length > 0) {
      params.target = cidrMatches[0];
    } else if (ipv6Matches && ipv6Matches.length > 0) {
      params.target = ipv6Matches[0];
    } else if (ipv4Matches && ipv4Matches.length > 0) {
      params.target = ipv4Matches[0];
      params.protocol = 'ipv4';
    }

    // 提取速率
    const rateMatch = userMessage.match(/(\d+)\s*(个|包|数据包)\/?秒/);
    if (rateMatch) {
      params.rate = parseInt(rateMatch[1]);
    }

    // 判断协议
    if (userMessage.includes('IPv4') || userMessage.includes('ipv4')) {
      params.protocol = 'ipv4';
    } else {
      params.protocol = params.protocol || 'ipv6';
    }

  } else if (toolName === 'zgrab2') {
    // ZGrab2参数提取
    if (ipv6Matches && ipv6Matches.length > 0) {
      params.target = ipv6Matches[0];
    } else if (ipv4Matches && ipv4Matches.length > 0) {
      params.target = ipv4Matches[0];
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
    console.error('工作流生成错误:', error.message);
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
  processMessage,
  detectIntent,
  generateWorkflow,
  getWelcomeMessage,
  extractParams,
  WELCOME_MESSAGE
};
