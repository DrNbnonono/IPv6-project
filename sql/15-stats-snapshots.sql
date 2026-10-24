-- 15：每日统计快照（P5-1 趋势）
--
--   daily_global_stats    全局：国家数、ASN 数、前缀总数、活跃地址总数
--   daily_country_stats   每个国家每天的前缀数 / 活跃地址数
--   daily_asn_stats       每个 ASN 每天的前缀数 / 活跃地址数
--
-- 数据来自 countries / asns 上已有的汇总计数（total_ipv6_prefixes、total_active_ipv6），
-- 不扫描 7500 万行的 active_addresses。由后端每天写一份（services/statsSnapshotService.js，
-- 也可手动 npm run stats:snapshot）；同一天重复写入会覆盖当天那一行。
-- 只记录前缀数与地址数都大于 0 的国家 / ASN，避免大量全零行。
-- 趋势接口：GET /api/addresses/trends。
-- 可重复执行。

CREATE TABLE IF NOT EXISTS `daily_global_stats` (
  `stat_date` DATE NOT NULL COMMENT '快照日期',
  `total_countries` INT NOT NULL DEFAULT 0 COMMENT '国家数',
  `total_asns` INT NOT NULL DEFAULT 0 COMMENT 'ASN 数',
  `total_prefixes` BIGINT NOT NULL DEFAULT 0 COMMENT 'IPv6 前缀总数',
  `total_addresses` BIGINT NOT NULL DEFAULT 0 COMMENT '活跃 IPv6 地址总数',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '写入时间',
  PRIMARY KEY (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日全局统计快照';

CREATE TABLE IF NOT EXISTS `daily_country_stats` (
  `stat_date` DATE NOT NULL COMMENT '快照日期',
  `country_id` CHAR(2) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ISO 两位国家代码（countries.country_id）',
  `total_prefixes` INT NOT NULL DEFAULT 0 COMMENT 'IPv6 前缀数',
  `total_addresses` BIGINT NOT NULL DEFAULT 0 COMMENT '活跃 IPv6 地址数',
  PRIMARY KEY (`stat_date`, `country_id`),
  KEY `idx_country_date` (`country_id`, `stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日国家统计快照';

CREATE TABLE IF NOT EXISTS `daily_asn_stats` (
  `stat_date` DATE NOT NULL COMMENT '快照日期',
  `asn` INT NOT NULL COMMENT '自治系统号（asns.asn）',
  `total_prefixes` INT NOT NULL DEFAULT 0 COMMENT 'IPv6 前缀数',
  `total_addresses` BIGINT NOT NULL DEFAULT 0 COMMENT '活跃 IPv6 地址数',
  PRIMARY KEY (`stat_date`, `asn`),
  KEY `idx_asn_date` (`asn`, `stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日 ASN 统计快照';
