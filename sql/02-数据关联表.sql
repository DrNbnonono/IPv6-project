-- 协议统计物化表
CREATE TABLE `protocol_stats` (
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `affected_asns` int DEFAULT 0 COMMENT '受影响ASN数',
  `affected_countries` int DEFAULT 0 COMMENT '受影响国家数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`protocol_id`),
  CONSTRAINT `fk_ps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协议统计表';

-- ASN协议统计物化表
CREATE TABLE `asn_protocol_stats` (
  `asn` int NOT NULL COMMENT 'ASN',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `total_active_ipv6` int DEFAULT 0 COMMENT '活跃IPv6地址总数',
  `affected_percentage` decimal(5,2) DEFAULT 0.00 COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`asn`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_aps_asn` FOREIGN KEY (`asn`) REFERENCES `asns` (`asn`),
  CONSTRAINT `fk_aps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN协议统计表';

-- 区域协议统计物化表
CREATE TABLE `region_protocol_stats` (
  `region` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地区',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `total_addresses` int DEFAULT 0 COMMENT '总地址数',
  `affected_percentage` decimal(5,2) DEFAULT 0.00 COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`region`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_rps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域协议统计表';

-- 国家协议统计物化表
CREATE TABLE `country_protocol_stats` (
  `country_id` char(2) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址总数',
  `total_addresses` int DEFAULT 0 COMMENT '总地址数',
  `percentage` decimal(5,2) DEFAULT 0.00 COMMENT '使用百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`country_id`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_cps_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`),
  CONSTRAINT `fk_cps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家协议统计表';

-- 漏洞统计物化表
CREATE TABLE `vulnerability_stats` (
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `affected_asns` int DEFAULT 0 COMMENT '受影响ASN数',
  `affected_countries` int DEFAULT 0 COMMENT '受影响国家数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`vulnerability_id`),
  CONSTRAINT `fk_vs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='漏洞统计表';

-- ASN漏洞统计物化表
CREATE TABLE `asn_vulnerability_stats` (
  `asn` int NOT NULL COMMENT 'ASN',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `total_active_ipv6` int DEFAULT 0 COMMENT '活跃IPv6地址总数',
  `affected_percentage` decimal(5,2) DEFAULT 0.00 COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`asn`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_avs_asn` FOREIGN KEY (`asn`) REFERENCES `asns` (`asn`),
  CONSTRAINT `fk_avs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN漏洞统计表';

-- 区域漏洞统计物化表
CREATE TABLE `region_vulnerability_stats` (
  `region` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地区',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `total_addresses` int DEFAULT 0 COMMENT '总地址数',
  `affected_percentage` decimal(5,2) DEFAULT 0.00 COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`region`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_rvs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域漏洞统计表';

-- 国家漏洞统计物化表
CREATE TABLE `country_vulnerability_stats` (
  `country_id` char(2) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT 0 COMMENT '受影响地址数',
  `total_addresses` int DEFAULT 0 COMMENT '总地址数',
  `percentage` decimal(5,2) DEFAULT 0.00 COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`country_id`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_cvs_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`),
  CONSTRAINT `fk_cvs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家漏洞统计表';