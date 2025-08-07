const db = require('../database/db');
const { createLogger, transports } = require('winston');
const workflowEngine = require('../services/workflowEngine');

const logger = createLogger({
  transports: [new transports.Console()]
});

// 支持的节点类型定义
const NODE_TYPES = {
  'file_input': {
    name: '文件输入',
    description: '选择输入文件作为工作流起点',
    category: 'input',
    inputs: [],
    outputs: ['file'],
    config: {
      fileType: {
        type: 'select',
        options: ['txt', 'json', 'jsonl'],
        default: 'txt',
        label: '文件类型',
        description: '选择输入文件的格式类型'
      },
      fileId: {
        type: 'file_selector',
        required: false, // 改为非必需，因为用户需要手动选择
        default: '',
        label: '选择文件',
        description: '从已上传的文件中选择一个作为输入'
      }
    }
  },
  'xmap_scan': {
    name: 'XMap网络扫描',
    description: '高速IPv6或IPv4网络扫描工具（只能选择其中一种协议）',
    category: 'scan',
    inputs: ['file'],
    outputs: ['result_file'],
    config: {
      protocol: {
        type: 'select',
        options: ['ipv6', 'ipv4'],
        default: 'ipv6',
        label: '协议类型',
        description: '选择IPv6或IPv4扫描（不能同时选择）'
      },
      targetPort: {
        type: 'string',
        default: '80',
        label: '目标端口',
        description: '扫描的目标端口号，支持单个端口或端口范围，如: 80,443,100-200',
        placeholder: '80,443,100-200'
      },
      targetaddress: {
        type: 'string',
        default: '',
        label: '目标地址/范围',
        description: '可选的目标地址或地址范围，如: 2001:db8::/32, example.com',
        placeholder: '2001:db8::/32, example.com, 192.168.1.0/24'
      },
      rate: {
        type: 'number',
        default: 1000,
        label: '扫描速率 (Mbps)',
        description: '扫描速率，单位Mbps',
        min: 0.1,
        step: 0.1
      },
      maxResults: {
        type: 'number',
        default: 10000,
        label: '最大结果数',
        description: '限制返回的最大结果数量，0表示无限制',
        min: 0
      },
      maxlen: {
        type: 'number',
        default: null,
        label: '扫描长度 (Bytes)',
        description: '可选，扫描数据包长度，默认自动计算',
        min: 1
      },
      probeModule: {
        type: 'select',
        options: [
          'udp', 'dnsx', 'dnsa', 'dnsae', 'dnsan', 'dnsane', 'dnsane16',
          'dnsai', 'dnsaie', 'dnsap', 'dnsape', 'dnsaf', 'dnsafe',
          'tcp_syn', 'icmp_echo', 'icmp_echo_gw', 'icmp_echo_tmxd'
        ],
        default: 'icmp_echo',
        label: '探测模块',
        description: '选择网络探测的方式（选项根据协议类型动态变化）'
      },
      description: {
        type: 'string',
        default: 'XMap网络扫描任务',
        label: '任务描述',
        description: '为此扫描任务添加描述信息',
        required: true
      }
    }
  },
  'zgrab2_scan': {
    name: 'ZGrab2应用扫描',
    description: '应用层协议指纹识别和服务发现',
    category: 'scan',
    inputs: ['file'],
    outputs: ['result_file'],
    config: {
      scanMode: {
        type: 'select',
        options: ['single', 'multiple'],
        default: 'single',
        label: '扫描模式',
        description: '单模块扫描或多模块扫描（配置文件）'
      },
      module: {
        type: 'select',
        options: [
          'amqp091', 'bacnet', 'banner', 'dnp3', 'fox', 'ftp', 'http', 'imap',
          'ipp', 'jarm', 'modbus', 'mongodb', 'mqtt', 'mssql', 'mysql', 'ntp',
          'oracle', 'pop3', 'postgres', 'pptp', 'redis', 'siemens', 'smb',
          'smtp', 'socks5', 'ssh', 'telnet', 'tls'
        ],
        default: 'http',
        label: '扫描模块',
        description: '选择要扫描的应用层协议（单模块模式）'
      },
      port: {
        type: 'number',
        default: null,
        label: '目标端口',
        description: '扫描的目标端口号，留空使用模块默认端口',
        min: 1,
        max: 65535
      },
      configFile: {
        type: 'file_selector',
        default: '',
        label: '配置文件',
        description: '多模块扫描时使用的配置文件（.ini格式）',
        fileTypes: ['ini']
      },
      timeout: {
        type: 'number',
        default: 10,
        label: '超时时间 (秒)',
        description: '连接超时时间',
        min: 1,
        max: 300
      },
      senders: {
        type: 'number',
        default: 1000,
        label: '发送协程数',
        description: '并发发送的协程数量',
        min: 1,
        max: 10000
      },
      connectionsPerHost: {
        type: 'number',
        default: 1,
        label: '每主机连接数',
        description: '对每个主机的连接次数',
        min: 1,
        max: 10
      },
      readLimitPerHost: {
        type: 'number',
        default: 96,
        label: '读取限制 (KB)',
        description: '单个主机最大读取数据量（KB）',
        min: 1,
        max: 1024
      },
      description: {
        type: 'string',
        default: 'ZGrab2应用层扫描任务',
        label: '任务描述',
        description: '为此扫描任务添加描述信息',
        required: true
      },
      additionalParams: {
        type: 'string',
        default: '',
        label: '额外参数',
        description: '其他扫描参数，每行一个，格式: key=value',
        placeholder: 'user-agent=Custom-Agent\nmax-redirects=5'
      }
    }
  },
  'xmap_json_extract': {
    name: 'XMap结果提取',
    description: '从XMap扫描结果中提取成功响应的IPv6/IPv4地址（outersaddr字段）',
    category: 'process',
    inputs: ['result_file'],
    outputs: ['file'],
    config: {
      extractType: {
        type: 'select',
        options: ['outersaddr', 'successful_addresses', 'all_addresses'],
        default: 'outersaddr',
        label: '提取类型',
        description: '选择要提取的数据类型（outersaddr用于后续ZGrab2扫描）'
      },
      successOnly: {
        type: 'boolean',
        default: true,
        label: '仅成功响应',
        description: '是否只提取成功响应的地址'
      },
      outputFormat: {
        type: 'select',
        options: ['txt', 'json'],
        default: 'txt',
        label: '输出格式',
        description: '提取结果的保存格式'
      },
      fileName: {
        type: 'string',
        default: 'xmap_extracted_addresses',
        label: '输出文件名',
        description: '提取结果的文件名'
      }
    }
  },
  'zgrab2_json_extract': {
    name: 'ZGrab2结果提取',
    description: '从ZGrab2扫描结果中提取成功的服务信息和IP地址',
    category: 'process',
    inputs: ['result_file'],
    outputs: ['file'],
    config: {
      extractType: {
        type: 'select',
        options: ['successful_ips', 'service_info', 'full_results'],
        default: 'successful_ips',
        label: '提取类型',
        description: '选择要提取的数据类型'
      },
      successOnly: {
        type: 'boolean',
        default: true,
        label: '仅成功响应',
        description: '是否只提取成功响应的结果'
      },
      includeMetadata: {
        type: 'boolean',
        default: false,
        label: '包含元数据',
        description: '是否包含服务的详细元数据信息'
      },
      outputFormat: {
        type: 'select',
        options: ['txt', 'json'],
        default: 'txt',
        label: '输出格式',
        description: '提取结果的保存格式'
      },
      fileName: {
        type: 'string',
        default: 'zgrab2_extracted_results',
        label: '输出文件名',
        description: '提取结果的文件名'
      }
    }
  },
  'json_custom_extract': {
    name: '自定义JSON提取',
    description: '使用自定义规则从JSON文件中提取数据',
    category: 'process',
    inputs: ['result_file', 'file'],
    outputs: ['file'],
    config: {
      fieldPaths: {
        type: 'array',
        default: [],
        label: '字段路径',
        description: '要提取的JSON字段路径列表'
      },
      filterCriteria: {
        type: 'object',
        default: {},
        label: '过滤条件',
        description: '数据过滤条件（JSON格式）'
      },
      useRegex: {
        type: 'boolean',
        default: false,
        label: '使用正则表达式',
        description: '是否在过滤时使用正则表达式'
      },
      outputFormat: {
        type: 'select',
        options: ['json', 'txt', 'csv'],
        default: 'json',
        label: '输出格式',
        description: '提取结果的保存格式'
      },
      fileName: {
        type: 'string',
        default: 'custom_extracted_data',
        label: '输出文件名',
        description: '提取结果的文件名'
      }
    }
  },
  'file_output': {
    name: '文件输出',
    description: '保存处理后的结果文件',
    category: 'output',
    inputs: ['file', 'result_file'],
    outputs: [],
    config: {
      fileName: {
        type: 'string',
        required: true,
        label: '文件名',
        description: '输出文件的名称'
      },
      description: {
        type: 'string',
        default: '',
        label: '文件描述',
        description: '为输出文件添加描述信息'
      },
      fileType: {
        type: 'select',
        options: ['auto', 'txt', 'json', 'csv'],
        default: 'auto',
        label: '文件类型',
        description: '输出文件的格式类型'
      }
    }
  }
};

/**
 * 获取工作流列表
 */
exports.getWorkflows = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, name, description, status, created_at, updated_at
      FROM workflows 
      WHERE user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [workflows] = await db.query(query, params);

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM workflows WHERE user_id = ?';
    const countParams = [userId];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [[{ total }]] = await db.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        workflows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取工作流列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取工作流列表失败: ' + error.message
    });
  }
};

/**
 * 创建工作流
 */
exports.createWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, definition } = req.body;

    if (!name || !definition) {
      return res.status(400).json({
        success: false,
        message: '工作流名称和定义不能为空'
      });
    }

    // 验证工作流定义格式
    if (!definition.nodes || !Array.isArray(definition.nodes) || 
        !definition.connections || !Array.isArray(definition.connections)) {
      return res.status(400).json({
        success: false,
        message: '工作流定义格式不正确'
      });
    }

    const [result] = await db.query(`
      INSERT INTO workflows (user_id, name, description, definition, status)
      VALUES (?, ?, ?, ?, 'draft')
    `, [userId, name, description || '', JSON.stringify(definition)]);

    res.json({
      success: true,
      data: {
        id: result.insertId,
        message: '工作流创建成功'
      }
    });
  } catch (error) {
    logger.error('创建工作流失败:', error);
    res.status(500).json({
      success: false,
      message: '创建工作流失败: ' + error.message
    });
  }
};

/**
 * 获取工作流详情
 */
exports.getWorkflowById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [workflows] = await db.query(`
      SELECT * FROM workflows 
      WHERE id = ? AND user_id = ?
    `, [id, userId]);

    if (workflows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '工作流不存在'
      });
    }

    const workflow = workflows[0];

    // 安全地处理definition字段
    try {
      if (typeof workflow.definition === 'string') {
        // 检查是否是有效的JSON字符串
        if (workflow.definition.trim().startsWith('{') || workflow.definition.trim().startsWith('[')) {
          workflow.definition = JSON.parse(workflow.definition);
        } else {
          // 如果不是有效的JSON，创建默认结构
          console.warn('工作流定义不是有效的JSON，使用默认结构:', workflow.definition);
          workflow.definition = {
            nodes: [],
            connections: []
          };
        }
      } else if (!workflow.definition) {
        // 如果definition为null或undefined，创建默认结构
        workflow.definition = {
          nodes: [],
          connections: []
        };
      }
      // 如果已经是对象，直接使用
    } catch (parseError) {
      console.error('解析工作流定义失败:', parseError);
      // 解析失败时使用默认结构
      workflow.definition = {
        nodes: [],
        connections: []
      };
    }

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('获取工作流详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取工作流详情失败: ' + error.message
    });
  }
};

/**
 * 更新工作流
 */
exports.updateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, description, definition, status } = req.body;

    // 检查工作流是否存在
    const [workflows] = await db.query(`
      SELECT id FROM workflows 
      WHERE id = ? AND user_id = ?
    `, [id, userId]);

    if (workflows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '工作流不存在'
      });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (definition !== undefined) {
      updates.push('definition = ?');
      params.push(JSON.stringify(definition));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的字段'
      });
    }

    params.push(id);
    await db.query(`
      UPDATE workflows 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, params);

    res.json({
      success: true,
      message: '工作流更新成功'
    });
  } catch (error) {
    logger.error('更新工作流失败:', error);
    res.status(500).json({
      success: false,
      message: '更新工作流失败: ' + error.message
    });
  }
};

/**
 * 删除工作流
 */
exports.deleteWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 检查是否有正在执行的实例
    const [executions] = await db.query(`
      SELECT COUNT(*) as count FROM workflow_executions 
      WHERE workflow_id = ? AND status IN ('pending', 'running', 'paused')
    `, [id]);

    if (executions[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: '工作流有正在执行的实例，无法删除'
      });
    }

    const [result] = await db.query(`
      DELETE FROM workflows 
      WHERE id = ? AND user_id = ?
    `, [id, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '工作流不存在'
      });
    }

    res.json({
      success: true,
      message: '工作流删除成功'
    });
  } catch (error) {
    logger.error('删除工作流失败:', error);
    res.status(500).json({
      success: false,
      message: '删除工作流失败: ' + error.message
    });
  }
};

/**
 * 获取支持的节点类型
 */
exports.getNodeTypes = async (req, res) => {
  try {
    console.log('=== getNodeTypes 被调用 ===');
    console.log('NODE_TYPES 数量:', Object.keys(NODE_TYPES).length);
    console.log('NODE_TYPES 键:', Object.keys(NODE_TYPES));

    res.json({
      success: true,
      data: NODE_TYPES
    });
  } catch (error) {
    console.error('获取节点类型失败:', error);
    logger.error('获取节点类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取节点类型失败: ' + error.message
    });
  }
};

/**
 * 获取工作流模板
 */
exports.getWorkflowTemplates = async (req, res) => {
  try {
    console.log('=== getWorkflowTemplates 被调用 ===');
    const templates = [
      {
        id: 'xmap_zgrab2_basic',
        name: 'XMap + ZGrab2 基础扫描',
        description: 'XMap探测后使用ZGrab2进行应用层扫描的完整工作流',
        category: 'scan',
        tags: ['xmap', 'zgrab2', 'ipv6', 'http'],
        definition: {
          nodes: [
            {
              id: 'input_1',
              type: 'file_input',
              position: { x: 50, y: 150 },
              config: {
                fileType: 'txt',
                label: 'IPv6地址列表文件'
              }
            },
            {
              id: 'xmap_1',
              type: 'xmap_scan',
              position: { x: 250, y: 150 },
              config: {
                ipv6: true,
                ipv4: false,
                probeModule: 'icmp_echoscan',
                rate: 1000,
                maxResults: 10000,
                description: 'IPv6网络活跃性探测'
              }
            },
            {
              id: 'extract_1',
              type: 'xmap_json_extract',
              position: { x: 450, y: 150 },
              config: {
                extractType: 'successful_addresses',
                successOnly: true,
                outputFormat: 'txt',
                fileName: 'active_ipv6_addresses'
              }
            },
            {
              id: 'zgrab2_1',
              type: 'zgrab2_scan',
              position: { x: 650, y: 150 },
              config: {
                module: 'http',
                port: 80,
                timeout: 10,
                description: 'HTTP服务扫描'
              }
            },
            {
              id: 'extract_2',
              type: 'zgrab2_json_extract',
              position: { x: 850, y: 150 },
              config: {
                extractType: 'successful_ips',
                successOnly: true,
                includeMetadata: true,
                outputFormat: 'json',
                fileName: 'http_services'
              }
            },
            {
              id: 'output_1',
              type: 'file_output',
              position: { x: 1050, y: 150 },
              config: {
                fileName: 'final_scan_results',
                description: 'XMap+ZGrab2扫描最终结果',
                fileType: 'json'
              }
            }
          ],
          connections: [
            { from: 'input_1', to: 'xmap_1', fromPort: 'file', toPort: 'file' },
            { from: 'xmap_1', to: 'extract_1', fromPort: 'result_file', toPort: 'result_file' },
            { from: 'extract_1', to: 'zgrab2_1', fromPort: 'file', toPort: 'file' },
            { from: 'zgrab2_1', to: 'extract_2', fromPort: 'result_file', toPort: 'result_file' },
            { from: 'extract_2', to: 'output_1', fromPort: 'file', toPort: 'file' }
          ]
        }
      },
      {
        id: 'xmap_only_scan',
        name: 'XMap IPv6 探测',
        description: '单独使用XMap进行IPv6网络探测',
        category: 'scan',
        tags: ['xmap', 'ipv6', 'icmp'],
        definition: {
          nodes: [
            {
              id: 'input_1',
              type: 'file_input',
              position: { x: 100, y: 150 },
              config: {
                fileType: 'txt',
                label: 'IPv6地址范围文件'
              }
            },
            {
              id: 'xmap_1',
              type: 'xmap_scan',
              position: { x: 350, y: 150 },
              config: {
                ipv6: true,
                ipv4: false,
                probeModule: 'icmp_echoscan',
                rate: 2000,
                maxResults: 50000,
                description: 'IPv6网络大规模探测'
              }
            },
            {
              id: 'extract_1',
              type: 'xmap_json_extract',
              position: { x: 600, y: 150 },
              config: {
                extractType: 'successful_addresses',
                successOnly: true,
                outputFormat: 'txt',
                fileName: 'discovered_ipv6_hosts'
              }
            },
            {
              id: 'output_1',
              type: 'file_output',
              position: { x: 850, y: 150 },
              config: {
                fileName: 'xmap_discovery_results',
                description: 'IPv6主机发现结果',
                fileType: 'txt'
              }
            }
          ],
          connections: [
            { from: 'input_1', to: 'xmap_1', fromPort: 'file', toPort: 'file' },
            { from: 'xmap_1', to: 'extract_1', fromPort: 'result_file', toPort: 'result_file' },
            { from: 'extract_1', to: 'output_1', fromPort: 'file', toPort: 'file' }
          ]
        }
      },
      {
        id: 'zgrab2_multi_protocol',
        name: 'ZGrab2 多协议扫描',
        description: '使用ZGrab2对已知主机进行多种协议扫描',
        category: 'scan',
        tags: ['zgrab2', 'http', 'https', 'ssh'],
        definition: {
          nodes: [
            {
              id: 'input_1',
              type: 'file_input',
              position: { x: 50, y: 100 },
              config: {
                fileType: 'txt',
                label: '目标IP地址列表'
              }
            },
            {
              id: 'zgrab2_http',
              type: 'zgrab2_scan',
              position: { x: 300, y: 50 },
              config: {
                module: 'http',
                port: 80,
                timeout: 10,
                description: 'HTTP服务扫描'
              }
            },
            {
              id: 'zgrab2_https',
              type: 'zgrab2_scan',
              position: { x: 300, y: 150 },
              config: {
                module: 'https',
                port: 443,
                timeout: 10,
                description: 'HTTPS服务扫描'
              }
            },
            {
              id: 'zgrab2_ssh',
              type: 'zgrab2_scan',
              position: { x: 300, y: 250 },
              config: {
                module: 'ssh',
                port: 22,
                timeout: 10,
                description: 'SSH服务扫描'
              }
            },
            {
              id: 'extract_http',
              type: 'zgrab2_json_extract',
              position: { x: 550, y: 50 },
              config: {
                extractType: 'service_info',
                successOnly: true,
                includeMetadata: true,
                outputFormat: 'json',
                fileName: 'http_services'
              }
            },
            {
              id: 'extract_https',
              type: 'zgrab2_json_extract',
              position: { x: 550, y: 150 },
              config: {
                extractType: 'service_info',
                successOnly: true,
                includeMetadata: true,
                outputFormat: 'json',
                fileName: 'https_services'
              }
            },
            {
              id: 'extract_ssh',
              type: 'zgrab2_json_extract',
              position: { x: 550, y: 250 },
              config: {
                extractType: 'service_info',
                successOnly: true,
                includeMetadata: true,
                outputFormat: 'json',
                fileName: 'ssh_services'
              }
            }
          ],
          connections: [
            { from: 'input_1', to: 'zgrab2_http', fromPort: 'file', toPort: 'file' },
            { from: 'input_1', to: 'zgrab2_https', fromPort: 'file', toPort: 'file' },
            { from: 'input_1', to: 'zgrab2_ssh', fromPort: 'file', toPort: 'file' },
            { from: 'zgrab2_http', to: 'extract_http', fromPort: 'result_file', toPort: 'result_file' },
            { from: 'zgrab2_https', to: 'extract_https', fromPort: 'result_file', toPort: 'result_file' },
            { from: 'zgrab2_ssh', to: 'extract_ssh', fromPort: 'result_file', toPort: 'result_file' }
          ]
        }
      }
    ];

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('获取工作流模板失败:', error);
    res.status(500).json({
      success: false,
      message: '获取工作流模板失败: ' + error.message
    });
  }
};

/**
 * 执行工作流
 */
exports.executeWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, inputData = {} } = req.body;

    // 获取工作流定义
    const [workflows] = await db.query(`
      SELECT * FROM workflows
      WHERE id = ? AND user_id = ?
    `, [id, userId]);

    if (workflows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '工作流不存在'
      });
    }

    const workflow = workflows[0];

    // 安全地处理definition字段
    let definition;
    try {
      if (typeof workflow.definition === 'string') {
        if (workflow.definition.trim().startsWith('{') || workflow.definition.trim().startsWith('[')) {
          definition = JSON.parse(workflow.definition);
        } else {
          throw new Error('工作流定义格式不正确');
        }
      } else if (workflow.definition && typeof workflow.definition === 'object') {
        definition = workflow.definition;
      } else {
        throw new Error('工作流定义为空或格式不正确');
      }
    } catch (parseError) {
      console.error('解析工作流定义失败:', parseError);
      return res.status(400).json({
        success: false,
        message: '工作流定义格式不正确，无法执行'
      });
    }

    // 创建执行实例
    const [result] = await db.query(`
      INSERT INTO workflow_executions (workflow_id, user_id, name, status)
      VALUES (?, ?, ?, 'pending')
    `, [id, userId, name || `${workflow.name}_${Date.now()}`]);

    const executionId = result.insertId;

    // 异步启动工作流执行
    setImmediate(() => {
      workflowEngine.executeWorkflow(executionId, definition, inputData, userId)
        .catch(error => {
          logger.error(`工作流执行失败 [${executionId}]:`, error);
        });
    });

    res.json({
      success: true,
      data: {
        executionId,
        message: '工作流执行已启动'
      }
    });
  } catch (error) {
    logger.error('启动工作流执行失败:', error);
    res.status(500).json({
      success: false,
      message: '启动工作流执行失败: ' + error.message
    });
  }
};

/**
 * 获取执行历史
 */
exports.getExecutions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT e.*, w.name as workflow_name
      FROM workflow_executions e
      JOIN workflows w ON e.workflow_id = w.id
      WHERE e.workflow_id = ? AND e.user_id = ?
    `;
    const params = [id, userId];

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [executions] = await db.query(query, params);

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM workflow_executions
      WHERE workflow_id = ? AND user_id = ?
    `;
    const countParams = [id, userId];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [[{ total }]] = await db.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        executions: executions.map(exec => {
          let progress = null;
          try {
            if (exec.progress && typeof exec.progress === 'string') {
              if (exec.progress.trim().startsWith('{') || exec.progress.trim().startsWith('[')) {
                progress = JSON.parse(exec.progress);
              }
            } else if (exec.progress && typeof exec.progress === 'object') {
              progress = exec.progress;
            }
          } catch (parseError) {
            console.warn('解析执行进度失败:', parseError);
            progress = null;
          }

          return {
            ...exec,
            progress
          };
        }),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取执行历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取执行历史失败: ' + error.message
    });
  }
};

/**
 * 获取执行详情
 */
exports.getExecutionDetails = async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.id;

    // 获取执行实例信息
    const [executions] = await db.query(`
      SELECT e.*, w.name as workflow_name, w.definition
      FROM workflow_executions e
      JOIN workflows w ON e.workflow_id = w.id
      WHERE e.id = ? AND e.user_id = ?
    `, [executionId, userId]);

    if (executions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '执行实例不存在'
      });
    }

    const execution = executions[0];

    // 安全解析definition
    try {
      if (typeof execution.definition === 'string') {
        execution.definition = JSON.parse(execution.definition);
      }
    } catch (e) {
      execution.definition = { nodes: [], connections: [] };
    }

    // 安全解析progress
    try {
      if (execution.progress && typeof execution.progress === 'string') {
        execution.progress = JSON.parse(execution.progress);
      }
    } catch (e) {
      execution.progress = null;
    }

    // 获取节点执行记录
    const [nodeExecutions] = await db.query(`
      SELECT * FROM workflow_node_executions
      WHERE execution_id = ?
      ORDER BY created_at ASC
    `, [executionId]);

    execution.nodeExecutions = nodeExecutions.map(node => {
      const result = { ...node };

      // 安全解析input_data
      try {
        if (node.input_data && typeof node.input_data === 'string') {
          result.input_data = JSON.parse(node.input_data);
        }
      } catch (e) {
        result.input_data = null;
      }

      // 安全解析output_data
      try {
        if (node.output_data && typeof node.output_data === 'string') {
          result.output_data = JSON.parse(node.output_data);
        }
      } catch (e) {
        result.output_data = null;
      }

      // 安全解析config
      try {
        if (node.config && typeof node.config === 'string') {
          result.config = JSON.parse(node.config);
        }
      } catch (e) {
        result.config = null;
      }

      return result;
    });

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    logger.error('获取执行详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取执行详情失败: ' + error.message
    });
  }
};

/**
 * 取消执行
 */
exports.cancelExecution = async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.id;

    // 检查执行实例是否存在且属于当前用户
    const [executions] = await db.query(`
      SELECT status FROM workflow_executions
      WHERE id = ? AND user_id = ?
    `, [executionId, userId]);

    if (executions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '执行实例不存在'
      });
    }

    const execution = executions[0];
    if (!['pending', 'running', 'paused'].includes(execution.status)) {
      return res.status(400).json({
        success: false,
        message: '执行实例不在可取消状态'
      });
    }

    // 取消工作流执行
    await workflowEngine.cancelExecution(executionId);

    res.json({
      success: true,
      message: '执行已取消'
    });
  } catch (error) {
    logger.error('取消执行失败:', error);
    res.status(500).json({
      success: false,
      message: '取消执行失败: ' + error.message
    });
  }
};

/**
 * 暂停执行
 */
exports.pauseExecution = async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.id;

    await workflowEngine.pauseExecution(executionId, userId);

    res.json({
      success: true,
      message: '执行已暂停'
    });
  } catch (error) {
    logger.error('暂停执行失败:', error);
    res.status(500).json({
      success: false,
      message: '暂停执行失败: ' + error.message
    });
  }
};

/**
 * 恢复执行
 */
exports.resumeExecution = async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.id;

    await workflowEngine.resumeExecution(executionId, userId);

    res.json({
      success: true,
      message: '执行已恢复'
    });
  } catch (error) {
    logger.error('恢复执行失败:', error);
    res.status(500).json({
      success: false,
      message: '恢复执行失败: ' + error.message
    });
  }
};
