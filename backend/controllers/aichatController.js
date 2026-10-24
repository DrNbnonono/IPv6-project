/**
 * AI Chat Controller
 * Detection页面 - IPv6数据分析专家问答
 * 模型调用统一走 llmService（提供商、密钥、模型、日志与 Agent 共用一套配置，P4-7）
 */

const llmService = require('../services/llmService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('aichat');

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

// 单条问题与单条历史消息的长度上限：该接口对未登录访客开放，避免用超长输入消耗模型额度
const MAX_MESSAGE_CHARS = parseInt(process.env.AI_MESSAGE_MAX_CHARS, 10) || 2000;
const MAX_HISTORY_ITEM_CHARS = 4000;

/**
 * Detection页面AI问答 - IPv6专家
 * POST /api/ai/detection/chat
 */
exports.detectionChat = async (req, res) => {
  const { message, context, history } = req.body;

  logger.debug('收到Detection AI请求:', { 
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

  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({
      success: false,
      message: `问题过长，请控制在 ${MAX_MESSAGE_CHARS} 字以内`
    });
  }

  try {
    // 调用模型：只带用户的问题和（清理过的）历史，不带工具
    const result = await llmService.chat(message.trim(), history, {
      systemPrompt: IPV6_EXPERT_SYSTEM_PROMPT,
      maxHistoryItemChars: MAX_HISTORY_ITEM_CHARS,
      temperature: 0.7,
      max_tokens: 2048
    });

    const assistantMessage = result.message;
    if (!assistantMessage) {
      throw new Error('AI返回内容为空');
    }

    logger.debug('AI响应成功:', {
      preview: assistantMessage.slice(0, 120),
      responseLength: assistantMessage.length,
      usage: result.usage
    });

    // 返回响应
    res.json({
      success: true,
      message: assistantMessage,
      data: {
        type: 'text',
        model: result.model,
        usage: result.usage
      }
    });

  } catch (error) {
    logger.error('Detection AI错误:', error.message);

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
  const config = llmService.getProviderConfig();

  res.json({
    success: true,
    data: {
      detection: {
        enabled: true,
        provider: config.name,
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
