-- Agent记忆表
-- 用于存储Agent的长期记忆，包括用户偏好、工具使用历史、知识库等

CREATE TABLE IF NOT EXISTS `agent_memory` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `memory_type` ENUM('preference', 'tool_history', 'knowledge') NOT NULL COMMENT '记忆类型',
  `memory_key` VARCHAR(255) NOT NULL COMMENT '记忆键',
  `memory_value` TEXT NOT NULL COMMENT '记忆值（JSON格式）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_type_key` (`user_id`, `memory_type`, `memory_key`(100)),
  KEY `idx_user_type` (`user_id`, `memory_type`),
  KEY `idx_memory_type` (`memory_type`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent记忆表';

-- 示例数据
-- INSERT INTO `agent_memory` (`user_id`, `memory_type`, `memory_key`, `memory_value`) VALUES
-- ('test_user', 'preference', 'agent:user:preferences:test_user', '{"theme":"dark","language":"zh-CN"}');
