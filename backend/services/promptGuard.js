/**
 * 提示注入隔离（P4-3）：把外部数据交给模型前的包装。
 * 独立成模块，是为了让 toolService（知识检索）和 agentService（工具结果）共用，又不互相引用。
 */

const crypto = require('crypto');

const DEFAULT_UNTRUSTED_LIMIT = 4000;

/**
 * 把外部数据（扫描返回的内容、任务描述、数据库记录、模型生成的文字等）包进定界标签再交给模型。
 * 标签名带每次随机生成的后缀，数据里无法预先写出匹配的结束标签；系统提示里写明标签内是数据、不是指令。
 * 超长的数据截断；控制字符（除换行、制表）去掉。返回字符串。
 */
const wrapUntrusted = (data, source = 'data', { maxLength = DEFAULT_UNTRUSTED_LIMIT } = {}) => {
  let text;
  if (typeof data === 'string') {
    text = data;
  } else {
    try {
      text = JSON.stringify(data);
    } catch (error) {
      text = String(data);
    }
    if (text === undefined) text = String(data);
  }
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

  const limit = Math.max(Number(maxLength) || DEFAULT_UNTRUSTED_LIMIT, 1);
  if (text.length > limit) text = `${text.slice(0, limit)}…（已截断，原长 ${text.length} 个字符）`;

  const label = String(source).replace(/[^\w.-]/g, '_').slice(0, 40) || 'data';
  const tag = `data-${crypto.randomBytes(4).toString('hex')}`;
  // 数据里即便出现同样的标签名，也破坏掉（随机后缀使这几乎不可能，这里是兜底）
  text = text.split(`<${tag}`).join(`<​${tag}`).split(`</${tag}`).join(`</​${tag}`);
  return `<${tag} source="${label}">\n${text}\n</${tag}>`;
};

module.exports = { wrapUntrusted, DEFAULT_UNTRUSTED_LIMIT };
