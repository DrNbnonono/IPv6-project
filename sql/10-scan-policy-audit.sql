-- 10：扫描策略与审计
--   scan_allowlist  允许扫描的目标网段（默认拒绝：不在白名单内的目标一律不能扫描）
--   scan_blacklist  禁止扫描的网段（与白名单有交集时也拒绝，用于排除例外、满足对方的退出请求）
--   user_quotas     用户级配额覆盖（未配置的字段使用环境变量里的默认值）
--   audit_logs      审计日志：登录、任务创建/取消/删除、数据库写操作、终端命令、Agent 工具执行、策略拒绝
-- 全部使用 IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS `scan_allowlist` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `cidr` VARCHAR(64) NOT NULL COMMENT '允许扫描的地址或网段（规范化后的 CIDR 写法）',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '说明（实验网段、授权来源等）',
  `created_by` INT DEFAULT NULL COMMENT '添加人',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cidr` (`cidr`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `fk_sal_users` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描目标白名单（默认拒绝）';

CREATE TABLE IF NOT EXISTS `scan_blacklist` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `cidr` VARCHAR(64) NOT NULL COMMENT '禁止扫描的地址或网段（规范化后的 CIDR 写法）',
  `reason` VARCHAR(255) DEFAULT NULL COMMENT '原因（对方要求退出、敏感网段等）',
  `created_by` INT DEFAULT NULL COMMENT '添加人',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cidr` (`cidr`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `fk_sbl_users` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描目标黑名单';

CREATE TABLE IF NOT EXISTS `user_quotas` (
  `user_id` INT NOT NULL COMMENT '用户ID',
  `max_rate_bps` BIGINT DEFAULT NULL COMMENT '单个 xmap 任务的速率上限（bit/s）；NULL 表示使用默认值',
  `daily_scan_limit` INT DEFAULT NULL COMMENT '每天可创建的扫描任务数（xmap + zgrab2）；NULL 表示使用默认值',
  `updated_by` INT DEFAULT NULL COMMENT '最后修改人',
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后修改时间',
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_uq_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户扫描配额覆盖';

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` INT DEFAULT NULL COMMENT '操作人（登录失败等未识别用户时为空）',
  `action` VARCHAR(64) NOT NULL COMMENT '动作，如 auth.login、task.create、scan.denied',
  `resource_type` VARCHAR(32) DEFAULT NULL COMMENT '资源类型，如 task、database、terminal',
  `resource_id` VARCHAR(64) DEFAULT NULL COMMENT '资源标识，如任务ID',
  `success` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '操作是否成功',
  `detail` JSON DEFAULT NULL COMMENT '补充信息（已脱敏）',
  `ip` VARCHAR(45) DEFAULT NULL COMMENT '来源 IP',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_action_created` (`action`, `created_at`),
  CONSTRAINT `fk_al_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志';
