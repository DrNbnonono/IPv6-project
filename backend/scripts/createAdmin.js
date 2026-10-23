#!/usr/bin/env node
/**
 * 创建（或重置）管理员账号。全新建库后 users 表是空的，用它创建第一个管理员。
 *
 *   node scripts/createAdmin.js <手机号> [用户名]            密码从环境变量 ADMIN_PASSWORD 读取，未设置则交互输入
 *   node scripts/createAdmin.js <手机号> [用户名] --update   账号已存在时：设为管理员并重置密码
 *
 * 密码不接受命令行参数（避免进入 shell 历史和进程列表）。这是 CLI 工具，直接输出到控制台。
 */
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcrypt');

const PHONE_RE = /^[0-9+-]{6,20}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128; // 与 authController 保持一致（bcrypt 只处理前 72 字节）

/** 校验输入，返回错误信息；通过时返回 null。 */
function validateInput({ phone, username, password }) {
  if (!phone || !PHONE_RE.test(phone)) return '手机号格式不正确（6–20 位数字，可含 + 和 -）';
  if (username && username.length > 50) return '用户名不能超过 50 个字符';
  if (!password || password.length < MIN_PASSWORD) return `密码至少 ${MIN_PASSWORD} 位`;
  if (password.length > MAX_PASSWORD) return `密码不能超过 ${MAX_PASSWORD} 位`;
  return null;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      // 只显示问题本身，不回显输入
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const update = argv.includes('--update');
  const [phone, username] = argv.filter((a) => !a.startsWith('--'));
  if (!phone) {
    console.error('用法: node scripts/createAdmin.js <手机号> [用户名] [--update]');
    return 1;
  }

  const password = env.ADMIN_PASSWORD || (process.stdin.isTTY ? await promptHidden('管理员密码: ') : '');
  const problem = validateInput({ phone, username, password });
  if (problem) {
    console.error(problem + (env.ADMIN_PASSWORD ? '' : '（也可通过环境变量 ADMIN_PASSWORD 提供密码）'));
    return 1;
  }

  const db = require('../database/db');
  const hash = await bcrypt.hash(password, parseInt(env.BCRYPT_ROUNDS, 10) || 10);
  const [rows] = await db.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);

  if (rows.length > 0) {
    if (!update) {
      console.error('该手机号已存在；如需设为管理员并重置密码，请加 --update');
      await db.end();
      return 1;
    }
    await db.query("UPDATE users SET password_hash = ?, role = 'admin'" + (username ? ', username = ?' : '') + ' WHERE id = ?',
      username ? [hash, username, rows[0].id] : [hash, rows[0].id]);
    console.log(`已更新管理员账号（用户ID ${rows[0].id}）`);
  } else {
    const [result] = await db.query(
      "INSERT INTO users (phone, username, password_hash, role) VALUES (?, ?, ?, 'admin')",
      [phone, username || null, hash]
    );
    console.log(`已创建管理员账号（用户ID ${result.insertId}）`);
  }
  await db.end();
  return 0;
}

module.exports = { validateInput, main };

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  require('dotenv').config();
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('失败:', err.message);
    process.exit(1);
  });
}
