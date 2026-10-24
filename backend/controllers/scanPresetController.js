/**
 * 扫描预设接口（挂在 /api/zgrab2/presets 下，登录即可）：
 *   GET    /presets              内置预设 + 自己保存的预设
 *   POST   /presets              保存自己的预设 { name, description?, entries: [{module, port?, params?}] }
 *   DELETE /presets/:id          删除自己的预设（内置预设不能删）
 *   POST   /presets/:id/apply    套用：生成 zgrab2 多模块 INI 配置文件并登记为自己的配置文件
 * 预设只决定“扫什么模块、什么端口”，扫描目标仍在创建任务时由扫描策略检查。
 */

const presets = require('../services/scanPresetService');
const { createModuleLogger } = require('../services/loggerService');
const logger = createModuleLogger('scan-presets');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handleError = (res, label, error) => {
  if (error instanceof presets.PresetError) return fail(res, error.status, error.message);
  logger.error(`${label}失败:`, error.message);
  return fail(res, 500, `${label}失败`);
};

exports.listPresets = async (req, res) => {
  try {
    res.json({ success: true, data: await presets.listPresets(req.user.id) });
  } catch (error) {
    handleError(res, '获取扫描预设', error);
  }
};

exports.createPreset = async (req, res) => {
  try {
    const data = await presets.createPreset(req.user.id, req.body || {});
    res.status(201).json({ success: true, message: '预设已保存', data });
  } catch (error) {
    handleError(res, '保存扫描预设', error);
  }
};

exports.deletePreset = async (req, res) => {
  try {
    await presets.deletePreset(req.user.id, req.params.id);
    res.json({ success: true, message: '预设已删除' });
  } catch (error) {
    handleError(res, '删除扫描预设', error);
  }
};

exports.applyPreset = async (req, res) => {
  try {
    const data = await presets.applyPreset(req.user.id, req.params.id);
    res.json({ success: true, message: '已生成配置文件，可在多模块扫描里选用', data });
  } catch (error) {
    handleError(res, '套用扫描预设', error);
  }
};
