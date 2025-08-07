-- 更新前缀统计数据的存储过程
-- 用于更新countries和asns表中的前缀总数统计，基于ip_prefixes表的实际数据

DELIMITER $$

-- 创建存储过程：更新ASN表的前缀统计
CREATE PROCEDURE UpdateAsnPrefixStats()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_asn INT;
    DECLARE v_prefix_count INT;
    DECLARE cur CURSOR FOR 
        SELECT asn, COUNT(*) as prefix_count 
        FROM ip_prefixes 
        WHERE version = '6' AND asn IS NOT NULL
        GROUP BY asn;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 首先将所有ASN的前缀数量重置为0
    UPDATE asns SET total_ipv6_prefixes = 0;
    
    -- 打开游标
    OPEN cur;
    
    read_loop: LOOP
        FETCH cur INTO v_asn, v_prefix_count;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- 更新ASN的前缀数量
        UPDATE asns 
        SET total_ipv6_prefixes = v_prefix_count,
            last_updated = CURRENT_TIMESTAMP
        WHERE asn = v_asn;
        
    END LOOP;
    
    -- 关闭游标
    CLOSE cur;
    
    -- 提交事务
    COMMIT;
    
    -- 输出更新结果
    SELECT 
        COUNT(*) as total_asns_updated,
        SUM(total_ipv6_prefixes) as total_prefixes_counted
    FROM asns 
    WHERE total_ipv6_prefixes > 0;
    
END$$

-- 创建存储过程：更新国家表的前缀统计
CREATE PROCEDURE UpdateCountryPrefixStats()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_country_id CHAR(2);
    DECLARE v_prefix_count INT;
    DECLARE cur CURSOR FOR 
        SELECT country_id, COUNT(*) as prefix_count 
        FROM ip_prefixes 
        WHERE version = '6' AND country_id IS NOT NULL
        GROUP BY country_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 首先将所有国家的前缀数量重置为0
    UPDATE countries SET total_ipv6_prefixes = 0;
    
    -- 打开游标
    OPEN cur;
    
    read_loop: LOOP
        FETCH cur INTO v_country_id, v_prefix_count;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- 更新国家的前缀数量
        UPDATE countries 
        SET total_ipv6_prefixes = v_prefix_count,
            last_updated = CURRENT_TIMESTAMP
        WHERE country_id = v_country_id;
        
    END LOOP;
    
    -- 关闭游标
    CLOSE cur;
    
    -- 提交事务
    COMMIT;
    
    -- 输出更新结果
    SELECT 
        COUNT(*) as total_countries_updated,
        SUM(total_ipv6_prefixes) as total_prefixes_counted
    FROM countries 
    WHERE total_ipv6_prefixes > 0;
    
END$$

-- 创建存储过程：更新所有前缀统计数据
CREATE PROCEDURE UpdateAllPrefixStats()
BEGIN
    -- 更新ASN前缀统计
    CALL UpdateAsnPrefixStats();
    
    -- 更新国家前缀统计
    CALL UpdateCountryPrefixStats();
    
    -- 输出总体统计信息
    SELECT 
        'Summary' as type,
        (SELECT COUNT(*) FROM ip_prefixes WHERE version = '6') as total_ipv6_prefixes_in_db,
        (SELECT COUNT(*) FROM asns WHERE total_ipv6_prefixes > 0) as asns_with_prefixes,
        (SELECT COUNT(*) FROM countries WHERE total_ipv6_prefixes > 0) as countries_with_prefixes,
        (SELECT SUM(total_ipv6_prefixes) FROM asns) as total_prefixes_in_asns,
        (SELECT SUM(total_ipv6_prefixes) FROM countries) as total_prefixes_in_countries;
        
END$$

DELIMITER ;

-- 使用说明：
-- 1. 只更新ASN前缀统计：CALL UpdateAsnPrefixStats();
-- 2. 只更新国家前缀统计：CALL UpdateCountryPrefixStats();
-- 3. 更新所有前缀统计：CALL UpdateAllPrefixStats();
