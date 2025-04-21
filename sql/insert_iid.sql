-- 插入接口标识符类型数据
INSERT IGNORE INTO address_types (type_name, description, is_risky, example) VALUES
('ieee', '基于IEEE EUI-64标准生成的IID', FALSE, '::200:5eff:fe12:3456'),
('isatap', 'ISATAP隧道接口标识符', FALSE, '::0:5efe:192.168.1.1'),
('ipv4-32', '嵌入32位IPv4地址的IID', TRUE, '::192.168.1.1'),
('ipv4-64', '嵌入64位IPv4地址的IID', TRUE, '::ffff:192.168.1.1'),
('ipv4-all', '各种IPv4嵌入格式的IID', TRUE, '::192.168.1.1或::ffff:192.168.1.1'),
('embed-port', '嵌入端口号的IID', TRUE, '::8080'),
('embed-port-rev', '反向嵌入端口号的IID', TRUE, '::8008'),
('embed-port-all', '各种端口号嵌入格式的IID', TRUE, '::8080或::8008'),
('low-byte', '低字节IID，常见于路由器', TRUE, '::1'),
('byte-pattern', '可预测字节模式的IID', TRUE, '::1234:5678'),
('random', '随机生成的IID', FALSE, '::1a2b:3c4d:5e6f'),
('service', '服务标识IID', FALSE, '::53 (DNS)');