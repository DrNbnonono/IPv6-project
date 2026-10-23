/**
 * 存储服务
 * 统一管理项目内的数据目录、路径安全校验，以及由程序生成的目标文件。
 * 目录根由 PROJECT_ROOT 决定（默认仓库根目录，与 xmapController 原有的相对写法一致）。
 * 模块加载时不创建目录；需要时调用 ensureDirs()/ensureDir()。
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || path.join(__dirname, '../..'));

// 旧版本把绝对路径写进了数据库（如 whitelists.file_path、tasks.output_path），
// 换部署目录后需要把这些前缀改写到当前 PROJECT_ROOT
const LEGACY_ROOTS = ['/home/ipv6/IPv6-project'];

const DIRS = {
  xmapLog: path.join(PROJECT_ROOT, 'xmap_log'),
  xmapResult: path.join(PROJECT_ROOT, 'xmap_result'),
  whitelists: path.join(PROJECT_ROOT, 'whitelists'),
  zgrab2Results: path.join(PROJECT_ROOT, 'zgrab2_results'),
  zgrab2Logs: path.join(PROJECT_ROOT, 'zgrab2_logs'),
  zgrab2Inputs: path.join(PROJECT_ROOT, 'zgrab2_inputs'),
  zgrab2Configs: path.join(PROJECT_ROOT, 'zgrab2_configs'),
  apdInputs: path.join(PROJECT_ROOT, 'apd_inputs'),
  apdResults: path.join(PROJECT_ROOT, 'apd_results'),
  uploads: path.join(PROJECT_ROOT, 'uploads'),
  ipv6Addresses: path.join(PROJECT_ROOT, 'IPv6_addresses'),
  jsonanalysis: path.join(PROJECT_ROOT, 'jsonanalysis'),
  jsonanalysisTemp: path.join(PROJECT_ROOT, 'jsonanalysis', 'temp'),
  reports: path.join(PROJECT_ROOT, 'reports'),
  backendLogs: path.join(PROJECT_ROOT, 'backend_logs'),
  docsXmap: path.join(PROJECT_ROOT, 'docs', 'xmap'),
  docsZgrab2: path.join(PROJECT_ROOT, 'docs', 'zgrab2')
};

// 文档目录是随仓库提供的内容，不由程序创建
const NON_CREATED_DIRS = new Set(['docsXmap', 'docsZgrab2']);

// 一次最多生成多少个目标
const MAX_TARGETS = 100000;
// 单个目标：IPv4/IPv6 地址或网段
const TARGET_PATTERN = /^[0-9A-Fa-f:.]{2,45}(\/\d{1,3})?$/;

const isInside = (baseDir, target) => {
  const relative = path.relative(path.resolve(baseDir), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * 在 baseDir 下拼接一个"文件名"。拒绝空值、绝对路径、路径分隔符、.. 与空字节。
 */
const safeJoin = (baseDir, name) => {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new Error('文件名无效');
  }
  if (name.includes('\0') || name.includes('/') || name.includes('\\') || path.isAbsolute(name)) {
    throw new Error('文件名不能包含路径');
  }
  if (name === '.' || name === '..' || name.split(path.sep).includes('..')) {
    throw new Error('文件名无效');
  }
  const resolved = path.resolve(baseDir, name);
  if (!isInside(baseDir, resolved) || resolved === path.resolve(baseDir)) {
    throw new Error('文件路径超出允许范围');
  }
  return resolved;
};

/**
 * 解析数据库中保存的路径：
 *  - 相对路径按 PROJECT_ROOT 解析
 *  - 旧部署目录前缀改写到当前 PROJECT_ROOT
 *  - 结果必须位于 baseDir 内，否则抛错
 */
const resolveStoredPath = (storedPath, baseDir = PROJECT_ROOT) => {
  if (typeof storedPath !== 'string' || storedPath.length === 0 || storedPath.includes('\0')) {
    throw new Error('路径无效');
  }

  let candidate = storedPath;
  if (path.isAbsolute(candidate)) {
    for (const legacyRoot of LEGACY_ROOTS) {
      if (legacyRoot !== PROJECT_ROOT && isInside(legacyRoot, candidate)) {
        candidate = path.join(PROJECT_ROOT, path.relative(legacyRoot, candidate));
        break;
      }
    }
  }

  const resolved = path.resolve(PROJECT_ROOT, candidate);
  if (!isInside(baseDir, resolved)) {
    throw new Error('文件路径超出允许范围');
  }
  return resolved;
};

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * 创建数据目录。不传参数时创建全部可写目录，也可只传目录键名。
 */
const ensureDirs = (names) => {
  const keys = names || Object.keys(DIRS).filter((key) => !NON_CREATED_DIRS.has(key));
  keys.forEach((key) => {
    if (!DIRS[key]) {
      throw new Error(`未知目录: ${key}`);
    }
    ensureDir(DIRS[key]);
  });
  return keys.map((key) => DIRS[key]);
};

const normalizeTargets = (targets) => {
  let list = targets;
  if (typeof list === 'string') {
    list = list.split(/[\s,;]+/);
  }
  if (!Array.isArray(list)) {
    throw new Error('目标列表格式无效');
  }

  const cleaned = [];
  const seen = new Set();
  for (const item of list) {
    const value = String(item).trim();
    if (!value) continue;
    if (!TARGET_PATTERN.test(value)) {
      throw new Error(`目标格式无效: ${value.slice(0, 64)}`);
    }
    if (!seen.has(value)) {
      seen.add(value);
      cleaned.push(value);
    }
  }

  if (cleaned.length === 0) {
    throw new Error('目标列表为空');
  }
  if (cleaned.length > MAX_TARGETS) {
    throw new Error(`目标数量超过上限 ${MAX_TARGETS}`);
  }
  return cleaned;
};

const TOOL_TARGET_DIRS = {
  zgrab2: { dir: 'zgrab2Inputs', prefix: 'zgrab2_input_' },
  xmap: { dir: 'whitelists', prefix: 'whitelist_' }
};

/**
 * 把一组目标写成"一行一个地址"的文件，并登记到 whitelists 表，使其与手动上传的文件一样可被任务引用。
 * @returns {Promise<{fileName: string, filePath: string, count: number}>}
 */
const saveTargetsFile = async (userId, targets, tool, description = 'Agent 生成的目标列表') => {
  const spec = TOOL_TARGET_DIRS[tool];
  if (!spec) {
    throw new Error(`不支持的工具: ${tool}`);
  }
  if (!Number.isInteger(userId)) {
    throw new Error('用户ID无效');
  }

  const list = normalizeTargets(targets);
  const dir = ensureDir(DIRS[spec.dir]);
  const fileName = `${spec.prefix}${userId}_${Date.now()}.txt`;
  const filePath = safeJoin(dir, fileName);

  // 延迟加载：避免 loggerService → storageService → db → loggerService 的循环依赖，
  // 也让只用到路径工具的代码（含单元测试）不必连接数据库
  const db = require('../database/db');
  const [tools] = await db.query('SELECT id FROM tools WHERE name = ? LIMIT 1', [tool]);
  if (tools.length === 0) {
    throw new Error(`工具未配置: ${tool}`);
  }

  fs.writeFileSync(filePath, `${list.join('\n')}\n`, { encoding: 'utf8', flag: 'wx' });

  let fileId = null;
  try {
    const [inserted] = await db.query(
      `INSERT INTO whitelists
       (user_id, tool_id, file_name, file_path, description, is_deleted, uploaded_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [userId, tools[0].id, fileName, filePath, description]
    );
    fileId = (inserted && inserted.insertId) || null;
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }

  return { fileId, fileName, filePath, count: list.length };
};

module.exports = {
  PROJECT_ROOT,
  DIRS,
  MAX_TARGETS,
  isInside,
  safeJoin,
  resolveStoredPath,
  ensureDir,
  ensureDirs,
  normalizeTargets,
  saveTargetsFile
};
