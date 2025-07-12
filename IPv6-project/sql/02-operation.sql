--IPv6地址导入存储过程
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
END 

--协议更新以后的操作
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
END 

--漏洞更新后，更新相关的存储过程
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
END 

--更新所有的存储过程
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
END 

DROP PROCEDURE IF EXISTS delete_prefix_with_addresses;
DELIMITER //

CREATE PROCEDURE delete_prefix_with_addresses(
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
    
    -- 错误处理
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_deleted_addresses = 0;
        SET p_prefix_deleted = FALSE;
        RESIGNAL;  -- 直接重新抛出原始错误
    END;

    -- 初始化输出参数
    SET p_deleted_addresses = 0;
    SET p_prefix_deleted = FALSE;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 检查前缀是否存在
    SELECT prefix, active_ipv6_count, asn, country_id
    INTO v_prefix, v_active_ipv6_count, v_asn, v_country_id
    FROM ip_prefixes
    WHERE prefix_id = p_prefix_id;
    
    IF v_prefix IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prefix not found';
    END IF;
    
    -- 设置输出参数
    SET p_asn = v_asn;
    SET p_country_id = v_country_id;
    
    
    -- 删除该前缀下的所有活跃地址
    DELETE FROM active_addresses
    WHERE prefix_id = p_prefix_id;
    
    -- 获取删除的地址数量
    SET p_deleted_addresses = ROW_COUNT();
    
    -- 删除前缀
    DELETE FROM ip_prefixes
    WHERE prefix_id = p_prefix_id;
    
    -- 检查是否成功删除前缀
    IF ROW_COUNT() > 0 THEN
        SET p_prefix_deleted = TRUE;
        
        -- 更新ASN统计信息
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
        
        -- 更新国家统计信息
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
    
    -- 提交事务
    COMMIT;
END //

DELIMITER ;