-- 创建工具表（用于区分不同工具）
CREATE TABLE `tools` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL COMMENT '工具名称（如xmap, addr6等）',
  `description` VARCHAR(255) COMMENT '工具描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具表';

-- 修改白名单表结构（支持多工具）
CREATE TABLE `whitelists` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '上传用户ID',
  `tool_id` INT NOT NULL COMMENT '关联的工具ID',
  `file_name` VARCHAR(255) NOT NULL COMMENT '文件名',
  `file_path` VARCHAR(255) NOT NULL COMMENT '文件存储路径',
  `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='白名单文件表';

-- 插入默认工具记录
INSERT INTO `tools` (`name`, `description`) VALUES 
('xmap', 'IPv6网络探测工具'),
('addr6', 'IPv6地址生成工具');

-- 修改whitelists表，添加description字段
ALTER TABLE `whitelists` 
ADD COLUMN `description` VARCHAR(255) NULL COMMENT '文件描述' AFTER `file_path`;

-- 添加删除标记字段（软删除）
ALTER TABLE `whitelists` 
ADD COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除(0:未删除,1:已删除)' AFTER `description`;

INSERT INTO `tools` (`name`, `description`) VALUES 
('zgrab2', '应用层协议扫描工具'),
('database', '数据库更新工具');  -- 添加您需要的其他工具类型