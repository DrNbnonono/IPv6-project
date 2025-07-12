const db = require('../database/db');
const { createLogger, transports } = require('winston');
const fs = require('fs');
const path = require('path');
const api = require('../api/internal'); // 内部API调用

const logger = createLogger({
  transports: [new transports.Console()]
});

// 活动的执行实例
const activeExecutions = new Map();

/**
 * 执行工作流
 */
async function executeWorkflow(executionId, definition, inputData, userId) {
  try {
    logger.info(`开始执行工作流 [${executionId}]`);

    // 更新执行状态
    await updateExecutionStatus(executionId, 'running', null, { totalNodes: definition.nodes.length, completedNodes: 0 });

    // 创建执行上下文
    const context = {
      executionId,
      userId,
      definition,
      inputData,
      nodeOutputs: new Map(), // 存储每个节点的输出
      status: 'running'
    };

    activeExecutions.set(executionId, context);

    // 构建节点依赖图
    const dependencyGraph = buildDependencyGraph(definition);
    
    // 按拓扑顺序执行节点
    const executionOrder = topologicalSort(dependencyGraph);
    
    for (const nodeId of executionOrder) {
      if (context.status === 'canceled') {
        logger.info(`工作流执行被取消 [${executionId}]`);
        break;
      }

      const node = definition.nodes.find(n => n.id === nodeId);
      if (!node) {
        throw new Error(`节点不存在: ${nodeId}`);
      }

      await executeNode(context, node);
      
      // 更新进度
      const progress = {
        totalNodes: definition.nodes.length,
        completedNodes: context.nodeOutputs.size
      };
      await updateExecutionProgress(executionId, progress);
    }

    if (context.status === 'running') {
      await updateExecutionStatus(executionId, 'completed');
      logger.info(`工作流执行完成 [${executionId}]`);
    }

  } catch (error) {
    logger.error(`工作流执行失败 [${executionId}]:`, error);
    await updateExecutionStatus(executionId, 'failed', error.message);
  } finally {
    activeExecutions.delete(executionId);
  }
}

/**
 * 执行单个节点
 */
async function executeNode(context, node) {
  const { executionId, userId } = context;
  
  logger.info(`执行节点 [${executionId}] ${node.id} (${node.type})`);

  // 创建节点执行记录
  const [result] = await db.query(`
    INSERT INTO workflow_node_executions 
    (execution_id, node_id, node_type, config, status)
    VALUES (?, ?, ?, ?, 'running')
  `, [executionId, node.id, node.type, JSON.stringify(node.config || {})]);

  const nodeExecutionId = result.insertId;

  try {
    // 准备输入数据
    const inputData = await prepareNodeInput(context, node);
    
    // 更新输入数据
    await db.query(`
      UPDATE workflow_node_executions 
      SET input_data = ?, started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(inputData), nodeExecutionId]);

    // 根据节点类型执行
    let outputData;
    switch (node.type) {
      case 'file_input':
        outputData = await executeFileInputNode(node, inputData, userId);
        break;
      case 'xmap_scan':
        outputData = await executeXmapScanNode(node, inputData, userId);
        break;
      case 'zgrab2_scan':
        outputData = await executeZgrab2ScanNode(node, inputData, userId);
        break;
      case 'xmap_json_extract':
        outputData = await executeXmapJsonExtractNode(node, inputData, userId);
        break;
      case 'zgrab2_json_extract':
        outputData = await executeZgrab2JsonExtractNode(node, inputData, userId);
        break;
      case 'json_custom_extract':
        outputData = await executeJsonCustomExtractNode(node, inputData, userId);
        break;
      case 'file_output':
        outputData = await executeFileOutputNode(node, inputData, userId);
        break;
      default:
        throw new Error(`不支持的节点类型: ${node.type}`);
    }

    // 存储节点输出
    context.nodeOutputs.set(node.id, outputData);

    // 更新节点执行状态，包括task_id
    const updateQuery = `
      UPDATE workflow_node_executions
      SET output_data = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
      ${outputData.taskId ? ', task_id = ?' : ''}
      WHERE id = ?
    `;

    const updateParams = [JSON.stringify(outputData)];
    if (outputData.taskId) {
      updateParams.push(outputData.taskId);
    }
    updateParams.push(nodeExecutionId);

    await db.query(updateQuery, updateParams);

    logger.info(`节点执行完成 [${executionId}] ${node.id}`);

  } catch (error) {
    logger.error(`节点执行失败 [${executionId}] ${node.id}:`, error);
    
    await db.query(`
      UPDATE workflow_node_executions 
      SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [error.message, nodeExecutionId]);

    throw error;
  }
}

/**
 * 准备节点输入数据
 */
async function prepareNodeInput(context, node) {
  const { definition, inputData, nodeOutputs } = context;
  
  // 查找连接到此节点的输入
  const inputConnections = definition.connections.filter(conn => conn.to === node.id);
  
  const inputs = {};
  
  for (const connection of inputConnections) {
    const sourceOutput = nodeOutputs.get(connection.from);
    if (sourceOutput) {
      // 支持新的连接格式（fromPort/toPort）和旧的格式（outputPort）
      const inputKey = connection.toPort || connection.outputPort || 'default';
      inputs[inputKey] = sourceOutput;
    }
  }

  // 如果是起始节点，使用工作流输入数据
  if (inputConnections.length === 0) {
    Object.assign(inputs, inputData);
  }

  return inputs;
}

/**
 * 文件输入节点执行
 */
async function executeFileInputNode(node, inputData, userId) {
  const { fileId, fileType } = node.config;
  
  if (!fileId) {
    throw new Error('文件输入节点缺少文件ID配置');
  }

  // 获取文件信息
  const [files] = await db.query(`
    SELECT file_path, file_name FROM whitelists 
    WHERE id = ? AND user_id = ? AND is_deleted = 0
  `, [fileId, userId]);

  if (files.length === 0) {
    throw new Error('指定的文件不存在或无权访问');
  }

  const file = files[0];
  
  return {
    type: 'file',
    fileId: fileId,
    filePath: file.file_path,
    fileName: file.file_name,
    fileType: fileType
  };
}

/**
 * XMap扫描节点执行
 */
async function executeXmapScanNode(node, inputData, userId) {
  const {
    protocol, ipv6, ipv4, targetPort, targetaddress, rate, maxResults,
    maxlen, probeModule, description
  } = node.config;

  // 获取输入文件（可选，作为起始节点时可能没有）
  const inputFile = inputData.default || inputData.file;

  // 如果没有输入文件，检查是否配置了目标地址
  if (!inputFile || !inputFile.filePath) {
    if (!targetaddress || targetaddress.trim() === '') {
      throw new Error('XMap扫描节点作为起始节点时，必须配置目标地址或提供输入文件');
    }
  }

  // 处理协议配置 - 支持新旧格式
  let useIPv6, useIPv4;
  if (protocol) {
    // 新格式：使用protocol字段
    useIPv6 = protocol === 'ipv6';
    useIPv4 = protocol === 'ipv4';
  } else {
    // 旧格式：使用ipv6/ipv4字段
    useIPv6 = ipv6 !== false;
    useIPv4 = ipv4 === true;
  }

  // 调用XMap API - 使用现有的完整参数
  const scanParams = {
    ipv6: useIPv6,
    ipv4: useIPv4,
    targetPort: targetPort || '80',
    targetaddress: targetaddress || '',
    rate: rate || 1000,
    max_results: maxResults || 10000,
    maxlen: maxlen || null,
    probeModule: probeModule || 'icmp_echo',
    description: description || `工作流XMap扫描 - ${node.id}`
  };

  // 只有当有输入文件时才设置whitelistFile
  if (inputFile && inputFile.filePath) {
    scanParams.whitelistFile = path.basename(inputFile.filePath);
  }

  const response = await api.xmap.startScan(scanParams, userId);

  if (!response.success) {
    throw new Error(`XMap扫描失败: ${response.message}`);
  }

  // 等待任务完成
  const taskId = response.taskId;
  await waitForTaskCompletion(taskId, 'xmap', userId);

  // 获取结果文件路径
  const taskDetails = await api.xmap.getTaskDetails(taskId, userId);

  return {
    type: 'result_file',
    taskId: taskId,
    filePath: taskDetails.output_path,
    fileName: `xmap_result_${taskId}.json`,
    fileType: 'json',
    toolType: 'xmap'
  };
}

/**
 * ZGrab2扫描节点执行
 */
async function executeZgrab2ScanNode(node, inputData, userId) {
  const {
    scanMode, module, port, configFile, timeout, senders,
    connectionsPerHost, readLimitPerHost, description, additionalParams
  } = node.config;

  // 获取输入文件
  const inputFile = inputData.default || inputData.file;
  if (!inputFile || !inputFile.filePath) {
    throw new Error('ZGrab2扫描节点缺少输入文件');
  }

  // 准备扫描参数 - 修复文件路径传递问题
  const scanParams = {
    inputFile: path.basename(inputFile.filePath),
    inputFilePath: inputFile.filePath, // 添加完整文件路径
    fileId: inputFile.fileId, // 添加文件ID用于数据库查询
    description: description || `工作流ZGrab2扫描 - ${node.id}`,
    additionalParams: {}
  };

  // 根据扫描模式设置参数
  if (scanMode === 'multiple') {
    // 多模块扫描模式
    if (!configFile) {
      throw new Error('多模块扫描模式需要配置文件');
    }
    scanParams.configFile = configFile;
  } else {
    // 单模块扫描模式
    scanParams.module = module || 'http';
    if (port) {
      scanParams.port = port;
    }
  }

  // 添加额外参数
  if (timeout) scanParams.additionalParams.timeout = timeout;
  if (senders) scanParams.additionalParams.senders = senders;
  if (connectionsPerHost) scanParams.additionalParams['connections-per-host'] = connectionsPerHost;
  if (readLimitPerHost) scanParams.additionalParams['read-limit-per-host'] = readLimitPerHost;

  // 解析额外参数字符串
  if (additionalParams) {
    additionalParams.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        scanParams.additionalParams[key.trim()] = value.trim();
      }
    });
  }

  const response = await api.zgrab2.createTask(scanParams, userId);

  if (!response.success) {
    throw new Error(`ZGrab2扫描失败: ${response.message}`);
  }

  // 等待任务完成
  const taskId = response.taskId;
  await waitForTaskCompletion(taskId, 'zgrab2', userId);

  // 获取结果文件路径
  const taskDetails = await api.zgrab2.getTaskDetails(taskId, userId);

  return {
    type: 'result_file',
    taskId: taskId,
    filePath: taskDetails.output_path,
    fileName: `zgrab2_result_${taskId}.jsonl`,
    fileType: 'jsonl',
    toolType: 'zgrab2'
  };
}

/**
 * XMap JSON结果提取节点执行
 */
async function executeXmapJsonExtractNode(node, inputData, userId) {
  const { extractType, successOnly, outputFormat, fileName } = node.config;

  // 获取输入文件
  const inputFile = inputData.default || inputData.result_file;
  if (!inputFile || !inputFile.taskId) {
    throw new Error('XMap JSON提取节点缺少输入文件或任务ID');
  }

  // 解析JSON文件
  const parseResponse = await api.jsonanalysis.parseFile(inputFile.taskId, userId);

  if (!parseResponse.success) {
    throw new Error(`JSON文件解析失败: ${parseResponse.message}`);
  }

  const sessionId = parseResponse.data.sessionId;

  // 提取XMap结果
  const extractResponse = await api.jsonanalysis.extractXmapResults({
    sessionId,
    filterCriteria: {
      onlySuccessful: successOnly !== false,
      extractType: extractType || 'outersaddr'
    }
  }, userId);

  if (!extractResponse.success) {
    throw new Error(`XMap数据提取失败: ${extractResponse.message}`);
  }

  // 保存提取结果
  const extractedData = extractResponse.data;
  const outputFileName = fileName || `xmap_extracted_${node.id}_${Date.now()}`;

  // 根据提取类型决定保存的数据
  const dataToSave = extractedData.extractedData || extractedData;

  const saveResponse = await api.jsonanalysis.save({
    jsonData: dataToSave,
    fileName: outputFileName,
    description: `XMap工作流提取结果 - ${node.id}`,
    format: outputFormat || 'txt'
  }, userId);

  if (!saveResponse.success) {
    throw new Error(`保存XMap提取结果失败: ${saveResponse.message}`);
  }

  return {
    type: 'file',
    fileId: saveResponse.data.fileId,
    filePath: saveResponse.data.filePath,
    fileName: saveResponse.data.fileName,
    fileType: outputFormat || 'txt',
    extractedData: extractedData
  };
}

/**
 * ZGrab2 JSON结果提取节点执行
 */
async function executeZgrab2JsonExtractNode(node, inputData, userId) {
  const { extractType, successOnly, includeMetadata, outputFormat, fileName } = node.config;

  // 获取输入文件
  const inputFile = inputData.default || inputData.result_file;
  if (!inputFile || !inputFile.taskId) {
    throw new Error('ZGrab2 JSON提取节点缺少输入文件或任务ID');
  }

  // 解析JSON文件
  const parseResponse = await api.jsonanalysis.parseFile(inputFile.taskId, userId);

  if (!parseResponse.success) {
    throw new Error(`JSON文件解析失败: ${parseResponse.message}`);
  }

  const sessionId = parseResponse.data.sessionId;

  // 提取ZGrab2结果
  const extractResponse = await api.jsonanalysis.extractZgrab2Results({
    sessionId,
    filterCriteria: {
      successOnly: successOnly !== false,
      extractType: extractType || 'successful_ips',
      includeMetadata: includeMetadata === true
    }
  }, userId);

  if (!extractResponse.success) {
    throw new Error(`ZGrab2数据提取失败: ${extractResponse.message}`);
  }

  // 保存提取结果
  const extractedData = extractResponse.data;
  const outputFileName = fileName || `zgrab2_extracted_${node.id}_${Date.now()}`;

  const saveResponse = await api.jsonanalysis.save({
    jsonData: extractedData,
    fileName: outputFileName,
    description: `ZGrab2工作流提取结果 - ${node.id}`,
    format: outputFormat || 'txt'
  }, userId);

  if (!saveResponse.success) {
    throw new Error(`保存ZGrab2提取结果失败: ${saveResponse.message}`);
  }

  return {
    type: 'file',
    fileId: saveResponse.data.fileId,
    filePath: saveResponse.data.filePath,
    fileName: saveResponse.data.fileName,
    fileType: outputFormat || 'txt',
    extractedData: extractedData
  };
}

/**
 * 自定义JSON提取节点执行
 */
async function executeJsonCustomExtractNode(node, inputData, userId) {
  const { fieldPaths, filterCriteria, useRegex, outputFormat, fileName } = node.config;

  // 获取输入文件
  const inputFile = inputData.default || inputData.result_file || inputData.file;
  if (!inputFile || (!inputFile.taskId && !inputFile.fileId)) {
    throw new Error('自定义JSON提取节点缺少输入文件');
  }

  // 解析JSON文件
  const parseResponse = await api.jsonanalysis.parseFile(inputFile.taskId || inputFile.fileId, userId);

  if (!parseResponse.success) {
    throw new Error(`JSON文件解析失败: ${parseResponse.message}`);
  }

  const sessionId = parseResponse.data.sessionId;

  // 自定义字段提取
  const extractResponse = await api.jsonanalysis.extractFieldsFromSession({
    sessionId,
    fieldPaths: fieldPaths || [],
    filterCriteria: filterCriteria || {},
    useRegex: useRegex === true
  }, userId);

  if (!extractResponse.success) {
    throw new Error(`自定义数据提取失败: ${extractResponse.message}`);
  }

  // 保存提取结果
  const extractedData = extractResponse.data;
  const outputFileName = fileName || `custom_extracted_${node.id}_${Date.now()}`;

  const saveResponse = await api.jsonanalysis.save({
    jsonData: extractedData,
    fileName: outputFileName,
    description: `自定义工作流提取结果 - ${node.id}`,
    format: outputFormat || 'json'
  }, userId);

  if (!saveResponse.success) {
    throw new Error(`保存自定义提取结果失败: ${saveResponse.message}`);
  }

  return {
    type: 'file',
    fileId: saveResponse.data.fileId,
    filePath: saveResponse.data.filePath,
    fileName: saveResponse.data.fileName,
    fileType: outputFormat || 'json',
    extractedData: extractedData
  };
}

/**
 * 文件输出节点执行
 */
async function executeFileOutputNode(node, inputData, userId) {
  const { fileName, description, fileType } = node.config;

  // 获取输入数据
  const inputFile = inputData.default || inputData.file || inputData.result_file;
  if (!inputFile) {
    throw new Error('文件输出节点缺少输入数据');
  }

  // 如果输入已经是文件，可以选择重命名或直接返回
  if (inputFile.fileId) {
    // 如果指定了新的文件名，创建副本
    if (fileName && fileName !== inputFile.fileName) {
      const saveResponse = await api.jsonanalysis.save({
        jsonData: inputFile.extractedData || inputFile,
        fileName: fileName,
        description: description || '工作流输出文件',
        format: fileType === 'auto' ? inputFile.fileType : fileType
      }, userId);

      if (!saveResponse.success) {
        throw new Error(`保存输出文件失败: ${saveResponse.message}`);
      }

      return {
        type: 'output',
        fileId: saveResponse.data.fileId,
        filePath: saveResponse.data.filePath,
        fileName: saveResponse.data.fileName,
        description: description || '工作流输出文件'
      };
    }

    // 直接返回原文件
    return {
      type: 'output',
      fileId: inputFile.fileId,
      filePath: inputFile.filePath,
      fileName: fileName || inputFile.fileName,
      description: description || '工作流输出文件'
    };
  }

  // 如果是其他类型数据，保存为文件
  const saveResponse = await api.jsonanalysis.save({
    jsonData: inputFile,
    fileName: fileName || `workflow_output_${Date.now()}`,
    description: description || '工作流输出文件',
    format: fileType === 'auto' ? 'json' : fileType
  }, userId);

  if (!saveResponse.success) {
    throw new Error(`保存输出文件失败: ${saveResponse.message}`);
  }

  return {
    type: 'output',
    fileId: saveResponse.data.fileId,
    filePath: saveResponse.data.filePath,
    fileName: saveResponse.data.fileName,
    description: description || '工作流输出文件'
  };
}

/**
 * 等待任务完成
 */
async function waitForTaskCompletion(taskId, taskType, userId, maxWaitTime = 3600000) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5秒轮询一次

  while (Date.now() - startTime < maxWaitTime) {
    let taskDetails;

    if (taskType === 'xmap') {
      taskDetails = await api.xmap.getTaskDetails(taskId, userId);
    } else if (taskType === 'zgrab2') {
      taskDetails = await api.zgrab2.getTaskDetails(taskId, userId);
    } else {
      throw new Error(`不支持的任务类型: ${taskType}`);
    }

    if (taskDetails.status === 'completed') {
      return taskDetails;
    } else if (taskDetails.status === 'failed') {
      throw new Error(`任务执行失败: ${taskDetails.error_message}`);
    } else if (taskDetails.status === 'canceled') {
      throw new Error('任务被取消');
    }

    // 等待下次轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('任务执行超时');
}

/**
 * 构建依赖图
 */
function buildDependencyGraph(definition) {
  const graph = new Map();

  // 初始化所有节点
  for (const node of definition.nodes) {
    graph.set(node.id, { dependencies: [], dependents: [] });
  }

  // 添加依赖关系
  for (const connection of definition.connections) {
    const fromNode = graph.get(connection.from);
    const toNode = graph.get(connection.to);

    if (fromNode && toNode) {
      toNode.dependencies.push(connection.from);
      fromNode.dependents.push(connection.to);
    }
  }

  return graph;
}

/**
 * 拓扑排序
 */
function topologicalSort(graph) {
  const visited = new Set();
  const visiting = new Set();
  const result = [];

  function visit(nodeId) {
    if (visiting.has(nodeId)) {
      throw new Error('工作流中存在循环依赖');
    }

    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        visit(depId);
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    result.push(nodeId);
  }

  for (const nodeId of graph.keys()) {
    if (!visited.has(nodeId)) {
      visit(nodeId);
    }
  }

  return result;
}

/**
 * 更新执行状态
 */
async function updateExecutionStatus(executionId, status, errorMessage = null, progress = null) {
  const updates = ['status = ?'];
  const params = [status];

  if (errorMessage !== null) {
    updates.push('error_message = ?');
    params.push(errorMessage);
  }

  if (progress !== null) {
    updates.push('progress = ?');
    params.push(JSON.stringify(progress));
  }

  if (status === 'running') {
    updates.push('started_at = CURRENT_TIMESTAMP');
  } else if (['completed', 'failed', 'canceled'].includes(status)) {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }

  params.push(executionId);

  await db.query(`
    UPDATE workflow_executions
    SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, params);
}

/**
 * 更新执行进度
 */
async function updateExecutionProgress(executionId, progress) {
  await db.query(`
    UPDATE workflow_executions
    SET progress = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [JSON.stringify(progress), executionId]);
}

/**
 * 取消执行
 */
async function cancelExecution(executionId) {
  const context = activeExecutions.get(executionId);
  if (context) {
    context.status = 'canceled';
  }

  await updateExecutionStatus(executionId, 'canceled');

  // 取消正在运行的任务
  const [nodeExecutions] = await db.query(`
    SELECT task_id FROM workflow_node_executions
    WHERE execution_id = ? AND status = 'running' AND task_id IS NOT NULL
  `, [executionId]);

  for (const nodeExec of nodeExecutions) {
    if (nodeExec.task_id) {
      try {
        // 这里需要调用相应的取消任务API
        // await api.cancelTask(nodeExec.task_id);
      } catch (error) {
        logger.error(`取消任务失败 [${nodeExec.task_id}]:`, error);
      }
    }
  }
}

/**
 * 暂停执行
 */
async function pauseExecution(executionId, userId) {
  const context = activeExecutions.get(executionId);
  if (context) {
    context.status = 'paused';
  }

  await updateExecutionStatus(executionId, 'paused');
}

/**
 * 恢复执行
 */
async function resumeExecution(executionId, userId) {
  const context = activeExecutions.get(executionId);
  if (context) {
    context.status = 'running';
  }

  await updateExecutionStatus(executionId, 'running');

  // 重新启动执行
  // 这里需要实现从暂停点恢复的逻辑
}

module.exports = {
  executeWorkflow,
  cancelExecution,
  pauseExecution,
  resumeExecution
};
