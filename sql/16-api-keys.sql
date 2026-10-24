-- 16：开放只读 API 的密钥表（P5-3）
--
--   api_keys   发给外部使用者的只读 API 密钥。只保存密钥的 SHA-256（密钥是 256 位随机串，不需要慢哈希），
--              明文只在创建时返回一次，丢了只能吊销重发。
--   key_prefix 明文的前 12 个字符（形如 ov6_AbCdEfGh），仅用于在列表里认出是哪把钥匙，不能用来还原。
--   scopes     权限范围（JSON 数组）：stats = 聚合/前缀级统计；addresses = 可以读取完整地址。
--              默认只发 stats，addresses 需要管理员明确勾选。
--   rate_limit_per_min  这把钥匙每分钟最多请求数；NULL 表示用环境变量 OPEN_API_RATE_PER_MIN（默认 60）。
--   created_by 创建它的管理员（users.id）；不设外键，用户被删除不应让钥匙连带消失或阻止删除用户。
-- 可重复执行。

CREATE TABLE IF NOT EXISTS `api_keys` (
  `key_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '用途说明（给谁、做什么）',
  `key_prefix` VARCHAR(16) NOT NULL COMMENT '明文前缀，仅用于识别',
  `key_hash` CHAR(64) NOT NULL COMMENT '密钥明文的 SHA-256（十六进制）',
  `scopes` JSON NOT NULL COMMENT '权限范围数组，如 ["stats"]',
  `rate_limit_per_min` INT UNSIGNED DEFAULT NULL COMMENT '每分钟请求上限；NULL=默认值',
  `created_by` INT DEFAULT NULL COMMENT '创建者（users.id）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME DEFAULT NULL COMMENT '过期时间；NULL=不过期',
  `last_used_at` DATETIME DEFAULT NULL COMMENT '最近使用时间（约每分钟更新一次）',
  `revoked_at` DATETIME DEFAULT NULL COMMENT '吊销时间；非 NULL 即失效',
  PRIMARY KEY (`key_id`),
  UNIQUE KEY `uk_key_hash` (`key_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='开放 API 密钥';
