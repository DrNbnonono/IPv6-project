create database ipv6_project character set utf8mb4 collate utf8mb4_unicode_ci;

use ipv6_project;

-- 用户表（支持普通用户和管理员）
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(20) NOT NULL COMMENT '手机号（唯一标识）',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '加密后的密码',
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user' COMMENT '用户角色',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 任务表（记录 xmap/addr6 等工具的运行记录）
CREATE TABLE `tasks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '发起任务的用户ID',
  `command` VARCHAR(255) NOT NULL COMMENT '执行的命令（如 xmap -6）',
  `status` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `log_path` VARCHAR(255) COMMENT '日志文件路径',
  `output_path` VARCHAR(255) COMMENT '结果文件路径（供下载）',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务记录表';

INSERT INTO users (phone, password_hash, role)
VALUES (
  '13526656040',  -- 替换为管理员手机号
  'admin',  -- 替换为步骤 2 生成的 hash
  'admin'
);

-- 更新 tasks 表结构
ALTER TABLE `tasks` 
ADD COLUMN `error_message` TEXT NULL COMMENT '错误信息' AFTER `status`,
ADD COLUMN `completed_at` TIMESTAMP NULL COMMENT '完成时间' AFTER `updated_at`;

-- 修改 tasks 表的 id 列为 BIGINT
ALTER TABLE `tasks` MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT;

ALTER TABLE `tasks` 
ADD COLUMN `exit_code` INT NULL COMMENT '进程退出码',
ADD COLUMN `signal` VARCHAR(20) NULL COMMENT '终止信号';

-- 修改 tasks 表结构
ALTER TABLE `tasks` 
CHANGE COLUMN `signal` `process_signal` VARCHAR(20) NULL DEFAULT NULL COMMENT '进程终止信号';

ALTER TABLE tasks 
MODIFY COLUMN status ENUM('pending', 'running', 'completed', 'failed', 'canceled') NOT NULL DEFAULT 'pending';

-- 更新用户表添加昵称字段
ALTER TABLE `users` 
ADD COLUMN `username` VARCHAR(50) NULL COMMENT '用户昵称' AFTER `phone`;

-- 1. 为tasks表添加description字段
ALTER TABLE `tasks` 
ADD COLUMN `description` VARCHAR(255) NULL COMMENT '任务描述' AFTER `command`;

-- 3. 添加索引以提高分页查询性能
ALTER TABLE `tasks` ADD INDEX `idx_user_status` (`user_id`, `status`);