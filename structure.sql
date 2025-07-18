-- MySQL dump 10.13  Distrib 8.0.42, for Linux (x86_64)
--
-- Host: localhost    Database: ipv6_project
-- ------------------------------------------------------
-- Server version	8.0.42-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS ipv6_project CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
use ipv6_project;

-- 创建数据库用户和权限设置
-- 注意：这些命令需要root权限执行
-- 创建linux_db用户（如果不存在）
CREATE USER IF NOT EXISTS 'linux_db'@'localhost' IDENTIFIED BY 'root';
CREATE USER IF NOT EXISTS 'linux_db'@'172.25.%' IDENTIFIED BY 'root';

-- 授予权限
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'localhost';
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'172.25.%';

-- 刷新权限
FLUSH PRIVILEGES;

--
-- Table structure for table `active_addresses`
--

DROP TABLE IF EXISTS `active_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=75084135 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活跃地址表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `address_protocols`
--

DROP TABLE IF EXISTS `address_protocols`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址协议关联表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_protocol_insert` AFTER INSERT ON `address_protocols` FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_total_addresses INT;
    
    
    SELECT ip.country_id, ip.asn, COUNT(*) INTO v_country_id, v_asn, v_total_addresses
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id
    GROUP BY ip.country_id, ip.asn;
    
    
    IF v_asn IS NOT NULL THEN
        INSERT INTO asn_protocol_stats 
            (asn, protocol_id, address_count, percentage, last_updated)
        SELECT 
            v_asn,
            NEW.protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.asn = v_asn
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.asn = v_asn AND
            ap.protocol_id = NEW.protocol_id
        GROUP BY 
            ip.asn, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    
    IF v_country_id IS NOT NULL THEN
        INSERT INTO country_protocol_stats 
            (country_id, protocol_id, address_count, percentage, last_updated)
        SELECT 
            v_country_id,
            NEW.protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.country_id = v_country_id
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.country_id = v_country_id AND
            ap.protocol_id = NEW.protocol_id
        GROUP BY 
            ip.country_id, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_protocol_delete` AFTER DELETE ON `address_protocols` FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_address_count INT;
    DECLARE v_total_addresses INT;
    DECLARE v_percentage DECIMAL(5,2);
    
    
    SELECT ip.country_id, ip.asn INTO v_country_id, v_asn
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = OLD.address_id;
    
    
    IF v_asn IS NOT NULL THEN
        
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn AND ap.protocol_id = OLD.protocol_id;
        
        
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn;
        
        
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        
        IF v_address_count = 0 THEN
            DELETE FROM asn_protocol_stats
            WHERE asn = v_asn AND protocol_id = OLD.protocol_id;
        ELSE
            UPDATE asn_protocol_stats
            SET address_count = v_address_count,
                percentage = v_percentage,
                last_updated = NOW()
            WHERE asn = v_asn AND protocol_id = OLD.protocol_id;
        END IF;
    END IF;
    
    
    IF v_country_id IS NOT NULL THEN
        
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id AND ap.protocol_id = OLD.protocol_id;
        
        
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id;
        
        
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        
        IF v_address_count = 0 THEN
            DELETE FROM country_protocol_stats
            WHERE country_id = v_country_id AND protocol_id = OLD.protocol_id;
        ELSE
            UPDATE country_protocol_stats
            SET address_count = v_address_count,
                percentage = v_percentage,
                last_updated = NOW()
            WHERE country_id = v_country_id AND protocol_id = OLD.protocol_id;
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `address_types`
--

DROP TABLE IF EXISTS `address_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `address_types` (
  `type_id` int NOT NULL AUTO_INCREMENT COMMENT '类型ID',
  `type_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型名称',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类型描述',
  `is_risky` tinyint(1) DEFAULT '0' COMMENT '是否为风险类型',
  `example` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '示例地址',
  PRIMARY KEY (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址类型表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `address_vulnerabilities`
--

DROP TABLE IF EXISTS `address_vulnerabilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址漏洞关联表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_vulnerability_insert` AFTER INSERT ON `address_vulnerabilities` FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    
    
    SELECT ip.country_id INTO v_country_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id;
    
    
    INSERT INTO country_vulnerability_stats 
        (country_id, vulnerability_id, affected_addresses, percentage, last_updated)
    SELECT 
        v_country_id,
        NEW.vulnerability_id,
        COUNT(*),
        ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses a
            JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
            WHERE p.country_id = v_country_id
        ), 2),
        NOW()
    FROM 
        address_vulnerabilities av
    JOIN 
        active_addresses aa ON av.address_id = aa.address_id
    JOIN 
        ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE 
        ip.country_id = v_country_id AND
        av.vulnerability_id = NEW.vulnerability_id AND
        av.is_fixed = 0
    GROUP BY 
        ip.country_id, av.vulnerability_id
    ON DUPLICATE KEY UPDATE
        affected_addresses = VALUES(affected_addresses),
        percentage = VALUES(percentage),
        last_updated = NOW();
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `asn_protocol_stats`
--

DROP TABLE IF EXISTS `asn_protocol_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asn_protocol_stats` (
  `asn` int NOT NULL COMMENT 'ASN',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `total_active_ipv6` int DEFAULT '0' COMMENT '活跃IPv6地址总数',
  `affected_percentage` decimal(5,2) DEFAULT '0.00' COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`asn`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_aps_asn` FOREIGN KEY (`asn`) REFERENCES `asns` (`asn`),
  CONSTRAINT `fk_aps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN协议统计表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_protocol_stats_insert` AFTER INSERT ON `asn_protocol_stats` FOR EACH ROW BEGIN
    CALL update_related_protocol_stats_for_asn(NEW.asn, NEW.protocol_id);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_protocol_stats_update` AFTER UPDATE ON `asn_protocol_stats` FOR EACH ROW BEGIN
    
    IF OLD.affected_addresses <> NEW.affected_addresses OR OLD.total_active_ipv6 <> NEW.total_active_ipv6 THEN
        CALL update_related_protocol_stats_for_asn(NEW.asn, NEW.protocol_id);
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_protocol_stats_delete` AFTER DELETE ON `asn_protocol_stats` FOR EACH ROW BEGIN
    CALL update_related_protocol_stats_for_asn(OLD.asn, OLD.protocol_id);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Temporary view structure for view `asn_protocol_stats_view`
--

DROP TABLE IF EXISTS `asn_protocol_stats_view`;
/*!50001 DROP VIEW IF EXISTS `asn_protocol_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `asn_protocol_stats_view` AS SELECT 
 1 AS `asn`,
 1 AS `as_name`,
 1 AS `as_name_zh`,
 1 AS `country_id`,
 1 AS `country_name`,
 1 AS `country_name_zh`,
 1 AS `protocol_id`,
 1 AS `protocol_name`,
 1 AS `affected_addresses`,
 1 AS `total_active_ipv6`,
 1 AS `affected_percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `asn_vulnerability_stats`
--

DROP TABLE IF EXISTS `asn_vulnerability_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asn_vulnerability_stats` (
  `asn` int NOT NULL COMMENT 'ASN',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `total_active_ipv6` int DEFAULT '0' COMMENT '活跃IPv6地址总数',
  `affected_percentage` decimal(5,2) DEFAULT '0.00' COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`asn`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_avs_asn` FOREIGN KEY (`asn`) REFERENCES `asns` (`asn`),
  CONSTRAINT `fk_avs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN漏洞统计表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_vulnerability_stats_insert` AFTER INSERT ON `asn_vulnerability_stats` FOR EACH ROW BEGIN
    CALL update_related_vulnerability_stats_for_asn(NEW.asn, NEW.vulnerability_id);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_vulnerability_stats_update` AFTER UPDATE ON `asn_vulnerability_stats` FOR EACH ROW BEGIN
    
    IF OLD.affected_addresses <> NEW.affected_addresses OR OLD.total_active_ipv6 <> NEW.total_active_ipv6 THEN
        CALL update_related_vulnerability_stats_for_asn(NEW.asn, NEW.vulnerability_id);
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_asn_vulnerability_stats_delete` AFTER DELETE ON `asn_vulnerability_stats` FOR EACH ROW BEGIN
    CALL update_related_vulnerability_stats_for_asn(OLD.asn, OLD.vulnerability_id);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Temporary view structure for view `asn_vulnerability_stats_view`
--

DROP TABLE IF EXISTS `asn_vulnerability_stats_view`;
/*!50001 DROP VIEW IF EXISTS `asn_vulnerability_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `asn_vulnerability_stats_view` AS SELECT 
 1 AS `asn`,
 1 AS `as_name`,
 1 AS `as_name_zh`,
 1 AS `country_id`,
 1 AS `country_name`,
 1 AS `country_name_zh`,
 1 AS `vulnerability_id`,
 1 AS `cve_id`,
 1 AS `name`,
 1 AS `severity`,
 1 AS `affected_addresses`,
 1 AS `total_active_ipv6`,
 1 AS `affected_percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `asns`
--

DROP TABLE IF EXISTS `asns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ASN信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `countries`
--

DROP TABLE IF EXISTS `countries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `country_protocol_stats`
--

DROP TABLE IF EXISTS `country_protocol_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `country_protocol_stats` (
  `country_id` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址总数',
  `total_addresses` int DEFAULT '0' COMMENT '总地址数',
  `percentage` decimal(5,2) DEFAULT '0.00' COMMENT '使用百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`country_id`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_cps_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`),
  CONSTRAINT `fk_cps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家协议统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `country_protocol_stats_view`
--

DROP TABLE IF EXISTS `country_protocol_stats_view`;
/*!50001 DROP VIEW IF EXISTS `country_protocol_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `country_protocol_stats_view` AS SELECT 
 1 AS `country_id`,
 1 AS `country_name`,
 1 AS `country_name_zh`,
 1 AS `protocol_id`,
 1 AS `protocol_name`,
 1 AS `affected_addresses`,
 1 AS `total_addresses`,
 1 AS `percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `country_vulnerability_stats`
--

DROP TABLE IF EXISTS `country_vulnerability_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `country_vulnerability_stats` (
  `country_id` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `total_addresses` int DEFAULT '0' COMMENT '总地址数',
  `percentage` decimal(5,2) DEFAULT '0.00' COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`country_id`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_cvs_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`),
  CONSTRAINT `fk_cvs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家漏洞统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `country_vulnerability_stats_view`
--

DROP TABLE IF EXISTS `country_vulnerability_stats_view`;
/*!50001 DROP VIEW IF EXISTS `country_vulnerability_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `country_vulnerability_stats_view` AS SELECT 
 1 AS `country_id`,
 1 AS `country_name`,
 1 AS `country_name_zh`,
 1 AS `vulnerability_id`,
 1 AS `cve_id`,
 1 AS `name`,
 1 AS `severity`,
 1 AS `description`,
 1 AS `total_addresses`,
 1 AS `affected_addresses`,
 1 AS `percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `ip_prefixes`
--

DROP TABLE IF EXISTS `ip_prefixes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=352 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IP前缀表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `protocol_stats`
--

DROP TABLE IF EXISTS `protocol_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `protocol_stats` (
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `affected_asns` int DEFAULT '0' COMMENT '受影响ASN数',
  `affected_countries` int DEFAULT '0' COMMENT '受影响国家数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`protocol_id`),
  CONSTRAINT `fk_ps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协议统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `protocol_stats_view`
--

DROP TABLE IF EXISTS `protocol_stats_view`;
/*!50001 DROP VIEW IF EXISTS `protocol_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `protocol_stats_view` AS SELECT 
 1 AS `protocol_id`,
 1 AS `protocol_name`,
 1 AS `description`,
 1 AS `affected_addresses`,
 1 AS `affected_asns`,
 1 AS `affected_countries`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `protocols`
--

DROP TABLE IF EXISTS `protocols`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `protocols` (
  `protocol_id` int NOT NULL AUTO_INCREMENT COMMENT '协议ID',
  `protocol_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '协议名称',
  `protocol_number` int DEFAULT NULL COMMENT '协议号',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '协议描述',
  `is_common` tinyint(1) DEFAULT '0' COMMENT '是否为常见协议',
  `risk_level` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'low' COMMENT '风险等级',
  PRIMARY KEY (`protocol_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协议信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `region_protocol_stats`
--

DROP TABLE IF EXISTS `region_protocol_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `region_protocol_stats` (
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地区',
  `protocol_id` int NOT NULL COMMENT '协议ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `total_addresses` int DEFAULT '0' COMMENT '总地址数',
  `affected_percentage` decimal(5,2) DEFAULT '0.00' COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`region`,`protocol_id`),
  KEY `idx_protocol` (`protocol_id`),
  CONSTRAINT `fk_rps_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `protocols` (`protocol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域协议统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `region_protocol_stats_view`
--

DROP TABLE IF EXISTS `region_protocol_stats_view`;
/*!50001 DROP VIEW IF EXISTS `region_protocol_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `region_protocol_stats_view` AS SELECT 
 1 AS `region`,
 1 AS `protocol_id`,
 1 AS `protocol_name`,
 1 AS `affected_addresses`,
 1 AS `total_addresses`,
 1 AS `affected_percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `region_vulnerability_stats`
--

DROP TABLE IF EXISTS `region_vulnerability_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `region_vulnerability_stats` (
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地区',
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `total_addresses` int DEFAULT '0' COMMENT '总地址数',
  `affected_percentage` decimal(5,2) DEFAULT '0.00' COMMENT '影响百分比',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`region`,`vulnerability_id`),
  KEY `idx_vulnerability` (`vulnerability_id`),
  CONSTRAINT `fk_rvs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域漏洞统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `region_vulnerability_stats_view`
--

DROP TABLE IF EXISTS `region_vulnerability_stats_view`;
/*!50001 DROP VIEW IF EXISTS `region_vulnerability_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `region_vulnerability_stats_view` AS SELECT 
 1 AS `region`,
 1 AS `vulnerability_id`,
 1 AS `cve_id`,
 1 AS `name`,
 1 AS `severity`,
 1 AS `affected_addresses`,
 1 AS `total_addresses`,
 1 AS `affected_percentage`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '发起任务的用户ID',
  `command` text COMMENT '执行的命令（如 xmap -6）',
  `description` varchar(255) DEFAULT NULL COMMENT '任务描述',
  `task_type` varchar(20) DEFAULT NULL COMMENT '任务类型（如xmap、zgrab2等）',
  `status` enum('pending','running','completed','failed','canceled') NOT NULL DEFAULT 'pending',
  `error_message` text COMMENT '错误信息',
  `log_path` varchar(255) DEFAULT NULL COMMENT '日志文件路径',
  `output_path` varchar(255) DEFAULT NULL COMMENT '结果文件路径（供下载）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `exit_code` int DEFAULT NULL COMMENT '进程退出码',
  `process_signal` varchar(20) DEFAULT NULL COMMENT '进程终止信号',
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1751989268046 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='任务记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tools`
--

DROP TABLE IF EXISTS `tools`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tools` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '工具名称（如xmap, addr6等）',
  `description` varchar(255) DEFAULT NULL COMMENT '工具描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工具表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL COMMENT '手机号（唯一标识）',
  `username` varchar(50) DEFAULT NULL COMMENT '用户昵称',
  `password_hash` varchar(255) NOT NULL COMMENT '加密后的密码',
  `role` enum('user','admin') NOT NULL DEFAULT 'user' COMMENT '用户角色',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vulnerabilities`
--

DROP TABLE IF EXISTS `vulnerabilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='漏洞信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vulnerability_stats`
--

DROP TABLE IF EXISTS `vulnerability_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vulnerability_stats` (
  `vulnerability_id` int NOT NULL COMMENT '漏洞ID',
  `affected_addresses` int DEFAULT '0' COMMENT '受影响地址数',
  `affected_asns` int DEFAULT '0' COMMENT '受影响ASN数',
  `affected_countries` int DEFAULT '0' COMMENT '受影响国家数',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`vulnerability_id`),
  CONSTRAINT `fk_vs_vulnerability` FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities` (`vulnerability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='漏洞统计表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `vulnerability_stats_view`
--

DROP TABLE IF EXISTS `vulnerability_stats_view`;
/*!50001 DROP VIEW IF EXISTS `vulnerability_stats_view`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vulnerability_stats_view` AS SELECT 
 1 AS `vulnerability_id`,
 1 AS `cve_id`,
 1 AS `name`,
 1 AS `description`,
 1 AS `severity`,
 1 AS `affected_addresses`,
 1 AS `affected_asns`,
 1 AS `affected_countries`,
 1 AS `last_updated`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `whitelists`
--

DROP TABLE IF EXISTS `whitelists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whitelists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '上传用户ID',
  `tool_id` int NOT NULL COMMENT '关联的工具ID',
  `file_name` varchar(255) NOT NULL COMMENT '文件名',
  `file_path` varchar(255) NOT NULL COMMENT '文件存储路径',
  `description` varchar(255) DEFAULT NULL COMMENT '文件描述',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除(0:未删除,1:已删除)',
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `tool_id` (`tool_id`),
  CONSTRAINT `whitelists_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `whitelists_ibfk_2` FOREIGN KEY (`tool_id`) REFERENCES `tools` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='白名单文件表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workflow_executions`
--

DROP TABLE IF EXISTS `workflow_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_executions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint NOT NULL COMMENT '工作流ID',
  `user_id` int NOT NULL COMMENT '执行用户ID',
  `name` varchar(255) NOT NULL COMMENT '执行实例名称',
  `status` enum('pending','running','completed','failed','canceled','paused') NOT NULL DEFAULT 'pending' COMMENT '执行状态',
  `current_node_id` varchar(50) DEFAULT NULL COMMENT '当前执行节点ID',
  `progress` json DEFAULT NULL COMMENT '执行进度信息',
  `error_message` text COMMENT '错误信息',
  `started_at` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workflow_status` (`workflow_id`,`status`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `workflow_executions_ibfk_1` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_executions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流执行实例表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workflow_node_executions`
--

DROP TABLE IF EXISTS `workflow_node_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_node_executions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `execution_id` bigint NOT NULL COMMENT '工作流执行实例ID',
  `node_id` varchar(50) NOT NULL COMMENT '节点ID',
  `node_type` varchar(50) NOT NULL COMMENT '节点类型(xmap,zgrab2,json_extract等)',
  `task_id` bigint DEFAULT NULL COMMENT '关联的任务ID(如果是扫描节点)',
  `input_data` json DEFAULT NULL COMMENT '节点输入数据',
  `output_data` json DEFAULT NULL COMMENT '节点输出数据',
  `config` json DEFAULT NULL COMMENT '节点配置',
  `status` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending' COMMENT '节点执行状态',
  `error_message` text COMMENT '错误信息',
  `started_at` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_execution_node` (`execution_id`,`node_id`),
  KEY `idx_task` (`task_id`),
  CONSTRAINT `workflow_node_executions_ibfk_1` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_node_executions_ibfk_2` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流节点执行记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workflows`
--

DROP TABLE IF EXISTS `workflows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflows` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '创建用户ID',
  `name` varchar(255) NOT NULL COMMENT '工作流名称',
  `description` text COMMENT '工作流描述',
  `definition` json NOT NULL COMMENT '工作流定义(节点和连接)',
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'draft' COMMENT '工作流状态',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `workflows_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流定义表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'ipv6_project'
--

--
-- Dumping routines for database 'ipv6_project'
--
/*!50003 DROP PROCEDURE IF EXISTS `batch_import_ipv6_addresses` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `batch_import_ipv6_addresses`(
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_prefix VARCHAR(64),
    IN p_task_id BIGINT,
    OUT p_imported_count INT,
    OUT p_error_count INT,
    OUT p_prefix_id INT,
    OUT p_new_prefix BOOLEAN,
    OUT p_total_addresses INT,
    OUT p_asn_total_addresses INT,
    OUT p_country_total_addresses INT
)
BEGIN
    
    DECLARE v_random_type_id INT;
    DECLARE v_temp_count INT;
    DECLARE v_start_time TIMESTAMP;
    DECLARE v_error_msg TEXT;
    DECLARE v_prefix_exists BOOLEAN;
    
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            v_error_msg = MESSAGE_TEXT;
        ROLLBACK;
        
        UPDATE tasks 
        SET status = 'failed',
            error_message = CONCAT('导入失败: ', v_error_msg),
            completed_at = NOW(),
            output_path = JSON_OBJECT(
                'err', v_error_msg,
                'st', v_start_time,
                'et', NOW(),
                'cnt', v_temp_count,
                'pfx', p_prefix,
                'cid', p_country_id,
                'asn', p_asn
            )
        WHERE id = p_task_id;
        SET p_error_count = 1;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_error_msg;
    END;
    
    
    SET p_imported_count = 0;
    SET p_error_count = 0;
    SET p_new_prefix = FALSE;
    SET v_start_time = NOW();
    
    
    START TRANSACTION;
    
    
    IF NOT EXISTS (SELECT 1 FROM countries WHERE country_id = p_country_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '国家ID不存在';
    END IF;
    
    
    IF NOT EXISTS (SELECT 1 FROM asns WHERE asn = p_asn) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ASN不存在';
    END IF;
    
    
    SELECT type_id INTO v_random_type_id
    FROM address_types 
    WHERE type_name = 'random' 
    LIMIT 1;
    
    IF v_random_type_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '未找到random类型的地址类型';
    END IF;
    
    
    SELECT COUNT(*) INTO v_temp_count FROM temp_addresses;
    
    
    SELECT EXISTS(
        SELECT 1 FROM ip_prefixes 
        WHERE prefix = p_prefix 
        AND country_id = p_country_id 
        AND asn = p_asn
    ) INTO v_prefix_exists;
    
    
    IF NOT v_prefix_exists THEN
        INSERT INTO ip_prefixes (
            prefix, 
            country_id, 
            asn, 
            version, 
            prefix_length,
            active_ipv6_count
        ) VALUES (
            p_prefix, 
            p_country_id, 
            p_asn, 
            '6', 
            SUBSTRING_INDEX(p_prefix, '/', -1),
            0
        );
        SET p_prefix_id = LAST_INSERT_ID();
        SET p_new_prefix = TRUE;
    ELSE
        SELECT prefix_id INTO p_prefix_id
        FROM ip_prefixes 
        WHERE prefix = p_prefix 
        AND country_id = p_country_id 
        AND asn = p_asn;
    END IF;
    
    
    INSERT INTO active_addresses (address, version, prefix_id, iid_type)
    SELECT 
        address, 
        '6', 
        p_prefix_id,
        v_random_type_id
    FROM temp_addresses
    WHERE is_processed = FALSE;
    
    
    SET p_imported_count = ROW_COUNT();
    
    
    UPDATE temp_addresses SET is_processed = TRUE;
    
    
    UPDATE ip_prefixes 
    SET active_ipv6_count = active_ipv6_count + p_imported_count
    WHERE prefix_id = p_prefix_id;
    
    
    SELECT active_ipv6_count INTO p_total_addresses
    FROM ip_prefixes 
    WHERE prefix_id = p_prefix_id;
    
    
    UPDATE asns
    SET 
        total_active_ipv6 = (
            SELECT COALESCE(SUM(active_ipv6_count), 0)
            FROM ip_prefixes
            WHERE asn = p_asn
        ),
        total_ipv6_prefixes = (
            SELECT COUNT(DISTINCT prefix_id)
            FROM ip_prefixes
            WHERE asn = p_asn
        ),
        last_updated = NOW()
    WHERE asn = p_asn;
    
    
    SELECT total_active_ipv6 INTO p_asn_total_addresses
    FROM asns
    WHERE asn = p_asn;
    
    
    UPDATE countries 
    SET 
        total_active_ipv6 = (
            SELECT COALESCE(SUM(total_active_ipv6), 0)
            FROM asns
            WHERE country_id = p_country_id
        ),
        total_ipv6_prefixes = (
            SELECT COUNT(DISTINCT prefix_id)
            FROM ip_prefixes
            WHERE country_id = p_country_id
        ),
        last_updated = NOW()
    WHERE country_id = p_country_id;
    
    
    SELECT total_active_ipv6 INTO p_country_total_addresses
    FROM countries
    WHERE country_id = p_country_id;
    
    
    UPDATE tasks 
    SET status = 'completed',
        completed_at = NOW(),
        output_path = JSON_OBJECT(
            'imp', p_imported_count,
            'pid', p_prefix_id,
            'new', p_new_prefix,
            'cnt', v_temp_count,
            'tot', p_total_addresses,
            'cid', p_country_id,
            'asn', p_asn,
            'pfx', p_prefix
        )
    WHERE id = p_task_id;
    
    
    COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `delete_prefix_with_addresses` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `delete_prefix_with_addresses`(
    IN p_prefix_id BIGINT,
    OUT p_deleted_addresses INT,
    OUT p_prefix_deleted BOOLEAN,
    OUT p_asn INT,
    OUT p_country_id CHAR(2)
)
BEGIN
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_active_ipv6_count INT;
    DECLARE v_asn INT;
    DECLARE v_country_id CHAR(2);
    
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_deleted_addresses = 0;
        SET p_prefix_deleted = FALSE;
        RESIGNAL;  
    END;

    
    SET p_deleted_addresses = 0;
    SET p_prefix_deleted = FALSE;
    
    
    START TRANSACTION;
    
    
    SELECT prefix, active_ipv6_count, asn, country_id
    INTO v_prefix, v_active_ipv6_count, v_asn, v_country_id
    FROM ip_prefixes
    WHERE prefix_id = p_prefix_id;
    
    IF v_prefix IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prefix not found';
    END IF;
    
    
    SET p_asn = v_asn;
    SET p_country_id = v_country_id;
    
    
    
    DELETE FROM active_addresses
    WHERE prefix_id = p_prefix_id;
    
    
    SET p_deleted_addresses = ROW_COUNT();
    
    
    DELETE FROM ip_prefixes
    WHERE prefix_id = p_prefix_id;
    
    
    IF ROW_COUNT() > 0 THEN
        SET p_prefix_deleted = TRUE;
        
        
        UPDATE asns
        SET
            total_active_ipv6 = (
                SELECT COALESCE(SUM(active_ipv6_count), 0)
                FROM ip_prefixes
                WHERE asn = v_asn
            ),
            total_ipv6_prefixes = (
                SELECT COUNT(DISTINCT prefix_id)
                FROM ip_prefixes
                WHERE asn = v_asn
            ),
            last_updated = NOW()
        WHERE asn = v_asn;
        
        
        UPDATE countries
        SET
            total_active_ipv6 = (
                SELECT COALESCE(SUM(total_active_ipv6), 0)
                FROM asns
                WHERE country_id = v_country_id
            ),
            total_ipv6_prefixes = (
                SELECT COUNT(DISTINCT prefix_id)
                FROM ip_prefixes
                WHERE country_id = v_country_id
            ),
            last_updated = NOW()
        WHERE country_id = v_country_id;
        
    END IF;
    
    
    COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `update_all_stats` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `update_all_stats`()
BEGIN
    
    UPDATE countries c
    SET 
        c.total_active_ipv6 = (
            SELECT COUNT(*) 
            FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.country_id = c.country_id
        ),
        c.total_ipv6_prefixes = (
            SELECT COUNT(*) 
            FROM ip_prefixes 
            WHERE country_id = c.country_id
        ),
        c.last_updated = NOW();

    
    UPDATE asns a
    SET 
        a.total_active_ipv6 = (
            SELECT COUNT(*) 
            FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.asn = a.asn
        ),
        a.total_ipv6_prefixes = (
            SELECT COUNT(*) 
            FROM ip_prefixes 
            WHERE asn = a.asn
        ),
        a.last_updated = NOW();
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `update_prefix_active_ipv6_count` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `update_prefix_active_ipv6_count`()
BEGIN
    
    DECLARE v_affected_rows INT DEFAULT 0;
    
    
    START TRANSACTION;
    
    
    UPDATE ip_prefixes ip
    SET ip.active_ipv6_count = (
        SELECT COUNT(*) 
        FROM active_addresses aa 
        WHERE aa.prefix_id = ip.prefix_id AND aa.version = '6'
    )
    WHERE ip.version = '6';
    
    
    SET v_affected_rows = ROW_COUNT();
    
    
    COMMIT;
    
    
    SELECT CONCAT('已更新 ', v_affected_rows, ' 个IPv6前缀的活跃地址数量') AS result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `update_related_protocol_stats_for_asn` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `update_related_protocol_stats_for_asn`(IN p_asn INT, IN p_protocol_id INT)
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_region VARCHAR(50);
    DECLARE v_total_active_country INT;
    DECLARE v_total_active_region INT;
    DECLARE v_affected_addresses_country INT;
    DECLARE v_affected_addresses_region INT;
    DECLARE v_affected_addresses_global INT;
    DECLARE v_affected_asns_global INT;
    DECLARE v_affected_countries_global INT;

    
    SELECT c.country_id, c.region, c.total_active_ipv6
    INTO v_country_id, v_region, v_total_active_country
    FROM asns a
    JOIN countries c ON a.country_id = c.country_id
    WHERE a.asn = p_asn;

    IF v_country_id IS NOT NULL THEN
        
        SELECT IFNULL(SUM(aps.affected_addresses), 0)
        INTO v_affected_addresses_country
        FROM asn_protocol_stats aps
        JOIN asns a ON aps.asn = a.asn
        WHERE a.country_id = v_country_id AND aps.protocol_id = p_protocol_id;
        
        
        INSERT INTO country_protocol_stats (country_id, protocol_id, affected_addresses, total_addresses, percentage, last_updated)
        VALUES (v_country_id, p_protocol_id, v_affected_addresses_country, v_total_active_country,
                IF(v_total_active_country > 0, ROUND(v_affected_addresses_country * 100.0 / v_total_active_country, 2), 0), NOW())
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses),
            percentage = VALUES(percentage),
            last_updated = NOW();

        IF v_region IS NOT NULL THEN
            
            SELECT IFNULL(SUM(total_active_ipv6), 0)
            INTO v_total_active_region
            FROM countries
            WHERE region = v_region;

            
            SELECT IFNULL(SUM(aps.affected_addresses), 0)
            INTO v_affected_addresses_region
            FROM asn_protocol_stats aps
            JOIN asns a ON aps.asn = a.asn
            JOIN countries c ON a.country_id = c.country_id
            WHERE c.region = v_region AND aps.protocol_id = p_protocol_id;

            
            INSERT INTO region_protocol_stats (region, protocol_id, affected_addresses, total_addresses, affected_percentage, last_updated)
            VALUES (v_region, p_protocol_id, v_affected_addresses_region, v_total_active_region,
                    IF(v_total_active_region > 0, ROUND(v_affected_addresses_region * 100.0 / v_total_active_region, 2), 0), NOW())
            ON DUPLICATE KEY UPDATE
                affected_addresses = VALUES(affected_addresses),
                total_addresses = VALUES(total_addresses),
                affected_percentage = VALUES(affected_percentage),
                last_updated = NOW();
        END IF;
    END IF;

    
    
    SELECT IFNULL(SUM(affected_addresses), 0)
    INTO v_affected_addresses_global
    FROM country_protocol_stats
    WHERE protocol_id = p_protocol_id;

    
    SELECT COUNT(DISTINCT country_id)
    INTO v_affected_countries_global
    FROM country_protocol_stats
    WHERE protocol_id = p_protocol_id AND affected_addresses > 0;

    
    SELECT COUNT(DISTINCT asn)
    INTO v_affected_asns_global
    FROM asn_protocol_stats
    WHERE protocol_id = p_protocol_id AND affected_addresses > 0;

    INSERT INTO protocol_stats (protocol_id, affected_addresses, affected_asns, affected_countries, last_updated)
    VALUES (p_protocol_id, v_affected_addresses_global, v_affected_asns_global, v_affected_countries_global, NOW())
    ON DUPLICATE KEY UPDATE
        affected_addresses = VALUES(affected_addresses),
        affected_asns = VALUES(affected_asns),
        affected_countries = VALUES(affected_countries),
        last_updated = NOW();
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `update_related_vulnerability_stats_for_asn` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `update_related_vulnerability_stats_for_asn`(IN p_asn INT, IN p_vulnerability_id INT)
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_region VARCHAR(50);
    DECLARE v_total_active_country INT;
    DECLARE v_total_active_region INT;
    DECLARE v_affected_addresses_country INT;
    DECLARE v_affected_addresses_region INT;
    DECLARE v_affected_addresses_global INT;
    DECLARE v_affected_asns_global INT;
    DECLARE v_affected_countries_global INT;

    
    SELECT c.country_id, c.region, c.total_active_ipv6
    INTO v_country_id, v_region, v_total_active_country
    FROM asns a
    JOIN countries c ON a.country_id = c.country_id
    WHERE a.asn = p_asn;

    IF v_country_id IS NOT NULL THEN
        
        SELECT IFNULL(SUM(avs.affected_addresses), 0)
        INTO v_affected_addresses_country
        FROM asn_vulnerability_stats avs
        JOIN asns a ON avs.asn = a.asn
        WHERE a.country_id = v_country_id AND avs.vulnerability_id = p_vulnerability_id;
        
        
        INSERT INTO country_vulnerability_stats (country_id, vulnerability_id, affected_addresses, total_addresses, percentage, last_updated)
        VALUES (v_country_id, p_vulnerability_id, v_affected_addresses_country, v_total_active_country,
                IF(v_total_active_country > 0, ROUND(v_affected_addresses_country * 100.0 / v_total_active_country, 2), 0), NOW())
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses), 
            percentage = VALUES(percentage),
            last_updated = NOW();

        IF v_region IS NOT NULL THEN
            
            SELECT IFNULL(SUM(total_active_ipv6), 0)
            INTO v_total_active_region
            FROM countries
            WHERE region = v_region;

            
            SELECT IFNULL(SUM(avs.affected_addresses), 0)
            INTO v_affected_addresses_region
            FROM asn_vulnerability_stats avs
            JOIN asns a ON avs.asn = a.asn
            JOIN countries c ON a.country_id = c.country_id
            WHERE c.region = v_region AND avs.vulnerability_id = p_vulnerability_id;

            
            INSERT INTO region_vulnerability_stats (region, vulnerability_id, affected_addresses, total_addresses, affected_percentage, last_updated)
            VALUES (v_region, p_vulnerability_id, v_affected_addresses_region, v_total_active_region,
                    IF(v_total_active_region > 0, ROUND(v_affected_addresses_region * 100.0 / v_total_active_region, 2), 0), NOW())
            ON DUPLICATE KEY UPDATE
                affected_addresses = VALUES(affected_addresses),
                total_addresses = VALUES(total_addresses), 
                affected_percentage = VALUES(affected_percentage),
                last_updated = NOW();
        END IF;
    END IF;

    
    
    SELECT IFNULL(SUM(affected_addresses), 0)
    INTO v_affected_addresses_global
    FROM country_vulnerability_stats
    WHERE vulnerability_id = p_vulnerability_id;

    
    SELECT COUNT(DISTINCT country_id)
    INTO v_affected_countries_global
    FROM country_vulnerability_stats
    WHERE vulnerability_id = p_vulnerability_id AND affected_addresses > 0;

    
    SELECT COUNT(DISTINCT asn)
    INTO v_affected_asns_global
    FROM asn_vulnerability_stats
    WHERE vulnerability_id = p_vulnerability_id AND affected_addresses > 0;

    INSERT INTO vulnerability_stats (vulnerability_id, affected_addresses, affected_asns, affected_countries, last_updated)
    VALUES (p_vulnerability_id, v_affected_addresses_global, v_affected_asns_global, v_affected_countries_global, NOW())
    ON DUPLICATE KEY UPDATE
        affected_addresses = VALUES(affected_addresses),
        affected_asns = VALUES(affected_asns),
        affected_countries = VALUES(affected_countries),
        last_updated = NOW();
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `update_relation_tables` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `update_relation_tables`()
BEGIN
    
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_protocol_id INT;
    DECLARE v_vulnerability_id INT;
    DECLARE v_asn INT;
    DECLARE v_country_id CHAR(2);
    DECLARE v_region VARCHAR(50);
    
    
    DECLARE cur_protocols CURSOR FOR 
        SELECT protocol_id FROM protocols;
    
    
    DECLARE cur_vulnerabilities CURSOR FOR 
        SELECT vulnerability_id FROM vulnerabilities;
    
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    
    START TRANSACTION;
    
    
    
    
    
    
    INSERT INTO asn_protocol_stats (asn, protocol_id, total_active_ipv6, affected_percentage)
    SELECT 
        a.asn,
        p.protocol_id,
        a.total_active_ipv6,
        0.00 AS affected_percentage
    FROM 
        asns a
    CROSS JOIN 
        protocols p
    WHERE 
        a.total_active_ipv6 > 0
    ON DUPLICATE KEY UPDATE
        total_active_ipv6 = a.total_active_ipv6,
        last_updated = NOW();
    
    
    
    OPEN cur_protocols;
    
    
    SET done = FALSE;
    
    
    read_protocol_loop: LOOP
        FETCH cur_protocols INTO v_protocol_id;
        
        IF done THEN
            LEAVE read_protocol_loop;
        END IF;
        
        
        INSERT INTO country_protocol_stats (country_id, protocol_id, affected_addresses, total_addresses, percentage)
        SELECT 
            c.country_id,
            v_protocol_id,
            IFNULL(SUM(aps.affected_addresses), 0) AS affected_addresses,
            c.total_active_ipv6 AS total_addresses,
            CASE 
                WHEN c.total_active_ipv6 > 0 THEN 
                    ROUND(IFNULL(SUM(aps.affected_addresses), 0) * 100.0 / c.total_active_ipv6, 2)
                ELSE 0
            END AS percentage
        FROM 
            countries c
        LEFT JOIN 
            asns a ON c.country_id = a.country_id
        LEFT JOIN 
            asn_protocol_stats aps ON a.asn = aps.asn AND aps.protocol_id = v_protocol_id
        GROUP BY 
            c.country_id
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses),
            percentage = VALUES(percentage),
            last_updated = NOW();
        
        
        INSERT INTO region_protocol_stats (region, protocol_id, affected_addresses, total_addresses, affected_percentage)
        SELECT 
            c.region,
            v_protocol_id,
            IFNULL(SUM(cps.affected_addresses), 0) AS affected_addresses,
            SUM(c.total_active_ipv6) AS total_addresses,
            CASE 
                WHEN SUM(c.total_active_ipv6) > 0 THEN 
                    ROUND(IFNULL(SUM(cps.affected_addresses), 0) * 100.0 / SUM(c.total_active_ipv6), 2)
                ELSE 0
            END AS affected_percentage
        FROM 
            countries c
        LEFT JOIN 
            country_protocol_stats cps ON c.country_id = cps.country_id AND cps.protocol_id = v_protocol_id
        WHERE 
            c.region IS NOT NULL
        GROUP BY 
            c.region
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses),
            affected_percentage = VALUES(affected_percentage),
            last_updated = NOW();
        
        
        INSERT INTO protocol_stats (protocol_id, affected_addresses, affected_asns, affected_countries)
        SELECT 
            v_protocol_id,
            IFNULL(SUM(cps.affected_addresses), 0) AS affected_addresses,
            (SELECT COUNT(*) FROM asn_protocol_stats WHERE protocol_id = v_protocol_id AND affected_addresses > 0) AS affected_asns,
            (SELECT COUNT(*) FROM country_protocol_stats WHERE protocol_id = v_protocol_id AND affected_addresses > 0) AS affected_countries
        FROM 
            country_protocol_stats cps
        WHERE 
            cps.protocol_id = v_protocol_id
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            affected_asns = VALUES(affected_asns),
            affected_countries = VALUES(affected_countries),
            last_updated = NOW();
    END LOOP;
    
    
    CLOSE cur_protocols;
    
    
    SET done = FALSE;
    
    
    
    
    
    
    INSERT INTO asn_vulnerability_stats (asn, vulnerability_id, total_active_ipv6, affected_percentage)
    SELECT 
        a.asn,
        v.vulnerability_id,
        a.total_active_ipv6,
        0.00 AS affected_percentage
    FROM 
        asns a
    CROSS JOIN 
        vulnerabilities v
    WHERE 
        a.total_active_ipv6 > 0
    ON DUPLICATE KEY UPDATE
        total_active_ipv6 = a.total_active_ipv6,
        last_updated = NOW();
    
    
    
    OPEN cur_vulnerabilities;
    
    
    read_vulnerability_loop: LOOP
        FETCH cur_vulnerabilities INTO v_vulnerability_id;
        
        IF done THEN
            LEAVE read_vulnerability_loop;
        END IF;
        
        
        INSERT INTO country_vulnerability_stats (country_id, vulnerability_id, affected_addresses, total_addresses, percentage)
        SELECT 
            c.country_id,
            v_vulnerability_id,
            IFNULL(SUM(avs.affected_addresses), 0) AS affected_addresses,
            c.total_active_ipv6 AS total_addresses,
            CASE 
                WHEN c.total_active_ipv6 > 0 THEN 
                    ROUND(IFNULL(SUM(avs.affected_addresses), 0) * 100.0 / c.total_active_ipv6, 2)
                ELSE 0
            END AS percentage
        FROM 
            countries c
        LEFT JOIN 
            asns a ON c.country_id = a.country_id
        LEFT JOIN 
            asn_vulnerability_stats avs ON a.asn = avs.asn AND avs.vulnerability_id = v_vulnerability_id
        GROUP BY 
            c.country_id
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses),
            percentage = VALUES(percentage),
            last_updated = NOW();
        
        
        INSERT INTO region_vulnerability_stats (region, vulnerability_id, affected_addresses, total_addresses, affected_percentage)
        SELECT 
            c.region,
            v_vulnerability_id,
            IFNULL(SUM(cvs.affected_addresses), 0) AS affected_addresses,
            SUM(c.total_active_ipv6) AS total_addresses,
            CASE 
                WHEN SUM(c.total_active_ipv6) > 0 THEN 
                    ROUND(IFNULL(SUM(cvs.affected_addresses), 0) * 100.0 / SUM(c.total_active_ipv6), 2)
                ELSE 0
            END AS affected_percentage
        FROM 
            countries c
        LEFT JOIN 
            country_vulnerability_stats cvs ON c.country_id = cvs.country_id AND cvs.vulnerability_id = v_vulnerability_id
        WHERE 
            c.region IS NOT NULL
        GROUP BY 
            c.region
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            total_addresses = VALUES(total_addresses),
            affected_percentage = VALUES(affected_percentage),
            last_updated = NOW();
        
        
        INSERT INTO vulnerability_stats (vulnerability_id, affected_addresses, affected_asns, affected_countries)
        SELECT 
            v_vulnerability_id,
            IFNULL(SUM(cvs.affected_addresses), 0) AS affected_addresses,
            (SELECT COUNT(*) FROM asn_vulnerability_stats WHERE vulnerability_id = v_vulnerability_id AND affected_addresses > 0) AS affected_asns,
            (SELECT COUNT(*) FROM country_vulnerability_stats WHERE vulnerability_id = v_vulnerability_id AND affected_addresses > 0) AS affected_countries
        FROM 
            country_vulnerability_stats cvs
        WHERE 
            cvs.vulnerability_id = v_vulnerability_id
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            affected_asns = VALUES(affected_asns),
            affected_countries = VALUES(affected_countries),
            last_updated = NOW();
    END LOOP;
    
    
    CLOSE cur_vulnerabilities;
    
    
    COMMIT;
END ;;
DELIMITER ;


-- 插入默认管理员用户
-- 用户名: admin, 手机号: 13011122222, 密码: admin, 角色: admin
-- 注意：使用明文密码存储
INSERT IGNORE INTO `users` (`phone`, `password_hash`, `role`) VALUES
('13011122222', 'admin', 'admin');

INSERT INTO tools (name, description) VALUES
('xmap', 'IPv6网络探测工具'),
('addr6', 'IPv6地址生成工具'),
('zgrab2', '应用层协议扫描工具'),
('database', '数据库更新工具'),
('jsonanalysis', 'JSON分析工具');

/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `asn_protocol_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `asn_protocol_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `asn_protocol_stats_view` AS select `aps`.`asn` AS `asn`,`a`.`as_name` AS `as_name`,`a`.`as_name_zh` AS `as_name_zh`,`a`.`country_id` AS `country_id`,`c`.`country_name` AS `country_name`,`c`.`country_name_zh` AS `country_name_zh`,`aps`.`protocol_id` AS `protocol_id`,`p`.`protocol_name` AS `protocol_name`,`aps`.`affected_addresses` AS `affected_addresses`,`aps`.`total_active_ipv6` AS `total_active_ipv6`,`aps`.`affected_percentage` AS `affected_percentage`,`aps`.`last_updated` AS `last_updated` from (((`asn_protocol_stats` `aps` join `asns` `a` on((`aps`.`asn` = `a`.`asn`))) join `protocols` `p` on((`aps`.`protocol_id` = `p`.`protocol_id`))) left join `countries` `c` on((`a`.`country_id` = `c`.`country_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `asn_vulnerability_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `asn_vulnerability_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `asn_vulnerability_stats_view` AS select `avs`.`asn` AS `asn`,`a`.`as_name` AS `as_name`,`a`.`as_name_zh` AS `as_name_zh`,`a`.`country_id` AS `country_id`,`c`.`country_name` AS `country_name`,`c`.`country_name_zh` AS `country_name_zh`,`avs`.`vulnerability_id` AS `vulnerability_id`,`v`.`cve_id` AS `cve_id`,`v`.`name` AS `name`,`v`.`severity` AS `severity`,`avs`.`affected_addresses` AS `affected_addresses`,`avs`.`total_active_ipv6` AS `total_active_ipv6`,`avs`.`affected_percentage` AS `affected_percentage`,`avs`.`last_updated` AS `last_updated` from (((`asn_vulnerability_stats` `avs` join `asns` `a` on((`avs`.`asn` = `a`.`asn`))) join `vulnerabilities` `v` on((`avs`.`vulnerability_id` = `v`.`vulnerability_id`))) left join `countries` `c` on((`a`.`country_id` = `c`.`country_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `country_protocol_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `country_protocol_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `country_protocol_stats_view` AS select `cps`.`country_id` AS `country_id`,`c`.`country_name` AS `country_name`,`c`.`country_name_zh` AS `country_name_zh`,`cps`.`protocol_id` AS `protocol_id`,`p`.`protocol_name` AS `protocol_name`,`cps`.`affected_addresses` AS `affected_addresses`,`cps`.`total_addresses` AS `total_addresses`,`cps`.`percentage` AS `percentage`,`cps`.`last_updated` AS `last_updated` from ((`country_protocol_stats` `cps` join `countries` `c` on((`cps`.`country_id` = `c`.`country_id`))) join `protocols` `p` on((`cps`.`protocol_id` = `p`.`protocol_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `country_vulnerability_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `country_vulnerability_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `country_vulnerability_stats_view` AS select `cvs`.`country_id` AS `country_id`,`c`.`country_name` AS `country_name`,`c`.`country_name_zh` AS `country_name_zh`,`cvs`.`vulnerability_id` AS `vulnerability_id`,`v`.`cve_id` AS `cve_id`,`v`.`name` AS `name`,`v`.`severity` AS `severity`,`v`.`description` AS `description`,`cvs`.`total_addresses` AS `total_addresses`,`cvs`.`affected_addresses` AS `affected_addresses`,`cvs`.`percentage` AS `percentage`,`cvs`.`last_updated` AS `last_updated` from ((`country_vulnerability_stats` `cvs` join `countries` `c` on((`cvs`.`country_id` = `c`.`country_id`))) join `vulnerabilities` `v` on((`cvs`.`vulnerability_id` = `v`.`vulnerability_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `protocol_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `protocol_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `protocol_stats_view` AS select `ps`.`protocol_id` AS `protocol_id`,`p`.`protocol_name` AS `protocol_name`,`p`.`description` AS `description`,`ps`.`affected_addresses` AS `affected_addresses`,`ps`.`affected_asns` AS `affected_asns`,`ps`.`affected_countries` AS `affected_countries`,`ps`.`last_updated` AS `last_updated` from (`protocol_stats` `ps` join `protocols` `p` on((`ps`.`protocol_id` = `p`.`protocol_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `region_protocol_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `region_protocol_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `region_protocol_stats_view` AS select `rps`.`region` AS `region`,`rps`.`protocol_id` AS `protocol_id`,`p`.`protocol_name` AS `protocol_name`,`rps`.`affected_addresses` AS `affected_addresses`,`rps`.`total_addresses` AS `total_addresses`,`rps`.`affected_percentage` AS `affected_percentage`,`rps`.`last_updated` AS `last_updated` from (`region_protocol_stats` `rps` join `protocols` `p` on((`rps`.`protocol_id` = `p`.`protocol_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `region_vulnerability_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `region_vulnerability_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `region_vulnerability_stats_view` AS select `rvs`.`region` AS `region`,`rvs`.`vulnerability_id` AS `vulnerability_id`,`v`.`cve_id` AS `cve_id`,`v`.`name` AS `name`,`v`.`severity` AS `severity`,`rvs`.`affected_addresses` AS `affected_addresses`,`rvs`.`total_addresses` AS `total_addresses`,`rvs`.`affected_percentage` AS `affected_percentage`,`rvs`.`last_updated` AS `last_updated` from (`region_vulnerability_stats` `rvs` join `vulnerabilities` `v` on((`rvs`.`vulnerability_id` = `v`.`vulnerability_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vulnerability_stats_view`
--

/*!50001 DROP VIEW IF EXISTS `vulnerability_stats_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vulnerability_stats_view` AS select `vs`.`vulnerability_id` AS `vulnerability_id`,`v`.`cve_id` AS `cve_id`,`v`.`name` AS `name`,`v`.`description` AS `description`,`v`.`severity` AS `severity`,`vs`.`affected_addresses` AS `affected_addresses`,`vs`.`affected_asns` AS `affected_asns`,`vs`.`affected_countries` AS `affected_countries`,`vs`.`last_updated` AS `last_updated` from (`vulnerability_stats` `vs` join `vulnerabilities` `v` on((`vs`.`vulnerability_id` = `v`.`vulnerability_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-07-09  3:12:32

-- 亚洲国家
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('AF', 'Afghanistan', '阿富汗', 'AFG', 'Asia', 'Southern Asia', 33.93911, 67.709953),
('AM', 'Armenia', '亚美尼亚', 'ARM', 'Asia', 'Western Asia', 40.069099, 45.038189),
('AZ', 'Azerbaijan', '阿塞拜疆', 'AZE', 'Asia', 'Western Asia', 40.143105, 47.576927),
('BH', 'Bahrain', '巴林', 'BHR', 'Asia', 'Western Asia', 25.930414, 50.637772),
('BD', 'Bangladesh', '孟加拉国', 'BGD', 'Asia', 'Southern Asia', 23.684994, 90.356331),
('BT', 'Bhutan', '不丹', 'BTN', 'Asia', 'Southern Asia', 27.514162, 90.433601),
('BN', 'Brunei Darussalam', '文莱', 'BRN', 'Asia', 'South-Eastern Asia', 4.535277, 114.727669),
('KH', 'Cambodia', '柬埔寨', 'KHM', 'Asia', 'South-Eastern Asia', 12.565679, 104.990963),
('CY', 'Cyprus', '塞浦路斯', 'CYP', 'Asia', 'Western Asia', 35.126413, 33.429859),
('GE', 'Georgia', '格鲁吉亚', 'GEO', 'Asia', 'Western Asia', 42.315407, 43.356892),
('IN', 'India', '印度', 'IND', 'Asia', 'Southern Asia', 20.593684, 78.96288),
('ID', 'Indonesia', '印度尼西亚', 'IDN', 'Asia', 'South-Eastern Asia', -0.789275, 113.921327),
('IR', 'Iran', '伊朗', 'IRN', 'Asia', 'Southern Asia', 32.427908, 53.688046),
('IQ', 'Iraq', '伊拉克', 'IRQ', 'Asia', 'Western Asia', 33.223191, 43.679291),
('IL', 'Israel', '以色列', 'ISR', 'Asia', 'Western Asia', 31.046051, 34.851612),
('JP', 'Japan', '日本', 'JPN', 'Asia', 'Eastern Asia', 36.204824, 138.252924),
('JO', 'Jordan', '约旦', 'JOR', 'Asia', 'Western Asia', 30.585164, 36.238414),
('KZ', 'Kazakhstan', '哈萨克斯坦', 'KAZ', 'Asia', 'Central Asia', 48.019573, 66.923684),
('KW', 'Kuwait', '科威特', 'KWT', 'Asia', 'Western Asia', 29.31166, 47.481766),
('KG', 'Kyrgyzstan', '吉尔吉斯斯坦', 'KGZ', 'Asia', 'Central Asia', 41.20438, 74.766098),
('LA', 'Lao PDR', '老挝', 'LAO', 'Asia', 'South-Eastern Asia', 19.85627, 102.495496),
('LB', 'Lebanon', '黎巴嫩', 'LBN', 'Asia', 'Western Asia', 33.854721, 35.862285),
('MY', 'Malaysia', '马来西亚', 'MYS', 'Asia', 'South-Eastern Asia', 4.210484, 101.975766),
('MV', 'Maldives', '马尔代夫', 'MDV', 'Asia', 'Southern Asia', 3.202778, 73.22068),
('MN', 'Mongolia', '蒙古', 'MNG', 'Asia', 'Eastern Asia', 46.862496, 103.846656),
('MM', 'Myanmar', '缅甸', 'MMR', 'Asia', 'South-Eastern Asia', 21.913965, 95.956223),
('NP', 'Nepal', '尼泊尔', 'NPL', 'Asia', 'Southern Asia', 28.394857, 84.124008),
('KP', 'North Korea', '朝鲜', 'PRK', 'Asia', 'Eastern Asia', 40.339852, 127.510093),
('OM', 'Oman', '阿曼', 'OMN', 'Asia', 'Western Asia', 21.512583, 55.923255),
('PK', 'Pakistan', '巴基斯坦', 'PAK', 'Asia', 'Southern Asia', 30.375321, 69.345116),
('PS', 'Palestine', '巴勒斯坦', 'PSE', 'Asia', 'Western Asia', 31.952162, 35.233154),
('PH', 'Philippines', '菲律宾', 'PHL', 'Asia', 'South-Eastern Asia', 12.879721, 121.774017),
('QA', 'Qatar', '卡塔尔', 'QAT', 'Asia', 'Western Asia', 25.354826, 51.183884),
('SA', 'Saudi Arabia', '沙特阿拉伯', 'SAU', 'Asia', 'Western Asia', 23.885942, 45.079162),
('SG', 'Singapore', '新加坡', 'SGP', 'Asia', 'South-Eastern Asia', 1.352083, 103.819836),
('KR', 'South Korea', '韩国', 'KOR', 'Asia', 'Eastern Asia', 35.907757, 127.766922),
('LK', 'Sri Lanka', '斯里兰卡', 'LKA', 'Asia', 'Southern Asia', 7.873054, 80.771797),
('SY', 'Syria', '叙利亚', 'SYR', 'Asia', 'Western Asia', 34.802075, 38.996815),
('TW', 'Taiwan', '台湾地区(中国的省份)', 'TWN', 'Asia', 'Eastern Asia', 23.69781, 120.960515),
('TJ', 'Tajikistan', '塔吉克斯坦', 'TJK', 'Asia', 'Central Asia', 38.861034, 71.276093),
('TH', 'Thailand', '泰国', 'THA', 'Asia', 'South-Eastern Asia', 15.870032, 100.992541),
('TL', 'Timor-Leste', '东帝汶', 'TLS', 'Asia', 'South-Eastern Asia', -8.874217, 125.727539),
('TR', 'Turkey', '土耳其', 'TUR', 'Asia', 'Western Asia', 38.963745, 35.243322),
('TM', 'Turkmenistan', '土库曼斯坦', 'TKM', 'Asia', 'Central Asia', 38.969719, 59.556278),
('AE', 'United Arab Emirates', '阿拉伯联合酋长国', 'ARE', 'Asia', 'Western Asia', 23.424076, 53.847818),
('UZ', 'Uzbekistan', '乌兹别克斯坦', 'UZB', 'Asia', 'Central Asia', 41.377491, 64.585262),
('VN', 'Vietnam', '越南', 'VNM', 'Asia', 'South-Eastern Asia', 14.058324, 108.277199),
('YE', 'Yemen', '也门', 'YEM', 'Asia', 'Western Asia', 15.552727, 48.516388);

-- 欧洲国家
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('AL', 'Albania', '阿尔巴尼亚', 'ALB', 'Europe', 'Southern Europe', 41.153332, 20.168331),
('AD', 'Andorra', '安道尔', 'AND', 'Europe', 'Southern Europe', 42.546245, 1.601554),
('AT', 'Austria', '奥地利', 'AUT', 'Europe', 'Western Europe', 47.516231, 14.550072),
('BY', 'Belarus', '白俄罗斯', 'BLR', 'Europe', 'Eastern Europe', 53.709807, 27.953389),
('BE', 'Belgium', '比利时', 'BEL', 'Europe', 'Western Europe', 50.503887, 4.469936),
('BA', 'Bosnia and Herzegovina', '波斯尼亚和黑塞哥维那', 'BIH', 'Europe', 'Southern Europe', 43.915886, 17.679076),
('BG', 'Bulgaria', '保加利亚', 'BGR', 'Europe', 'Eastern Europe', 42.733883, 25.48583),
('HR', 'Croatia', '克罗地亚', 'HRV', 'Europe', 'Southern Europe', 45.1, 15.2),
('CZ', 'Czech Republic', '捷克', 'CZE', 'Europe', 'Eastern Europe', 49.817492, 15.472962),
('DK', 'Denmark', '丹麦', 'DNK', 'Europe', 'Northern Europe', 56.26392, 9.501785),
('EE', 'Estonia', '爱沙尼亚', 'EST', 'Europe', 'Northern Europe', 58.595272, 25.013607),
('FO', 'Faroe Islands', '法罗群岛', 'FRO', 'Europe', 'Northern Europe', 61.892635, -6.911806),
('FI', 'Finland', '芬兰', 'FIN', 'Europe', 'Northern Europe', 61.92411, 25.748151),
('FR', 'France', '法国', 'FRA', 'Europe', 'Western Europe', 46.227638, 2.213749),
('DE', 'Germany', '德国', 'DEU', 'Europe', 'Western Europe', 51.165691, 10.451526),
('GI', 'Gibraltar', '直布罗陀', 'GIB', 'Europe', 'Southern Europe', 36.137741, -5.345374),
('GR', 'Greece', '希腊', 'GRC', 'Europe', 'Southern Europe', 39.074208, 21.824312),
('GG', 'Guernsey', '根西岛', 'GGY', 'Europe', 'Northern Europe', 49.465691, -2.585278),
('HU', 'Hungary', '匈牙利', 'HUN', 'Europe', 'Eastern Europe', 47.162494, 19.503304),
('IS', 'Iceland', '冰岛', 'ISL', 'Europe', 'Northern Europe', 64.963051, -19.020835),
('IE', 'Ireland', '爱尔兰', 'IRL', 'Europe', 'Northern Europe', 53.41291, -8.24389),
('IM', 'Isle of Man', '马恩岛', 'IMN', 'Europe', 'Northern Europe', 54.236107, -4.548056),
('IT', 'Italy', '意大利', 'ITA', 'Europe', 'Southern Europe', 41.87194, 12.56738),
('JE', 'Jersey', '泽西岛', 'JEY', 'Europe', 'Northern Europe', 49.214439, -2.13125),
('XK', 'Kosovo', '科索沃', 'XKX', 'Europe', 'Eastern Europe', 42.602636, 20.902977),
('LV', 'Latvia', '拉脱维亚', 'LVA', 'Europe', 'Northern Europe', 56.879635, 24.603189),
('LI', 'Liechtenstein', '列支敦士登', 'LIE', 'Europe', 'Western Europe', 47.166, 9.555373),
('LT', 'Lithuania', '立陶宛', 'LTU', 'Europe', 'Northern Europe', 55.169438, 23.881275),
('LU', 'Luxembourg', '卢森堡', 'LUX', 'Europe', 'Western Europe', 49.815273, 6.129583),
('MK', 'North Macedonia', '北马其顿', 'MKD', 'Europe', 'Southern Europe', 41.608635, 21.745275),
('MT', 'Malta', '马耳他', 'MLT', 'Europe', 'Southern Europe', 35.937496, 14.375416),
('MD', 'Moldova', '摩尔多瓦', 'MDA', 'Europe', 'Eastern Europe', 47.411631, 28.369885),
('MC', 'Monaco', '摩纳哥', 'MCO', 'Europe', 'Western Europe', 43.750298, 7.412841),
('ME', 'Montenegro', '黑山', 'MNE', 'Europe', 'Southern Europe', 42.708678, 19.37439),
('NL', 'Netherlands', '荷兰', 'NLD', 'Europe', 'Western Europe', 52.132633, 5.291266),
('NO', 'Norway', '挪威', 'NOR', 'Europe', 'Northern Europe', 60.472024, 8.468946),
('PL', 'Poland', '波兰', 'POL', 'Europe', 'Eastern Europe', 51.919438, 19.145136),
('PT', 'Portugal', '葡萄牙', 'PRT', 'Europe', 'Southern Europe', 39.399872, -8.224454),
('RO', 'Romania', '罗马尼亚', 'ROU', 'Europe', 'Eastern Europe', 45.943161, 24.96676),
('RU', 'Russian Federation', '俄罗斯', 'RUS', 'Europe', 'Eastern Europe', 61.52401, 105.318756),
('SM', 'San Marino', '圣马力诺', 'SMR', 'Europe', 'Southern Europe', 43.94236, 12.457777),
('RS', 'Serbia', '塞尔维亚', 'SRB', 'Europe', 'Southern Europe', 44.016521, 21.005859),
('SK', 'Slovakia', '斯洛伐克', 'SVK', 'Europe', 'Eastern Europe', 48.669026, 19.699024),
('SI', 'Slovenia', '斯洛文尼亚', 'SVN', 'Europe', 'Southern Europe', 46.151241, 14.995463),
('ES', 'Spain', '西班牙', 'ESP', 'Europe', 'Southern Europe', 40.463667, -3.74922),
('SE', 'Sweden', '瑞典', 'SWE', 'Europe', 'Northern Europe', 60.128161, 18.643501),
('CH', 'Switzerland', '瑞士', 'CHE', 'Europe', 'Western Europe', 46.818188, 8.227512),
('UA', 'Ukraine', '乌克兰', 'UKR', 'Europe', 'Eastern Europe', 48.379433, 31.16558),
('GB', 'United Kingdom', '英国', 'GBR', 'Europe', 'Northern Europe', 55.378051, -3.435973),
('VA', 'Holy See (Vatican City State)', '梵蒂冈', 'VAT', 'Europe', 'Southern Europe', 41.902916, 12.453389);

-- 非洲国家
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('DZ', 'Algeria', '阿尔及利亚', 'DZA', 'Africa', 'Northern Africa', 28.033886, 1.659626),
('AO', 'Angola', '安哥拉', 'AGO', 'Africa', 'Middle Africa', -11.202692, 17.873887),
('BJ', 'Benin', '贝宁', 'BEN', 'Africa', 'Western Africa', 9.30769, 2.315834),
('BW', 'Botswana', '博茨瓦纳', 'BWA', 'Africa', 'Southern Africa', -22.328474, 24.684866),
('BF', 'Burkina Faso', '布基纳法索', 'BFA', 'Africa', 'Western Africa', 12.238333, -1.561593),
('BI', 'Burundi', '布隆迪', 'BDI', 'Africa', 'Eastern Africa', -3.373056, 29.918886),
('CV', 'Cabo Verde', '佛得角', 'CPV', 'Africa', 'Western Africa', 16.002082, -24.013197),
('CM', 'Cameroon', '喀麦隆', 'CMR', 'Africa', 'Middle Africa', 7.369722, 12.354722),
('CF', 'Central African Republic', '中非共和国', 'CAF', 'Africa', 'Middle Africa', 6.611111, 20.939444),
('TD', 'Chad', '乍得', 'TCD', 'Africa', 'Middle Africa', 15.454166, 18.732207),
('KM', 'Comoros', '科摩罗', 'COM', 'Africa', 'Eastern Africa', -11.875001, 43.872219),
('CG', 'Congo', '刚果(布)', 'COG', 'Africa', 'Middle Africa', -0.228021, 15.827659),
('CD', 'Congo, Democratic Republic of the', '刚果(金)', 'COD', 'Africa', 'Middle Africa', -4.038333, 21.758664),
('CI', 'Côte d''Ivoire', '科特迪瓦', 'CIV', 'Africa', 'Western Africa', 7.539989, -5.54708),
('DJ', 'Djibouti', '吉布提', 'DJI', 'Africa', 'Eastern Africa', 11.825138, 42.590275),
('EG', 'Egypt', '埃及', 'EGY', 'Africa', 'Northern Africa', 26.820553, 30.802498),
('GQ', 'Equatorial Guinea', '赤道几内亚', 'GNQ', 'Africa', 'Middle Africa', 1.650801, 10.267895),
('ER', 'Eritrea', '厄立特里亚', 'ERI', 'Africa', 'Eastern Africa', 15.179384, 39.782334),
('SZ', 'Eswatini', '斯威士兰', 'SWZ', 'Africa', 'Southern Africa', -26.522503, 31.465866),
('ET', 'Ethiopia', '埃塞俄比亚', 'ETH', 'Africa', 'Eastern Africa', 9.145, 40.489673),
('GA', 'Gabon', '加蓬', 'GAB', 'Africa', 'Middle Africa', -0.803689, 11.609444),
('GM', 'Gambia', '冈比亚', 'GMB', 'Africa', 'Western Africa', 13.443182, -15.310139),
('GH', 'Ghana', '加纳', 'GHA', 'Africa', 'Western Africa', 7.946527, -1.023194),
('GN', 'Guinea', '几内亚', 'GIN', 'Africa', 'Western Africa', 9.945587, -9.696645),
('GW', 'Guinea-Bissau', '几内亚比绍', 'GNB', 'Africa', 'Western Africa', 11.803749, -15.180413),
('KE', 'Kenya', '肯尼亚', 'KEN', 'Africa', 'Eastern Africa', -0.023559, 37.906193),
('LS', 'Lesotho', '莱索托', 'LSO', 'Africa', 'Southern Africa', -29.609988, 28.233608),
('LR', 'Liberia', '利比里亚', 'LBR', 'Africa', 'Western Africa', 6.428055, -9.429499),
('LY', 'Libya', '利比亚', 'LBY', 'Africa', 'Northern Africa', 26.3351, 17.228331),
('MG', 'Madagascar', '马达加斯加', 'MDG', 'Africa', 'Eastern Africa', -18.766947, 46.869107),
('MW', 'Malawi', '马拉维', 'MWA', 'Africa', 'Eastern Africa', -13.254308, 34.301525),
('ML', 'Mali', '马里', 'MLI', 'Africa', 'Western Africa', 17.570692, -3.996166),
('MR', 'Mauritania', '毛里塔尼亚', 'MRT', 'Africa', 'Western Africa', 21.00789, -10.940835),
('MU', 'Mauritius', '毛里求斯', 'MUS', 'Africa', 'Eastern Africa', -20.348404, 57.552152),
('YT', 'Mayotte', '马约特', 'MYT', 'Africa', 'Eastern Africa', -12.8275, 45.166244),
('MA', 'Morocco', '摩洛哥', 'MAR', 'Africa', 'Northern Africa', 31.791702, -7.09262),
('MZ', 'Mozambique', '莫桑比克', 'MOZ', 'Africa', 'Eastern Africa', -18.665695, 35.529562),
('NA', 'Namibia', '纳米比亚', 'NAM', 'Africa', 'Southern Africa', -22.95764, 18.49041),
('NE', 'Niger', '尼日尔', 'NER', 'Africa', 'Western Africa', 17.607789, 8.081666),
('NG', 'Nigeria', '尼日利亚', 'NGA', 'Africa', 'Western Africa', 9.081999, 8.675277),
('RE', 'Réunion', '留尼汪', 'REU', 'Africa', 'Eastern Africa', -21.115141, 55.536384),
('RW', 'Rwanda', '卢旺达', 'RWA', 'Africa', 'Eastern Africa', -1.940278, 29.873888),
('SH', 'Saint Helena', '圣赫勒拿', 'SHN', 'Africa', 'Western Africa', -24.143474, -10.030696),
('ST', 'Sao Tome and Principe', '圣多美和普林西比', 'STP', 'Africa', 'Middle Africa', 0.18636, 6.613081),
('SN', 'Senegal', '塞内加尔', 'SEN', 'Africa', 'Western Africa', 14.497401, -14.452362),
('SC', 'Seychelles', '塞舌尔', 'SYC', 'Africa', 'Eastern Africa', -4.679574, 55.491977),
('SL', 'Sierra Leone', '塞拉利昂', 'SLE', 'Africa', 'Western Africa', 8.460555, -11.779889),
('SO', 'Somalia', '索马里', 'SOM', 'Africa', 'Eastern Africa', 5.152149, 46.199616),
('ZA', 'South Africa', '南非', 'ZAF', 'Africa', 'Southern Africa', -30.559482, 22.937506),
('SS', 'South Sudan', '南苏丹', 'SSD', 'Africa', 'Eastern Africa', 6.876991, 31.306978),
('SD', 'Sudan', '苏丹', 'SDN', 'Africa', 'Northern Africa', 12.862807, 30.217636),
('TZ', 'Tanzania', '坦桑尼亚', 'TZA', 'Africa', 'Eastern Africa', -6.369028, 34.888822),
('TG', 'Togo', '多哥', 'TGO', 'Africa', 'Western Africa', 8.619543, 0.824782),
('TN', 'Tunisia', '突尼斯', 'TUN', 'Africa', 'Northern Africa', 33.886917, 9.537499),
('UG', 'Uganda', '乌干达', 'UGA', 'Africa', 'Eastern Africa', 1.373333, 32.290275),
('EH', 'Western Sahara', '西撒哈拉', 'ESH', 'Africa', 'Northern Africa', 24.215527, -12.885834),
('ZM', 'Zambia', '赞比亚', 'ZMB', 'Africa', 'Eastern Africa', -13.133897, 27.849332),
('ZW', 'Zimbabwe', '津巴布韦', 'ZWE', 'Africa', 'Eastern Africa', -19.015438, 29.154857);

-- 美洲国家
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('AI', 'Anguilla', '安圭拉', 'AIA', 'Americas', 'Caribbean', 18.220554, -63.068615),
('AG', 'Antigua and Barbuda', '安提瓜和巴布达', 'ATG', 'Americas', 'Caribbean', 17.060816, -61.796428),
('AR', 'Argentina', '阿根廷', 'ARG', 'Americas', 'South America', -38.416097, -63.616672),
('AW', 'Aruba', '阿鲁巴', 'ABW', 'Americas', 'Caribbean', 12.52111, -69.968338),
('BS', 'Bahamas', '巴哈马', 'BHS', 'Americas', 'Caribbean', 25.03428, -77.39628),
('BB', 'Barbados', '巴巴多斯', 'BRB', 'Americas', 'Caribbean', 13.193887, -59.543198),
('BZ', 'Belize', '伯利兹', 'BLZ', 'Americas', 'Central America', 17.189877, -88.49765),
('BM', 'Bermuda', '百慕大', 'BMU', 'Americas', 'Northern America', 32.321384, -64.75737),
('BO', 'Bolivia', '玻利维亚', 'BOL', 'Americas', 'South America', -16.290154, -63.588653),
('BR', 'Brazil', '巴西', 'BRA', 'Americas', 'South America', -14.235004, -51.92528),
('VG', 'British Virgin Islands', '英属维尔京群岛', 'VGB', 'Americas', 'Caribbean', 18.420695, -64.639968),
('CA', 'Canada', '加拿大', 'CAN', 'Americas', 'Northern America', 56.130366, -106.346771),
('KY', 'Cayman Islands', '开曼群岛', 'CYM', 'Americas', 'Caribbean', 19.513469, -80.566956),
('CL', 'Chile', '智利', 'CHL', 'Americas', 'South America', -35.675147, -71.542969),
('CO', 'Colombia', '哥伦比亚', 'COL', 'Americas', 'South America', 4.570868, -74.297333),
('CR', 'Costa Rica', '哥斯达黎加', 'CRI', 'Americas', 'Central America', 9.748917, -83.753428),
('CU', 'Cuba', '古巴', 'CUB', 'Americas', 'Caribbean', 21.521757, -77.781167),
('DM', 'Dominica', '多米尼克', 'DMA', 'Americas', 'Caribbean', 15.414999, -61.370976),
('DO', 'Dominican Republic', '多米尼加', 'DOM', 'Americas', 'Caribbean', 18.735693, -70.162651),
('EC', 'Ecuador', '厄瓜多尔', 'ECU', 'Americas', 'South America', -1.831239, -78.183406),
('SV', 'El Salvador', '萨尔瓦多', 'SLV', 'Americas', 'Central America', 13.794185, -88.89653),
('FK', 'Falkland Islands', '福克兰群岛', 'FLK', 'Americas', 'South America', -51.796253, -59.523613),
('GF', 'French Guiana', '法属圭亚那', 'GUF', 'Americas', 'South America', 3.933889, -53.125782),
('GL', 'Greenland', '格陵兰', 'GRL', 'Americas', 'Northern America', 71.706936, -42.604303),
('GD', 'Grenada', '格林纳达', 'GRD', 'Americas', 'Caribbean', 12.262776, -61.604171),
('GP', 'Guadeloupe', '瓜德罗普', 'GLP', 'Americas', 'Caribbean', 16.995971, -62.067641),
('GT', 'Guatemala', '危地马拉', 'GTM', 'Americas', 'Central America', 15.783471, -90.230759),
('GY', 'Guyana', '圭亚那', 'GUY', 'Americas', 'South America', 4.860416, -58.93018),
('HT', 'Haiti', '海地', 'HTI', 'Americas', 'Caribbean', 18.971187, -72.285215),
('HN', 'Honduras', '洪都拉斯', 'HND', 'Americas', 'Central America', 15.199999, -86.241905),
('JM', 'Jamaica', '牙买加', 'JAM', 'Americas', 'Caribbean', 18.109581, -77.297508),
('MQ', 'Martinique', '马提尼克', 'MTQ', 'Americas', 'Caribbean', 14.641528, -61.024174),
('MX', 'Mexico', '墨西哥', 'MEX', 'Americas', 'Central America', 23.634501, -102.552784),
('MS', 'Montserrat', '蒙特塞拉特', 'MSR', 'Americas', 'Caribbean', 16.742498, -62.187366),
('NI', 'Nicaragua', '尼加拉瓜', 'NIC', 'Americas', 'Central America', 12.865416, -85.207229),
('PA', 'Panama', '巴拿马', 'PAN', 'Americas', 'Central America', 8.537981, -80.782127),
('PY', 'Paraguay', '巴拉圭', 'PRY', 'Americas', 'South America', -23.442503, -58.443832),
('PE', 'Peru', '秘鲁', 'PER', 'Americas', 'South America', -9.189967, -75.015152),
('PR', 'Puerto Rico', '波多黎各', 'PRI', 'Americas', 'Caribbean', 18.220833, -66.590149),
('BL', 'Saint Barthélemy', '圣巴泰勒米', 'BLM', 'Americas', 'Caribbean', 17.9, -62.833333),
('KN', 'Saint Kitts and Nevis', '圣基茨和尼维斯', 'KNA', 'Americas', 'Caribbean', 17.357822, -62.782998),
('LC', 'Saint Lucia', '圣卢西亚', 'LCA', 'Americas', 'Caribbean', 13.909444, -60.978893),
('MF', 'Saint Martin', '法属圣马丁', 'MAF', 'Americas', 'Caribbean', 18.0708, -63.0501),
('PM', 'Saint Pierre and Miquelon', '圣皮埃尔和密克隆', 'SPM', 'Americas', 'Northern America', 46.941936, -56.27111),
('VC', 'Saint Vincent and the Grenadines', '圣文森特和格林纳丁斯', 'VCT', 'Americas', 'Caribbean', 12.984305, -61.287228),
('SX', 'Sint Maarten', '荷属圣马丁', 'SXM', 'Americas', 'Caribbean', 18.04248, -63.05483),
('SR', 'Suriname', '苏里南', 'SUR', 'Americas', 'South America', 3.919305, -56.027783),
('TT', 'Trinidad and Tobago', '特立尼达和多巴哥', 'TTO', 'Americas', 'Caribbean', 10.691803, -61.222503),
('TC', 'Turks and Caicos Islands', '特克斯和凯科斯群岛', 'TCA', 'Americas', 'Caribbean', 21.694025, -71.797928),
('US', 'United States', '美国', 'USA', 'Americas', 'Northern America', 37.09024, -95.712891),
('UY', 'Uruguay', '乌拉圭', 'URY', 'Americas', 'South America', -32.522779, -55.765835),
('VE', 'Venezuela', '委内瑞拉', 'VEN', 'Americas', 'South America', 6.42375, -66.58973),
('VI', 'Virgin Islands, U.S.', '美属维尔京群岛', 'VIR', 'Americas', 'Caribbean', 18.335765, -64.896335);

-- 大洋洲国家
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('AS', 'American Samoa', '美属萨摩亚', 'ASM', 'Oceania', 'Polynesia', -14.270972, -170.132217),
('AU', 'Australia', '澳大利亚', 'AUS', 'Oceania', 'Australia and New Zealand', -25.274398, 133.775136),
('CK', 'Cook Islands', '库克群岛', 'COK', 'Oceania', 'Polynesia', -21.236736, -159.777671),
('FJ', 'Fiji', '斐济', 'FJI', 'Oceania', 'Melanesia', -17.713371, 178.065032),
('PF', 'French Polynesia', '法属波利尼西亚', 'PYF', 'Oceania', 'Polynesia', -17.679742, -149.406843),
('GU', 'Guam', '关岛', 'GUM', 'Oceania', 'Micronesia', 13.444304, 144.793731),
('KI', 'Kiribati', '基里巴斯', 'KIR', 'Oceania', 'Micronesia', -3.370417, -168.734039),
('MH', 'Marshall Islands', '马绍尔群岛', 'MHL', 'Oceania', 'Micronesia', 7.131474, 171.184478),
('FM', 'Micronesia', '密克罗尼西亚', 'FSM', 'Oceania', 'Micronesia', 7.425554, 150.550812),
('NR', 'Nauru', '瑙鲁', 'NRU', 'Oceania', 'Micronesia', -0.522778, 166.931503),
('NC', 'New Caledonia', '新喀里多尼亚', 'NCL', 'Oceania', 'Melanesia', -20.904305, 165.618042),
('NZ', 'New Zealand', '新西兰', 'NZL', 'Oceania', 'Australia and New Zealand', -40.900557, 174.885971),
('NU', 'Niue', '纽埃', 'NIU', 'Oceania', 'Polynesia', -19.054445, -169.867233),
('NF', 'Norfolk Island', '诺福克岛', 'NFK', 'Oceania', 'Australia and New Zealand', -29.040835, 167.954712),
('MP', 'Northern Mariana Islands', '北马里亚纳群岛', 'MNP', 'Oceania', 'Micronesia', 17.33083, 145.38469),
('PW', 'Palau', '帕劳', 'PLW', 'Oceania', 'Micronesia', 7.51498, 134.58252),
('PG', 'Papua New Guinea', '巴布亚新几内亚', 'PNG', 'Oceania', 'Melanesia', -6.314993, 143.95555),
('PN', 'Pitcairn', '皮特凯恩群岛', 'PCN', 'Oceania', 'Polynesia', -24.703615, -127.439308),
('WS', 'Samoa', '萨摩亚', 'WSM', 'Oceania', 'Polynesia', -13.759029, -172.104629),
('SB', 'Solomon Islands', '所罗门群岛', 'SLB', 'Oceania', 'Melanesia', -9.64571, 160.156194),
('TK', 'Tokelau', '托克劳', 'TKL', 'Oceania', 'Polynesia', -8.967363, -171.855881),
('TO', 'Tonga', '汤加', 'TON', 'Oceania', 'Polynesia', -21.178986, -175.198242),
('TV', 'Tuvalu', '图瓦卢', 'TUV', 'Oceania', 'Polynesia', -7.109535, 177.64933),
('UM', 'United States Minor Outlying Islands', '美国本土外小岛屿', 'UMI', 'Oceania', 'Micronesia', 19.282319, 166.647047),
('VU', 'Vanuatu', '瓦努阿图', 'VUT', 'Oceania', 'Melanesia', -15.376706, 166.959158),
('WF', 'Wallis and Futuna', '瓦利斯和富图纳', 'WLF', 'Oceania', 'Polynesia', -13.768752, -177.156097);

-- 补充可能遗漏的国家和特殊地区
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('AX', 'Åland Islands', '奥兰群岛', 'ALA', 'Europe', 'Northern Europe', 60.178524, 19.91561),
('BQ', 'Bonaire, Sint Eustatius and Saba', '荷兰加勒比区', 'BES', 'Americas', 'Caribbean', 12.178361, -68.238534),
('BV', 'Bouvet Island', '布韦岛', 'BVT', 'Antarctica', 'Antarctica', -54.423199, 3.413194),
('CC', 'Cocos (Keeling) Islands', '科科斯群岛', 'CCK', 'Asia', 'Southern Asia', -12.164165, 96.870956),
('CX', 'Christmas Island', '圣诞岛', 'CXR', 'Asia', 'Southern Asia', -10.447525, 105.690449),
('HM', 'Heard Island and McDonald Islands', '赫德岛和麦克唐纳群岛', 'HMD', 'Antarctica', 'Antarctica', -53.08181, 73.504158),
('IO', 'British Indian Ocean Territory', '英属印度洋领地', 'IOT', 'Asia', 'Southern Asia', -6.343194, 71.876519),
('CW', 'Curaçao', '库拉索', 'CUW', 'Americas', 'Caribbean', 12.16957, -68.99002),
('TF', 'French Southern Territories', '法属南部领地', 'ATF', 'Antarctica', 'Antarctica', -49.280366, 69.348557),
('HK', 'Hong Kong', '香港(中国特别行政区)', 'HKG', 'Asia', 'Eastern Asia', 22.396428, 114.109497),
('MO', 'Macao', '澳门(中国特别行政区)', 'MAC', 'Asia', 'Eastern Asia', 22.198745, 113.543873),
('SJ', 'Svalbard and Jan Mayen', '斯瓦尔巴和扬马延', 'SJM', 'Europe', 'Northern Europe', 77.553604, 23.670272),
('GS', 'South Georgia and the South Sandwich Islands', '南乔治亚和南桑威奇群岛', 'SGS', 'Antarctica', 'Antarctica', -54.429579, -36.587909);

-- 欧洲地区ASN和前缀 (整合两个文件的内容)
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 法国
(3215, 'ORANGE', 'Orange', 'FR', 'Orange S.A.'),
-- 德国
(3320, 'DTAG', '德国电信', 'DE', 'Deutsche Telekom AG'),
-- 英国
(2856, 'BT-UK-AS', '英国电信', 'GB', 'British Telecommunications PLC'),
(6830, 'LIBERTY-GLOBAL', 'Liberty Global', 'GB', 'Liberty Global B.V.'),
-- 瑞典
(1299, 'TELIANET', 'Telia', 'SE', 'Telia Company AB'),
-- 意大利
(39120, 'CONVERGENZE', 'Convergenze S.p.A.', 'IT', 'Convergenze S.p.A.'),
(51185, 'MAINSTREAMING', 'MainStreaming SpA', 'IT', 'MainStreaming SpA'),
(20993, 'FIBER-TELECOM', 'Fiber Telecom S.p.A.', 'IT', 'Fiber Telecom S.p.A.'),
(12779, 'IT-GATE', 'IT.Gate S.p.A.', 'IT', 'IT.Gate S.p.A.'),
(49605, 'DIGITAL-TELECOM', 'Digital Telecommunication Services S.r.I.', 'IT', 'Digital Telecommunication Services S.r.I.'),
(1267, 'WIND-TRE', 'WIND TRE S.P.A.', 'IT', 'WIND TRE S.P.A.'),
-- 拉脱维亚
(12578, 'LATTELECOM', 'Lattelecom', 'LV', 'Lattelecom'),
(2588, 'BITE-LATVIJA', 'Bite Latvija', 'LV', 'Bite Latvija'),
(12847, 'LMT', 'Latvijas Mobilais Telefons', 'LV', 'Latvijas Mobilais Telefons SIA'),
-- 立陶宛
(8764, 'TELIA-LIETUVA', 'Telia Lietuva', 'LT', 'Telia Lietuva, AB'),
(43811, 'TELIA-LIETUVA-2', 'Telia Lietuva', 'LT', 'Telia Lietuva, AB'),
(13194, 'BITE-LIETUVA', 'Bite Lietuva', 'LT', 'UAB Bite Lietuva'),
(56630, 'MELBIKOMAS', 'Melbikomas', 'LT', 'Melbikomas UAB'),
(8849, 'MELBIKOMAS-2', 'Melbikomas', 'LT', 'Melbikomas UAB'),
(21412, 'CGATES', 'Cgates', 'LT', 'UAB Cgates'),
-- 卢森堡
(199524, 'G-CORE-LABS', 'G-Core Labs', 'LU', 'G-Core Labs S.A.'),
(56665, 'PROXIMUS-LUX', 'Proximus Luxembourg', 'LU', 'Proximus Luxembourg S.A.'),
(6661, 'POST-LUX', 'POST Luxembourg', 'LU', 'POST Luxembourg'),
(8632, 'LUX-ONLINE', 'Luxembourg Online', 'LU', 'Luxembourg Online S.A.'),
(29467, 'LUXNETWORK', 'LUXNETWORK', 'LU', 'LUXNETWORK S.A.'),
-- 北马其顿
(6821, 'MAKEDONSKI-TELEKOM', 'Makedonski Telekom', 'MK', 'Makedonski Telekom AD Skopje'),
(43612, 'A1-MACEDONIA', 'A1 Macedonia', 'MK', 'A1 Makedonija DOOEL Skopje'),
(34772, 'NEOTEL', 'NEOTEL DOO', 'MK', 'NEOTEL DOO export-import Skopje'),
(34547, 'TELESMART', 'TELESMART TELEKOM DOO', 'MK', 'TELESMART TELEKOM DOO'),
-- 荷兰
(31477, 'T-MOBILE-NL', 'T-Mobile', 'NL', 'T-Mobile Netherlands'),
(50266, 'ODIDO', 'Odido', 'NL', 'Odido Netherlands B.V.'),
-- 挪威
(2119, 'TELENOR-NORGE', 'Telenor Norge', 'NO', 'Telenor Norge AS'),
(25400, 'TELIA-NORGE', 'Telia Norge', 'NO', 'Telia Norge AS'),
(29695, 'LYSE', 'Lyse Tele', 'NO', 'Lyse Tele AS'),
(8896, 'GLOBALCONNECT', 'GlobalConnect', 'NO', 'GlobalConnect AS'),
-- 波兰
(29535, 'ORANGE-POLSKA', 'Orange Polska', 'PL', 'Orange Polska Spolka Akcyjna'),
(12912, 'T-MOBILE-POLSKA', 'T-Mobile Polska', 'PL', 'T-Mobile Polska S.A.'),
(8374, 'POLKOMTEL', 'Polkomtel', 'PL', 'Polkomtel Sp.z o.o.'),
(12741, 'NETIA', 'Netia', 'PL', 'Netia SA'),
-- 葡萄牙
(8657, 'MEO', 'MEO', 'PT', 'MEO-Servicos de Comunicacoes e Multimédia S.A.'),
(2860, 'NOS', 'NOS', 'PT', 'NOS Comunicacoes, S.A.'),
(12353, 'VODAFONE-PT', 'Vodafone Portugal', 'PT', 'Vodafone Portugal-Comunicacoes Pessoais S.A.'),
-- 罗马尼亚
(8953, 'ORANGE-ROMANIA', 'Orange Romania', 'RO', 'Orange Romania S.A.'),
(12302, 'VODAFONE-RO', 'Vodafone Romania', 'RO', 'Vodafone Romania S.A.'),
(6663, 'EUROWEB-RO', 'Euroweb Romania', 'RO', 'Euroweb Romania S.R.L.'),
-- 塞尔维亚
(8400, 'TELEKOM-SRB', 'Telekom Srbija', 'RS', 'Telekom Srbija a.d.'),
(31042, 'TELENOR-SRB', 'Telenor Serbia', 'RS', 'Telenor d.o.o.'),
-- 斯洛伐克
(6855, 'SLOVAK-TELEKOM', 'Slovak Telekom', 'SK', 'Slovak Telekom, a.s.'),
(29405, 'O2-SLOVAKIA', 'O2 Slovakia', 'SK', 'VNET a.s.'),
(8778, 'SLOVANET', 'Slovanet', 'SK', 'Slovanet a.s.'),
-- 斯洛文尼亚
(5603, 'TELEKOM-SLOVENIJA', 'Telekom Slovenija', 'SI', 'Telekom Slovenije, d.d.'),
(3212, 'TELEMACH-SI', 'Telemach Slovenija', 'SI', 'Telemach Slovenija d.o.o.'),
(21283, 'A1-SLOVENIJA', 'A1 Slovenija', 'SI', 'A1 Slovenija telekomunikacijske storitve, d.d.'),
-- 西班牙
(3352, 'TELEFONICA-ES', 'Telefónica de España', 'ES', 'Telefónica de España S.A.U.'),
(12479, 'ORANGE-ES', 'Orange España', 'ES', 'Orange España SA'),
-- 瑞典
(1299, 'ARELION', 'Arelion Sweden', 'SE', 'Arelion Sweden AB'),
(3301, 'TELIA-SE', 'Telia Company', 'SE', 'Telia Company AB'),
(1257, 'TELE2-SE', 'Tele2 Sverige', 'SE', 'Tele2 Sverige AB'),
(8473, 'BAHNHOF', 'Bahnhof', 'SE', 'Bahnhof AB'),
-- 瑞士
(3303, 'SWISSCOM', 'Swisscom', 'CH', 'Swisscom (Schweiz) AG'),
(6730, 'SUNRISE', 'Sunrise', 'CH', 'Sunrise GmbH'),
(15796, 'SALT', 'Salt Mobile', 'CH', 'Salt Mobile SA'),
(25091, 'IP-MAX', 'IP-Max', 'CH', 'IP-Max SA'),
(15547, 'NETPLUS', 'netplus.ch', 'CH', 'netplus.ch SA'),
-- 土耳其
(9121, 'TURK-TELEKOM', 'Turk Telekom', 'TR', 'Turk Telekommunikation Anonim Sirketi'),
(208972, 'TURKCELL', 'Turkcell', 'TR', 'Turkcell Iletisim Hizmetleri A.S.'),
(12735, 'TURKNET', 'TurkNet', 'TR', 'TurkNet Iletisim Hizmetleri A.S.'),
(34984, 'SUPERONLINE', 'Superonline', 'TR', 'Superonline Iletisim Hizmetleri A.S.'),
-- 乌克兰
(15895, 'KYIVSTAR', 'Kyivstar', 'UA', 'Kyivstar PJSC'),
(21497, 'VODAFONE-UA', 'Vodafone Ukraine', 'UA', 'Vodafone Ukraine'),
(3326, 'DATAGROUP', 'Datagroup', 'UA', 'PRIVATE JOINT STOCK COMPANY DATAGROUP'),
-- 英国
(2856, 'BT-GROUP', 'BT Group', 'GB', 'BT Group plc'),
(1273, 'VODAFONE-UK', 'Vodafone Group', 'GB', 'Vodafone Group PLC'),
(12576, 'EE', 'EE Limited', 'GB', 'EE Limited'),
(8683, 'VIRGIN-MEDIA', 'Virgin Media', 'GB', 'Virgin Media O2'),
(8282, 'THREE-UK', 'Three UK', 'GB', 'Three UK (Hutchison 3G UK Ltd)'),
-- 俄罗斯
(8359, 'MTS', 'MTS PJSC', 'RU', 'MTS PJSC'),
(31133, 'MEGAFON', 'MegaFon', 'RU', 'PJSC MegaFon'),
(48858, 'ER-TELECOM', 'ER-Telecom', 'RU', 'JSC ER-Telecom Holding');

-- 欧洲地区IPv6前缀 (整合两个文件的内容)
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 德国电信
('2001:908::', 32, '6', 3320, 'DE', '2003-03-18', 'RIPE'),
('2003:80::', 32, '6', 3320, 'DE', '2005-03-01', 'RIPE'),
-- 英国电信
('2a00:1a40::', 32, '6', 2856, 'GB', '2010-06-07', 'RIPE'),
('2001:8f8::', 32, '6', 2856, 'GB', '2003-03-18', 'RIPE'),
-- 俄罗斯MTS
('2a00:15f8::', 32, '6', 8359, 'RU', '2010-06-07', 'RIPE'),
('2001:67c:258::', 48, '6', 8359, 'RU', '2003-03-18', 'RIPE'),
-- 意大利Convergenze
('2a01:9a80::', 32, '6', 39120, 'IT', '2014-11-14', 'RIPE'),
-- 法国Orange
('2001:cb8::', 32, '6', 3215, 'FR', '2003-03-18', 'RIPE'),
-- 意大利MainStreaming
('2a02:b000::', 23, '6', 51185, 'IT', '2014-11-14', 'RIPE'),
-- 意大利Fiber Telecom
('2a00:c260:8000::', 34, '6', 20993, 'IT', '2010-06-07', 'RIPE'),
-- 意大利IT.Gate
('2a02:c480::', 32, '6', 12779, 'IT', '2014-11-14', 'RIPE'),
-- 意大利Digital Telecommunication
('2a02:e50::', 32, '6', 49605, 'IT', '2014-11-14', 'RIPE'),
-- 意大利WIND TRE
('2a02:b000::', 23, '6', 1267, 'IT', '2014-11-14', 'RIPE'),
-- 拉脱维亚Lattelecom
('2a02:2330::', 29, '6', 12578, 'LV', '2014-11-14', 'RIPE'),
-- 拉脱维亚Bite Latvija
('2a02:610::', 32, '6', 2588, 'LV', '2014-11-14', 'RIPE'),
-- 拉脱维亚LMT
('2a03:ec00::', 32, '6', 12847, 'LV', '2014-11-14', 'RIPE'),
-- 立陶宛Telia Lietuva
('2a00:1eb8::', 35, '6', 8764, 'LT', '2010-06-07', 'RIPE'),
('2a02:118:2::', 48, '6', 8764, 'LT', '2014-11-14', 'RIPE'),
('2a00:1eb8:c004::', 48, '6', 8764, 'LT', '2010-06-07', 'RIPE'),
-- 立陶宛Bite Lietuva
('2a00:f500::', 29, '6', 13194, 'LT', '2010-06-07', 'RIPE'),
-- 立陶宛Melbikomas
('2a06:f900::', 36, '6', 56630, 'LT', '2010-06-07', 'RIPE'),
('2a0d:8400::', 32, '6', 56630, 'LT', '2014-11-14', 'RIPE'),
-- 立陶宛Cgates
('2a00:7600::', 32, '6', 21412, 'LT', '2010-06-07', 'RIPE'),
('2a04:ce00::', 29, '6', 21412, 'LT', '2014-11-14', 'RIPE'),
-- 卢森堡G-Core Labs
('2a03:90c0:10::', 44, '6', 199524, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡Proximus Luxembourg
('2a00:4180:1::', 48, '6', 56665, 'LU', '2010-06-07', 'RIPE'),
('2a04:81c0::', 29, '6', 56665, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡POST Luxembourg
('2001:7e8::', 32, '6', 6661, 'LU', '2003-03-18', 'RIPE'),
-- 卢森堡Luxembourg Online
('2a02:678::', 32, '6', 8632, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡LUXNETWORK
('2a02:70c0::', 32, '6', 29467, 'LU', '2014-11-14', 'RIPE'),
('2a03:2f00::', 32, '6', 29467, 'LU', '2014-11-14', 'RIPE'),
-- 北马其顿Makedonski Telekom
('2a00:5c40::', 29, '6', 6821, 'MK', '2010-06-07', 'RIPE'),
-- 北马其顿A1 Macedonia
('2a01:b780::', 32, '6', 43612, 'MK', '2014-11-14', 'RIPE'),
-- 北马其顿NEOTEL
('2a00:1218::', 32, '6', 34772, 'MK', '2010-06-07', 'RIPE'),
-- 北马其顿TELESMART
('2a02:5580::', 32, '6', 34547, 'MK', '2014-11-14', 'RIPE'),
-- 荷兰T-Mobile
('2a0b:6d80::', 29, '6', 31477, 'NL', '2014-11-14', 'RIPE'),
('2001:678:750::', 48, '6', 31477, 'NL', '2010-06-07', 'RIPE'),
-- 荷兰Odido
('2a02:4240::', 32, '6', 50266, 'NL', '2014-11-14', 'RIPE'),
-- 挪威Telenor Norge
('2001:678:9dc::', 48, '6', 2119, 'NO', '2010-06-07', 'RIPE'),
-- 挪威Telia Norge
('2a02:228::', 29, '6', 25400, 'NO', '2014-11-14', 'RIPE'),
('2001:678:69c::', 48, '6', 25400, 'NO', '2010-06-07', 'RIPE'),
-- 挪威Lyse Tele
('2a00:fd00::', 32, '6', 29695, 'NO', '2010-06-07', 'RIPE'),
('2a00:dec0::', 32, '6', 29695, 'NO', '2010-06-07', 'RIPE'),
-- 挪威GlobalConnect
('2a00:1e18::', 32, '6', 8896, 'NO', '2010-06-07', 'RIPE'),
('2a03:9a00::', 32, '6', 8896, 'NO', '2014-11-14', 'RIPE'),
-- 波兰Orange Polska
('2001:7f8:27::', 48, '6', 29535, 'PL', '2003-03-18', 'RIPE'),
('2a01:11f0::', 28, '6', 29535, 'PL', '2014-11-14', 'RIPE'),
-- 波兰T-Mobile Polska
('2001:4190::', 32, '6', 12912, 'PL', '2003-03-18', 'RIPE'),
('2001:1b80::', 29, '6', 12912, 'PL', '2003-03-18', 'RIPE'),
-- 波兰Polkomtel
('2a01:bb80::', 32, '6', 8374, 'PL', '2014-11-14', 'RIPE'),
('2a01:2e0::', 28, '6', 8374, 'PL', '2014-11-14', 'RIPE'),
-- 波兰Netia
('2001:16b0::', 32, '6', 12741, 'PL', '2003-03-18', 'RIPE'),
('2001:41b0::', 32, '6', 12741, 'PL', '2003-03-18', 'RIPE'),
-- 葡萄牙NOS
('2001:1588::', 29, '6', 2860, 'PT', '2003-03-18', 'RIPE'),
('2a01:8::', 29, '6', 2860, 'PT', '2014-11-14', 'RIPE'),
-- 葡萄牙Vodafone
('2001:818::', 32, '6', 12353, 'PT', '2003-03-18', 'RIPE'),
('2001:818::', 29, '6', 12353, 'PT', '2003-03-18', 'RIPE'),
-- 罗马尼亚Orange Romania
('2a02:a58::', 32, '6', 8953, 'RO', '2014-11-14', 'RIPE'),
-- 罗马尼亚Vodafone Romania
('2a04:2410::', 28, '6', 12302, 'RO', '2014-11-14', 'RIPE'),
('2a04:2400::', 27, '6', 12302, 'RO', '2014-11-14', 'RIPE'),
-- 罗马尼亚Euroweb Romania
('2a02:2720::', 32, '6', 6663, 'RO', '2014-11-14', 'RIPE'),
-- 塞尔维亚Telekom Srbija
('2a00:e90::', 32, '6', 8400, 'RS', '2010-06-07', 'RIPE'),
('2a06:5b00::', 29, '6', 8400, 'RS', '2010-06-07', 'RIPE'),
-- 塞尔维亚Telenor Serbia
('2a03:87c0::', 29, '6', 31042, 'RS', '2014-11-14', 'RIPE'),
-- 斯洛伐克Slovak Telekom
('2a01:5f7::', 32, '6', 6855, 'SK', '2014-11-14', 'RIPE'),
('2a00:12a8::', 29, '6', 6855, 'SK', '2010-06-07', 'RIPE'),
-- 斯洛伐克O2 Slovakia
('2a01:390::', 32, '6', 29405, 'SK', '2014-11-14', 'RIPE'),
('2a00:10d8::', 32, '6', 29405, 'SK', '2010-06-07', 'RIPE'),
-- 斯洛伐克Slovanet
('2a00:9060::', 32, '6', 8778, 'SK', '2010-06-07', 'RIPE'),
('2a02:dd8::', 29, '6', 8778, 'SK', '2014-11-14', 'RIPE'),
-- 斯洛文尼亚Telekom Slovenija
('2a02:e20::', 32, '6', 5603, 'SI', '2014-11-14', 'RIPE'),
('2a00:ee1::', 32, '6', 5603, 'SI', '2010-06-07', 'RIPE'),
-- 斯洛文尼亚Telemach Slovenija
('2a00:fc0::', 32, '6', 3212, 'SI', '2010-06-07', 'RIPE'),
('2001:1688::', 29, '6', 3212, 'SI', '2003-03-18', 'RIPE'),
-- 斯洛文尼亚A1 Slovenija
('2001:15c0::', 29, '6', 21283, 'SI', '2003-03-18', 'RIPE'),
('2a00:1a20::', 32, '6', 21283, 'SI', '2010-06-07', 'RIPE'),
-- 西班牙Telefónica
('2a06:f0c0::', 29, '6', 3352, 'ES', '2010-06-07', 'RIPE'),
('2a02:9155::', 32, '6', 3352, 'ES', '2014-11-14', 'RIPE'),
-- 西班牙Orange
('2a01:c508::', 29, '6', 12479, 'ES', '2014-11-14', 'RIPE'),
('2a01:c504::', 31, '6', 12479, 'ES', '2014-11-14', 'RIPE'),
-- 瑞典Arelion
('2001:2000:3000::', 40, '6', 1299, 'SE', '2003-03-18', 'RIPE'),
('2001:2030::', 28, '6', 1299, 'SE', '2003-03-18', 'RIPE'),
-- 瑞典Telia
('2001:678:784::', 48, '6', 3301, 'SE', '2010-06-07', 'RIPE'),
('2001:678:704::', 48, '6', 3301, 'SE', '2010-06-07', 'RIPE'),
-- 瑞典Tele2
('2001:67c:10c8::', 48, '6', 1257, 'SE', '2010-06-07', 'RIPE'),
('2001:67c:488::', 48, '6', 1257, 'SE', '2010-06-07', 'RIPE'),
-- 瑞典Bahnhof
('2a0c:c400::', 32, '6', 8473, 'SE', '2014-11-14', 'RIPE'),
('2001:9b2::', 34, '6', 8473, 'SE', '2003-03-18', 'RIPE'),
-- 瑞士Swisscom
('2001:8a8::', 32, '6', 3303, 'CH', '2003-03-18', 'RIPE'),
('2a02:a90::', 32, '6', 3303, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士Sunrise
('2001:918::', 32, '6', 6730, 'CH', '2003-03-18', 'RIPE'),
('2001:678:e0::', 48, '6', 6730, 'CH', '2010-06-07', 'RIPE'),
-- 瑞士Salt Mobile
('2a04:ee40::', 29, '6', 15796, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士IP-Max
('2a0c:4144:100::', 48, '6', 25091, 'CH', '2014-11-14', 'RIPE'),
('2a0d:cb80::', 29, '6', 25091, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士netplus.ch
('2a03:4380::', 32, '6', 15547, 'CH', '2014-11-14', 'RIPE'),
('2a02:26a0::', 29, '6', 15547, 'CH', '2014-11-14', 'RIPE'),
-- 土耳其Turk Telekom
('2a01:358:1011::', 48, '6', 9121, 'TR', '2014-11-14', 'RIPE'),
('2a01:358:1000::', 36, '6', 9121, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其Turkcell
('2a0a:4944:2::', 48, '6', 208972, 'TR', '2014-11-14', 'RIPE'),
('2a0a:4940::', 48, '6', 208972, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其TurkNet
('2a02:ff0:200::', 40, '6', 12735, 'TR', '2014-11-14', 'RIPE'),
('2a02:ff0:4::', 48, '6', 12735, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其Superonline
('2a02:e0::', 36, '6', 34984, 'TR', '2014-11-14', 'RIPE'),
('2a01:188::', 48, '6', 34984, 'TR', '2014-11-14', 'RIPE'),
-- 乌克兰Kyivstar
('2a02:2378::', 32, '6', 15895, 'UA', '2014-11-14', 'RIPE'),
('2a02:8a8::', 32, '6', 15895, 'UA', '2014-11-14', 'RIPE'),
-- 乌克兰Vodafone Ukraine
('2a00:f50::', 32, '6', 21497, 'UA', '2010-06-07', 'RIPE'),
-- 乌克兰Datagroup
('2a02:70::', 32, '6', 3326, 'UA', '2014-11-14', 'RIPE'),
('2a01:758:ffe0::', 48, '6', 3326, 'UA', '2014-11-14', 'RIPE'),
-- 英国BT Group
('2a01:4c8:f401::', 48, '6', 2856, 'GB', '2014-11-14', 'RIPE'),
('2a00:2380::', 25, '6', 2856, 'GB', '2010-06-07', 'RIPE'),
-- 英国Vodafone
('2001:5000::', 21, '6', 1273, 'GB', '2003-03-18', 'RIPE'),
-- 英国EE
('2a01:4c8::', 29, '6', 12576, 'GB', '2014-11-14', 'RIPE'),
-- 英国Virgin Media
('2a01:61c:1100::', 40, '6', 8683, 'GB', '2014-11-14', 'RIPE'),
('2a01:618:8000::', 40, '6', 8683, 'GB', '2014-11-14', 'RIPE'),
-- 英国Three UK
('2a01:2c0::', 32, '6', 8282, 'GB', '2014-11-14', 'RIPE'),
-- 俄罗斯MTS
('2a02:28::', 32, '6', 8359, 'RU', '2014-11-14', 'RIPE'),
('2a00:189c::', 32, '6', 8359, 'RU', '2010-06-07', 'RIPE'),
-- 俄罗斯MegaFon
('2a03:d002::', 40, '6', 31133, 'RU', '2014-11-14', 'RIPE'),
('2a03:d000:200::', 41, '6', 31133, 'RU', '2014-11-14', 'RIPE'),
-- 俄罗斯ER-Telecom
('2a0b:9fc0::', 48, '6', 48858, 'RU', '2014-11-14', 'RIPE');


-- 非洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 南非
(5713, 'SAIX-NET', 'SAIX', 'ZA', 'South African Internet Exchange'),
(3741, 'IS-AS', 'Internet Solutions', 'ZA', 'Internet Solutions'),
-- 埃及
(36992, 'TE-AS', 'Telecom Egypt', 'EG', 'Telecom Egypt'),
-- 尼日利亚
(29465, 'MTN-NG', 'MTN Nigeria', 'NG', 'MTN Nigeria Communications Limited'),
-- 肯尼亚
(33771, 'SAFARICOM-LTD', 'Safaricom', 'KE', 'Safaricom Limited'),
-- 摩洛哥
(36903, 'IAM', 'Maroc Telecom', 'MA', 'Itissalat Al-Maghrib'),
-- 阿尔及利亚
(327690, 'ALGTELECOM', 'Algérie Télécom', 'DZ', 'Algérie Télécom'),
-- 突尼斯
(37605, 'TUNISIANA', 'Tunisiana', 'TN', 'Tunisiana'),
-- 加纳
(30994, 'MTN-GH', 'MTN Ghana', 'GH', 'MTN Ghana'),
-- 科特迪瓦
(30980, 'MTN-CI', 'MTN Côte d\'Ivoire', 'CI', 'MTN Côte d\'Ivoire');

-- 非洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 南非Internet Solutions
('2001:43f8::', 32, '6', 3741, 'ZA', '2003-03-18', 'AFRINIC'),
-- 埃及Telecom Egypt
('2001:1308::', 32, '6', 36992, 'EG', '2003-03-18', 'AFRINIC'),
-- 尼日利亚MTN
('2c0f:f530::', 32, '6', 29465, 'NG', '2010-06-07', 'AFRINIC'),
-- 肯尼亚Safaricom
('2c0f:f7a8::', 32, '6', 33771, 'KE', '2010-06-07', 'AFRINIC'),
-- 摩洛哥Maroc Telecom
('2001:1470::', 32, '6', 36903, 'MA', '2003-03-18', 'AFRINIC'),
-- 阿尔及利亚Algérie Télécom
('2c0f:feb0::', 32, '6', 327690, 'DZ', '2010-06-07', 'AFRINIC'),
-- 突尼斯Tunisiana
('2001:1570::', 32, '6', 37605, 'TN', '2003-03-18', 'AFRINIC'),
-- 加纳MTN
('2c0f:f9c0::', 32, '6', 30994, 'GH', '2010-06-07', 'AFRINIC'),
-- 科特迪瓦MTN
('2c0f:f9f0::', 32, '6', 30980, 'CI', '2010-06-07', 'AFRINIC');


-- 美洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 美国
(15169, 'GOOGLE', '谷歌', 'US', 'Google LLC'),
(32934, 'FACEBOOK', '脸书', 'US', 'Facebook, Inc.'),
(8075, 'MICROSOFT-CORP-MSN-AS-BLOCK', '微软', 'US', 'Microsoft Corporation'),
(16509, 'AMAZON-02', '亚马逊', 'US', 'Amazon.com, Inc.'),
(14618, 'AMAZON-AES', '亚马逊', 'US', 'Amazon Data Services NoVa'),
(13335, 'CLOUDFLARENET', 'Cloudflare', 'US', 'Cloudflare, Inc.'),
(20940, 'AKAMAI-ASN1', 'Akamai', 'US', 'Akamai Technologies, Inc.'),
(7018, 'ATT-INTERNET4', 'AT&T', 'US', 'AT&T Services, Inc.'),
(7922, 'COMCAST-7922', 'Comcast', 'US', 'Comcast Cable Communications, LLC'),
(701, 'UUNET', 'Verizon', 'US', 'Verizon Business'),
(174, 'COGENT-174', 'Cogent', 'US', 'Cogent Communications'),
(3356, 'LEVEL3', 'Level 3', 'US', 'Level 3 Parent, LLC'),
(6453, 'TATA-COMMUNICATIONS', 'Tata Communications', 'US', 'Tata Communications (America) Inc.'),
(2914, 'NTT-AMERICA', 'NTT America', 'US', 'NTT America, Inc.'),
-- 加拿大
(577, 'BCE-INC', 'Bell Canada', 'CA', 'Bell Canada'),
(812, 'ROGERS-CABLE', 'Rogers Communications', 'CA', 'Rogers Communications Inc.'),
(852, 'TELUS', 'Telus', 'CA', 'Telus Communications Inc.'),
(6327, 'SHAW', 'Shaw Communications', 'CA', 'Shaw Communications Inc.'),
(11260, 'EASTLINK', 'Eastlink', 'CA', 'Eastlink'),
-- 墨西哥
(28548, 'CABLEVISION-MX', 'Cablevisión', 'MX', 'Cablevisión, S.A. de C.V.'),
(13999, 'MEGA-CABLE', 'Mega Cable', 'MX', 'Mega Cable, S.A. de C.V.'),
(8151, 'TELMEX', 'Telmex', 'MX', 'Telmex'),
(11172, 'ALESTRA', 'Alestra', 'MX', 'Alestra, S. de R.L. de C.V.'),
-- 巴西
(4230, 'CLARO-SA', 'Claro S.A.', 'BR', 'Claro S.A.'),
(10429, 'TELEFONICA-BR', 'Vivo', 'BR', 'Telefônica Brasil S.A.'),
(8167, 'OI', 'Oi', 'BR', 'V tal'),
(26615, 'TIM-BRASIL', 'TIM Brasil', 'BR', 'TIM S/A'),
-- 阿根廷
(22927, 'TELEFONICA-AR', 'Telefónica Argentina', 'AR', 'Telefónica de Argentina'),
(7303, 'TELECOM-AR', 'Telecom Argentina', 'AR', 'Telecom Argentina S.A.'),
-- 哥伦比亚
(13489, 'CLARO-CO', 'Claro Colombia', 'CO', 'UNE EPM Telecomunicaciones S.A.'),
(3816, 'COLOMBIA-TELECOM', 'ETB', 'CO', 'Colombia Telecomunicaciones S.A. ESP'),
-- 秘鲁
(12252, 'CLARO-PE', 'Claro Peru', 'PE', 'América Móvil Perú S.A.C.'),
(6147, 'TELEFONICA-PE', 'Telefónica del Perú', 'PE', 'Telefónica del Perú S.A.A.'),
(21575, 'ENTEL-PE', 'Entel Peru', 'PE', 'Entel Perú S.A.'),
-- 智利
(18822, 'MOVISTAR-CL', 'Movistar Chile', 'CL', 'Manquehuenet'),
(27651, 'ENTEL-CL', 'Entel Chile', 'CL', 'Entel Chile S.A.'),
-- 委内瑞拉
(8048, 'CANTV', 'CANTV', 'VE', 'CANTV'),
(10393, 'CANTV-2', 'CANTV', 'VE', 'CANTV'),
-- 古巴
(27725, 'ETECSA', 'ETECSA', 'CU', 'Empresa de Telecomunicaciones de Cuba, S.A.'),
-- 多米尼加共和国
(64126, 'DOMINICAN-CABLE', 'Dominican Cable Group', 'DO', 'Dominican Cable Group DCG, S.R.L.'),
(28118, 'ALTICE-DO', 'Altice Dominicana', 'DO', 'Altice Dominicana S.A.'),
(46198, 'TRILOGY-DO', 'Trilogy Dominicana', 'DO', 'Trilogy Dominicana, S.A.'),
-- 波多黎各
(11992, 'LIBERTY-PR', 'Liberty Mobile', 'PR', 'Liberty Mobile Puerto Rico Inc.'),
(399291, 'PR-FIBER', 'Puerto Rico Fiber', 'PR', 'Puerto Rico Fiber Network Inc'),
(5786, 'UNIVERSITY-PR', 'University of Puerto Rico', 'PR', 'University of Puerto Rico');

-- 美洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 美国Google
('2001:4860::', 32, '6', 15169, 'US', '2005-03-01', 'ARIN'),
('2607:f8b0::', 32, '6', 15169, 'US', '2007-10-17', 'ARIN'),
-- 美国Facebook
('2a03:2880::', 32, '6', 32934, 'US', '2014-11-14', 'RIPE'),
('2620:0:1c00::', 48, '6', 32934, 'US', '2010-06-07', 'ARIN'),
-- 美国Microsoft
('2603:1000::', 40, '6', 8075, 'US', '2007-10-17', 'ARIN'),
('2603:2000::', 40, '6', 8075, 'US', '2007-10-17', 'ARIN'),
-- 美国Amazon
('2600:1f00::', 40, '6', 16509, 'US', '2007-10-17', 'ARIN'),
('2a05:d000::', 32, '6', 16509, 'US', '2014-11-14', 'RIPE'),
-- 美国Cloudflare
('2606:4700::', 32, '6', 13335, 'US', '2007-10-17', 'ARIN'),
('2a06:98c0::', 29, '6', 13335, 'US', '2010-06-07', 'RIPE'),
-- 美国Akamai
('2600:1400::', 35, '6', 20940, 'US', '2007-10-17', 'ARIN'),
('2a02:26f0::', 29, '6', 20940, 'US', '2010-06-07', 'RIPE'),
-- 美国AT&T
('2600:300::', 24, '6', 7018, 'US', '2007-10-17', 'ARIN'),
-- 美国Comcast
('2601::', 20, '6', 7922, 'US', '2007-10-17', 'ARIN'),
('2001:558::', 29, '6', 7922, 'US', '2003-03-18', 'ARIN'),
-- 美国Verizon
('2001:4868::', 32, '6', 701, 'US', '2003-03-18', 'ARIN'),
('2600:800::', 27, '6', 701, 'US', '2007-10-17', 'ARIN'),
-- 美国Cogent
('2001:550::', 32, '6', 174, 'US', '2003-03-18', 'ARIN'),
('2a09:54c1::', 32, '6', 174, 'US', '2014-11-14', 'RIPE'),
-- 美国Level 3
('2001:1900::', 32, '6', 3356, 'US', '2003-03-18', 'ARIN'),
('2606:840::', 32, '6', 3356, 'US', '2007-10-17', 'ARIN'),
-- 美国Tata Communications
('2001:5a0::', 32, '6', 6453, 'US', '2003-03-18', 'ARIN'),
-- 美国NTT America
('2001:218::', 32, '6', 2914, 'US', '2003-03-18', 'ARIN'),
-- 加拿大Bell
('2001:4958::', 32, '6', 577, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Rogers
('2605:8d80::', 32, '6', 812, 'CA', '2007-10-17', 'ARIN'),
-- 加拿大Telus
('2001:569::', 33, '6', 852, 'CA', '2003-03-18', 'ARIN'),
('2001:56a::', 33, '6', 852, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Shaw
('2001:4e8::', 32, '6', 6327, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Eastlink
('2604:1ec0::', 36, '6', 11260, 'CA', '2007-10-17', 'ARIN'),
('2607:a000::', 32, '6', 11260, 'CA', '2007-10-17', 'ARIN'),
-- 墨西哥Cablevisión
('2806:250:a::', 48, '6', 28548, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Mega Cable
('2806:203::', 32, '6', 13999, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Telmex
('2001:1208::', 32, '6', 8151, 'MX', '2003-03-18', 'LACNIC'),
('2806:1070::', 32, '6', 8151, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Alestra
('2801:c4:2a1::', 48, '6', 11172, 'MX', '2011-08-16', 'LACNIC'),
-- 巴西Claro
('2804:a8::', 32, '6', 4230, 'BR', '2011-08-16', 'LACNIC'),
-- 巴西Vivo
('2001:12e0:200::', 40, '6', 10429, 'BR', '2003-03-18', 'LACNIC'),
-- 巴西Oi
('2804:d50::', 28, '6', 8167, 'BR', '2011-08-16', 'LACNIC'),
-- 巴西TIM
('2804:20::', 32, '6', 26615, 'BR', '2011-08-16', 'LACNIC'),
-- 阿根廷Telefónica
('2800:380::', 32, '6', 22927, 'AR', '2011-08-16', 'LACNIC'),
-- 阿根廷Telecom
('2001:13d0::', 32, '6', 7303, 'AR', '2003-03-18', 'LACNIC'),
-- 哥伦比亚Claro
('2800:580::', 32, '6', 13489, 'CO', '2011-08-16', 'LACNIC'),
-- 哥伦比亚ETB
('2800:680::', 32, '6', 3816, 'CO', '2011-08-16', 'LACNIC'),
-- 秘鲁Claro
('2800:200::', 32, '6', 12252, 'PE', '2011-08-16', 'LACNIC'),
-- 秘鲁Telefónica
('2001:1388::', 32, '6', 6147, 'PE', '2003-03-18', 'LACNIC'),
-- 秘鲁Entel
('2803:7180:6000::', 36, '6', 21575, 'PE', '2011-08-16', 'LACNIC'),
-- 智利Movistar
('2800:8e0::', 48, '6', 18822, 'CL', '2011-08-16', 'LACNIC'),
-- 智利Entel
('2800:300:6220::', 44, '6', 27651, 'CL', '2011-08-16', 'LACNIC'),
-- 委内瑞拉CANTV
('2801:10::', 32, '6', 8048, 'VE', '2011-08-16', 'LACNIC'),
-- 古巴ETECSA
('2001:1358::', 32, '6', 27725, 'CU', '2003-03-18', 'LACNIC'),
-- 多米尼加共和国Dominican Cable
('2803:6de0::', 32, '6', 64126, 'DO', '2011-08-16', 'LACNIC'),
-- 多米尼加共和国Altice
('2803:a180::', 32, '6', 28118, 'DO', '2011-08-16', 'LACNIC'),
('2001:13f0::', 32, '6', 28118, 'DO', '2003-03-18', 'LACNIC');



-- 大洋洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 澳大利亚
(4632, 'TELSTRA-MNS', 'Telstra Managed Network', 'AU', 'Telstra Corporation Ltd'),
(7474, 'SINGTEL-OPTUS', 'SingTel Optus', 'AU', 'SingTel Optus Pty Ltd'),
(18291, 'VODAFONE-AU', 'Vodafone Australia', 'AU', 'Vodafone Australia Pty Ltd'),
(1221, 'TELSTRA', 'Telstra', 'AU', 'Telstra Pty Ltd'),
(4766, 'SINGTEL', 'SingTel', 'SG', 'SingTel Optus Pty Ltd'),
-- 新西兰
(9500, 'ONE-NZ', 'One New Zealand', 'NZ', 'One New Zealand Group Limited'),
(9790, '2DEGREES', '2degrees', 'NZ', 'Two Degrees Networks Limited'),
(23752, 'VODAFONE-NZ', 'Vodafone NZ', 'NZ', 'Vodafone New Zealand Limited'),
-- 斐济
(17974, 'FINTEL', 'Fintel', 'FJ', 'Fiji International Telecommunications Limited'),
-- 巴布亚新几内亚
(17977, 'DIGICEL-PNG', 'Digicel PNG', 'PG', 'Digicel (PNG) Limited'),
-- 萨摩亚
(17976, 'DIGICEL-WS', 'Digicel Samoa', 'WS', 'Digicel (Samoa) Limited');

-- 大洋洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 澳大利亚Telstra
('2001:8000::', 20, '6', 4632, 'AU', '2003-03-18', 'APNIC'),
('2401:8000::', 32, '6', 1221, 'AU', '2011-08-16', 'APNIC'),
-- 澳大利亚Optus
('2405:9000::', 32, '6', 7474, 'AU', '2011-08-16', 'APNIC'),
('2405:9000:a::', 48, '6', 7474, 'AU', '2011-08-16', 'APNIC'),
-- 澳大利亚Vodafone
('2405:6e00:f800::', 48, '6', 18291, 'AU', '2011-08-16', 'APNIC'),
('2405:6e00:200::', 40, '6', 18291, 'AU', '2011-08-16', 'APNIC'),
-- 新西兰One NZ
('2001:4400::', 30, '6', 9500, 'NZ', '2003-03-18', 'APNIC'),
('2407:7000::', 32, '6', 9500, 'NZ', '2011-08-16', 'APNIC'),
-- 新西兰2degrees
('2400:4800::', 32, '6', 9790, 'NZ', '2011-08-16', 'APNIC'),
('2403:c200::', 32, '6', 9790, 'NZ', '2011-08-16', 'APNIC'),
-- 新西兰Vodafone
('2406:e000::', 32, '6', 23752, 'NZ', '2011-08-16', 'APNIC'),
-- 斐济Fintel
('2404:4e00::', 32, '6', 17974, 'FJ', '2011-08-16', 'APNIC'),
-- 巴布亚新几内亚Digicel
('2404:5e00::', 32, '6', 17977, 'PG', '2011-08-16', 'APNIC'),
-- 萨摩亚Digicel
('2404:7e00::', 32, '6', 17976, 'WS', '2011-08-16', 'APNIC');

-- 插入接口标识符类型数据
INSERT IGNORE INTO address_types (type_name, description, is_risky, example) VALUES
('ieee', '基于IEEE EUI-64标准生成的IID', FALSE, '::200:5eff:fe12:3456'),
('isatap', 'ISATAP隧道接口标识符', FALSE, '::0:5efe:192.168.1.1'),
('ipv4-32', '嵌入32位IPv4地址的IID', TRUE, '::192.168.1.1'),
('ipv4-64', '嵌入64位IPv4地址的IID', TRUE, '::ffff:192.168.1.1'),
('ipv4-all', '各种IPv4嵌入格式的IID', TRUE, '::192.168.1.1或::ffff:192.168.1.1'),
('embed-port', '嵌入端口号的IID', TRUE, '::8080'),
('embed-port-rev', '反向嵌入端口号的IID', TRUE, '::8008'),
('embed-port-all', '各种端口号嵌入格式的IID', TRUE, '::8080或::8008'),
('low-byte', '低字节IID，常见于路由器', TRUE, '::1'),
('byte-pattern', '可预测字节模式的IID', TRUE, '::1234:5678'),
('random', '随机生成的IID', FALSE, '::1a2b:3c4d:5e6f'),
('service', '服务标识IID', FALSE, '::53 (DNS)');

-- 插入网络协议数据
INSERT IGNORE INTO protocols (protocol_name, protocol_number, description, is_common, risk_level) VALUES
('HTTP', 80, 'Hypertext Transfer Protocol', TRUE, 'low'),
('HTTPS', 443, 'HTTP Secure', TRUE, 'low'),
('SSH', 22, 'Secure Shell', TRUE, 'medium'),
('Telnet', 23, 'Telnet Protocol', FALSE, 'high'),
('DNS', 53, 'Domain Name System', TRUE, 'low'),
('ICMP', 1, 'Internet Control Message Protocol', TRUE, 'low'),
('SNMP', 161, 'Simple Network Management Protocol', FALSE, 'high'),
('SMTP', 25, 'Simple Mail Transfer Protocol', TRUE, 'medium'),
('POP3', 110, 'Post Office Protocol v3', TRUE, 'medium'),
('IMAP', 143, 'Internet Message Access Protocol', TRUE, 'medium'),
('FTP', 21, 'File Transfer Protocol', FALSE, 'high'),
('TFTP', 69, 'Trivial File Transfer Protocol', FALSE, 'high'),
('NTP', 123, 'Network Time Protocol', TRUE, 'medium'),
('RDP', 3389, 'Remote Desktop Protocol', FALSE, 'high'),
('SMB', 445, 'Server Message Block', FALSE, 'high'),
('MySQL', 3306, 'MySQL Database Service', FALSE, 'high'),
('PostgreSQL', 5432, 'PostgreSQL Database Service', FALSE, 'high'),
('Redis', 6379, 'Redis Database Service', FALSE, 'high'),
('MongoDB', 27017, 'MongoDB Database Service', FALSE, 'high'),
('Memcached', 11211, 'Memcached Service', FALSE, 'high'),
('LDAP', 389, 'Lightweight Directory Access Protocol', FALSE, 'high'),
('LDAPS', 636, 'LDAP over SSL', FALSE, 'medium'),
('RPC', 111, 'Remote Procedure Call', FALSE, 'high'),
('NetBIOS', 137, 'NetBIOS Name Service', FALSE, 'high'),
('NetBIOS-DGM', 138, 'NetBIOS Datagram Service', FALSE, 'high'),
('NetBIOS-SSN', 139, 'NetBIOS Session Service', FALSE, 'high'),
('UPnP', 1900, 'Universal Plug and Play', FALSE, 'high'),
('CoAP', 5683, 'Constrained Application Protocol', FALSE, 'medium'),
('MQTT', 1883, 'Message Queuing Telemetry Transport', FALSE, 'medium'),
('AMQP', 5672, 'Advanced Message Queuing Protocol', FALSE, 'medium'),
('Kafka', 9092, 'Apache Kafka', FALSE, 'medium'),
('gRPC', 50051, 'Google Remote Procedure Call', FALSE, 'medium'),
('QUIC', 443, 'Quick UDP Internet Connections', TRUE, 'low'),
('IPsec', NULL, 'IP Security Protocol Suite', FALSE, 'medium'),
('OpenVPN', 1194, 'OpenVPN', FALSE, 'medium'),
('WireGuard', 51820, 'WireGuard VPN', FALSE, 'medium'),
('IKEv2', 500, 'Internet Key Exchange version 2', FALSE, 'medium'),
('L2TP', 1701, 'Layer 2 Tunneling Protocol', FALSE, 'medium'),
('PPTP', 1723, 'Point-to-Point Tunneling Protocol', FALSE, 'high'),
('SIP', 5060, 'Session Initiation Protocol', FALSE, 'medium'),
('RTP', 5004, 'Real-time Transport Protocol', FALSE, 'medium'),
('RTSP', 554, 'Real Time Streaming Protocol', FALSE, 'medium'),
('WebRTC', NULL, 'Web Real-Time Communication', FALSE, 'medium'),
('STUN', 3478, 'Session Traversal Utilities for NAT', FALSE, 'medium'),
('TURN', 3478, 'Traversal Using Relays around NAT', FALSE, 'medium'),
('RTMP', 1935, 'Real-Time Messaging Protocol', FALSE, 'medium'),
('HLS', NULL, 'HTTP Live Streaming', FALSE, 'low'),
('DASH', NULL, 'Dynamic Adaptive Streaming over HTTP', FALSE, 'low'),
('WebSocket', 80, 'WebSocket Protocol', TRUE, 'low'),
('WebSocket-SSL', 443, 'WebSocket over SSL', TRUE, 'low'),
('GraphQL', NULL, 'Graph Query Language', FALSE, 'low'),
('REST', NULL, 'Representational State Transfer', FALSE, 'low'),
('SOAP', NULL, 'Simple Object Access Protocol', FALSE, 'medium'),
('XML-RPC', NULL, 'XML Remote Procedure Call', FALSE, 'high'),
('JSON-RPC', NULL, 'JSON Remote Procedure Call', FALSE, 'medium'),
('gRPC-Web', NULL, 'gRPC for Web Clients', FALSE, 'medium'),
('Prometheus', 9090, 'Prometheus Monitoring', FALSE, 'medium'),
('Grafana', 3000, 'Grafana Dashboard', FALSE, 'medium'),
('Kibana', 5601, 'Kibana Dashboard', FALSE, 'medium'),
('Elasticsearch', 9200, 'Elasticsearch Service', FALSE, 'high'),
('Logstash', 5044, 'Logstash Service', FALSE, 'medium'),
('Filebeat', NULL, 'Filebeat Log Shipper', FALSE, 'medium'),
('Metricbeat', NULL, 'Metricbeat Metrics Shipper', FALSE, 'medium'),
('Packetbeat', NULL, 'Packetbeat Network Shipper', FALSE, 'medium'),
('Heartbeat', NULL, 'Heartbeat Uptime Monitor', FALSE, 'medium'),
('Auditbeat', NULL, 'Auditbeat Security Monitor', FALSE, 'medium'),
('Zabbix', 10051, 'Zabbix Monitoring', FALSE, 'medium'),
('Nagios', NULL, 'Nagios Monitoring', FALSE, 'medium'),
('Consul', 8500, 'Consul Service Discovery', FALSE, 'medium'),
('etcd', 2379, 'etcd Key-Value Store', FALSE, 'medium'),
('Vault', 8200, 'Vault Secrets Management', FALSE, 'high'),
('Nomad', 4646, 'Nomad Scheduler', FALSE, 'medium'),
('Terraform', NULL, 'Terraform Infrastructure', FALSE, 'medium'),
('Ansible', NULL, 'Ansible Configuration', FALSE, 'medium'),
('Puppet', 8140, 'Puppet Configuration', FALSE, 'medium'),
('Chef', NULL, 'Chef Configuration', FALSE, 'medium'),
('Salt', 4505, 'Salt Configuration', FALSE, 'medium'),
('Jenkins', 8080, 'Jenkins CI/CD', FALSE, 'medium'),
('GitLab', NULL, 'GitLab CI/CD', FALSE, 'medium'),
('GitHub', NULL, 'GitHub CI/CD', FALSE, 'medium'),
('Bitbucket', NULL, 'Bitbucket CI/CD', FALSE, 'medium'),
('Travis', NULL, 'Travis CI', FALSE, 'medium'),
('CircleCI', NULL, 'CircleCI', FALSE, 'medium'),
('Drone', NULL, 'Drone CI', FALSE, 'medium'),
('Argo', NULL, 'Argo Workflows', FALSE, 'medium'),
('Tekton', NULL, 'Tekton Pipelines', FALSE, 'medium'),
('Spinnaker', NULL, 'Spinnaker CD', FALSE, 'medium'),
('Flux', NULL, 'Flux CD', FALSE, 'medium'),
('ArgoCD', NULL, 'Argo CD', FALSE, 'medium'),
('Kubernetes', 6443, 'Kubernetes API', FALSE, 'high'),
('Docker', 2375, 'Docker API', FALSE, 'high'),
('Containerd', NULL, 'Containerd API', FALSE, 'high'),
('CRI-O', NULL, 'CRI-O API', FALSE, 'high'),
('Istio', NULL, 'Istio Service Mesh', FALSE, 'high'),
('Linkerd', NULL, 'Linkerd Service Mesh', FALSE, 'high'),
('Envoy', NULL, 'Envoy Proxy', FALSE, 'high'),
('Nginx', 80, 'Nginx Web Server', TRUE, 'low'),
('Apache', 80, 'Apache Web Server', TRUE, 'low'),
('Lighttpd', 80, 'Lighttpd Web Server', FALSE, 'low'),
('Caddy', 80, 'Caddy Web Server', FALSE, 'low'),
('Traefik', 80, 'Traefik Reverse Proxy', FALSE, 'low'),
('HAProxy', 80, 'HAProxy Load Balancer', FALSE, 'low'),
('Squid', 3128, 'Squid Proxy', FALSE, 'medium'),
('Varnish', 80, 'Varnish Cache', FALSE, 'low'),
('Memcached', 11211, 'Memcached Cache', FALSE, 'high'),
('Redis', 6379, 'Redis Cache', FALSE, 'high'),
('RabbitMQ', 5672, 'RabbitMQ Message Broker', FALSE, 'medium'),
('ActiveMQ', 61616, 'ActiveMQ Message Broker', FALSE, 'medium'),
('Kafka', 9092, 'Apache Kafka Message Broker', FALSE, 'medium'),
('NATS', 4222, 'NATS Message Broker', FALSE, 'medium'),
('MQTT', 1883, 'MQTT Message Broker', FALSE, 'medium'),
('AMQP', 5672, 'AMQP Message Broker', FALSE, 'medium'),
('STOMP', 61613, 'STOMP Message Broker', FALSE, 'medium'),
('ZeroMQ', NULL, 'ZeroMQ Message Broker', FALSE, 'medium'),
('NSQ', 4150, 'NSQ Message Broker', FALSE, 'medium'),
('Pulsar', 6650, 'Apache Pulsar Message Broker', FALSE, 'medium'),
('Celery', NULL, 'Celery Task Queue', FALSE, 'medium'),
('Airflow', NULL, 'Apache Airflow', FALSE, 'medium'),
('Luigi', NULL, 'Luigi Workflow', FALSE, 'medium'),
('Prefect', NULL, 'Prefect Workflow', FALSE, 'medium'),
('Dagster', NULL, 'Dagster Workflow', FALSE, 'medium'),
('Metaflow', NULL, 'Metaflow Workflow', FALSE, 'medium'),
('MLflow', NULL, 'MLflow Machine Learning', FALSE, 'medium'),
('Kubeflow', NULL, 'Kubeflow Machine Learning', FALSE, 'medium'),
('TensorFlow', NULL, 'TensorFlow Machine Learning', FALSE, 'medium'),
('PyTorch', NULL, 'PyTorch Machine Learning', FALSE, 'medium'),
('MXNet', NULL, 'MXNet Machine Learning', FALSE, 'medium'),
('Caffe', NULL, 'Caffe Machine Learning', FALSE, 'medium'),
('Theano', NULL, 'Theano Machine Learning', FALSE, 'medium'),
('ONNX', NULL, 'ONNX Machine Learning', FALSE, 'medium'),
('Scikit-learn', NULL, 'Scikit-learn Machine Learning', FALSE, 'medium'),
('XGBoost', NULL, 'XGBoost Machine Learning', FALSE, 'medium'),
('LightGBM', NULL, 'LightGBM Machine Learning', FALSE, 'medium'),
('CatBoost', NULL, 'CatBoost Machine Learning', FALSE, 'medium'),
('H2O', NULL, 'H2O Machine Learning', FALSE, 'medium'),
('Weka', NULL, 'Weka Machine Learning', FALSE, 'medium'),
('RapidMiner', NULL, 'RapidMiner Machine Learning', FALSE, 'medium'),
('KNIME', NULL, 'KNIME Machine Learning', FALSE, 'medium'),
('Orange', NULL, 'Orange Machine Learning', FALSE, 'medium'),
('BigML', NULL, 'BigML Machine Learning', FALSE, 'medium'),
('DataRobot', NULL, 'DataRobot Machine Learning', FALSE, 'medium'),
('Hugging Face', NULL, 'Hugging Face NLP', FALSE, 'medium'),
('SpaCy', NULL, 'SpaCy NLP', FALSE, 'medium'),
('NLTK', NULL, 'NLTK NLP', FALSE, 'medium'),
('Gensim', NULL, 'Gensim NLP', FALSE, 'medium'),
('AllenNLP', NULL, 'AllenNLP NLP', FALSE, 'medium'),
('Stanford NLP', NULL, 'Stanford NLP', FALSE, 'medium'),
('OpenNLP', NULL, 'OpenNLP NLP', FALSE, 'medium'),
('CoreNLP', NULL, 'CoreNLP NLP', FALSE, 'medium'),
('FastText', NULL, 'FastText NLP', FALSE, 'medium'),
('Word2Vec', NULL, 'Word2Vec NLP', FALSE, 'medium'),
('GloVe', NULL, 'GloVe NLP', FALSE, 'medium'),
('ELMo', NULL, 'ELMo NLP', FALSE, 'medium'),
('BERT', NULL, 'BERT NLP', FALSE, 'medium'),
('GPT', NULL, 'GPT NLP', FALSE, 'medium'),
('Transformer', NULL, 'Transformer NLP', FALSE, 'medium'),
('T5', NULL, 'T5 NLP', FALSE, 'medium'),
('BART', NULL, 'BART NLP', FALSE, 'medium'),
('XLNet', NULL, 'XLNet NLP', FALSE, 'medium'),
('RoBERTa', NULL, 'RoBERTa NLP', FALSE, 'medium'),
('DistilBERT', NULL, 'DistilBERT NLP', FALSE, 'medium'),
('ALBERT', NULL, 'ALBERT NLP', FALSE, 'medium'),
('ELECTRA', NULL, 'ELECTRA NLP', FALSE, 'medium'),
('DeBERTa', NULL, 'DeBERTa NLP', FALSE, 'medium'),
('Longformer', NULL, 'Longformer NLP', FALSE, 'medium'),
('Reformer', NULL, 'Reformer NLP', FALSE, 'medium'),
('IPsec-AH', 51, 'IPsec Authentication Header', FALSE, 'medium'),
('IPsec-ESP', 50, 'IPsec Encapsulating Security Payload', FALSE, 'medium'),
('GRE', 47, 'Generic Routing Encapsulation', FALSE, 'medium'),
('L2TPv3', NULL, 'Layer 2 Tunneling Protocol v3', FALSE, 'medium'),
('VXLAN', 4789, 'Virtual Extensible LAN', FALSE, 'medium'),
('Geneve', 6081, 'Generic Network Virtualization Encapsulation', FALSE, 'medium'),
('NVGRE', NULL, 'Network Virtualization using GRE', FALSE, 'medium'),
('STT', NULL, 'Stateless Transport Tunneling', FALSE, 'medium'),
('MPLS', NULL, 'Multiprotocol Label Switching', FALSE, 'medium'),
('OTV', NULL, 'Overlay Transport Virtualization', FALSE, 'medium'),
('FCoE', NULL, 'Fibre Channel over Ethernet', FALSE, 'medium'),
('iSCSI', 860, 'Internet Small Computer Systems Interface', FALSE, 'high'),
('FCIP', NULL, 'Fibre Channel over IP', FALSE, 'medium'),
('iFCP', NULL, 'Internet Fibre Channel Protocol', FALSE, 'medium'),
('SRP', NULL, 'SCSI RDMA Protocol', FALSE, 'medium'),
('AoE', NULL, 'ATA over Ethernet', FALSE, 'medium'),
('iWARP', NULL, 'Internet Wide Area RDMA Protocol', FALSE, 'medium'),
('RoCE', NULL, 'RDMA over Converged Ethernet', FALSE, 'medium'),
('InfiniBand', NULL, 'InfiniBand Protocol', FALSE, 'medium'),
('Fibre Channel', NULL, 'Fibre Channel Protocol', FALSE, 'medium'),
('SAS', NULL, 'Serial Attached SCSI', FALSE, 'medium'),
('SATA', NULL, 'Serial ATA', FALSE, 'medium'),
('NVMe', NULL, 'Non-Volatile Memory Express', FALSE, 'medium'),
('NVMe-oF', NULL, 'NVMe over Fabrics', FALSE, 'medium'),
('USB', NULL, 'Universal Serial Bus', FALSE, 'medium'),
('Thunderbolt', NULL, 'Thunderbolt Interface', FALSE, 'medium'),
('PCIe', NULL, 'PCI Express', FALSE, 'medium'),
('CXL', NULL, 'Compute Express Link', FALSE, 'medium'),
('HDMI', NULL, 'High-Definition Multimedia Interface', FALSE, 'medium'),
('DisplayPort', NULL, 'DisplayPort Interface', FALSE, 'medium'),
('VGA', NULL, 'Video Graphics Array', FALSE, 'medium'),
('DVI', NULL, 'Digital Visual Interface', FALSE, 'medium'),
('SDI', NULL, 'Serial Digital Interface', FALSE, 'medium'),
('AES67', NULL, 'Audio over IP Standard', FALSE, 'medium'),
('Dante', NULL, 'Dante Audio over IP', FALSE, 'medium'),
('RAVENNA', NULL, 'RAVENNA Audio over IP', FALSE, 'medium'),
('Livewire', NULL, 'Livewire Audio over IP', FALSE, 'medium'),
('Q-LAN', NULL, 'QSC Q-LAN Audio over IP', FALSE, 'medium'),
('AVB', NULL, 'Audio Video Bridging', FALSE, 'medium'),
('TSN', NULL, 'Time-Sensitive Networking', FALSE, 'medium'),
('PTP', 319, 'Precision Time Protocol', FALSE, 'medium'),
('NTPv4', 123, 'Network Time Protocol v4', TRUE, 'medium'),
('SNTP', 123, 'Simple Network Time Protocol', TRUE, 'medium'),
('IRIG', NULL, 'Inter-Range Instrumentation Group Time Code', FALSE, 'medium'),
('PPS', NULL, 'Pulse Per Second', FALSE, 'medium'),
('GPS', NULL, 'Global Positioning System Time', FALSE, 'medium'),
('GLONASS', NULL, 'GLONASS Time', FALSE, 'medium'),
('Galileo', NULL, 'Galileo Time', FALSE, 'medium'),
('BeiDou', NULL, 'BeiDou Time', FALSE, 'medium'),
('IEEE 1588', NULL, 'IEEE 1588 Precision Time Protocol', FALSE, 'medium'),
('White Rabbit', NULL, 'White Rabbit Precision Time Protocol', FALSE, 'medium'),
('SyncE', NULL, 'Synchronous Ethernet', FALSE, 'medium'),
('BITS', NULL, 'Building Integrated Timing Supply', FALSE, 'medium'),
('SONET', NULL, 'Synchronous Optical Networking', FALSE, 'medium'),
('SDH', NULL, 'Synchronous Digital Hierarchy', FALSE, 'medium'),
('OTN', NULL, 'Optical Transport Network', FALSE, 'medium'),
('DWDM', NULL, 'Dense Wavelength Division Multiplexing', FALSE, 'medium'),
('CWDM', NULL, 'Coarse Wavelength Division Multiplexing', FALSE, 'medium'),
('Dark Fiber', NULL, 'Dark Fiber Network', FALSE, 'medium'),
('Dark Light', NULL, 'Dark Light Network', FALSE, 'medium'),
('LiFi', NULL, 'Light Fidelity', FALSE, 'medium'),
('Free Space Optics', NULL, 'Free Space Optical Communication', FALSE, 'medium'),
('PLC', NULL, 'Power Line Communication', FALSE, 'medium'),
('HomePlug', NULL, 'HomePlug Powerline Alliance', FALSE, 'medium'),
('G.hn', NULL, 'G.hn Home Networking', FALSE, 'medium'),
('MoCA', NULL, 'Multimedia over Coax Alliance', FALSE, 'medium'),
('HomePNA', NULL, 'Home Phoneline Networking Alliance', FALSE, 'medium'),
('HomeRF', NULL, 'Home Radio Frequency', FALSE, 'medium'),
('Z-Wave', NULL, 'Z-Wave Home Automation', FALSE, 'medium'),
('Zigbee', NULL, 'Zigbee Home Automation', FALSE, 'medium'),
('Thread', NULL, 'Thread Home Automation', FALSE, 'medium'),
('Matter', NULL, 'Matter Home Automation', FALSE, 'medium'),
('KNX', NULL, 'KNX Home Automation', FALSE, 'medium'),
('LonWorks', NULL, 'LonWorks Home Automation', FALSE, 'medium'),
('BACnet', 47808, 'Building Automation and Control Networks', FALSE, 'medium'),
('Modbus', 502, 'Modbus Protocol', FALSE, 'high'),
('DNP3', 20000, 'Distributed Network Protocol 3', FALSE, 'high'),
('IEC 60870', NULL, 'IEC 60870 Telecontrol Protocol', FALSE, 'high'),
('IEC 61850', NULL, 'IEC 61850 Power Utility Automation', FALSE, 'high'),
('IEC 62351', NULL, 'IEC 62351 Security for Power Systems', FALSE, 'high'),
('OPC UA', 4840, 'OPC Unified Architecture', FALSE, 'high'),
('OPC DA', NULL, 'OPC Data Access', FALSE, 'high'),
('OPC HDA', NULL, 'OPC Historical Data Access', FALSE, 'high'),
('OPC A&E', NULL, 'OPC Alarms and Events', FALSE, 'high'),
('OPC XML-DA', NULL, 'OPC XML Data Access', FALSE, 'high'),
('MTConnect', NULL, 'MTConnect Manufacturing Protocol', FALSE, 'medium'),
('PROFINET', NULL, 'PROFINET Industrial Ethernet', FALSE, 'high'),
('EtherCAT', NULL, 'EtherCAT Industrial Ethernet', FALSE, 'high'),
('EtherNet/IP', 44818, 'EtherNet/IP Industrial Protocol', FALSE, 'high'),
('DeviceNet', NULL, 'DeviceNet Industrial Protocol', FALSE, 'high'),
('ControlNet', NULL, 'ControlNet Industrial Protocol', FALSE, 'high'),
('CAN', NULL, 'Controller Area Network', FALSE, 'medium'),
('CANopen', NULL, 'CANopen Industrial Protocol', FALSE, 'medium'),
('J1939', NULL, 'SAE J1939 Vehicle Bus', FALSE, 'medium'),
('FlexRay', NULL, 'FlexRay Vehicle Bus', FALSE, 'medium'),
('LIN', NULL, 'Local Interconnect Network', FALSE, 'medium'),
('MOST', NULL, 'Media Oriented Systems Transport', FALSE, 'medium'),
('AFDX', NULL, 'Avionics Full-Duplex Switched Ethernet', FALSE, 'medium'),
('ARINC 429', NULL, 'ARINC 429 Avionics Bus', FALSE, 'medium'),
('ARINC 664', NULL, 'ARINC 664 Avionics Ethernet', FALSE, 'medium'),
('ARINC 825', NULL, 'ARINC 825 Avionics CAN', FALSE, 'medium'),
('MIL-STD-1553', NULL, 'MIL-STD-1553 Military Bus', FALSE, 'medium'),
('SpaceWire', NULL, 'SpaceWire Spacecraft Bus', FALSE, 'medium'),
('IEEE 1394', NULL, 'IEEE 1394 FireWire', FALSE, 'medium'),
('USB Attached SCSI', NULL, 'USB Attached SCSI Protocol', FALSE, 'medium'),
('Thunderbolt Networking', NULL, 'Thunderbolt Networking Protocol', FALSE, 'medium'),
('AppleTalk', NULL, 'AppleTalk Protocol Suite', FALSE, 'medium'),
('IPX/SPX', NULL, 'IPX/SPX Protocol Suite', FALSE, 'medium'),
('NetBEUI', NULL, 'NetBIOS Extended User Interface', FALSE, 'medium'),
('DECnet', NULL, 'DECnet Protocol Suite', FALSE, 'medium'),
('Banyan VINES', NULL, 'Banyan VINES Protocol Suite', FALSE, 'medium'),
('XNS', NULL, 'Xerox Network Systems', FALSE, 'medium'),
('Chaosnet', NULL, 'Chaosnet Protocol', FALSE, 'medium'),
('CLNP', NULL, 'Connectionless Network Protocol', FALSE, 'medium'),
('TP4', NULL, 'OSI Transport Protocol Class 4', FALSE, 'medium');

-- 插入特定协议相关的漏洞
INSERT IGNORE INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method, published_date) VALUES
('CVE-2022-22965', 'Spring4Shell漏洞', 'Spring Framework中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2022-03-31'),
('CVE-2021-34527', 'PrintNightmare漏洞', 'Windows Print Spooler服务中的远程代码执行漏洞', 'critical', 'SMB', '网络扫描', '2021-07-01'),
('CVE-2021-26855', 'Exchange Server漏洞', 'Microsoft Exchange Server中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2021-03-02'),
('CVE-2020-1350', 'SIGRed漏洞', 'Windows DNS服务器中的远程代码执行漏洞', 'critical', 'DNS', '网络扫描', '2020-07-14'),
('CVE-2019-19781', 'Citrix ADC漏洞', 'Citrix ADC和Gateway中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2019-12-17'),
('CVE-2019-0708', 'BlueKeep漏洞', 'Windows远程桌面服务中的远程代码执行漏洞', 'critical', 'RDP', '网络扫描', '2019-05-14'),
('CVE-2018-13379', 'Fortinet VPN漏洞', 'Fortinet VPN中的路径遍历漏洞', 'high', 'HTTPS', '应用扫描', '2018-07-30'),
('CVE-2017-0144', 'EternalBlue漏洞', 'Windows SMB服务器中的远程代码执行漏洞', 'critical', 'SMB', '网络扫描', '2017-03-14'),
('CVE-2016-6277', 'OpenSSH漏洞', 'OpenSSH服务器中的拒绝服务漏洞', 'high', 'SSH', '网络扫描', '2016-08-01'),
('CVE-2015-7547', 'glibc DNS漏洞', 'glibc库中的DNS解析漏洞', 'high', 'DNS', '应用扫描', '2015-02-16');

-- 插入漏洞数据
INSERT IGNORE INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method, published_date) VALUES
('CVE-2022-23093', 'IPv6 路由头处理漏洞', 'IPv6路由头处理中的缓冲区溢出漏洞，可能导致远程代码执行', 'critical', 'IPv6', '网络扫描', '2022-01-15'),
('CVE-2021-44228', 'Log4Shell漏洞', '影响Java Log4j库的远程代码执行漏洞，可通过IPv6地址触发', 'critical', 'HTTP,HTTPS', '应用扫描', '2021-12-10'),
('CVE-2020-16898', 'IPv6 ICMPv6 NDP漏洞', 'Windows TCP/IP实现中的远程代码执行漏洞，通过ICMPv6路由器广告触发', 'high', 'ICMPv6', '网络扫描', '2020-10-13'),
('CVE-2020-13112', 'IPv6分片处理漏洞', 'Linux内核IPv6实现中的分片处理漏洞，可能导致拒绝服务', 'medium', 'IPv6', '网络扫描', '2020-05-20'),
('CVE-2019-5597', 'IPv6 DHCPv6客户端漏洞', 'DHCPv6客户端中的缓冲区溢出漏洞，可能导致远程代码执行', 'high', 'DHCPv6', '网络扫描', '2019-07-17'),
('CVE-2018-5391', 'IPv6分段重组漏洞', '操作系统IPv6实现中的分段重组漏洞，可能导致拒绝服务攻击', 'medium', 'IPv6', '网络扫描', '2018-08-06'),
('CVE-2018-17463', 'IPv6隧道实现漏洞', 'IPv6隧道实现中的安全漏洞，可能导致信息泄露', 'medium', 'IPv6', '网络扫描', '2018-09-25'),
('CVE-2017-9022', 'IPv6扩展头处理漏洞', '网络设备中IPv6扩展头处理漏洞，可能导致拒绝服务', 'high', 'IPv6', '网络扫描', '2017-05-18'),
('CVE-2016-1409', 'IPv6邻居发现协议漏洞', 'IPv6邻居发现协议实现中的漏洞，可能导致拒绝服务', 'high', 'ICMPv6', '网络扫描', '2016-03-23'),
('CVE-2015-8631', 'IPv6地址解析漏洞', 'IPv6地址解析中的漏洞，可能导致信息泄露', 'medium', 'IPv6', '应用扫描', '2015-12-15');

-- 创建存储过程：批量更新IPv6地址漏洞信息
DELIMITER //
CREATE PROCEDURE update_vulnerability_status(
    IN p_vulnerability_id INT,
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_is_fixed TINYINT,
    OUT p_affected_rows INT
)
BEGIN
    DECLARE v_count INT;
    DECLARE v_vulnerability_exists INT;
    DECLARE v_affected_rows INT DEFAULT 0;
    DECLARE v_sqlstate CHAR(5);
    DECLARE v_errno INT;
    DECLARE v_error_msg TEXT;
    
    -- 改进错误处理，捕获并返回详细的错误信息
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- 获取详细的错误信息
        GET DIAGNOSTICS CONDITION 1
            v_sqlstate = RETURNED_SQLSTATE,
            v_errno = MYSQL_ERRNO,
            v_error_msg = MESSAGE_TEXT;
        
        -- 回滚事务
        ROLLBACK;
        
        -- 设置输出参数为0
        SET p_affected_rows = 0;
        
        -- 返回详细的错误信息
        SET @error_detail = CONCAT('数据库错误: ', v_errno, ' (', v_sqlstate, '): ', v_error_msg);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @error_detail;
    END;
    
    -- 验证必要参数
    IF p_vulnerability_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '缺少漏洞ID';
    END IF;
    
    -- 检查漏洞是否存在
    SELECT COUNT(*) INTO v_vulnerability_exists FROM vulnerabilities WHERE vulnerability_id = p_vulnerability_id;
    IF v_vulnerability_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '指定的漏洞ID不存在';
    END IF;
    
    -- 验证至少有一个筛选条件
    IF p_country_id IS NULL AND p_asn IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '至少需要提供一个筛选条件(国家ID或ASN)';
    END IF;
    
    START TRANSACTION;

    -- 创建临时表存储需要更新的地址ID（使用IF NOT EXISTS避免回滚问题）
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_update_addresses AS
    SELECT aa.address_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    JOIN temp_address_list tal ON aa.address = tal.address
    WHERE (p_country_id IS NULL OR ip.country_id = p_country_id)
      AND (p_asn IS NULL OR ip.asn = p_asn);
    
    -- 检查是否有符合条件的地址
    SELECT COUNT(*) INTO v_count FROM temp_update_addresses;
    
    IF v_count = 0 THEN
        -- 如果没有找到匹配的地址，尝试直接根据国家和ASN筛选
        TRUNCATE TABLE temp_update_addresses;
        
        INSERT INTO temp_update_addresses
        SELECT aa.address_id
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE (p_country_id IS NULL OR ip.country_id = p_country_id)
          AND (p_asn IS NULL OR ip.asn = p_asn);
        
        SELECT COUNT(*) INTO v_count FROM temp_update_addresses;
        
        IF v_count = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '没有找到符合条件的地址';
        END IF;
    END IF;
    
    -- 更新或插入漏洞记录
    INSERT INTO address_vulnerabilities (address_id, vulnerability_id, is_fixed, detection_date, last_detected)
    SELECT 
        ta.address_id,
        p_vulnerability_id,
        p_is_fixed,
        NOW(),
        NOW()
    FROM 
        temp_update_addresses ta
    ON DUPLICATE KEY UPDATE
        is_fixed = p_is_fixed,
        last_detected = NOW();
    
    -- 获取受影响的行数
    SET v_affected_rows = ROW_COUNT();
    SET p_affected_rows = v_affected_rows;
    SET @affected_rows = v_affected_rows;
    
    -- 更新国家漏洞统计
    IF p_country_id IS NOT NULL THEN
        -- 更新或插入国家漏洞统计
        INSERT INTO country_vulnerability_stats 
            (country_id, vulnerability_id, affected_addresses, percentage, last_updated)
        SELECT 
            p_country_id,
            p_vulnerability_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.country_id = p_country_id
            ), 2),
            NOW()
        FROM 
            address_vulnerabilities av
        JOIN 
            active_addresses aa ON av.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.country_id = p_country_id AND
            av.vulnerability_id = p_vulnerability_id AND
            av.is_fixed = 0
        GROUP BY 
            ip.country_id, av.vulnerability_id
        ON DUPLICATE KEY UPDATE
            affected_addresses = VALUES(affected_addresses),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    -- 清理临时表（使用TRUNCATE而不是DROP）
    TRUNCATE TABLE temp_update_addresses;
    
    COMMIT;
END //
DELIMITER ;

-- 创建存储过程：批量更新IPv6地址协议支持信息
DELIMITER //
CREATE PROCEDURE update_protocol_support(
    IN p_protocol_id INT,
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_port INT,
    IN p_is_supported TINYINT,
    OUT p_affected_rows INT
)
BEGIN
    DECLARE v_count INT;
    DECLARE v_protocol_exists INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '更新协议支持状态失败';
    END;
    
    -- 验证必要参数
    IF p_protocol_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '缺少协议ID';
    END IF;
    
    -- 检查协议是否存在
    SELECT COUNT(*) INTO v_protocol_exists FROM protocols WHERE protocol_id = p_protocol_id;
    IF v_protocol_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '指定的协议ID不存在';
    END IF;
    
    -- 验证至少有一个筛选条件
    IF p_country_id IS NULL AND p_asn IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '至少需要提供一个筛选条件(国家ID或ASN)';
    END IF;
    
    START TRANSACTION;
    
    -- 创建临时表存储需要更新的地址ID
    -- 只选择临时表中存在的地址
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_update_addresses AS
    SELECT aa.address_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    JOIN temp_address_list tal ON aa.address = tal.address
    WHERE (p_country_id IS NULL OR ip.country_id = p_country_id)
      AND (p_asn IS NULL OR ip.asn = p_asn);
    
    -- 检查是否有符合条件的地址
    SELECT COUNT(*) INTO v_count FROM temp_update_addresses;
    
    IF v_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '没有找到符合条件的地址';
    END IF;
    
    -- 更新或插入协议支持记录
    IF p_is_supported = 1 THEN
        INSERT INTO address_protocols (address_id, protocol_id, port, first_seen, last_seen)
        SELECT 
            ta.address_id,
            p_protocol_id,
            IFNULL(p_port, (SELECT protocol_number FROM protocols WHERE protocol_id = p_protocol_id)),
            NOW(),
            NOW()
        FROM 
            temp_update_addresses ta
        ON DUPLICATE KEY UPDATE
            last_seen = NOW();
    ELSE
        -- 移除协议支持
        DELETE FROM address_protocols
        WHERE address_id IN (SELECT address_id FROM temp_update_addresses)
          AND protocol_id = p_protocol_id
          AND (p_port IS NULL OR port = p_port);
    END IF;
    
    -- 获取受影响的行数
    SET p_affected_rows = ROW_COUNT();
    
    -- 更新国家协议统计
    IF p_country_id IS NOT NULL THEN
        -- 更新或插入国家协议统计
        INSERT INTO country_protocol_stats 
            (country_id, protocol_id, address_count, percentage, last_updated)
        SELECT 
            p_country_id,
            p_protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.country_id = p_country_id
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.country_id = p_country_id AND
            ap.protocol_id = p_protocol_id
        GROUP BY 
            ip.country_id, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    -- 更新ASN协议统计（新增部分）
    IF p_asn IS NOT NULL THEN
        -- 更新或插入ASN协议统计
        INSERT INTO asn_protocol_stats 
            (asn, protocol_id, address_count, percentage, last_updated)
        SELECT 
            p_asn,
            p_protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.asn = p_asn
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.asn = p_asn AND
            ap.protocol_id = p_protocol_id
        GROUP BY 
            ip.asn, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    -- 清理临时表
    DROP TEMPORARY TABLE IF EXISTS temp_update_addresses;
    
    COMMIT;
END //
DELIMITER ;
