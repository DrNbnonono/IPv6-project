-- 17：探针退出请求（P2-4）
--
--   opt_out_requests  网络运营者通过公开页面提交的“请不要扫描我的网段”请求。
--     cidr         请求退出的网段（规范化写法）；一个请求一行，一次提交最多 10 个网段会拆成多行。
--     contact      联系方式（邮箱），只给管理员看，不在任何公开接口返回。
--     organization 单位/网络名称（可选）。
--     note         补充说明（可选）。
--     status       pending 待审核 | approved 已通过（已写入 scan_blacklist）| rejected 已驳回。
--                  pending 状态的网段在审核期间就会被扫描策略拒绝（宁可误停，不可误扫）。
--     source_ip    提交者 IP，仅用于滥用排查。
--     reviewed_by  审核的管理员（users.id）；不设外键，用户被删除不应阻止或连带删除请求记录。
-- 可重复执行。

CREATE TABLE IF NOT EXISTS `opt_out_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cidr` VARCHAR(64) NOT NULL COMMENT '请求退出的网段（规范化 CIDR）',
  `contact` VARCHAR(255) NOT NULL COMMENT '联系邮箱',
  `organization` VARCHAR(120) DEFAULT NULL COMMENT '单位/网络名称',
  `note` VARCHAR(500) DEFAULT NULL COMMENT '补充说明',
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `source_ip` VARCHAR(45) DEFAULT NULL COMMENT '提交者 IP',
  `reviewed_by` INT DEFAULT NULL COMMENT '审核人（users.id）',
  `reviewed_at` DATETIME DEFAULT NULL,
  `review_note` VARCHAR(255) DEFAULT NULL COMMENT '审核备注',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_cidr` (`cidr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='探针退出请求';
