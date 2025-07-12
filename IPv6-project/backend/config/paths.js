// 路径配置文件 - 统一管理所有文件路径
const path = require('path');

// 获取项目根目录
// 在Docker环境中为 /app，在开发环境中为项目根目录
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../');

// 目录配置
const DIRECTORIES = {
  // 项目根目录
  root: PROJECT_ROOT,
  
  // 后端相关目录
  backendLogs: path.join(PROJECT_ROOT, 'backend_logs'),
  uploads: path.join(PROJECT_ROOT, 'uploads'),
  tempFiles: path.join(PROJECT_ROOT, 'temp_files'),
  
  // XMap相关目录
  xmapLogs: path.join(PROJECT_ROOT, 'xmap_log'),
  xmapResults: path.join(PROJECT_ROOT, 'xmap_result'),
  whitelists: path.join(PROJECT_ROOT, 'whitelists'),
  
  // ZGrab2相关目录
  zgrab2Logs: path.join(PROJECT_ROOT, 'zgrab2_logs'),
  zgrab2Results: path.join(PROJECT_ROOT, 'zgrab2_results'),
  zgrab2Inputs: path.join(PROJECT_ROOT, 'zgrab2_inputs'),
  zgrab2Configs: path.join(PROJECT_ROOT, 'zgrab2_configs'),
  
  // 数据库相关目录
  ipv6Addresses: path.join(PROJECT_ROOT, 'IPv6_addresses'),
  
  // JSON分析目录
  jsonanalysis: path.join(PROJECT_ROOT, 'jsonanalysis')
};

// 工具路径配置
const TOOLS = {
  xmap: process.env.XMAP_PATH || 'xmap',
  zgrab2: process.env.ZGRAB2_PATH || path.join(PROJECT_ROOT, '../tools/zgrab2')
};

// 确保所有目录存在
const fs = require('fs');
Object.values(DIRECTORIES).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`创建目录: ${dir}`);
  }
});

module.exports = {
  PROJECT_ROOT,
  DIRECTORIES,
  TOOLS
};
