#!/usr/bin/env node
/**
 * 把知识文档索引进 knowledge_chunks（P4-5）。
 *
 *   node scripts/indexKnowledge.js            索引默认目录（backend/knowledge、docs/xmap、docs/zgrab2、KNOWLEDGE_EXTRA_DIRS）
 *   node scripts/indexKnowledge.js 目录...    只索引指定目录
 *   node scripts/indexKnowledge.js --dry-run  只列出会处理的文件和块数，不写数据库
 *
 * 需要先执行迁移 14（node scripts/migrate.js）。内容没变的文档会跳过，可以反复运行；文档更新后重新运行即可。
 * 这是 CLI 工具，直接输出到控制台。退出码：0 成功；1 失败（含迁移未执行）。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const knowledge = require('../services/knowledgeService');

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dirs = args.filter((arg) => !arg.startsWith('--')).map((dir) => path.resolve(dir));
  const targets = dirs.length > 0 ? dirs : knowledge.defaultDirs();

  if (dryRun) {
    let total = 0;
    for (const dir of targets) {
      for (const file of knowledge.listDocuments(dir)) {
        const text = require('fs').readFileSync(file, 'utf8');
        const count = knowledge.chunkMarkdown(text).length;
        total += count;
        console.log(`${knowledge.sourceOf(file)}  ${count} 块`);
      }
    }
    console.log(`共 ${total} 块（dry-run，未写入数据库）`);
    return 0;
  }

  try {
    const stats = await knowledge.indexDocuments(targets);
    console.log(`文档 ${stats.files} 个：新建/更新 ${stats.indexed}，未变化 ${stats.unchanged}，清理 ${stats.removed}；共 ${stats.chunks} 块`);
    return 0;
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) {
      console.error('knowledge_chunks 表不存在，请先执行迁移：node scripts/migrate.js');
    } else {
      console.error(`索引失败: ${error.message}`);
    }
    return 1;
  }
};

main().then((code) => {
  const db = require('../database/db');
  Promise.resolve(db.end && db.end()).catch(() => {}).finally(() => process.exit(code));
});
