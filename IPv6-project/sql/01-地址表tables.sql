CREATE TABLE `active_addresses` (
  `address_id` bigint NOT NULL AUTO_INCREMENT COMMENT '地址ID',
  `address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'IPv4(15) or IPv6(45)地址',
  `version` enum('4','6') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '4=IPv4, 6=IPv6',
  `prefix_id` bigint DEFAULT NULL COMMENT '所属前缀ID',
  `iid_type` int DEFAULT NULL COMMENT '接口标识符类型',
  PRIMARY KEY (`address_id`),
  UNIQUE KEY `uk_address` (`address`) COMMENT '地址唯一约束',
  KEY `idx_prefix` (`prefix_id`) COMMENT '前缀ID索引',
  KEY `idx_version` (`version`) COMMENT 'IP版本索引',
  KEY `idx_iid_type` (`iid_type`) COMMENT 'IID类型索引',
  CONSTRAINT `fk_address_prefix` FOREIGN KEY (`prefix_id`) REFERENCES `ip_prefixes` (`prefix_id`),
  CONSTRAINT `fk_address_type` FOREIGN KEY (`iid_type`) REFERENCES `address_types` (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=75083988 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活跃地址表'


--前缀表
CREATE TABLE `ip_prefixes` (
  `prefix_id` bigint NOT NULL AUTO_INCREMENT COMMENT '前缀ID',
  `prefix` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'IP前缀(如2001:db8::/32)',
  `prefix_length` int NOT NULL COMMENT '前缀长度',
  `version` enum('4','6') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '4=IPv4, 6=IPv6',
  `asn` int DEFAULT NULL COMMENT '所属ASN',
  `country_id` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '所属国家代码',
  `allocation_date` date DEFAULT NULL COMMENT '分配日期',
  `registry` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '注册机构(如APNIC, ARIN)',
  `is_private` tinyint(1) DEFAULT '0' COMMENT '是否为私有地址',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `active_ipv6_count` int DEFAULT '0' COMMENT '活跃IPv6地址数量',
  PRIMARY KEY (`prefix_id`),
  UNIQUE KEY `uk_prefix` (`prefix`,`prefix_length`) COMMENT '前缀唯一约束',
  KEY `idx_asn` (`asn`) COMMENT 'ASN索引',
  KEY `idx_country` (`country_id`) COMMENT '国家代码索引',
  KEY `idx_version` (`version`) COMMENT 'IP版本索引',
  KEY `idx_prefix_length` (`prefix_length`) COMMENT '前缀长度索引',
  CONSTRAINT `fk_prefix_asn` FOREIGN KEY (`asn`) REFERENCES `asns` (`asn`),
  CONSTRAINT `fk_prefix_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`)
) ENGINE=InnoDB AUTO_INCREMENT=347 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IP前缀表'

--ASN信息表
CREATE TABLE `asns` (
  `asn` int NOT NULL COMMENT '自治系统号',
  `as_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'AS名称',
  `as_name_zh` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AS中文名称',
  `country_id` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '所属国家代码',
  `organization` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '所属组织',
  `total_ipv6_prefixes` int DEFAULT '0' COMMENT 'IPv6前缀总数',
  `total_active_ipv6` int DEFAULT '0' COMMENT '活跃IPv6地址总数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`asn`),
  KEY `idx_as_name` (`as_name`) COMMENT 'AS名称索引',
  KEY `idx_country` (`country_id`) COMMENT '国家代码索引',
  KEY `idx_organization` (`organization`(100)) COMMENT '组织名称索引',
  CONSTRAINT `fk_asn_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN信息表' 

--国家信息表
CREATE TABLE `countries` (
  `country_id` char(2) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ISO 2字母国家代码',
  `country_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家英文名称',
  `country_name_zh` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家中文名称',
  `iso3_code` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ISO 3字母国家代码',
  `region` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地区(如Asia, Europe)',
  `subregion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '子地区(如Eastern Asia)',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '纬度',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '经度',
  `total_ipv6_prefixes` int DEFAULT '0' COMMENT 'IPv6前缀总数',
  `total_active_ipv6` int DEFAULT '0' COMMENT '活跃IPv6地址总数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`country_id`),
  KEY `idx_country_name` (`country_name`) COMMENT '国家名称索引',
  KEY `idx_region` (`region`) COMMENT '地区索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家信息表'

CREATE TABLE `protocols` (
  `protocol_id` int NOT NULL AUTO_INCREMENT COMMENT '协议ID',
  `protocol_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '协议名称',
  `protocol_number` int DEFAULT NULL COMMENT '协议号',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '协议描述',
  `is_common` tinyint(1) DEFAULT '0' COMMENT '是否为常见协议',
  `risk_level` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'low' COMMENT '风险等级',
  PRIMARY KEY (`protocol_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协议信息表'

CREATE TABLE `vulnerabilities` (
  `vulnerability_id` int NOT NULL AUTO_INCREMENT COMMENT '漏洞ID',
  `cve_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'CVE编号',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '漏洞名称',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '漏洞描述',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '严重程度',
  `affected_protocols` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '影响的协议',
  `detection_method` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '检测方法',
  `published_date` date DEFAULT NULL COMMENT '发布日期',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`vulnerability_id`),
  UNIQUE KEY `uk_cve` (`cve_id`) COMMENT 'CVE编号唯一约束',
  KEY `idx_severity` (`severity`) COMMENT '严重程度索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='漏洞信息表'

CREATE TABLE `address_types` (
  `type_id` int NOT NULL AUTO_INCREMENT COMMENT '类型ID',
  `type_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型名称',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类型描述',
  `is_risky` tinyint(1) DEFAULT '0' COMMENT '是否为风险类型',
  `example` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '示例地址',
  PRIMARY KEY (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址类型表' 



CREATE TABLE `address_protocols` (
  `address_id` bigint NOT NULL COMMENT '地址ID',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `port` int NOT NULL COMMENT '端口号',
  `first_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次发现时间',
  `last_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后发现时间',
  PRIMARY KEY (`address_id`,`protocol_id`,`port`) COMMENT '复合主键',
  KEY `idx_protocol` (`protocol_id`) COMMENT '协议ID索引',
  CONSTRAINT `fk_ap_address` FOREIGN KEY (`address_id`) REFERENCES `active_addresses` (`address_id`),
  CONSTRAINT `fk_ap_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址协议关联表' 

CREATE TABLE `address_vulnerabilities` (
  `av_id` bigint NOT NULL AUTO_INCREMENT COMMENT '关联ID',
  `address_id` bigint NOT NULL COMMENT '地址ID',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `detection_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检测日期',
  `last_detected` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后检测时间',
  `is_fixed` tinyint(1) DEFAULT '0' COMMENT '是否已修复',
  PRIMARY KEY (`av_id`),
  KEY `idx_address` (`address_id`) COMMENT '地址ID索引',
  KEY `idx_vulnerability` (`vulnerability_id`) COMMENT '漏洞ID索引',
  CONSTRAINT `fk_av_address` FOREIGN KEY (`address_id`) REFERENCES `active_addresses` (`address_id`),
  CONSTRAINT `fk_av_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址漏洞关联表'
