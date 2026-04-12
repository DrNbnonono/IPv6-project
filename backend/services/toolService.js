/**
 * 工具服务
 * 工具注册表和执行器
 */

const db = require('../database/db');

// 工具注册表
const TOOL_REGISTRY = {
  xmap: {
    name: 'XMap扫描',
    description: 'IPv6地址活跃性扫描工具，用于检测目标地址或网段是否在线',
    category: 'scanner',
    parameters: {
      target: { type: 'string', required: true, description: '目标地址或网段' },
      protocol: { type: 'string', default: 'ipv6', description: '协议类型' },
      rate: { type: 'number', default: 1000, description: '发送速率' }
    },
    execute: async (params, context) => {
      try {
        const { target, protocol = 'ipv6', rate = 1000 } = params;

        // 调用内部API执行扫描
        const xmap = require('../api/internal').xmap;
        const mockReq = {
          body: { target, protocol, rate },
          params: {},
          query: {},
          user: context.user
        };
        const mockRes = {
          status: (code) => {
            mockRes.statusCode = code;
            return mockRes;
          },
          json: (data) => {
            mockRes.data = data;
            return mockRes;
          }
        };

        await xmap.createTask(mockReq, mockRes);

        if (mockRes.statusCode >= 400) {
          throw new Error(mockRes.data?.message || 'XMap扫描启动失败');
        }

        return {
          success: true,
          tool: 'xmap',
          result: mockRes.data?.data || { taskId: mockRes.data?.taskId, target, protocol },
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
    description: 'IPv6服务探测工具，用于探测目标地址的端口和服务信息',
    category: 'scanner',
    parameters: {
      target: { type: 'string', required: true, description: '目标地址' },
      module: { type: 'string', required: true, description: '探测模块' },
      port: { type: 'number', description: '指定端口' }
    },
    execute: async (params, context) => {
      try {
        const { target, module, port } = params;

        const zgrab2 = require('../api/internal').zgrab2;
        const mockReq = {
          body: { target, module, port },
          params: {},
          query: {},
          user: context.user
        };
        const mockRes = {
          status: (code) => {
            mockRes.statusCode = code;
            return mockRes;
          },
          json: (data) => {
            mockRes.data = data;
            return mockRes;
          }
        };

        await zgrab2.createTask(mockReq, mockRes);

        if (mockRes.statusCode >= 400) {
          throw new Error(mockRes.data?.message || 'ZGrab2扫描启动失败');
        }

        return {
          success: true,
          tool: 'zgrab2',
          result: mockRes.data?.data || { taskId: mockRes.data?.taskId, target, module },
          message: `ZGrab2扫描任务已创建：${target} (${module})`
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
    parameters: {
      command: { type: 'string', required: true, description: '要执行的命令' },
      terminalId: { type: 'string', description: '终端会话ID（可选，不提供则创建新终端）' },
      timeout: { type: 'number', description: '命令超时时间（毫秒）', default: 60000 }
    },
    execute: async (params, context) => {
      try {
        const { command, terminalId, timeout = 60000 } = params;

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
 */
const executeTool = async (toolName, params, context = {}) => {
  const tool = TOOL_REGISTRY[toolName];

  if (!tool) {
    return {
      success: false,
      error: `未知工具: ${toolName}`,
      availableTools: Object.keys(TOOL_REGISTRY)
    };
  }

  // 参数验证
  for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
    if (paramConfig.required && !params[paramName]) {
      return {
        success: false,
        error: `缺少必需参数: ${paramName}`,
        details: paramConfig.description
      };
    }
  }

  // 设置默认值
  const finalParams = { ...params };
  for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
    if (paramConfig.default !== undefined && finalParams[paramName] === undefined) {
      finalParams[paramName] = paramConfig.default;
    }
  }

  console.log(`执行工具: ${toolName}`, { params: finalParams });

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
