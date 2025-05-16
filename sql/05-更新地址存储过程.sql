DELIMITER //
CREATE PROCEDURE batch_import_ipv6_addresses(
    IN p_country_id CHAR(2),
    IN p_asn INT,
    IN p_prefix VARCHAR(64),
    IN p_task_id BIGINT,
    OUT p_imported_count INT,
    OUT p_error_count INT
)
BEGIN
    -- 声明变量
    DECLARE v_prefix_id INT;
    DECLARE v_error_msg TEXT;
    DECLARE v_task_status VARCHAR(20);
    
    -- 错误处理
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
        v_error_msg = MESSAGE_TEXT;
        ROLLBACK;
        
        -- 更新任务状态为失败
        UPDATE tasks 
        SET status = 'failed',
            error_message = CONCAT('导入失败:', v_error_msg),
            completed_at = NOW()
        WHERE id = p_task_id;
        
        SET @error_message = CONCAT('导入失败:', v_error_msg);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @error_message;
    END;
    
    -- 初始化计数器
    SET p_imported_count = 0;
    SET p_error_count = 0;
    
    -- 开始事务
    START TRANSACTION;
    
    -- 更新任务状态为运行中
    UPDATE tasks 
    SET status = 'running',
        updated_at = NOW()
    WHERE id = p_task_id;
    
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
    
    -- 处理临时表中的地址
    INSERT INTO active_addresses (address, version, prefix_id, iid_type)
    SELECT 
        a.address, 
        '6', 
        v_prefix_id,
        (SELECT type_id FROM address_types WHERE type_name = 'random' LIMIT 1)
    FROM 
        temp_addresses a
    LEFT JOIN 
        active_addresses aa ON a.address = aa.address
    WHERE 
        aa.address_id IS NULL AND a.is_processed = FALSE
    ON DUPLICATE KEY UPDATE 
        prefix_id = v_prefix_id;
    
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
    
    -- 更新任务状态为完成
    UPDATE tasks 
    SET status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;
    
    -- 提交事务
    COMMIT;
    
    -- 清理临时表
    DROP TEMPORARY TABLE IF EXISTS temp_addresses;
END //
DELIMITER ;