--
CREATE TABLE `tasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '发起任务的用户ID',
  `command` varchar(255) NOT NULL COMMENT '执行的命令（如 xmap -6）',
  `description` varchar(255) DEFAULT NULL COMMENT '任务描述',
  `task_type` varchar(20) DEFAULT NULL COMMENT '任务类型（如xmap、zgrab2等）',
  `status` enum('pending','running','completed','failed','canceled') NOT NULL DEFAULT 'pending',
  `error_message` text COMMENT '错误信息',
  `log_path` varchar(255) DEFAULT NULL COMMENT '日志文件路径',
  `output_path` varchar(255) DEFAULT NULL COMMENT '结果文件路径（供下载）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `exit_code` int DEFAULT NULL COMMENT '进程退出码',
  `process_signal` varchar(20) DEFAULT NULL COMMENT '进程终止信号',
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1746429702748 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='任务记录表'

--
CREATE TABLE `tools` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '工具名称（如xmap, addr6等）',
  `description` varchar(255) DEFAULT NULL COMMENT '工具描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工具表'   

--
 CREATE TABLE `whitelists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '上传用户ID',
  `tool_id` int NOT NULL COMMENT '关联的工具ID',
  `file_name` varchar(255) NOT NULL COMMENT '文件名',
  `file_path` varchar(255) NOT NULL COMMENT '文件存储路径',
  `description` varchar(255) DEFAULT NULL COMMENT '文件描述',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除(0:未删除,1:已删除)',
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `tool_id` (`tool_id`),
  CONSTRAINT `whitelists_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `whitelists_ibfk_2` FOREIGN KEY (`tool_id`) REFERENCES `tools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='白名单文件表'           

--
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL COMMENT '手机号（唯一标识）',
  `username` varchar(50) DEFAULT NULL COMMENT '用户昵称',
  `password_hash` varchar(255) NOT NULL COMMENT '加密后的密码',
  `role` enum('user','admin') NOT NULL DEFAULT 'user' COMMENT '用户角色',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表'  
