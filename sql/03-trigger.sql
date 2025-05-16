-- 创建触发器：地址协议关联后更新统计
DELIMITER //
CREATE TRIGGER after_address_protocol_insert
AFTER INSERT ON address_protocols
FOR EACH ROW
BEGIN
    -- 调用更新协议统计存储过程
    CALL update_protocol_stats(NEW.protocol_id);
END //
DELIMITER ;

-- 创建触发器：地址协议关联删除后更新统计
DELIMITER //
CREATE TRIGGER after_address_protocol_delete
AFTER DELETE ON address_protocols
FOR EACH ROW
BEGIN
    -- 调用更新协议统计存储过程
    CALL update_protocol_stats(OLD.protocol_id);
END //
DELIMITER ;

-- 创建触发器：地址漏洞关联后更新统计
DELIMITER //
CREATE TRIGGER after_address_vulnerability_insert
AFTER INSERT ON address_vulnerabilities
FOR EACH ROW
BEGIN
    -- 调用更新漏洞统计存储过程
    CALL update_vulnerability_stats(NEW.vulnerability_id);
END //
DELIMITER ;

-- 创建触发器：地址漏洞关联更新后更新统计
DELIMITER //
CREATE TRIGGER after_address_vulnerability_update
AFTER UPDATE ON address_vulnerabilities
FOR EACH ROW
BEGIN
    -- 如果修复状态发生变化，调用更新漏洞统计存储过程
    IF NEW.is_fixed != OLD.is_fixed THEN
        CALL update_vulnerability_stats(NEW.vulnerability_id);
    END IF;
END //
DELIMITER ;

-- 创建触发器：地址漏洞关联删除后更新统计
DELIMITER //
CREATE TRIGGER after_address_vulnerability_delete
AFTER DELETE ON address_vulnerabilities
FOR EACH ROW
BEGIN
    -- 调用更新漏洞统计存储过程
    CALL update_vulnerability_stats(OLD.vulnerability_id);
END //
DELIMITER ;



