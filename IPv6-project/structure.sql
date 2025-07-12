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
CREATE USER IF NOT EXISTS 'linux_db'@'%' IDENTIFIED BY 'root';

-- 授予权限
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'localhost';
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'172.25.%';
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'%';

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

-- 1. 创建用户
CREATE USER 'linux_db'@'%' IDENTIFIED BY 'root';

-- 2. 授权
GRANT ALL PRIVILEGES ON ipv6_project.* TO 'linux_db'@'%';

-- 3. 刷新权限
FLUSH PRIVILEGES;

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
