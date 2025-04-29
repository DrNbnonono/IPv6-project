-- 使用现有的ipv6_project数据库
USE ipv6_project;

-- 创建存储过程：批量导入IPv6地址
DELIMITER //
CREATE PROCEDURE batch_import_ipv6_addresses(
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_prefix VARCHAR(64),
    OUT p_imported_count INT,
    OUT p_error_count INT
)
BEGIN
    -- 声明变量
    DECLARE v_prefix_id INT;
    DECLARE v_error_msg TEXT;
    
    -- 错误处理
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
        v_error_msg = MESSAGE_TEXT;
        ROLLBACK;
        SET @error_message = CONCAT('导入失败:', v_error_msg);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @error_message;
    END;
    
    -- 初始化计数器
    SET p_imported_count = 0;
    SET p_error_count = 0;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 检查国家是否存在
    IF NOT EXISTS (SELECT 1 FROM countries WHERE country_id = p_country_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '国家ID不存在';
    END IF;
    
    -- 检查ASN是否存在
    IF NOT EXISTS (SELECT 1 FROM asns WHERE asn = p_asn) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ASN不存在';
    END IF;
    
    -- 检查前缀是否存在，不存在则创建
    SELECT prefix_id INTO v_prefix_id 
    FROM ip_prefixes 
    WHERE prefix = p_prefix AND country_id = p_country_id AND asn = p_asn;
    
    IF v_prefix_id IS NULL THEN
        -- 创建新前缀
        INSERT INTO ip_prefixes (prefix, country_id, asn, version, prefix_length)
        VALUES (p_prefix, p_country_id, p_asn, '6', SUBSTRING_INDEX(p_prefix, '/', -1));
        
        SET v_prefix_id = LAST_INSERT_ID();
    END IF;
    
    -- 创建临时表存储导入的地址
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_addresses (
        address VARCHAR(128) NOT NULL,
        is_processed BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (address)
    );
    
    -- 注意：实际导入数据时，需要通过应用程序将文件内容插入到临时表中
    -- 这里仅展示存储过程的逻辑
    
    -- 处理临时表中的地址，设置默认IID类型为random
    INSERT INTO active_addresses (address, version, prefix_id, first_seen, last_seen, iid_type)
    SELECT 
        a.address, 
        '6', 
        v_prefix_id, 
        NOW(), 
        NOW(),
        (SELECT type_id FROM address_types WHERE type_name = 'random' LIMIT 1)
    FROM 
        temp_addresses a
    LEFT JOIN 
        active_addresses aa ON a.address = aa.address
    WHERE 
        aa.address_id IS NULL AND a.is_processed = FALSE
    ON DUPLICATE KEY UPDATE 
        last_seen = NOW();
    
    -- 更新导入计数
    SET p_imported_count = ROW_COUNT();
    
    -- 更新已处理标志
    UPDATE temp_addresses SET is_processed = TRUE;
    
    -- 更新国家统计
    UPDATE countries 
    SET 
        total_active_ipv6 = (
            SELECT COUNT(*) FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.country_id = p_country_id
        ),
        total_ipv6_prefixes = (
            SELECT COUNT(*) FROM ip_prefixes
            WHERE country_id = p_country_id
        ),
        last_updated = NOW()
    WHERE country_id = p_country_id;
    
    -- 更新ASN统计
    UPDATE asns
    SET 
        total_active_ipv6 = (
            SELECT COUNT(*) FROM active_addresses aa
            JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
            WHERE ip.asn = p_asn
        ),
        total_ipv6_prefixes = (
            SELECT COUNT(*) FROM ip_prefixes
            WHERE asn = p_asn
        ),
        last_updated = NOW()
    WHERE asn = p_asn;
    
    -- 提交事务
    COMMIT;
    
    -- 清理临时表
    DROP TEMPORARY TABLE IF EXISTS temp_addresses;
END //
DELIMITER ;

-- 修改触发器：地址漏洞关联后更新统计（移除日志记录）
DELIMITER //
CREATE TRIGGER after_vulnerability_insert
AFTER INSERT ON address_vulnerabilities
FOR EACH ROW
BEGIN
    DECLARE v_country_id CHAR(2);
    
    -- 获取地址所属国家
    SELECT ip.country_id INTO v_country_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id;
    
    -- 更新或插入国家漏洞统计
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
END //
DELIMITER ;

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

-- 创建IPv6地址详情视图
CREATE OR REPLACE VIEW ipv6_address_details_view AS
SELECT 
    aa.address_id,
    aa.address,
    aa.version,
    aa.first_seen,
    aa.last_seen,
    aa.uptime_percentage,
    aa.iid_type,
    at.type_name AS iid_type_name,
    ip.prefix_id,
    ip.prefix,
    ip.asn,
    a.as_name,
    a.as_name_zh,
    ip.country_id,
    c.country_name,
    c.country_name_zh,
    c.region,
    c.subregion,
    (
        SELECT GROUP_CONCAT(p.protocol_name)
        FROM address_protocols ap
        JOIN protocols p ON ap.protocol_id = p.protocol_id
        WHERE ap.address_id = aa.address_id
    ) AS supported_protocols,
    (
        SELECT COUNT(*)
        FROM address_vulnerabilities av
        WHERE av.address_id = aa.address_id AND av.is_fixed = 0
    ) AS open_vulnerabilities
FROM 
    active_addresses aa
LEFT JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
LEFT JOIN 
    asns a ON ip.asn = a.asn
LEFT JOIN 
    countries c ON ip.country_id = c.country_id
LEFT JOIN 
    address_types at ON aa.iid_type = at.type_id;

-- 创建国家IPv6统计视图
CREATE OR REPLACE VIEW country_ipv6_stats_view AS
SELECT 
    c.country_id,
    c.country_name,
    c.country_name_zh,
    c.region,
    c.subregion,
    c.total_ipv6_prefixes,
    c.total_active_ipv6,
    (
        SELECT GROUP_CONCAT(DISTINCT a.asn)
        FROM (
            SELECT a.asn
            FROM asns a
            WHERE a.country_id = c.country_id
            ORDER BY a.total_active_ipv6 DESC
            LIMIT 5
        ) AS a
    ) AS top_asns,
    (
        SELECT COUNT(*) 
        FROM address_vulnerabilities av
        JOIN active_addresses aa ON av.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = c.country_id AND av.is_fixed = 0
    ) AS total_vulnerabilities,
    (
        SELECT COUNT(DISTINCT protocol_id) 
        FROM country_protocol_stats
        WHERE country_id = c.country_id
    ) AS supported_protocols,
    c.last_updated
FROM 
    countries c;

-- 创建协议支持统计视图
CREATE OR REPLACE VIEW protocol_support_stats_view AS
SELECT 
    p.protocol_id,
    p.protocol_name,
    p.protocol_number,
    p.description,
    p.risk_level,
    (
        SELECT COUNT(*) 
        FROM address_protocols ap
        WHERE ap.protocol_id = p.protocol_id
    ) AS total_addresses,
    (
        SELECT COUNT(DISTINCT ip.country_id)
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ap.protocol_id = p.protocol_id
    ) AS countries_count,
    (
        SELECT GROUP_CONCAT(DISTINCT c.country_name)
        FROM (
            SELECT c.country_name, cps.address_count
            FROM country_protocol_stats cps
            JOIN countries c ON cps.country_id = c.country_id
            WHERE cps.protocol_id = p.protocol_id
            ORDER BY cps.address_count DESC
            LIMIT 5
        ) AS c
    ) AS top_countries
FROM 
    protocols p;

-- 创建漏洞统计视图
CREATE OR REPLACE VIEW vulnerability_stats_view AS
SELECT 
    v.vulnerability_id,
    v.cve_id,
    v.name,
    v.severity,
    v.affected_protocols,
    (
        SELECT COUNT(*) 
        FROM address_vulnerabilities av
        WHERE av.vulnerability_id = v.vulnerability_id AND av.is_fixed = 0
    ) AS affected_addresses,
    (
        SELECT COUNT(DISTINCT ip.country_id)
        FROM address_vulnerabilities av
        JOIN active_addresses aa ON av.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE av.vulnerability_id = v.vulnerability_id AND av.is_fixed = 0
    ) AS affected_countries,
    (
        SELECT GROUP_CONCAT(DISTINCT c.country_name)
        FROM (
            SELECT c.country_name, cvs.affected_addresses
            FROM country_vulnerability_stats cvs
            JOIN countries c ON cvs.country_id = c.country_id
            WHERE cvs.vulnerability_id = v.vulnerability_id
            ORDER BY cvs.affected_addresses DESC
            LIMIT 5
        ) AS c
    ) AS top_affected_countries,
    v.published_date,
    v.last_updated
FROM 
    vulnerabilities v;



-- 创建触发器：地址协议关联后更新ASN和国家统计
DELIMITER //
CREATE TRIGGER after_protocol_insert
AFTER INSERT ON address_protocols
FOR EACH ROW
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_total_addresses INT;
    
    -- 获取地址所属国家和ASN
    SELECT ip.country_id, ip.asn, COUNT(*) INTO v_country_id, v_asn, v_total_addresses
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id
    GROUP BY ip.country_id, ip.asn;
    
    -- 更新ASN协议统计
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
    
    -- 更新国家协议统计
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
END //
DELIMITER ;

-- 创建触发器：地址协议删除后更新ASN和国家统计
DELIMITER //
CREATE TRIGGER after_protocol_delete
AFTER DELETE ON address_protocols
FOR EACH ROW
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_address_count INT;
    DECLARE v_total_addresses INT;
    DECLARE v_percentage DECIMAL(5,2);
    
    -- 获取地址所属国家和ASN
    SELECT ip.country_id, ip.asn INTO v_country_id, v_asn
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = OLD.address_id;
    
    -- 更新ASN协议统计
    IF v_asn IS NOT NULL THEN
        -- 计算新的地址数量
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn AND ap.protocol_id = OLD.protocol_id;
        
        -- 计算总地址数
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn;
        
        -- 计算百分比
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        -- 如果没有地址了，删除统计记录，否则更新
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
    
    -- 更新国家协议统计
    IF v_country_id IS NOT NULL THEN
        -- 计算新的地址数量
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id AND ap.protocol_id = OLD.protocol_id;
        
        -- 计算总地址数
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id;
        
        -- 计算百分比
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        -- 如果没有地址了，删除统计记录，否则更新
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
END //
DELIMITER ;
