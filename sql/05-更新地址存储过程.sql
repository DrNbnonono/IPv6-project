DELIMITER //

DROP PROCEDURE IF EXISTS `batch_import_ipv6_addresses` //

CREATE PROCEDURE `batch_import_ipv6_addresses`(
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
    -- 声明变量
    DECLARE v_random_type_id INT;
    DECLARE v_temp_count INT;
    DECLARE v_start_time TIMESTAMP;
    DECLARE v_error_msg TEXT;
    DECLARE v_prefix_exists BOOLEAN;
    
    -- 错误处理
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            v_error_msg = MESSAGE_TEXT;
        ROLLBACK;
        -- 更新任务状态为失败
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
    
    -- 初始化变量
    SET p_imported_count = 0;
    SET p_error_count = 0;
    SET p_new_prefix = FALSE;
    SET v_start_time = NOW();
    
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
    
    -- 获取随机类型ID
    SELECT type_id INTO v_random_type_id
    FROM address_types 
    WHERE type_name = 'random' 
    LIMIT 1;
    
    IF v_random_type_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '未找到random类型的地址类型';
    END IF;
    
    -- 获取临时表中的地址数量
    SELECT COUNT(*) INTO v_temp_count FROM temp_addresses;
    
    -- 检查前缀是否存在
    SELECT EXISTS(
        SELECT 1 FROM ip_prefixes 
        WHERE prefix = p_prefix 
        AND country_id = p_country_id 
        AND asn = p_asn
    ) INTO v_prefix_exists;
    
    -- 查找或创建前缀记录
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
    
    -- 直接插入新地址
    INSERT INTO active_addresses (address, version, prefix_id, iid_type)
    SELECT 
        address, 
        '6', 
        p_prefix_id,
        v_random_type_id
    FROM temp_addresses
    WHERE is_processed = FALSE;
    
    -- 获取导入数量
    SET p_imported_count = ROW_COUNT();
    
    -- 更新临时表状态
    UPDATE temp_addresses SET is_processed = TRUE;
    
    -- 更新前缀的活跃地址数量（增加而不是替换）
    UPDATE ip_prefixes 
    SET active_ipv6_count = active_ipv6_count + p_imported_count
    WHERE prefix_id = p_prefix_id;
    
    -- 获取更新后的前缀地址总数
    SELECT active_ipv6_count INTO p_total_addresses
    FROM ip_prefixes 
    WHERE prefix_id = p_prefix_id;
    
    -- 更新ASN统计信息（通过前缀表统计）
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
    
    -- 获取ASN的地址总数
    SELECT total_active_ipv6 INTO p_asn_total_addresses
    FROM asns
    WHERE asn = p_asn;
    
    -- 更新国家统计信息（通过ASN统计）
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
    
    -- 获取国家的地址总数
    SELECT total_active_ipv6 INTO p_country_total_addresses
    FROM countries
    WHERE country_id = p_country_id;
    
    -- 更新任务状态
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
    
    -- 提交事务
    COMMIT;
END //

DELIMITER ;