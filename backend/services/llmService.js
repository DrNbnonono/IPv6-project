/**
 * LLM服务抽象层
 * 支持多厂商：MiniMax（Anthropic格式）、DeepSeek、OpenAI（OpenAI格式）
 */

const axios = require('axios');

// MiniMax/Anthropic格式配置
const ANTHROPIC_LIKE_PROVIDERS = {
  minimax: {
    name: 'MiniMax',
    baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic',
    model: process.env.MINIMAX_MODEL || 'MiniMax-Text-01',
    apiKey: process.env.MINIMAX_API_KEY,
    endpoint: '/messages',
    headers: { 'anthropic-version': '2023-06-01' }
  }
};

// OpenAI格式配置（DeepSeek、OpenAI、硅基流动）
const OPENAI_LIKE_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY,
    endpoint: '/chat/completions'
  },
  openai: {
    name: 'OpenAI',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
    endpoint: '/chat/completions'
  },
  siliconflow: {
    name: 'SiliconFlow',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    apiKey: process.env.SILICONFLOW_API_KEY || process.env.AI_API_KEY,
    endpoint: '/chat/completions'
  },
  custom: {
    name: 'Custom',
    baseURL: process.env.AI_API_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.AI_MODEL || 'deepseek-chat',
    apiKey: process.env.AI_API_KEY,
    endpoint: '/chat/completions'
  }
};

// Agent系统提示词
const AGENT_SYSTEM_PROMPT = `你是一位智能Agent助手，名为"ObserV6 Agent"。你的功能是帮助用户完成IPv6网络探测任务。

你的核心能力：
1. **工具调用**：你可以通过调用各种工具来完成任务
2. **意图识别**：分析用户需求，判断是否需要使用工具
3. **工作流生成**：帮助用户设计探测工作流
4. **知识问答**：解答IPv6相关技术问题

工具调用规则：
- 当用户请求扫描、探测、检测地址活跃性时，使用xmap工具
- 当用户请求探测服务、端口、协议时，使用zgrab2工具
- 当用户询问IPv6技术知识时，使用knowledge工具
- 当用户需要设计工作流时，使用workflow工具

回答格式：
- 直接回答时，提供清晰、专业的回复
- 需要执行工具时，说明原因并返回工具调用请求
- 结果分析时，使用Markdown格式化输出

重要：
- 保持对话上下文连贯
- 对于不确定的信息，明确说明
- 建议的操作要具体可执行`;

/**
 * 获取当前配置的LLM提供商
 */
const getProviderConfig = () => {
  const provider = (process.env.AI_PROVIDER || 'minimax').toLowerCase();

  // 先检查是否是Anthropic-like提供商
  if (ANTHROPIC_LIKE_PROVIDERS[provider]) {
    const config = ANTHROPIC_LIKE_PROVIDERS[provider];
    return {
      type: 'anthropic',
      name: config.name,
      baseURL: config.baseURL,
      model: config.model,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      headers: config.headers
    };
  }

  // 检查OpenAI-like提供商
  const openaiConfig = OPENAI_LIKE_PROVIDERS[provider];
  if (openaiConfig) {
    return {
      type: 'openai',
      name: openaiConfig.name,
      baseURL: openaiConfig.baseURL,
      model: openaiConfig.model,
      apiKey: openaiConfig.apiKey,
      endpoint: openaiConfig.endpoint
    };
  }

  // 默认使用MiniMax
  const defaultConfig = ANTHROPIC_LIKE_PROVIDERS.minimax;
  return {
    type: 'anthropic',
    name: defaultConfig.name,
    baseURL: defaultConfig.baseURL,
    model: defaultConfig.model,
    apiKey: defaultConfig.apiKey,
    endpoint: defaultConfig.endpoint,
    headers: defaultConfig.headers
  };
};

/**
 * 构建消息历史
 */
const buildMessages = (userMessage, history = [], systemPrompt = AGENT_SYSTEM_PROMPT) => {
  const messages = [];

  // 添加系统提示词
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 添加历史消息
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-20);

    recentHistory.forEach((msg) => {
      if (!msg) return;

      const role = msg.role === 'assistant' ? 'assistant' : (msg.role === 'user' ? 'user' : null);
      const content = typeof msg.content === 'string' ? msg.content.trim() : '';

      if (!role || !content) return;

      messages.push({ role, content });
    });
  }

  // 添加当前用户消息
  if (typeof userMessage === 'string' && userMessage.trim()) {
    messages.push({ role: 'user', content: userMessage.trim() });
  }

  return messages;
};

/**
 * 调用Anthropic格式API（MiniMax）
 */
const callAnthropicAPI = async (messages, config, options = {}) => {
  const { baseURL, model, apiKey, endpoint, headers } = config;

  if (!apiKey) {
    throw new Error('API密钥未配置，请检查环境变量');
  }

  try {
    // 提取最后一条用户消息作为prompt
    const userMessage = messages[messages.length - 1]?.content || '';
    const systemMessage = messages.find(m => m.role === 'system')?.content;

    const requestData = {
      model: model,
      messages: messages.filter(m => m.role !== 'system'),
      max_tokens: options.max_tokens || 2048,
      temperature: options.temperature || 0.7,
      stream: false
    };

    // 添加system消息（如果存在）
    if (systemMessage) {
      requestData.system = systemMessage;
    }

    const response = await axios.post(
      `${baseURL}${endpoint}`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...headers
        },
        timeout: 60000
      }
    );

    return response.data;
  } catch (error) {
    console.error('Anthropic API调用失败:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * 调用OpenAI格式API（DeepSeek、OpenAI等）
 */
const callOpenAIAPI = async (messages, config, options = {}) => {
  const { baseURL, model, apiKey, endpoint } = config;

  if (!apiKey) {
    throw new Error('API密钥未配置，请检查环境变量');
  }

  try {
    const response = await axios.post(
      `${baseURL}${endpoint}`,
      {
        model: model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2048,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60000
      }
    );

    return response.data;
  } catch (error) {
    console.error('OpenAI API调用失败:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * 通用聊天接口
 */
const chat = async (userMessage, history = [], options = {}) => {
  const config = getProviderConfig();
  const messages = buildMessages(userMessage, history);

  let response;

  if (config.type === 'anthropic') {
    response = await callAnthropicAPI(messages, config, options);
    // 解析Anthropic格式响应
    return {
      success: true,
      message: response.content?.[0]?.text || '',
      model: config.model,
      provider: config.name,
      usage: response.usage ? {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      } : null,
      raw: response
    };
  } else {
    response = await callOpenAIAPI(messages, config, options);
    // 解析OpenAI格式响应
    return {
      success: true,
      message: response.choices?.[0]?.message?.content || '',
      model: config.model,
      provider: config.name,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : null,
      raw: response
    };
  }
};

/**
 * 获取LLM服务状态
 */
const getStatus = () => {
  const config = getProviderConfig();

  return {
    success: true,
    data: {
      provider: config.name,
      model: config.model,
      type: config.type,
      configured: !!config.apiKey,
      baseURL: config.baseURL
    }
  };
};

/**
 * 获取支持的工具列表（用于Function Calling格式）
 */
const getToolDefinitions = () => {
  // 这是OpenAI格式的工具定义
  return [
    {
      type: 'function',
      function: {
        name: 'xmap_scan',
        description: 'IPv6地址活跃性扫描工具，用于检测目标地址或网段是否在线',
        parameters: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: '目标地址或网段，如 2001:db8::/32 或 2001:db8::1'
            },
            protocol: {
              type: 'string',
              enum: ['ipv6', 'ipv4'],
              description: '协议类型，默认为ipv6',
              default: 'ipv6'
            },
            rate: {
              type: 'number',
              description: '发送速率（包/秒）',
              default: 1000
            }
          },
          required: ['target']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'zgrab2_scan',
        description: 'IPv6服务探测工具，用于探测目标地址的端口和服务信息',
        parameters: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: '目标地址，如 2001:db8::1'
            },
            module: {
              type: 'string',
              description: '探测模块，如 http, https, ssh, ftp, smtp 等'
            },
            port: {
              type: 'number',
              description: '指定端口号'
            }
          },
          required: ['target', 'module']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ipv6_knowledge',
        description: 'IPv6知识问答工具，用于查询IPv6相关的技术知识',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: '查询主题，如 IPv6地址结构、ICMPv6、NDP协议等'
            },
            question: {
              type: 'string',
              description: '具体问题'
            }
          },
          required: ['question']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'workflow_generate',
        description: '工作流生成工具，用于根据需求生成探测工作流',
        parameters: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              description: '探测目标，如 "扫描某大学IPv6地址分布"'
            },
            constraints: {
              type: 'string',
              description: '约束条件，如时间限制、范围限制等'
            }
          },
          required: ['goal']
        }
      }
    }
  ];
};

module.exports = {
  chat,
  getStatus,
  getProviderConfig,
  getToolDefinitions,
  buildMessages,
  AGENT_SYSTEM_PROMPT
};
