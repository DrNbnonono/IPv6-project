/**
 * 工具服务
 * 工具注册表和执行器
 */

const db = require('../database/db');
const storageService = require('./storageService');

/**
 * 工具参数校验辅助
 * 校验失败抛出 ToolValidationError，由 executeTool 转成 { success: false, error }
 */
class ToolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

// IPv4/IPv6 地址或网段（仅字符与长度校验，不做可达性判断）
const ADDRESS_PATTERN = /^[0-9A-Fa-f:.]{2,45}(\/\d{1,3})?$/;
const RATE_PATTERN = /^\d{1,6}[KkMmGg]?$/;
// Agent 一次最多处理的目标数（需要更多请上传输入文件）
const AGENT_MAX_TARGETS = 1000;
const INPUT_FILE_PATTERN = /^[\w.\-\u4e00-\u9fa5]{1,128}$/;

const toBoundedInt = (value, label, min, max) => {
  const text = String(value).trim();
  if (!/^\d{1,9}$/.test(text)) {
    throw new ToolValidationError(`${label} 必须是整数`);
  }
  const number = Number(text);
  if (number < min || number > max) {
    throw new ToolValidationError(`${label} 必须在 ${min} 到 ${max} 之间`);
  }
  return number;
};

/**
 * 调用 api/internal.js 的方法，并把失败响应转成异常
 * internal 方法签名为 (params, userId)，返回带 statusCode 的响应对象
 */
const callInternal = async (fn, params, user) => {
  const response = await fn(params, user?.id);
  if (!response || response.success === false || response.statusCode >= 400) {
    throw new Error(response?.message || '内部接口调用失败');
  }
  return response;
};

// 工具注册表
//  requiresConfirmation: 会产生副作用（发起扫描/执行命令）的工具，必须由用户确认后才执行
//  validate:  参数校验与规范化，返回最终参数
//  authorize: 调用者权限检查
const TOOL_REGISTRY = {
  xmap: {
    name: 'XMap扫描',
    description: 'IPv6地址活跃性扫描工具，用于检测目标地址或网段是否在线',
    category: 'scanner',
    requiresConfirmation: true,
    parameters: {
      target: { type: 'string', required: true, description: '目标地址或网段，如 2001:db8::/32' },
      protocol: { type: 'string', default: 'ipv6', description: '协议类型：ipv6 或 ipv4' },
      rate: { type: 'string', default: '1M', description: '带宽，如 1M、10M' },
      port: { type: 'number', description: '目标端口（可选）' },
      maxResults: { type: 'number', default: 1000, description: '最多返回结果数' }
    },
    validate: (params) => {
      const target = String(params.target || '').trim();
      if (!ADDRESS_PATTERN.test(target)) {
        throw new ToolValidationError('目标地址或网段格式无效');
      }
      const protocol = String(params.protocol || 'ipv6').toLowerCase();
      if (protocol !== 'ipv6' && protocol !== 'ipv4') {
        throw new ToolValidationError('protocol 只能是 ipv6 或 ipv4');
      }
      const rate = String(params.rate || '1M').trim();
      if (!RATE_PATTERN.test(rate)) {
        throw new ToolValidationError('rate 格式无效，应类似 1M、10M');
      }
      const normalized = {
        target,
        protocol,
        rate,
        maxResults: toBoundedInt(params.maxResults ?? 1000, 'maxResults', 1, 100000)
      };
      if (params.port !== undefined && params.port !== null && params.port !== '') {
        normalized.port = toBoundedInt(params.port, 'port', 1, 65535);
      }
      return normalized;
    },
    execute: async (params, context) => {
      try {
        const { target, protocol, rate, port, maxResults } = params;

        // 参数名映射到 xmapController.scan 接受的字段
        const scanParams = {
          [protocol === 'ipv4' ? 'ipv4' : 'ipv6']: true,
          targetaddress: target,
          rate,
          max_results: String(maxResults),
          description: `Agent 发起的扫描：${target}`
        };
        if (port !== undefined) {
          scanParams.targetPort = String(port);
        }

        const xmap = require('../api/internal').xmap;
        const response = await callInternal(xmap.startScan, scanParams, context.user);

        return {
          success: true,
          tool: 'xmap',
          result: { taskId: response.taskId, target, protocol },
          message: `XMap扫描任务已创建：${target}`
        };
      } catch (error) {
        console.error('XMap工具执行错误:', error.message);
        return {
          success: false,
          tool: 'xmap',
          error: error.message
        };
      }
    }
  },

  zgrab2: {
    name: 'ZGrab2扫描',
    description: 'IPv6服务探测工具，对地址列表或已上传的输入文件中的地址进行端口和服务探测',
    category: 'scanner',
    requiresConfirmation: true,
    parameters: {
      targets: { type: 'string', description: `目标地址列表（逗号或换行分隔，最多 ${AGENT_MAX_TARGETS} 个），与 inputFile 二选一` },
      inputFile: { type: 'string', description: '已上传的输入文件名（每行一个地址），与 targets 二选一' },
      module: { type: 'string', required: true, description: '探测模块，如 http、ssh' },
      port: { type: 'number', description: '指定端口（可选）' }
    },
    validate: (params) => {
      const hasTargets = params.targets !== undefined && params.targets !== null && params.targets !== '';
      const hasInputFile = params.inputFile !== undefined && params.inputFile !== null && params.inputFile !== '';

      if (hasTargets === hasInputFile) {
        throw new ToolValidationError('请提供 targets（地址列表）或 inputFile（已上传文件名），二者选其一');
      }

      const module = String(params.module || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{1,32}$/.test(module)) {
        throw new ToolValidationError('探测模块名无效');
      }

      const normalized = { module };

      if (hasTargets) {
        try {
          normalized.targets = storageService.normalizeTargets(params.targets);
        } catch (error) {
          throw new ToolValidationError(error.message);
        }
        if (normalized.targets.length > AGENT_MAX_TARGETS) {
          throw new ToolValidationError(`目标数量超过 ${AGENT_MAX_TARGETS}，请上传输入文件后使用 inputFile`);
        }
      } else {
        const inputFile = String(params.inputFile).trim();
        if (!INPUT_FILE_PATTERN.test(inputFile)) {
          throw new ToolValidationError('输入文件名无效');
        }
        normalized.inputFile = inputFile;
      }

      if (params.port !== undefined && params.port !== null && params.port !== '') {
        normalized.port = toBoundedInt(params.port, 'port', 1, 65535);
      }
      return normalized;
    },
    execute: async (params, context) => {
      try {
        const { targets, module, port } = params;
        let inputFile = params.inputFile;

        // 地址列表先落成当前用户名下的输入文件（与手动上传的文件一样登记到 whitelists 表）
        if (targets) {
          const saved = await storageService.saveTargetsFile(context.user?.id, targets, 'zgrab2');
          inputFile = saved.fileName;
        }

        // 只传文件名，由 zgrab2Controller 按当前用户查找文件；不接受 inputFilePath 等任意路径
        const taskParams = {
          module,
          inputFile,
          description: targets
            ? `Agent 发起的探测：${targets.length} 个目标 (${module})`
            : `Agent 发起的探测：${inputFile} (${module})`
        };
        if (port !== undefined) {
          taskParams.port = String(port);
        }

        const zgrab2 = require('../api/internal').zgrab2;
        const response = await callInternal(zgrab2.createTask, taskParams, context.user);

        return {
          success: true,
          tool: 'zgrab2',
          result: {
            taskId: response.taskId,
            inputFile,
            module,
            targetCount: targets ? targets.length : undefined
          },
          message: targets
            ? `ZGrab2扫描任务已创建：${targets.length} 个目标 (${module})`
            : `ZGrab2扫描任务已创建：${inputFile} (${module})`
        };
      } catch (error) {
        console.error('ZGrab2工具执行错误:', error.message);
        return {
          success: false,
          tool: 'zgrab2',
          error: error.message
        };
      }
    }
  },

  knowledge: {
    name: '知识问答',
    description: 'IPv6知识问答助手，解答IPv6相关技术问题',
    category: 'assistant',
    parameters: {
      topic: { type: 'string', description: '查询主题' },
      question: { type: 'string', required: true, description: '问题内容' }
    },
    execute: async (params, context) => {
      try {
        const { topic, question } = params;

        // 使用LLM服务回答知识问题
        const llmService = require('./llmService');

        const knowledgePrompt = `你是一位资深的IPv6网络专家。请回答以下问题：

主题：${topic || 'IPv6'}
问题：${question}

要求：
1. 回答准确、专业
2. 如有必要，使用Markdown格式化
3. 如涉及数据，说明来源
4. 如不确定，明确说明`;

        const response = await llmService.chat(knowledgePrompt, [], { temperature: 0.7 });

        return {
          success: true,
          tool: 'knowledge',
          result: {
            topic,
            question,
            answer: response.message
          },
          message: '知识查询完成'
        };
      } catch (error) {
        console.error('Knowledge工具执行错误:', error.message);
        return {
          success: false,
          tool: 'knowledge',
          error: error.message
        };
      }
    }
  },

  workflow: {
    name: '工作流生成',
    description: '根据需求生成探测工作流配置',
    category: 'assistant',
    parameters: {
      goal: { type: 'string', required: true, description: '探测目标' },
      constraints: { type: 'string', description: '约束条件' }
    },
    execute: async (params, context) => {
      try {
        const { goal, constraints } = params;

        const llmService = require('./llmService');

        const workflowPrompt = `你是一位IPv6网络探测工作流设计专家。请根据以下需求生成工作流配置：

探测目标：${goal}
约束条件：${constraints || '无'}

请生成一个JSON格式的工作流配置，包含：
1. workflowName: 工作流名称
2. description: 工作流描述
3. steps: 操作步骤数组，每个步骤包含：
   - stepName: 步骤名称
   - tool: 使用的工具（xmap或zgrab2）
   - params: 工具参数
   - order: 执行顺序

请确保工作流设计合理、可执行。用JSON格式输出工作流配置。`;

        const response = await llmService.chat(workflowPrompt, [], { temperature: 0.5 });

        let workflowConfig;
        try {
          // 尝试从回复中提取JSON
          const jsonMatch = response.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            workflowConfig = JSON.parse(jsonMatch[0]);
          } else {
            workflowConfig = { raw: response.message };
          }
        } catch (parseError) {
          workflowConfig = { raw: response.message };
        }

        return {
          success: true,
          tool: 'workflow',
          result: workflowConfig,
          message: '工作流生成完成'
        };
      } catch (error) {
        console.error('Workflow工具执行错误:', error.message);
        return {
          success: false,
          tool: 'workflow',
          error: error.message
        };
      }
    }
  },

  terminal: {
    name: '终端命令',
    description: '在服务器上执行Linux终端命令，用于网络探测、系统信息查询等',
    category: 'system',
    requiresConfirmation: true,
    authorize: (context) => context.user?.role === 'admin',
    validate: (params) => {
      const command = String(params.command || '').trim();
      if (!command || command.length > 500) {
        throw new ToolValidationError('命令不能为空且不超过 500 字符');
      }
      return { ...params, command };
    },
    parameters: {
      command: { type: 'string', required: true, description: '要执行的命令' },
      terminalId: { type: 'string', description: '终端会话ID（可选，不提供则创建新终端）' },
      timeout: { type: 'number', description: '命令超时时间（毫秒）', default: 60000 }
    },
    execute: async (params, context) => {
      try {
        const { command, terminalId, timeout = 60000 } = params;

        if (context.user?.role !== 'admin') {
          throw new Error('仅管理员可使用终端工具');
        }

        const terminalService = require('./terminalService');

        // 获取或创建终端
        let termId = terminalId;
        if (!termId) {
          const createResult = terminalService.createTerminal(null, { userId: context.user?.id });
          if (!createResult.success) {
            throw new Error(createResult.error);
          }
          termId = createResult.terminal.id;
        }

        // 执行命令
        const result = await terminalService.executeCommand(termId, command, { timeout });

        // 格式化输出
        let output = '';
        if (result.stdout) {
          output += `【标准输出】\n${result.stdout}\n`;
        }
        if (result.stderr) {
          output += `【错误输出】\n${result.stderr}\n`;
        }
        if (!output) {
          output = '(无输出)';
        }

        return {
          success: result.success,
          tool: 'terminal',
          terminalId: termId,
          result: {
            command: result.command.command,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            duration: result.duration,
            timedOut: result.timedOut
          },
          message: `命令执行${result.success ? '成功' : '失败'}（退出码: ${result.exitCode}，耗时: ${result.duration}ms）\n${output}`
        };
      } catch (error) {
        console.error('Terminal工具执行错误:', error.message);
        return {
          success: false,
          tool: 'terminal',
          error: error.message
        };
      }
    }
  }
};

/**
 * 获取所有可用工具
 */
const getTools = () => {
  const tools = [];

  for (const [key, tool] of Object.entries(TOOL_REGISTRY)) {
    tools.push({
      id: key,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      requiresConfirmation: Boolean(tool.requiresConfirmation),
      parameters: tool.parameters
    });
  }

  return tools;
};

/**
 * 获取工具定义（用于LLM Function Calling）
 */
const getToolDefinitions = () => {
  const definitions = [];

  for (const [key, tool] of Object.entries(TOOL_REGISTRY)) {
    const params = {};
    const required = [];

    for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
      params[paramName] = {
        type: paramConfig.type,
        description: paramConfig.description
      };
      if (paramConfig.required) {
        required.push(paramName);
      }
    }

    definitions.push({
      type: 'function',
      function: {
        name: key,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: params,
          required: required
        }
      }
    });
  }

  return definitions;
};

/**
 * 执行工具
 * context.confirmed 只能由 HTTP 层在用户明确确认后设置；大模型驱动的调用不会带它。
 * requiresConfirmation 的工具在未确认时只返回待确认请求，不会执行。
 */
const executeTool = async (toolName, params, context = {}) => {
  const tool = Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolName)
    ? TOOL_REGISTRY[toolName]
    : null;

  if (!tool) {
    return {
      success: false,
      error: `未知工具: ${toolName}`,
      availableTools: Object.keys(TOOL_REGISTRY)
    };
  }

  const safeParams = params && typeof params === 'object' && !Array.isArray(params) ? params : {};

  // 参数验证
  for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
    if (paramConfig.required && !safeParams[paramName]) {
      return {
        success: false,
        error: `缺少必需参数: ${paramName}`,
        details: paramConfig.description
      };
    }
  }

  // 设置默认值
  let finalParams = { ...safeParams };
  for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
    if (paramConfig.default !== undefined && finalParams[paramName] === undefined) {
      finalParams[paramName] = paramConfig.default;
    }
  }

  // 权限检查
  if (tool.authorize && !tool.authorize(context)) {
    return {
      success: false,
      tool: toolName,
      error: '没有权限使用该工具'
    };
  }

  // 参数校验与规范化
  if (tool.validate) {
    try {
      finalParams = tool.validate(finalParams);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        return { success: false, tool: toolName, error: error.message };
      }
      throw error;
    }
  }

  // 有副作用的工具必须经过用户确认
  if (tool.requiresConfirmation && context.confirmed !== true) {
    return {
      success: false,
      needsConfirmation: true,
      tool: toolName,
      params: finalParams,
      error: '该操作会产生实际影响，需要用户确认后才能执行',
      message: `请确认是否执行「${tool.name}」`
    };
  }

  console.log(`执行工具: ${toolName}`);

  return await tool.execute(finalParams, context);
};

/**
 * 根据工具名称获取工具信息
 */
const getToolByName = (toolName) => {
  return TOOL_REGISTRY[toolName] || null;
};

module.exports = {
  getTools,
  getToolDefinitions,
  executeTool,
  getToolByName,
  TOOL_REGISTRY
};
