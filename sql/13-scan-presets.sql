-- 13：扫描预设（P3-6）
--
--   scan_presets   “模块 + 端口”的套件，例如邮件服务套件 = smtp:25 + imap:143 + pop3:110 + tls:993。
--                  user_id 为 NULL 的是内置预设（所有人可用、不可删除）；否则是该用户自己保存的。
--                  entries 是 JSON 文本：[{"module":"smtp","port":25,"params":{"key":"value"}}, ...]，
--                  由后端按 zgrab2 的模块名单校验，套用时生成 zgrab2 “multiple” 模式的 INI 配置文件。
-- 可重复执行：内置预设按名称只插入一次，已有的不会被覆盖（你改过的内置预设不会被迁移改回去）。

CREATE TABLE IF NOT EXISTS `scan_presets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT DEFAULT NULL COMMENT 'NULL = 内置预设',
  `name` VARCHAR(64) NOT NULL COMMENT '预设名称',
  `description` VARCHAR(255) DEFAULT NULL,
  `entries` LONGTEXT NOT NULL COMMENT 'JSON：[{module, port, params?}]',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描预设（zgrab2 模块套件）';

INSERT INTO `scan_presets` (`user_id`, `name`, `description`, `entries`)
SELECT NULL, v.name, v.description, v.entries
FROM (
  SELECT '邮件服务套件' AS name, 'SMTP / IMAP / POP3 以及 IMAPS 的 TLS 握手' AS description,
         '[{"module":"smtp","port":25},{"module":"imap","port":143},{"module":"pop3","port":110},{"module":"tls","port":993}]' AS entries
  UNION ALL
  SELECT '工控协议套件', 'Modbus / DNP3 / BACnet / Siemens S7 / Fox',
         '[{"module":"modbus","port":502},{"module":"dnp3","port":20000},{"module":"bacnet","port":47808},{"module":"siemens","port":102},{"module":"fox","port":1911}]'
  UNION ALL
  SELECT 'Web 服务套件', 'HTTP、HTTPS 的 TLS 握手与 JARM 指纹',
         '[{"module":"http","port":80},{"module":"tls","port":443},{"module":"jarm","port":443}]'
  UNION ALL
  SELECT '数据库服务套件', 'MySQL / PostgreSQL / MongoDB / Redis / MSSQL / Oracle',
         '[{"module":"mysql","port":3306},{"module":"postgres","port":5432},{"module":"mongodb","port":27017},{"module":"redis","port":6379},{"module":"mssql","port":1433},{"module":"oracle","port":1521}]'
  UNION ALL
  SELECT '远程管理与文件服务套件', 'SSH / Telnet / FTP / SMB / SOCKS5',
         '[{"module":"ssh","port":22},{"module":"telnet","port":23},{"module":"ftp","port":21},{"module":"smb","port":445},{"module":"socks5","port":1080}]'
  UNION ALL
  SELECT '消息队列与物联网套件', 'MQTT / AMQP 0.9.1',
         '[{"module":"mqtt","port":1883},{"module":"amqp091","port":5672}]'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM `scan_presets` p WHERE p.`user_id` IS NULL AND p.`name` = v.name);
