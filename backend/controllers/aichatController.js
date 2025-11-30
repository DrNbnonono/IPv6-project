/**
 * AI Chat Controller
 * Detection页面 - IPv6数据分析专家问答
 * 支持OpenAI、DeepSeek、硅基流动等兼容API
 */

const axios = require('axios');

// IPv6专家系统提示词
const IPV6_EXPERT_SYSTEM_PROMPT = `你是一位资深的IPv6网络专家和数据分析师，名为"ObserV6 AI助手"。你的专业领域包括：

1. **IPv6协议与技术**：
   - IPv6地址结构、分配机制和地址规划
   - IPv6过渡技术（双栈、隧道、NAT64等）
   - IPv6路由协议（OSPFv3、BGP4+等）
   - IPv6安全机制（IPSec、SEND等）

2. **IPv6网络测量与探测**：
   - 主动探测技术（ICMPv6、TCP/UDP扫描）
   - 被动测量方法（流量分析、BGP数据）
   - 地址活跃性检测
   - 网络拓扑发现

3. **IPv6数据分析**：
   - 全球IPv6部署统计
   - 国家/地区IPv6渗透率分析
   - ASN（自治系统）IPv6覆盖分析
   - IPv6前缀分配与使用情况

4. **IPv6安全与隐私**：
   - IPv6地址隐私扩展
   - IPv6网络安全威胁
   - IPv6防火墙配置

回答要求：
- 使用专业但易懂的语言
- 提供准确的技术信息
- 适当使用Markdown格式（标题、列表、代码块等）
- 如涉及数据，说明数据来源或估算依据
- 对于不确定的信息，明确说明`;

// API配置映射
const API_CONFIGS = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat'
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-3.5-turbo'
  },
  siliconflow: {
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V2.5'
  },
  custom: {
    baseURL: process.env.AI_API_BASE_URL || 'https://api.deepseek.com/v1',
    defaultModel: process.env.AI_MODEL || 'deepseek-chat'
  }
};

/**
 * 获取AI API配置
 */
const getAPIConfig = () => {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
  const config = API_CONFIGS[provider] || API_CONFIGS.custom;
  
  return {
    baseURL: process.env.AI_API_BASE_URL || config.baseURL,
    model: process.env.AI_MODEL || config.defaultModel,
    apiKey: process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || ''
  };
};

/**
 * 构建消息历史
 * 只保留 role 为 user/assistant 且 content 为非空字符串的记录，
 * 避免向 DeepSeek/OpenAI 发送无效的 assistant 消息（否则会触发
 * “Invalid assistant message: content or tool calls must be set” 错误）。
 */
const buildMessages = (userMessage, history = []) => {
  const messages = [
    { role: 'system', content: IPV6_EXPERT_SYSTEM_PROMPT }
  ];

  // 添加历史消息（最多保留最近10轮对话）
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-20); // 最近20条消息（10轮对话）

    recentHistory.forEach((msg) => {
      if (!msg) return;

      const role = msg.role === 'assistant' ? 'assistant' : (msg.role === 'user' ? 'user' : null);
      const content = typeof msg.content === 'string' ? msg.content.trim() : '';

      // 只保留 user / assistant 且 content 为非空字符串的消息
      if (!role || !content) return;

      messages.push({ role, content });
    });
  }

  // 添加当前用户消息（确保为非空字符串）
  if (typeof userMessage === 'string' && userMessage.trim()) {
    messages.push({ role: 'user', content: userMessage.trim() });
  }

  return messages;
};

/**
 * 调用AI API
 */
const callAIAPI = async (messages, config) => {
  const { baseURL, model, apiKey } = config;

  if (!apiKey) {
    throw new Error('AI API密钥未配置，请在.env文件中设置AI_API_KEY或DEEPSEEK_API_KEY');
  }

  try {
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60000 // 60秒超时
      }
    );

    return response.data;
  } catch (error) {
    console.error('AI API调用失败:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Detection页面AI问答 - IPv6专家
 * POST /api/ai/detection/chat
 */
exports.detectionChat = async (req, res) => {
  const { message, context, history } = req.body;

  console.log('收到Detection AI请求:', { 
    message: message?.substring(0, 50) + '...', 
    historyLength: history?.length || 0 
  });

  // 参数验证
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      success: false,
      message: '请提供有效的问题内容'
    });
  }

  try {
    // 获取API配置
    const config = getAPIConfig();
    console.log('使用AI配置:', { 
      baseURL: config.baseURL, 
      model: config.model,
      hasKey: !!config.apiKey 
    });

    // 构建消息
    const messages = buildMessages(message.trim(), history);

    // 调用AI API
    const aiResponse = await callAIAPI(messages, config);

    // 提取回复内容
    const assistantMessage = aiResponse.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error('AI返回内容为空');
    }

    console.log('AI响应成功:', { 
      preview: assistantMessage.slice(0, 120),
      responseLength: assistantMessage.length,
      usage: aiResponse.usage 
    });

    // 返回响应
    res.json({
      success: true,
      message: assistantMessage,
      data: {
        type: 'text',
        model: config.model,
        usage: aiResponse.usage
      }
    });

  } catch (error) {
    console.error('Detection AI错误:', error.message);

    // 错误处理
    let errorMessage = '抱歉，AI服务暂时不可用，请稍后再试。';
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
    } else if (error.message.includes('API密钥未配置')) {
      errorMessage = error.message;
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Tools页面AI问答 - 探测助手（预留接口）
 * POST /api/ai/tools/chat
 * 注意：此接口暂未实现，后续将集成LangChain和MCP
 */
exports.toolsChat = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Tools AI功能正在开发中，敬请期待。',
    data: {
      status: 'not_implemented',
      planned_features: [
        'LangChain集成',
        'MCP (Model Context Protocol)支持',
        '探测工具命令生成',
        '工作流辅助创建'
      ]
    }
  });
};

/**
 * 获取AI服务状态
 * GET /api/ai/status
 */
exports.getStatus = async (req, res) => {
  const config = getAPIConfig();
  
  res.json({
    success: true,
    data: {
      detection: {
        enabled: true,
        provider: process.env.AI_PROVIDER || 'deepseek',
        model: config.model,
        configured: !!config.apiKey
      },
      tools: {
        enabled: false,
        status: 'not_implemented'
      }
    }
  });
};
