-- 创建更新关联表格的存储过程
DELIMITER //
CREATE PROCEDURE update_relation_tables()
BEGIN
    -- 声明变量
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_protocol_id INT;
    DECLARE v_vulnerability_id INT;
    DECLARE v_asn INT;
    DECLARE v_country_id CHAR(2);
    DECLARE v_region VARCHAR(50);
    
    -- 协议游标
    DECLARE cur_protocols CURSOR FOR 
        SELECT protocol_id FROM protocols;
    
    -- 漏洞游标
    DECLARE cur_vulnerabilities CURSOR FOR 
        SELECT vulnerability_id FROM vulnerabilities;
    
    -- 异常处理
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 第一步：更新ASN协议关联表
    -- 清空现有数据（可选）
    -- TRUNCATE TABLE asn_protocol_stats;
    
    -- 插入ASN与协议的关联数据
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
    
    -- 第二步：更新国家协议统计表
    -- 打开协议游标
    OPEN cur_protocols;
    
    -- 遍历所有协议
    read_protocol_loop: LOOP
        FETCH cur_protocols INTO v_protocol_id;
        
        IF done THEN
            LEAVE read_protocol_loop;
        END IF;
        
        -- 更新国家协议统计表
        INSERT INTO country_protocol_stats (country_id, protocol_id, address_count, percentage)
        SELECT 
            c.country_id,
            v_protocol_id,
            IFNULL(SUM(aps.affected_addresses), 0) AS address_count,
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
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
        
        -- 第三步：更新地区协议统计表
        INSERT INTO region_protocol_stats (region, protocol_id, affected_addresses, total_addresses, affected_percentage)
        SELECT 
            c.region,
            v_protocol_id,
            IFNULL(SUM(cps.address_count), 0) AS affected_addresses,
            SUM(c.total_active_ipv6) AS total_addresses,
            CASE 
                WHEN SUM(c.total_active_ipv6) > 0 THEN 
                    ROUND(IFNULL(SUM(cps.address_count), 0) * 100.0 / SUM(c.total_active_ipv6), 2)
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
        
        -- 第四步：更新协议统计表
        INSERT INTO protocol_stats (protocol_id, affected_addresses, affected_asns, affected_countries)
        SELECT 
            v_protocol_id,
            IFNULL(SUM(cps.address_count), 0) AS affected_addresses,
            (SELECT COUNT(*) FROM asn_protocol_stats WHERE protocol_id = v_protocol_id AND affected_addresses > 0) AS affected_asns,
            (SELECT COUNT(*) FROM country_protocol_stats WHERE protocol_id = v_protocol_id AND address_count > 0) AS affected_countries
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
    
    -- 关闭协议游标
    CLOSE cur_protocols;
    
    -- 重置done标志
    SET done = FALSE;
    
    -- 第五步：更新ASN漏洞关联表
    -- 清空现有数据（可选）
    -- TRUNCATE TABLE asn_vulnerability_stats;
    
    -- 插入ASN与漏洞的关联数据
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
    
    -- 第六步：更新漏洞相关统计表
    -- 打开漏洞游标
    OPEN cur_vulnerabilities;
    
    -- 遍历所有漏洞
    read_vulnerability_loop: LOOP
        FETCH cur_vulnerabilities INTO v_vulnerability_id;
        
        IF done THEN
            LEAVE read_vulnerability_loop;
        END IF;
        
        -- 更新国家漏洞统计表
        INSERT INTO country_vulnerability_stats (country_id, vulnerability_id, affected_addresses, percentage)
        SELECT 
            c.country_id,
            v_vulnerability_id,
            IFNULL(SUM(avs.affected_addresses), 0) AS affected_addresses,
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
            percentage = VALUES(percentage),
            last_updated = NOW();
        
        -- 更新地区漏洞统计表
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
        
        -- 更新漏洞统计表
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
    
    -- 关闭漏洞游标
    CLOSE cur_vulnerabilities;
    
    -- 提交事务
    COMMIT;
END //
DELIMITER ;