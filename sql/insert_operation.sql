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
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = CONCAT('导入失败: ', v_error_msg);
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
        INSERT INTO ip_prefixes (prefix, country_id, asn, version)
        VALUES (p_prefix, p_country_id, p_asn, '6');
        
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
    
    -- 处理临时表中的地址
    INSERT INTO active_addresses (address, version, prefix_id, first_seen, last_seen)
    SELECT 
        a.address, 
        '6', 
        v_prefix_id, 
        NOW(), 
        NOW()
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

-- 删除存储过程（如需删除）
--DROP PROCEDURE IF EXISTS batch_import_ipv6_addresses;

-- 创建触发器：地址漏洞关联后更新统计
DELIMITER //
CREATE TRIGGER after_vulnerability_insert
AFTER INSERT ON address_vulnerabilities
FOR EACH ROW
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_address VARCHAR(128);
    
    -- 获取地址所属国家
    SELECT ip.country_id, aa.address INTO v_country_id, v_address
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
        
    -- 记录漏洞发现日志
    INSERT INTO vulnerability_logs 
        (address, vulnerability_id, action, action_time, details)
    VALUES 
        (v_address, NEW.vulnerability_id, 'discovered', NOW(), 
         CONCAT('发现地址 ', v_address, ' 存在漏洞ID: ', NEW.vulnerability_id));
END //
DELIMITER ;

-- 创建触发器：地址漏洞修复后更新统计
DELIMITER //
CREATE TRIGGER after_vulnerability_update
AFTER UPDATE ON address_vulnerabilities
FOR EACH ROW
BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_address VARCHAR(128);
    
    -- 仅在修复状态变更时处理
    IF NEW.is_fixed != OLD.is_fixed THEN
        -- 获取地址所属国家
        SELECT ip.country_id, aa.address INTO v_country_id, v_address
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE aa.address_id = NEW.address_id;
        
        -- 更新国家漏洞统计
        UPDATE country_vulnerability_stats
        SET 
            affected_addresses = (
                SELECT COUNT(*) 
                FROM address_vulnerabilities av
                JOIN active_addresses aa ON av.address_id = aa.address_id
                JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
                WHERE ip.country_id = v_country_id
                  AND av.vulnerability_id = NEW.vulnerability_id
                  AND av.is_fixed = 0
            ),
            percentage = (
                SELECT ROUND(COUNT(*) * 100.0 / (
                    SELECT COUNT(*) 
                    FROM active_addresses a
                    JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                    WHERE p.country_id = v_country_id
                ), 2)
                FROM address_vulnerabilities av
                JOIN active_addresses aa ON av.address_id = aa.address_id
                JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
                WHERE ip.country_id = v_country_id
                  AND av.vulnerability_id = NEW.vulnerability_id
                  AND av.is_fixed = 0
            ),
            last_updated = NOW()
        WHERE 
            country_id = v_country_id AND
            vulnerability_id = NEW.vulnerability_id;
            
        -- 记录漏洞修复日志
        IF NEW.is_fixed = 1 THEN
            INSERT INTO vulnerability_logs 
                (address, vulnerability_id, action, action_time, details)
            VALUES 
                (v_address, NEW.vulnerability_id, 'fixed', NOW(), 
                 CONCAT('修复地址 ', v_address, ' 的漏洞ID: ', NEW.vulnerability_id));
        END IF;
    END IF;
END //
DELIMITER ;

-- 删除触发器（如需删除）
--DROP TRIGGER IF EXISTS after_vulnerability_insert;
--DROP TRIGGER IF EXISTS after_vulnerability_update;

-- 创建存储过程：批量更新IPv6地址协议支持
DELIMITER //
CREATE PROCEDURE update_protocol_support(
    IN p_protocol_id INT,
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_is_supported TINYINT,
    OUT p_affected_rows INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '更新协议支持状态失败';
    END;
    
    START TRANSACTION;
    
    -- 创建临时表存储需要更新的地址ID
    CREATE TEMPORARY TABLE temp_addresses AS
    SELECT aa.address_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE (p_country_id IS NULL OR ip.country_id = p_country_id)
      AND (p_asn IS NULL OR ip.asn = p_asn);
    
    -- 更新或插入协议支持记录
    INSERT INTO address_protocols (address_id, protocol_id, is_supported, last_checked)
    SELECT 
        ta.address_id,
        p_protocol_id,
        p_is_supported,
        NOW()
    FROM 
        temp_addresses ta
    ON DUPLICATE KEY UPDATE
        is_supported = p_is_supported,
        last_checked = NOW();
    
    -- 获取受影响的行数
    SET p_affected_rows = ROW_COUNT();
    
    -- 更新国家协议统计
    IF p_country_id IS NOT NULL THEN
        -- 更新或插入国家协议统计
        INSERT INTO country_protocol_stats 
            (country_id, protocol_id, supported_addresses, percentage, last_updated)
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
            ap.protocol_id = p_protocol_id AND
            ap.is_supported = 1
        GROUP BY 
            ip.country_id, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            supported_addresses = VALUES(supported_addresses),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    -- 清理临时表
    DROP TEMPORARY TABLE temp_addresses;
    
    COMMIT;
END //
DELIMITER ;

-- 删除存储过程（如需删除）
--DROP PROCEDURE IF EXISTS update_protocol_support;

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
    GROUP_CONCAT(DISTINCT vt.vulnerability_name ORDER BY vt.vulnerability_id SEPARATOR ', ') AS vulnerabilities,
    SUM(CASE WHEN av.is_fixed = 0 THEN 1 ELSE 0 END) AS unfixed_vulnerabilities_count,
    GROUP_CONCAT(DISTINCT pt.protocol_name ORDER BY pt.protocol_id SEPARATOR ', ') AS supported_protocols
FROM 
    active_addresses aa
JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
JOIN 
    countries c ON ip.country_id = c.country_id
JOIN 
    asns a ON ip.asn = a.asn
LEFT JOIN 
    address_vulnerabilities av ON aa.address_id = av.address_id
LEFT JOIN 
    vulnerability_types vt ON av.vulnerability_id = vt.vulnerability_id
LEFT JOIN 
    address_protocols ap ON aa.address_id = ap.address_id AND ap.is_supported = 1
LEFT JOIN 
    protocol_types pt ON ap.protocol_id = pt.protocol_id
GROUP BY 
    aa.address_id;

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
    COUNT(DISTINCT ip.asn) AS asn_count,
    GROUP_CONCAT(DISTINCT a.as_name ORDER BY a.total_active_ipv6 DESC LIMIT 5 SEPARATOR ', ') AS top_asns,
    (SELECT COUNT(*) FROM address_vulnerabilities av 
     JOIN active_addresses aa ON av.address_id = aa.address_id
     JOIN ip_prefixes ip2 ON aa.prefix_id = ip2.prefix_id
     WHERE ip2.country_id = c.country_id AND av.is_fixed = 0) AS total_vulnerabilities,
    c.last_updated
FROM 
    countries c
LEFT JOIN 
    ip_prefixes ip ON c.country_id = ip.country_id
LEFT JOIN 
    asns a ON ip.asn = a.asn
GROUP BY 
    c.country_id;

-- 创建协议支持统计视图
CREATE OR REPLACE VIEW protocol_support_stats_view AS
SELECT 
    pt.protocol_id,
    pt.protocol_name,
    pt.protocol_description,
    COUNT(DISTINCT ap.address_id) AS supported_addresses,
    COUNT(DISTINCT ip.country_id) AS supported_countries,
    COUNT(DISTINCT ip.asn) AS supported_asns,
    ROUND(COUNT(DISTINCT ap.address_id) * 100.0 / (SELECT COUNT(*) FROM active_addresses), 2) AS global_percentage
FROM 
    protocol_types pt
LEFT JOIN 
    address_protocols ap ON pt.protocol_id = ap.protocol_id AND ap.is_supported = 1
LEFT JOIN 
    active_addresses aa ON ap.address_id = aa.address_id
LEFT JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
GROUP BY 
    pt.protocol_id;

-- 创建漏洞统计视图
CREATE OR REPLACE VIEW vulnerability_stats_view AS
SELECT 
    vt.vulnerability_id,
    vt.vulnerability_name,
    vt.vulnerability_description,
    vt.severity,
    COUNT(DISTINCT av.address_id) AS affected_addresses,
    SUM(CASE WHEN av.is_fixed = 1 THEN 1 ELSE 0 END) AS fixed_addresses,
    ROUND(SUM(CASE WHEN av.is_fixed = 1 THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(COUNT(DISTINCT av.address_id), 0), 2) AS fixed_percentage,
    COUNT(DISTINCT ip.country_id) AS affected_countries,
    COUNT(DISTINCT ip.asn) AS affected_asns
FROM 
    vulnerability_types vt
LEFT JOIN 
    address_vulnerabilities av ON vt.vulnerability_id = av.vulnerability_id
LEFT JOIN 
    active_addresses aa ON av.address_id = aa.address_id
LEFT JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
GROUP BY 
    vt.vulnerability_id;

-- 删除视图（如需删除）
--DROP VIEW IF EXISTS ipv6_address_details_view;
--DROP VIEW IF EXISTS country_ipv6_stats_view;
--DROP VIEW IF EXISTS protocol_support_stats_view;
--DROP VIEW IF EXISTS vulnerability_stats_view;
