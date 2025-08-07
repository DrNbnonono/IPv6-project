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

--
-- 工作流相关表结构
--

-- 工作流定义表
CREATE TABLE `workflows` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '创建用户ID',
  `name` varchar(255) NOT NULL COMMENT '工作流名称',
  `description` text COMMENT '工作流描述',
  `definition` json NOT NULL COMMENT '工作流定义(节点和连接)',
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'draft' COMMENT '工作流状态',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `workflows_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流定义表';

-- 工作流执行实例表
CREATE TABLE `workflow_executions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint NOT NULL COMMENT '工作流ID',
  `user_id` int NOT NULL COMMENT '执行用户ID',
  `name` varchar(255) NOT NULL COMMENT '执行实例名称',
  `status` enum('pending','running','completed','failed','canceled','paused') NOT NULL DEFAULT 'pending' COMMENT '执行状态',
  `current_node_id` varchar(50) DEFAULT NULL COMMENT '当前执行节点ID',
  `progress` json DEFAULT NULL COMMENT '执行进度信息',
  `error_message` text COMMENT '错误信息',
  `started_at` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workflow_status` (`workflow_id`,`status`),
  KEY `idx_user_status` (`user_id`,`status`),
  CONSTRAINT `workflow_executions_ibfk_1` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_executions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流执行实例表';

-- 工作流节点执行记录表
CREATE TABLE `workflow_node_executions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `execution_id` bigint NOT NULL COMMENT '工作流执行实例ID',
  `node_id` varchar(50) NOT NULL COMMENT '节点ID',
  `node_type` varchar(50) NOT NULL COMMENT '节点类型(xmap,zgrab2,json_extract等)',
  `task_id` bigint DEFAULT NULL COMMENT '关联的任务ID(如果是扫描节点)',
  `input_data` json DEFAULT NULL COMMENT '节点输入数据',
  `output_data` json DEFAULT NULL COMMENT '节点输出数据',
  `config` json DEFAULT NULL COMMENT '节点配置',
  `status` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending' COMMENT '节点执行状态',
  `error_message` text COMMENT '错误信息',
  `started_at` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_execution_node` (`execution_id`,`node_id`),
  KEY `idx_task` (`task_id`),
  CONSTRAINT `workflow_node_executions_ibfk_1` FOREIGN KEY (`execution_id`) REFERENCES `workflow_executions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_node_executions_ibfk_2` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工作流节点执行记录表';
