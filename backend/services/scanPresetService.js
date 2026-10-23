/**
 * 扫描预设：一组“模块 + 端口”，套用时生成 zgrab2 “multiple”（多模块）模式的 INI 配置文件，
 * 登记成用户自己的配置文件，任务表单直接选用——创建任务的流程不变（扫描策略仍在创建任务时检查目标）。
 *
 * 数据：scan_presets（迁移 sql/13-scan-presets.sql）。user_id 为 NULL 的是内置预设（只读）；
 * 用户可以保存自己的预设（每人最多 MAX_PRESETS_PER_USER 个，每个预设最多 MAX_ENTRIES 项）。
 *
 * INI 里的值会被引号包起来，所以校验时拒绝引号、反斜杠和控制字符，避免往配置文件里注入新的段或选项。
 */

const fs = require('fs');
const db = require('../database/db');
const { DIRS, ensureDir, safeJoin } = require('./storageService');
const { SUPPORTED_MODULES, RESERVED_OPTIONS, validatePort } = require('./zgrab2CommandService');

const MAX_ENTRIES = 20;
const MAX_PRESETS_PER_USER = 50;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 255;
const OPTION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
// 值：可见字符，不含引号、反斜杠、控制字符
const INI_VALUE = /^[^"\\\u0000-\u001f\u007f]{1,128}$/;

class PresetError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PresetError';
    this.status = status;
  }
}

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

/** 校验并规范化预设条目，返回 [{ module, port, params }]。 */
const validateEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) throw new PresetError('entries 必须是非空数组');
  if (entries.length > MAX_ENTRIES) throw new PresetError(`一个预设最多 ${MAX_ENTRIES} 项`);

  const seen = new Set();
  return entries.map((entry, index) => {
    const label = `第 ${index + 1} 项`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new PresetError(`${label}格式无效`);
    const { module, params } = entry;
    if (typeof module !== 'string' || !Object.prototype.hasOwnProperty.call(SUPPORTED_MODULES, module)) {
      throw new PresetError(`${label}：不支持的模块 ${String(module).slice(0, 40)}`);
    }
    let port;
    try {
      port = validatePort(entry.port);
    } catch (error) {
      throw new PresetError(`${label}：${error.message}`);
    }
    if (port === undefined) port = SUPPORTED_MODULES[module].defaultPort;

    const key = `${module}:${port}`;
    if (seen.has(key)) throw new PresetError(`${label}：${module} 端口 ${port} 重复`);
    seen.add(key);

    const cleanParams = {};
    if (params !== undefined && params !== null) {
      if (typeof params !== 'object' || Array.isArray(params)) throw new PresetError(`${label}：params 格式无效`);
      for (const [rawKey, rawValue] of Object.entries(params)) {
        const name = String(rawKey).trim().replace(/^-+/, '');
        if (!OPTION_NAME.test(name)) throw new PresetError(`${label}：参数名无效 ${String(rawKey).slice(0, 40)}`);
        if (RESERVED_OPTIONS.has(name.toLowerCase()) || name.toLowerCase() === 'name' || name.toLowerCase() === 'trigger') {
          throw new PresetError(`${label}：参数不允许 ${name}`);
        }
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;
        if (typeof rawValue === 'object') throw new PresetError(`${label}：参数值无效 ${name}`);
        const value = String(rawValue);
        if (!INI_VALUE.test(value)) throw new PresetError(`${label}：参数值无效 ${name}`);
        cleanParams[name] = rawValue;
      }
    }
    return { module, port, params: cleanParams };
  });
};

const validateText = (value, label, max, { required }) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new PresetError(`${label}不能为空`);
    return null;
  }
  if (typeof value !== 'string') throw new PresetError(`${label}必须是字符串`);
  const text = value.trim();
  if (required && !text) throw new PresetError(`${label}不能为空`);
  if (text.length > max) throw new PresetError(`${label}最长 ${max} 个字符`);
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new PresetError(`${label}含有非法字符`);
  return text || null;
};

const iniValue = (value) => (/^(-?\d+|true|false)$/.test(String(value)) ? String(value) : `"${value}"`);

/**
 * 生成 zgrab2 multiple 模式的 INI。每项一个段 [module]，name 作为结果里的标签：
 * 同一个模块只出现一次时用模块名，出现多次（不同端口）时用 module-port。
 */
const buildIni = (entries, title = '') => {
  const count = {};
  for (const entry of entries) count[entry.module] = (count[entry.module] || 0) + 1;
  const lines = [`; 由 ObserV6 扫描预设生成${title ? `：${String(title).replace(/[\r\n]/g, ' ')}` : ''}`];
  for (const entry of entries) {
    const label = count[entry.module] > 1 ? `${entry.module}-${entry.port}` : entry.module;
    lines.push('', `[${entry.module}]`, `name=${iniValue(label)}`, `port=${entry.port}`);
    for (const [key, value] of Object.entries(entry.params || {})) lines.push(`${key}=${iniValue(value)}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseEntries = (text) => {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const present = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  builtin: row.user_id === null || row.user_id === undefined,
  entries: parseEntries(row.entries),
  createdAt: row.created_at
});

/** 内置预设 + 该用户自己的预设（内置在前）。 */
const listPresets = async (userId) => {
  const list = rows(await db.query(
    'SELECT id, user_id, name, description, entries, created_at FROM scan_presets WHERE user_id IS NULL OR user_id = ? ORDER BY (user_id IS NULL) DESC, id',
    [userId]
  ));
  return list.map(present);
};

const loadVisible = async (userId, id) => {
  const presetId = Number(id);
  if (!Number.isInteger(presetId) || presetId < 1) throw new PresetError('预设 ID 无效');
  const [row] = rows(await db.query(
    'SELECT id, user_id, name, description, entries, created_at FROM scan_presets WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
    [presetId, userId]
  ));
  if (!row) throw new PresetError('预设不存在', 404);
  return row;
};

/** 保存用户自己的预设。 */
const createPreset = async (userId, body = {}) => {
  const name = validateText(body.name, '名称', NAME_MAX, { required: true });
  const description = validateText(body.description, '描述', DESCRIPTION_MAX, { required: false });
  const entries = validateEntries(body.entries);

  const [{ n }] = rows(await db.query('SELECT COUNT(*) AS n FROM scan_presets WHERE user_id = ?', [userId]));
  if (Number(n) >= MAX_PRESETS_PER_USER) throw new PresetError(`每人最多保存 ${MAX_PRESETS_PER_USER} 个预设`, 409);
  const [dup] = rows(await db.query('SELECT id FROM scan_presets WHERE name = ? AND (user_id = ? OR user_id IS NULL) LIMIT 1', [name, userId]));
  if (dup) throw new PresetError('已有同名预设', 409);

  const [inserted] = await db.query(
    'INSERT INTO scan_presets (user_id, name, description, entries) VALUES (?, ?, ?, ?)',
    [userId, name, description, JSON.stringify(entries)]
  );
  return { id: inserted.insertId, name, description, builtin: false, entries };
};

/** 删除用户自己的预设；内置预设不能删。 */
const deletePreset = async (userId, id) => {
  const row = await loadVisible(userId, id);
  if (row.user_id === null || row.user_id === undefined) throw new PresetError('内置预设不能删除', 403);
  await db.query('DELETE FROM scan_presets WHERE id = ? AND user_id = ?', [row.id, userId]);
};

/** 套用预设：生成 INI 并登记为该用户的 zgrab2 配置文件。返回 { fileId, fileName, entries }。 */
const applyPreset = async (userId, id) => {
  if (!Number.isInteger(userId)) throw new PresetError('用户ID无效');
  const row = await loadVisible(userId, id);
  const entries = validateEntries(parseEntries(row.entries)); // 手工改过库的脏数据在这里被挡住
  const [tool] = rows(await db.query("SELECT id FROM tools WHERE name = 'zgrab2' LIMIT 1"));
  if (!tool) throw new PresetError('Zgrab2工具未配置', 400);

  const dir = ensureDir(DIRS.zgrab2Configs);
  const fileName = `zgrab2_config_preset${row.id}_${userId}_${Date.now()}.ini`;
  const filePath = safeJoin(dir, fileName);
  fs.writeFileSync(filePath, buildIni(entries, row.name), { encoding: 'utf8', flag: 'wx' });

  let fileId = null;
  try {
    const [inserted] = await db.query(
      `INSERT INTO whitelists (user_id, tool_id, file_name, file_path, description, is_deleted, uploaded_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [userId, tool.id, fileName, filePath, `扫描预设：${row.name}`]
    );
    fileId = (inserted && inserted.insertId) || null;
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }
  return { fileId, fileName, presetId: row.id, name: row.name, entries };
};

module.exports = {
  PresetError, MAX_ENTRIES, MAX_PRESETS_PER_USER,
  validateEntries, buildIni, listPresets, createPreset, deletePreset, applyPreset
};
