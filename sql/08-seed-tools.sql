-- 08：工具表的基础记录
-- 任务、白名单、输入文件等表都通过 tools.id 关联到工具；全新建库后 tools 为空，
-- 导致"工具不存在"。此前这些记录只存在于 tools_whitelist.sql（该文件同时 CREATE TABLE，
-- 无法在已有表结构上重复执行）。INSERT IGNORE 依赖 tools.name 的唯一索引，可重复执行。
INSERT IGNORE INTO `tools` (`name`, `description`) VALUES
  ('xmap', 'IPv6网络探测工具'),
  ('addr6', 'IPv6地址生成工具'),
  ('zgrab2', '应用层协议扫描工具'),
  ('database', '数据库更新工具');
