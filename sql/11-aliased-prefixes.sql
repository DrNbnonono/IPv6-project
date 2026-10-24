-- 11：别名前缀检测（APD）
--   aliased_prefixes  已检测到的别名前缀（整个前缀下的任何地址都会应答）。表里是“当前判定”：
--                     重新检测后完全无应答的前缀会被移除；应答不全的（uncertain）不改动。
-- 说明：本迁移不修改 ip_prefixes 与统计存储过程。别名前缀通常是 /64 这样的细粒度前缀，
--       与 ip_prefixes 里的路由前缀不是同一层，因此用独立的表保存，并在导入/统计前通过 apd_filter 过滤地址。
-- 使用 IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS `aliased_prefixes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `prefix` VARCHAR(50) NOT NULL COMMENT '别名前缀（规范化 CIDR，如 2001:db8:1:2::/64）',
  `prefix_length` TINYINT UNSIGNED NOT NULL COMMENT '前缀长度（4 的倍数）',
  `probes_sent` TINYINT UNSIGNED NOT NULL COMMENT '最近一次检测发出的探测数',
  `probes_answered` TINYINT UNSIGNED NOT NULL COMMENT '最近一次检测收到应答的探测数',
  `method` VARCHAR(32) NOT NULL DEFAULT 'apd-16' COMMENT '检测方法',
  `task_id` BIGINT DEFAULT NULL COMMENT '最近一次检测的任务 ID（tasks.id，不设外键，任务可被删除）',
  `detected_by` INT DEFAULT NULL COMMENT '发起检测的用户',
  `detected_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次判定时间',
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近检测时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prefix` (`prefix`),
  KEY `idx_prefix_length` (`prefix_length`),
  KEY `idx_detected_by` (`detected_by`),
  CONSTRAINT `fk_ap_users` FOREIGN KEY (`detected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='别名前缀（APD 检测结果）';
