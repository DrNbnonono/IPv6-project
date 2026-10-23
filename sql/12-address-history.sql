-- 12：地址时间维度与批次记录（P3-4）
--
--   scan_batches                  每次导入（以及以后每次观察）记为一个批次：任务、前缀、起止时间、数量。
--   active_addresses.first_batch_id / last_batch_id
--                                 地址首次 / 最近一次被批次观察到。NULL 表示“追踪开始之前就存在”，
--                                 不会被当成某个批次的新增。用批次 ID 而不是时间戳：同一秒内的两个批次也能分清，
--                                 且每行只多 8 字节；时间通过 scan_batches 关联得到。
--   batch_import_ipv6_addresses   重新定义：地址已存在时不再因唯一键冲突让整个导入失败，而是记为再次观察到
--                                 （同一前缀下）或跳过（属于别的前缀）；新地址写入 first/last_batch_id；写批次行。
--
-- 对约 7500 万行的 active_addresses 加列：使用 ALGORITHM=INSTANT（只改元数据，不拷贝、不长时间锁表）。
-- 如果数据库版本不支持 INSTANT，语句会直接报错而不是悄悄重建整张表——此时请联系维护者。
-- 索引（idx_prefix_first / idx_prefix_last）体积大、创建耗时，不在本迁移里：见 sql/optional/12-address-history-indexes.sql，
-- 由你选低峰期手动执行；没有索引时差异查询也能工作，只是慢（按前缀过滤后逐行判断）。
-- 可重复执行。

CREATE TABLE IF NOT EXISTS `scan_batches` (
  `batch_id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '批次 ID（单调递增）',
  `task_id` BIGINT DEFAULT NULL COMMENT '产生该批次的任务（tasks.id，不设外键，任务可被删除）',
  `task_type` VARCHAR(32) NOT NULL DEFAULT 'import' COMMENT '批次类型（目前只有 import）',
  `prefix_id` BIGINT DEFAULT NULL COMMENT '批次所属前缀（ip_prefixes.prefix_id，不设外键，前缀可被删除）',
  `target_scope` VARCHAR(128) DEFAULT NULL COMMENT '范围说明（导入时的前缀文本）',
  `started_at` DATETIME NOT NULL COMMENT '开始时间',
  `finished_at` DATETIME NOT NULL COMMENT '结束时间',
  `new_count` INT NOT NULL DEFAULT 0 COMMENT '新增地址数',
  `seen_count` INT NOT NULL DEFAULT 0 COMMENT '已存在、本次再次观察到的地址数',
  `skipped_count` INT NOT NULL DEFAULT 0 COMMENT '已存在于其他前缀、未改动的地址数',
  `addr_count` INT NOT NULL DEFAULT 0 COMMENT '本批次观察到的地址数（新增 + 再次观察）',
  PRIMARY KEY (`batch_id`),
  KEY `idx_prefix_batch` (`prefix_id`, `batch_id`),
  KEY `idx_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导入/观察批次';

SET @has_history_cols := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'active_addresses'
    AND COLUMN_NAME IN ('first_batch_id', 'last_batch_id')
);
SET @history_ddl := IF(@has_history_cols = 0,
  'ALTER TABLE `active_addresses` ADD COLUMN `first_batch_id` INT UNSIGNED NULL DEFAULT NULL COMMENT ''首次被观察到的批次（NULL=追踪开始前就存在）'', ADD COLUMN `last_batch_id` INT UNSIGNED NULL DEFAULT NULL COMMENT ''最近一次被观察到的批次'', ALGORITHM=INSTANT',
  'SELECT 1');
PREPARE history_stmt FROM @history_ddl;
EXECUTE history_stmt;
DEALLOCATE PREPARE history_stmt;

DROP PROCEDURE IF EXISTS `batch_import_ipv6_addresses`;
DELIMITER ;;
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

    DECLARE v_random_type_id INT;
    DECLARE v_temp_count INT;
    DECLARE v_start_time TIMESTAMP;
    DECLARE v_error_msg TEXT;
    DECLARE v_prefix_exists BOOLEAN;
    DECLARE v_batch_id INT UNSIGNED;
    DECLARE v_seen INT DEFAULT 0;
    DECLARE v_skipped INT DEFAULT 0;


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


    -- 本次导入作为一个批次记录（先建批次行取得 ID，结束时回填数量）
    INSERT INTO scan_batches (task_id, task_type, prefix_id, target_scope, started_at, finished_at)
    VALUES (p_task_id, 'import', p_prefix_id, p_prefix, v_start_time, NOW());
    SET v_batch_id = LAST_INSERT_ID();

    -- 只插入库里还没有的地址（地址已存在不再报唯一键冲突）；新地址的首次/最近出现都是本批次
    INSERT INTO active_addresses (address, version, prefix_id, iid_type, first_batch_id, last_batch_id)
    SELECT
        t.address,
        '6',
        p_prefix_id,
        v_random_type_id,
        v_batch_id,
        v_batch_id
    FROM temp_addresses t
    LEFT JOIN active_addresses a ON a.address = t.address COLLATE utf8mb4_unicode_ci
    WHERE t.is_processed = FALSE
      AND a.address_id IS NULL;

    SET p_imported_count = ROW_COUNT();

    -- 已存在且属于同一前缀的地址：记为本批次再次观察到。first_batch_id 保持不变
    -- （NULL 表示“追踪开始之前就存在”，不能把它当成本批次新增）
    UPDATE active_addresses a
    JOIN temp_addresses t ON a.address = t.address COLLATE utf8mb4_unicode_ci
    SET a.last_batch_id = v_batch_id
    WHERE t.is_processed = FALSE
      AND a.prefix_id = p_prefix_id
      AND (a.last_batch_id IS NULL OR a.last_batch_id <> v_batch_id);

    SET v_seen = ROW_COUNT();

    -- 其余的已存在于别的前缀下：不改动
    SET v_skipped = GREATEST(v_temp_count - p_imported_count - v_seen, 0);


    UPDATE temp_addresses SET is_processed = TRUE;


    UPDATE ip_prefixes
    SET active_ipv6_count = active_ipv6_count + p_imported_count
    WHERE prefix_id = p_prefix_id;


    SELECT active_ipv6_count INTO p_total_addresses
    FROM ip_prefixes
    WHERE prefix_id = p_prefix_id;

    UPDATE scan_batches
    SET finished_at = NOW(),
        new_count = p_imported_count,
        seen_count = v_seen,
        skipped_count = v_skipped,
        addr_count = p_imported_count + v_seen
    WHERE batch_id = v_batch_id;


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
            'seen', v_seen,
            'skip', v_skipped,
            'bid', v_batch_id,
            'tot', p_total_addresses,
            'cid', p_country_id,
            'asn', p_asn,
            'pfx', p_prefix
        )
    WHERE id = p_task_id;


    COMMIT;
END ;;
DELIMITER ;
