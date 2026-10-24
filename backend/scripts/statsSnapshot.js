#!/usr/bin/env node
/**
 * 手动写一份统计快照（P5-1）。
 *
 *   node scripts/statsSnapshot.js              写今天的快照
 *   node scripts/statsSnapshot.js 2026-10-01   写（覆盖）指定日期的快照
 *
 * 平时不需要运行：后端启动后每天自动写一次（STATS_SNAPSHOT_HOUR，默认 2 点后）。
 * 这里用于首次启用时立刻有一个数据点、或补写某一天。需要先执行迁移 15（node scripts/migrate.js）。
 * 这是 CLI 工具，直接输出到控制台。退出码：0 成功；1 失败。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const stats = require('../services/statsSnapshotService');

const main = async () => {
  const date = process.argv[2];
  try {
    const result = await stats.takeSnapshot({ date });
    console.log(`已写入 ${result.date} 的统计快照`);
    return 0;
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) {
      console.error('快照表不存在，请先执行迁移：node scripts/migrate.js');
    } else {
      console.error(`写入失败: ${error.message}`);
    }
    return 1;
  }
};

main().then((code) => {
  const db = require('../database/db');
  Promise.resolve(db.end && db.end()).catch(() => {}).finally(() => process.exit(code));
});
