-- 可选：P3-4 批次差异查询用的索引。不会被 scripts/migrate.js 执行（它只读取 sql/ 下的 NN-*.sql）。
--
-- 为什么单独放：active_addresses 约有 7500 万行，每个索引约 1–2 GB，创建要几分钟到几小时，期间占用磁盘与 IO。
-- 没有这两个索引时，批次差异（GET /api/addresses/diff）也能工作：按前缀过滤后逐行判断批次 ID，前缀越大越慢。
--
-- 建议：低峰期执行；先在副本上试，记录耗时。ALGORITHM=INPLACE, LOCK=NONE 允许创建期间继续读写。
-- 可重复执行前请先确认索引不存在（MySQL 不支持 ADD INDEX IF NOT EXISTS）：
--   SELECT INDEX_NAME FROM information_schema.STATISTICS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'active_addresses' AND INDEX_NAME IN ('idx_prefix_first', 'idx_prefix_last');
--
-- 用法：mysql -u <用户> -p <库名> < sql/optional/12-address-history-indexes.sql

ALTER TABLE `active_addresses`
  ADD INDEX `idx_prefix_first` (`prefix_id`, `first_batch_id`),
  ADD INDEX `idx_prefix_last` (`prefix_id`, `last_batch_id`),
  ALGORITHM=INPLACE, LOCK=NONE;
