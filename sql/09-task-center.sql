-- 09：任务中枢（tasks 表扩展）
-- 为任务服务（services/taskService.js）与后续的调度器准备：
--   pid         子进程 PID，服务重启后用于判断进程是否还在
--   priority    调度优先级，数值大的先执行
--   params      创建任务时的原始参数（JSON），调度器据此启动任务
--   queued_at   进入队列的时间
--   started_at  实际开始运行的时间
-- 另外把 task_type 加宽到 varchar(32)（后续会有 apd、tga 等类型），并增加调度用的复合索引。
-- MySQL 的 ALTER TABLE 不支持 ADD COLUMN IF NOT EXISTS，所以用 information_schema 判断后再执行，
-- 保证这个文件可以重复执行（全新库的 structure.sql 已包含这些列时也不会报错）。

SET @db := DATABASE();

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'pid') = 0,
  'ALTER TABLE `tasks` ADD COLUMN `pid` INT NULL DEFAULT NULL COMMENT ''子进程PID（运行中才有意义）'' AFTER `process_signal`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'priority') = 0,
  'ALTER TABLE `tasks` ADD COLUMN `priority` INT NOT NULL DEFAULT 0 COMMENT ''调度优先级，数值大的先执行'' AFTER `pid`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'params') = 0,
  'ALTER TABLE `tasks` ADD COLUMN `params` JSON NULL COMMENT ''创建任务时的原始参数'' AFTER `priority`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'queued_at') = 0,
  'ALTER TABLE `tasks` ADD COLUMN `queued_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''进入队列的时间'' AFTER `params`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'started_at') = 0,
  'ALTER TABLE `tasks` ADD COLUMN `started_at` TIMESTAMP NULL DEFAULT NULL COMMENT ''开始运行的时间'' AFTER `queued_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `tasks` MODIFY COLUMN `task_type` VARCHAR(32) NULL DEFAULT NULL COMMENT '任务类型（如xmap、zgrab2等）';

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_status_type') = 0,
  'ALTER TABLE `tasks` ADD INDEX `idx_status_type` (`status`, `task_type`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
