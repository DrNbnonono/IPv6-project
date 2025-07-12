const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const { createLogger, transports } = require('winston');
const { DIRECTORIES } = require('../config/paths');

// 创建日志记录器
const logger = createLogger({
  level: 'info',
  format: require('winston').format.json(),
  transports: [
    new transports.File({ filename: path.join(DIRECTORIES.backendLogs, 'jsonanalysis.log') })
  ]
});

// 确保jsonanalysis目录存在
const JSONANALYSIS_DIR = DIRECTORIES.jsonanalysis;
const TEMP_DIR = path.join(DIRECTORIES.jsonanalysis, 'temp');

if (!fs.existsSync(JSONANALYSIS_DIR)) {
  fs.mkdirSync(JSONANALYSIS_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 临时文件管理 - 存储用户会话的临时文件
const tempFiles = new Map(); // sessionId -> { filePath, createdAt, data }

// 解析JSON文件内容
exports.parseJsonFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    console.log('解析JSON文件请求:', { fileId, userId });

    let filePath = null;
    let fileName = null;

    // 首先尝试从上传文件表查找
    const [uploadFiles] = await db.query(`
      SELECT w.file_path, w.file_name
      FROM whitelists w
      WHERE w.id = ? AND w.user_id = ? AND w.is_deleted = 0
    `, [fileId, userId]);

    if (uploadFiles.length > 0) {
      const file = uploadFiles[0];
      filePath = file.file_path;
      fileName = file.file_name;
      console.log('找到上传文件:', { filePath, fileName });
    } else {
      // 如果不是上传文件，尝试从任务表查找
      const [taskFiles] = await db.query(`
        SELECT t.output_path, t.description, t.task_type
        FROM tasks t
        WHERE t.id = ? AND t.user_id = ?
      `, [fileId, userId]);

      if (taskFiles.length === 0) {
        console.log('文件未找到:', { fileId, userId });
        return res.status(404).json({
          success: false,
          message: '文件不存在或无权访问'
        });
      }

      const task = taskFiles[0];
      filePath = task.output_path;
      fileName = `${task.task_type}_task_${fileId}_result`;
      console.log('找到任务文件:', { filePath, fileName });
    }

    // 检查文件是否存在
    if (!filePath || !fs.existsSync(filePath)) {
      console.log('文件不存在:', filePath);
      return res.status(404).json({
        success: false,
        message: '文件不存在或已被删除'
      });
    }

    console.log('准备读取文件:', filePath);

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('文件内容长度:', content.length);

    // 解析JSON - 支持标准JSON和JSONL格式
    let jsonData;
    try {
      // 首先尝试解析为标准JSON
      jsonData = JSON.parse(content);
      console.log('标准JSON解析成功');
    } catch (parseError) {
      console.log('标准JSON解析失败，尝试JSONL格式:', parseError.message);

      // 如果标准JSON解析失败，尝试解析为JSONL格式
      try {
        const lines = content.trim().split('\n').filter(line => line.trim());
        jsonData = [];

        for (let i = 0; i < lines.length; i++) {
          try {
            const lineData = JSON.parse(lines[i]);
            jsonData.push(lineData);
          } catch (lineError) {
            console.log(`第${i + 1}行JSON解析失败:`, lineError.message);
            // 跳过无效行，继续处理其他行
          }
        }

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: '文件不包含有效的JSON或JSONL格式数据'
          });
        }

        console.log(`JSONL解析成功，共解析${jsonData.length}行数据`);
      } catch (jsonlError) {
        console.log('JSONL解析也失败:', jsonlError.message);
        return res.status(400).json({
          success: false,
          message: '文件不是有效的JSON或JSONL格式: ' + parseError.message
        });
      }
    }

    // 分析JSON结构
    const analysis = analyzeJsonStructure(jsonData);
    console.log('结构分析完成:', analysis);

    // 生成会话ID用于临时文件管理
    const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // 将数据保存到临时文件
    const tempFilePath = path.join(TEMP_DIR, `${sessionId}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2), 'utf8');

    // 存储临时文件信息
    tempFiles.set(sessionId, {
      filePath: tempFilePath,
      createdAt: Date.now(),
      originalFileName: fileName,
      originalSize: content.length,
      data: jsonData
    });

    // 清理超过1小时的临时文件
    cleanupTempFiles();

    res.json({
      success: true,
      data: {
        sessionId: sessionId,
        fileName: fileName,
        analysis: analysis,
        size: content.length,
        dataPreview: getDataPreview(jsonData), // 只返回预览数据
        totalRecords: Array.isArray(jsonData) ? jsonData.length : 1
      }
    });

  } catch (error) {
    logger.error('解析JSON文件失败:', error);
    console.error('解析JSON文件详细错误:', error);
    res.status(500).json({
      success: false,
      message: '解析JSON文件失败: ' + error.message
    });
  }
};

// 解析JSON文本内容
exports.parseJsonText = async (req, res) => {
  try {
    const { jsonText } = req.body;

    if (!jsonText) {
      return res.status(400).json({
        success: false,
        message: 'JSON文本不能为空'
      });
    }

    // 解析JSON - 支持标准JSON和JSONL格式
    let jsonData;
    try {
      // 首先尝试解析为标准JSON
      jsonData = JSON.parse(jsonText);
    } catch (parseError) {
      // 如果标准JSON解析失败，尝试解析为JSONL格式
      try {
        const lines = jsonText.trim().split('\n').filter(line => line.trim());
        jsonData = [];

        for (let i = 0; i < lines.length; i++) {
          try {
            const lineData = JSON.parse(lines[i]);
            jsonData.push(lineData);
          } catch (lineError) {
            // 跳过无效行，继续处理其他行
          }
        }

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: '文本不包含有效的JSON或JSONL格式数据'
          });
        }
      } catch (jsonlError) {
        return res.status(400).json({
          success: false,
          message: '不是有效的JSON或JSONL格式: ' + parseError.message
        });
      }
    }

    // 分析JSON结构
    const analysis = analyzeJsonStructure(jsonData);

    res.json({
      success: true,
      data: {
        content: jsonData,
        analysis: analysis,
        size: jsonText.length
      }
    });

  } catch (error) {
    logger.error('解析JSON文本失败:', error);
    console.error('解析JSON文本详细错误:', error);
    res.status(500).json({
      success: false,
      message: '解析JSON文本失败: ' + error.message
    });
  }
};

// 提取字段
exports.extractFields = async (req, res) => {
  try {
    const { jsonData, fieldPaths, useRegex } = req.body;

    if (!jsonData || !fieldPaths || !Array.isArray(fieldPaths)) {
      return res.status(400).json({
        success: false,
        message: '参数不完整'
      });
    }

    const extractedData = extractFieldsFromJson(jsonData, fieldPaths, useRegex);

    res.json({
      success: true,
      data: extractedData
    });

  } catch (error) {
    logger.error('提取字段失败:', error);
    console.error('提取字段详细错误:', error);
    res.status(500).json({
      success: false,
      message: '提取字段失败: ' + error.message
    });
  }
};

// 搜索和过滤
exports.searchAndFilter = async (req, res) => {
  try {
    const { jsonData, searchQuery, filterType, filterValue } = req.body;

    if (!jsonData) {
      return res.status(400).json({
        success: false,
        message: 'JSON数据不能为空'
      });
    }

    const filteredData = searchAndFilterJson(jsonData, searchQuery, filterType, filterValue);

    res.json({
      success: true,
      data: filteredData
    });

  } catch (error) {
    logger.error('搜索过滤失败:', error);
    console.error('搜索过滤详细错误:', error);
    res.status(500).json({
      success: false,
      message: '搜索过滤失败: ' + error.message
    });
  }
};

// 获取会话数据（用于字段提取和搜索）
exports.getSessionData = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // 验证会话ID格式
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    res.json({
      success: true,
      data: {
        fileName: fileInfo.originalFileName,
        content: fileInfo.data,
        size: fileInfo.originalSize
      }
    });

  } catch (error) {
    logger.error('获取会话数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取会话数据失败: ' + error.message
    });
  }
};

// 基于会话的字段提取
exports.extractFieldsFromSession = async (req, res) => {
  try {
    const { sessionId, fieldPaths, useRegex } = req.body;
    const userId = req.user.id;

    // 验证会话ID
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    if (!fieldPaths || !Array.isArray(fieldPaths)) {
      return res.status(400).json({
        success: false,
        message: '参数不完整'
      });
    }

    const extractedData = extractFieldsFromJson(fileInfo.data, fieldPaths, useRegex);

    res.json({
      success: true,
      data: extractedData
    });

  } catch (error) {
    logger.error('基于会话的字段提取失败:', error);
    res.status(500).json({
      success: false,
      message: '字段提取失败: ' + error.message
    });
  }
};

// 基于会话的搜索过滤
exports.searchFilterFromSession = async (req, res) => {
  try {
    const { sessionId, searchQuery, filterType, filterValue } = req.body;
    const userId = req.user.id;

    // 验证会话ID
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    const filteredData = searchAndFilterJson(fileInfo.data, searchQuery, filterType, filterValue);

    res.json({
      success: true,
      data: filteredData
    });

  } catch (error) {
    logger.error('基于会话的搜索过滤失败:', error);
    res.status(500).json({
      success: false,
      message: '搜索过滤失败: ' + error.message
    });
  }
};

// 通用的数据过滤功能
exports.filterFromSession = async (req, res) => {
  try {
    const { sessionId, filterCriteria } = req.body;
    const userId = req.user.id;

    // 验证会话ID
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    const filterResults = filterJsonData(fileInfo.data, filterCriteria);

    res.json({
      success: true,
      data: filterResults
    });

  } catch (error) {
    logger.error('数据过滤失败:', error);
    res.status(500).json({
      success: false,
      message: '数据过滤失败: ' + error.message
    });
  }
};

// 专门针对xmap结果的分析和提取
exports.extractXmapResults = async (req, res) => {
  try {
    const { sessionId, filterCriteria } = req.body;
    const userId = req.user.id;

    // 验证会话ID
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    const extractedResults = extractXmapData(fileInfo.data, filterCriteria);

    res.json({
      success: true,
      data: extractedResults
    });

  } catch (error) {
    logger.error('XMap结果提取失败:', error);
    res.status(500).json({
      success: false,
      message: 'XMap结果提取失败: ' + error.message
    });
  }
};

// 专门针对zgrab2结果的IPv6地址提取
exports.extractZgrab2Results = async (req, res) => {
  try {
    const { sessionId, filterCriteria } = req.body;
    const userId = req.user.id;

    // 验证会话ID
    if (!sessionId || !sessionId.startsWith(`${userId}_`)) {
      return res.status(403).json({
        success: false,
        message: '无效的会话ID'
      });
    }

    const fileInfo = tempFiles.get(sessionId);
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: '会话已过期或不存在'
      });
    }

    const extractedResults = extractZgrab2Data(fileInfo.data, filterCriteria);

    res.json({
      success: true,
      data: extractedResults
    });

  } catch (error) {
    logger.error('Zgrab2结果提取失败:', error);
    res.status(500).json({
      success: false,
      message: 'Zgrab2结果提取失败: ' + error.message
    });
  }
};

// 保存处理后的JSON文件
exports.saveProcessedJson = async (req, res) => {
  try {
    const { jsonData, fileName, description, format = 'json' } = req.body;
    const userId = req.user.id;

    if (!jsonData || !fileName) {
      return res.status(400).json({
        success: false,
        message: '参数不完整'
      });
    }

    // 生成文件名
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    // 根据格式确定文件扩展名和内容
    let fileExtension, fileContent, fullFileName;

    if (format === 'txt' && Array.isArray(jsonData)) {
      // 如果是txt格式且数据是数组，每行一个元素
      fileExtension = 'txt';
      fileContent = jsonData.join('\n');
    } else if (format === 'txt' && typeof jsonData === 'string') {
      // 如果是txt格式且数据是字符串
      fileExtension = 'txt';
      fileContent = jsonData;
    } else {
      // 默认JSON格式
      fileExtension = 'json';
      fileContent = JSON.stringify(jsonData, null, 2);
    }

    fullFileName = `${safeFileName}_${timestamp}.${fileExtension}`;
    const filePath = path.join(JSONANALYSIS_DIR, fullFileName);

    // 保存文件
    fs.writeFileSync(filePath, fileContent, 'utf8');

    // 获取jsonanalysis工具ID
    const [tools] = await db.query('SELECT id FROM tools WHERE name = ?', ['jsonanalysis']);
    let toolId;

    if (tools.length === 0) {
      // 如果工具不存在，创建它
      const [result] = await db.query(
        'INSERT INTO tools (name, description) VALUES (?, ?)',
        ['jsonanalysis', 'JSON文件分析工具']
      );
      toolId = result.insertId;
    } else {
      toolId = tools[0].id;
    }

    // 保存到数据库
    const [result] = await db.query(`
      INSERT INTO whitelists (user_id, tool_id, file_name, file_path, description, uploaded_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [userId, toolId, fullFileName, filePath, description || '处理后的JSON文件']);

    res.json({
      success: true,
      data: {
        fileId: result.insertId,
        fileName: fullFileName,
        filePath: filePath
      }
    });

  } catch (error) {
    logger.error('保存JSON文件失败:', error);
    console.error('保存JSON文件详细错误:', error);
    res.status(500).json({
      success: false,
      message: '保存JSON文件失败: ' + error.message
    });
  }
};

// 分析JSON结构的辅助函数
function analyzeJsonStructure(data, path = '', depth = 0) {
  const analysis = {
    totalFields: 0,
    maxDepth: depth,
    typeDistribution: {},
    fieldPaths: [],
    structure: {}
  };

  function traverse(obj, currentPath, currentDepth) {
    analysis.maxDepth = Math.max(analysis.maxDepth, currentDepth);

    if (Array.isArray(obj)) {
      analysis.totalFields++;
      analysis.fieldPaths.push(currentPath);

      const type = 'array';
      analysis.typeDistribution[type] = (analysis.typeDistribution[type] || 0) + 1;

      if (obj.length > 0) {
        traverse(obj[0], `${currentPath}[0]`, currentDepth + 1);
      }
    } else if (obj !== null && typeof obj === 'object') {
      for (const key in obj) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        analysis.totalFields++;
        analysis.fieldPaths.push(newPath);

        const value = obj[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        analysis.typeDistribution[type] = (analysis.typeDistribution[type] || 0) + 1;

        if (typeof value === 'object' && value !== null) {
          traverse(value, newPath, currentDepth + 1);
        }
      }
    }
  }

  traverse(data, path, depth);
  return analysis;
}

// 提取字段的辅助函数
function extractFieldsFromJson(data, fieldPaths, useRegex = false) {
  const extracted = [];

  function extractFromObject(obj, basePath = '') {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        extractFromObject(item, `${basePath}[${index}]`);
      });
    } else if (obj !== null && typeof obj === 'object') {
      for (const key in obj) {
        const currentPath = basePath ? `${basePath}.${key}` : key;
        const value = obj[key];

        // 检查是否匹配字段路径
        const matches = fieldPaths.some(fieldPath => {
          if (useRegex) {
            try {
              const regex = new RegExp(fieldPath);
              return regex.test(currentPath) || regex.test(key);
            } catch (e) {
              return currentPath === fieldPath;
            }
          } else {
            return currentPath === fieldPath || currentPath.endsWith(`.${fieldPath}`) || key === fieldPath;
          }
        });

        if (matches) {
          extracted.push({
            path: currentPath,
            key: key,
            value: value,
            type: Array.isArray(value) ? 'array' : typeof value
          });
        }

        if (typeof value === 'object' && value !== null) {
          extractFromObject(value, currentPath);
        }
      }
    }
  }

  extractFromObject(data);
  return extracted;
}

// 搜索和过滤的辅助函数
function searchAndFilterJson(data, searchQuery, filterType, filterValue) {
  const results = [];

  function searchInObject(obj, basePath = '') {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        searchInObject(item, `${basePath}[${index}]`);
      });
    } else if (obj !== null && typeof obj === 'object') {
      for (const key in obj) {
        const currentPath = basePath ? `${basePath}.${key}` : key;
        const value = obj[key];

        // 搜索匹配
        let matchesSearch = true;
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          matchesSearch = key.toLowerCase().includes(searchLower) ||
                         (typeof value === 'string' && value.toLowerCase().includes(searchLower));
        }

        // 类型过滤
        let matchesFilter = true;
        if (filterType) {
          const valueType = Array.isArray(value) ? 'array' : typeof value;
          matchesFilter = valueType === filterType;
        }

        // 值范围过滤（仅对数值）
        if (filterValue && typeof value === 'number') {
          const [min, max] = filterValue.split('-').map(Number);
          if (!isNaN(min) && !isNaN(max)) {
            matchesFilter = matchesFilter && value >= min && value <= max;
          }
        }

        if (matchesSearch && matchesFilter) {
          results.push({
            path: currentPath,
            key: key,
            value: value,
            type: Array.isArray(value) ? 'array' : typeof value
          });
        }

        if (typeof value === 'object' && value !== null) {
          searchInObject(value, currentPath);
        }
      }
    }
  }

  searchInObject(data);
  return results;
}

// 专门用于提取xmap扫描结果的函数
function extractXmapData(data, filterCriteria = {}) {
  const results = {
    summary: {
      total: 0,
      successful: 0,
      failed: 0,
      uniqueAddresses: 0,
      responseTypes: {}
    },
    successfulResults: [],
    failedResults: [],
    filteredResults: [],
    uniqueAddresses: new Set(),
    uniqueAddressList: []
  };

  if (!Array.isArray(data)) {
    return results;
  }

  data.forEach((record, index) => {
    results.summary.total++;

    // 基本字段检查
    const success = record.success === 1 || record.success === '1';
    const responseClass = record.clas || 'unknown';
    const hlim = parseInt(record.hlim) || 0;
    const outersaddr = record.outersaddr;
    const saddr = record.saddr;

    // 统计响应类型
    results.summary.responseTypes[responseClass] = (results.summary.responseTypes[responseClass] || 0) + 1;

    // 统计成功/失败
    if (success) {
      results.summary.successful++;
      results.successfulResults.push(record);
    } else {
      results.summary.failed++;
      results.failedResults.push(record);
    }

    // 统计唯一地址
    if (outersaddr) {
      results.uniqueAddresses.add(outersaddr);
    }
    if (saddr && saddr !== outersaddr) {
      results.uniqueAddresses.add(saddr);
    }

    // 应用过滤条件
    let includeRecord = true;

    // 只显示成功响应
    if (filterCriteria.onlySuccessful && !success) {
      includeRecord = false;
    }

    // 响应类型过滤
    if (filterCriteria.responseClass && responseClass !== filterCriteria.responseClass) {
      includeRecord = false;
    }

    // TTL范围过滤
    if (filterCriteria.hlimMin && hlim < filterCriteria.hlimMin) {
      includeRecord = false;
    }
    if (filterCriteria.hlimMax && hlim > filterCriteria.hlimMax) {
      includeRecord = false;
    }

    // 排除重复响应
    if (filterCriteria.excludeRepeats && record.repeat && record.repeat > 0) {
      includeRecord = false;
    }

    if (includeRecord) {
      results.filteredResults.push({
        ...record,
        index: index,
        isSuccess: success,
        responseType: responseClass
      });
    }
  });

  // 转换Set为数组并计算唯一地址数
  results.summary.uniqueAddresses = results.uniqueAddresses.size;
  results.uniqueAddressList = Array.from(results.uniqueAddresses);

  // 根据提取类型返回不同的数据
  if (filterCriteria.extractType === 'outersaddr') {
    // 提取所有成功响应的outersaddr字段，用于ZGrab2扫描
    const outersaddrList = results.successfulResults
      .map(record => record.outersaddr)
      .filter(addr => addr && addr.trim() !== '')
      .filter((addr, index, arr) => arr.indexOf(addr) === index); // 去重

    return {
      ...results,
      extractedData: outersaddrList,
      extractType: 'outersaddr',
      description: `提取了 ${outersaddrList.length} 个唯一的IPv6地址（outersaddr字段）`
    };
  } else if (filterCriteria.extractType === 'successful_addresses') {
    // 提取所有成功响应的地址
    return {
      ...results,
      extractedData: results.uniqueAddressList,
      extractType: 'successful_addresses',
      description: `提取了 ${results.uniqueAddressList.length} 个唯一地址`
    };
  } else if (filterCriteria.extractType === 'all_addresses') {
    // 提取所有地址（包括失败的）
    const allAddresses = new Set();
    data.forEach(record => {
      if (record.outersaddr) allAddresses.add(record.outersaddr);
      if (record.saddr) allAddresses.add(record.saddr);
    });

    return {
      ...results,
      extractedData: Array.from(allAddresses),
      extractType: 'all_addresses',
      description: `提取了 ${allAddresses.size} 个地址（包括失败响应）`
    };
  }

  return results;
}

// 通用的JSON数据过滤函数
function filterJsonData(data, filterCriteria = {}) {
  const results = {
    summary: {
      total: 0,
      matched: 0,
      matchRate: 0
    },
    filteredData: []
  };

  if (!data) {
    return results;
  }

  // 如果是数组，遍历每个元素
  if (Array.isArray(data)) {
    results.summary.total = data.length;

    data.forEach((item, index) => {
      if (matchesFilter(item, filterCriteria, `[${index}]`)) {
        results.filteredData.push(item);
        results.summary.matched++;
      }
    });
  } else {
    // 如果是单个对象
    results.summary.total = 1;
    if (matchesFilter(data, filterCriteria, '')) {
      results.filteredData.push(data);
      results.summary.matched = 1;
    }
  }

  // 计算匹配率
  results.summary.matchRate = results.summary.total > 0
    ? Math.round((results.summary.matched / results.summary.total) * 100)
    : 0;

  return results;
}

// 检查单个项目是否匹配过滤条件
function matchesFilter(item, criteria, basePath = '') {
  // 如果没有设置任何过滤条件，返回true
  if (!criteria || Object.keys(criteria).length === 0) {
    return true;
  }

  let matches = true;

  // 搜索关键词过滤
  if (criteria.searchQuery && criteria.searchQuery.trim()) {
    const query = criteria.searchQuery.trim();
    const searchMatches = searchInValue(item, query, criteria.useRegex);
    if (!searchMatches) {
      matches = false;
    }
  }

  // 数据类型过滤
  if (criteria.dataType && criteria.dataType.trim()) {
    const typeMatches = hasValueOfType(item, criteria.dataType);
    if (!typeMatches) {
      matches = false;
    }
  }

  // 数值范围过滤
  if (criteria.dataType === 'number' && (criteria.numberMin !== null || criteria.numberMax !== null)) {
    const numberMatches = hasNumberInRange(item, criteria.numberMin, criteria.numberMax);
    if (!numberMatches) {
      matches = false;
    }
  }

  // 字段路径过滤
  if (criteria.fieldPath && criteria.fieldPath.trim()) {
    const fieldValue = getValueByPath(item, criteria.fieldPath);
    if (fieldValue === undefined) {
      matches = false;
    } else if (criteria.fieldValue && criteria.fieldValue.trim()) {
      // 字段值匹配
      const expectedValue = criteria.fieldValue.trim();
      if (criteria.useRegex) {
        try {
          const regex = new RegExp(expectedValue, 'i');
          if (!regex.test(String(fieldValue))) {
            matches = false;
          }
        } catch {
          if (String(fieldValue) !== expectedValue) {
            matches = false;
          }
        }
      } else {
        if (String(fieldValue) !== expectedValue) {
          matches = false;
        }
      }
    }
  }

  return matches;
}

// 在值中搜索关键词
function searchInValue(value, query, useRegex = false) {
  if (value === null || value === undefined) {
    return false;
  }

  const searchText = JSON.stringify(value).toLowerCase();

  if (useRegex) {
    try {
      const regex = new RegExp(query, 'i');
      return regex.test(searchText);
    } catch {
      return searchText.includes(query.toLowerCase());
    }
  } else {
    return searchText.includes(query.toLowerCase());
  }
}

// 检查是否包含指定类型的值
function hasValueOfType(value, targetType) {
  if (value === null) {
    return targetType === 'null';
  }

  if (Array.isArray(value)) {
    if (targetType === 'array') return true;
    return value.some(item => hasValueOfType(item, targetType));
  }

  if (typeof value === 'object') {
    if (targetType === 'object') return true;
    return Object.values(value).some(item => hasValueOfType(item, targetType));
  }

  return typeof value === targetType;
}

// 检查是否包含指定范围内的数字
function hasNumberInRange(value, min, max) {
  if (typeof value === 'number') {
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(item => hasNumberInRange(item, min, max));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(item => hasNumberInRange(item, min, max));
  }

  return false;
}

// 根据路径获取值
function getValueByPath(obj, path) {
  try {
    return path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
      return current?.[key];
    }, obj);
  } catch {
    return undefined;
  }
}

// 获取数据预览（只返回前几条记录）
function getDataPreview(data, maxRecords = 5) {
  if (Array.isArray(data)) {
    return data.slice(0, maxRecords);
  }
  return data;
}

// 清理超时的临时文件
function cleanupTempFiles() {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1小时

  for (const [sessionId, fileInfo] of tempFiles.entries()) {
    if (now - fileInfo.createdAt > maxAge) {
      try {
        if (fs.existsSync(fileInfo.filePath)) {
          fs.unlinkSync(fileInfo.filePath);
        }
        tempFiles.delete(sessionId);
        console.log(`清理临时文件: ${sessionId}`);
      } catch (error) {
        console.error(`清理临时文件失败: ${sessionId}`, error);
      }
    }
  }
}

// 定期清理临时文件（每30分钟执行一次）
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// 专门用于提取zgrab2扫描结果的函数
function extractZgrab2Data(data, filterCriteria = {}) {
  const results = {
    summary: {
      total: 0,
      successful: 0,
      failed: 0,
      protocols: {}
    },
    successfulIPs: [],
    failedIPs: [],
    detailedResults: []
  };

  if (!Array.isArray(data)) {
    return results;
  }

  data.forEach((record, index) => {
    results.summary.total++;

    if (!record.ip) {
      return;
    }

    const ip = record.ip;
    const recordData = record.data || {};

    // 检查各种协议的结果
    let hasSuccess = false;
    let hasError = false;
    const protocols = [];

    // 检查HTTP协议
    if (recordData.http) {
      protocols.push('http');
      results.summary.protocols.http = (results.summary.protocols.http || 0) + 1;

      if (recordData.http.status === 'success') {
        hasSuccess = true;
      } else {
        hasError = true;
      }
    }

    // 检查HTTPS协议
    if (recordData.https) {
      protocols.push('https');
      results.summary.protocols.https = (results.summary.protocols.https || 0) + 1;

      if (recordData.https.status === 'success') {
        hasSuccess = true;
      } else {
        hasError = true;
      }
    }

    // 检查SSH协议
    if (recordData.ssh) {
      protocols.push('ssh');
      results.summary.protocols.ssh = (results.summary.protocols.ssh || 0) + 1;

      if (recordData.ssh.status === 'success') {
        hasSuccess = true;
      } else {
        hasError = true;
      }
    }

    // 检查其他协议
    Object.keys(recordData).forEach(protocol => {
      if (!['http', 'https', 'ssh'].includes(protocol) && recordData[protocol]) {
        protocols.push(protocol);
        results.summary.protocols[protocol] = (results.summary.protocols[protocol] || 0) + 1;

        if (recordData[protocol].status === 'success') {
          hasSuccess = true;
        } else {
          hasError = true;
        }
      }
    });

    // 应用过滤条件
    let includeRecord = true;

    if (filterCriteria.onlySuccessful && !hasSuccess) {
      includeRecord = false;
    }

    if (filterCriteria.protocol && !protocols.includes(filterCriteria.protocol)) {
      includeRecord = false;
    }

    if (filterCriteria.statusCode && recordData.http && recordData.http.result &&
        recordData.http.result.response &&
        recordData.http.result.response.status_code !== filterCriteria.statusCode) {
      includeRecord = false;
    }

    if (includeRecord) {
      const resultRecord = {
        index: index,
        ip: ip,
        protocols: protocols,
        hasSuccess: hasSuccess,
        hasError: hasError,
        timestamp: record.timestamp || null,
        details: {}
      };

      // 添加协议详细信息
      protocols.forEach(protocol => {
        if (recordData[protocol]) {
          resultRecord.details[protocol] = {
            status: recordData[protocol].status,
            error: recordData[protocol].error || null
          };

          // 对于HTTP/HTTPS，添加更多详细信息
          if ((protocol === 'http' || protocol === 'https') &&
              recordData[protocol].result &&
              recordData[protocol].result.response) {
            const response = recordData[protocol].result.response;
            resultRecord.details[protocol].statusCode = response.status_code;
            resultRecord.details[protocol].statusLine = response.status_line;
            resultRecord.details[protocol].server = response.headers?.server?.[0] || null;
            resultRecord.details[protocol].contentType = response.headers?.content_type?.[0] || null;
          }
        }
      });

      results.detailedResults.push(resultRecord);

      if (hasSuccess) {
        results.summary.successful++;
        if (!results.successfulIPs.includes(ip)) {
          results.successfulIPs.push(ip);
        }
      }

      if (hasError && !hasSuccess) {
        results.summary.failed++;
        if (!results.failedIPs.includes(ip)) {
          results.failedIPs.push(ip);
        }
      }
    }
  });

  return results;
}