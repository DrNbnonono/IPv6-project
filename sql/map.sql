-- 使用现有的ipv6_project数据库
USE ipv6_project;

-- 国家信息表 - 存储国家基本信息和IPv6统计
CREATE TABLE IF NOT EXISTS countries (
    country_id CHAR(2) PRIMARY KEY COMMENT 'ISO 2字母国家代码',
    country_name VARCHAR(100) NOT NULL COMMENT '国家英文名称',
    country_name_zh VARCHAR(100) COMMENT '国家中文名称',
    iso3_code CHAR(3) COMMENT 'ISO 3字母国家代码',
    region VARCHAR(50) COMMENT '地区(如Asia, Europe)',
    subregion VARCHAR(50) COMMENT '子地区(如Eastern Asia)',
    latitude DECIMAL(10, 7) COMMENT '纬度',
    longitude DECIMAL(10, 7) COMMENT '经度',
    total_ipv6_prefixes INT DEFAULT 0 COMMENT 'IPv6前缀总数',
    total_active_ipv6 INT DEFAULT 0 COMMENT '活跃IPv6地址总数',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    INDEX idx_country_name (country_name) COMMENT '国家名称索引',
    INDEX idx_region (region) COMMENT '地区索引'
) ENGINE=InnoDB COMMENT='国家信息表';

-- ASN信息表 - 存储自治系统号信息
CREATE TABLE IF NOT EXISTS asns (
    asn INT PRIMARY KEY COMMENT '自治系统号',
    as_name VARCHAR(255) NOT NULL COMMENT 'AS名称',
    as_name_zh VARCHAR(255) COMMENT 'AS中文名称',
    country_id CHAR(2) COMMENT '所属国家代码',
    organization VARCHAR(255) COMMENT '所属组织',
    total_ipv6_prefixes INT DEFAULT 0 COMMENT 'IPv6前缀总数',
    total_active_ipv6 INT DEFAULT 0 COMMENT '活跃IPv6地址总数',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    INDEX idx_as_name (as_name) COMMENT 'AS名称索引',
    INDEX idx_country (country_id) COMMENT '国家代码索引',
    INDEX idx_organization (organization(100)) COMMENT '组织名称索引',
    CONSTRAINT fk_asn_country FOREIGN KEY (country_id) REFERENCES countries(country_id)
) ENGINE=InnoDB COMMENT='ASN信息表';

-- IP前缀表 - 存储IPv4/IPv6前缀信息
CREATE TABLE IF NOT EXISTS ip_prefixes (
    prefix_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '前缀ID',
    prefix VARCHAR(50) NOT NULL COMMENT 'IP前缀(如2001:db8::/32)',
    prefix_length INT NOT NULL COMMENT '前缀长度',
    version ENUM('4', '6') NOT NULL COMMENT '4=IPv4, 6=IPv6',
    asn INT COMMENT '所属ASN',
    country_id CHAR(2) COMMENT '所属国家代码',
    allocation_date DATE COMMENT '分配日期',
    registry VARCHAR(20) COMMENT '注册机构(如APNIC, ARIN)',
    is_private BOOLEAN DEFAULT FALSE COMMENT '是否为私有地址',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    UNIQUE KEY uk_prefix (prefix, prefix_length) COMMENT '前缀唯一约束',
    INDEX idx_asn (asn) COMMENT 'ASN索引',
    INDEX idx_country (country_id) COMMENT '国家代码索引',
    INDEX idx_version (version) COMMENT 'IP版本索引',
    INDEX idx_prefix_length (prefix_length) COMMENT '前缀长度索引',
    CONSTRAINT fk_prefix_asn FOREIGN KEY (asn) REFERENCES asns(asn),
    CONSTRAINT fk_prefix_country FOREIGN KEY (country_id) REFERENCES countries(country_id)
) ENGINE=InnoDB COMMENT='IP前缀表';

-- 地址类型表(IID类型) - 存储接口标识符类型分类
CREATE TABLE IF NOT EXISTS address_types (
    type_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '类型ID',
    type_name VARCHAR(50) NOT NULL COMMENT '类型名称',
    description VARCHAR(255) COMMENT '类型描述',
    is_risky BOOLEAN DEFAULT FALSE COMMENT '是否为风险类型',
    example VARCHAR(100) COMMENT '示例地址'
) ENGINE=InnoDB COMMENT='地址类型表';

-- 活跃地址表 - 存储探测到的活跃地址
CREATE TABLE IF NOT EXISTS active_addresses (
    address_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '地址ID',
    address VARCHAR(45) NOT NULL COMMENT 'IPv4(15) or IPv6(45)地址',
    version ENUM('4', '6') NOT NULL COMMENT '4=IPv4, 6=IPv6',
    prefix_id BIGINT COMMENT '所属前缀ID',
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '首次发现时间',
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后发现时间',
    uptime_percentage DECIMAL(5,2) DEFAULT 100.00 COMMENT '在线率百分比',
    iid_type INT COMMENT '接口标识符类型',
    is_router BOOLEAN DEFAULT FALSE COMMENT '是否为路由器',
    is_dns_server BOOLEAN DEFAULT FALSE COMMENT '是否为DNS服务器',
    is_web_server BOOLEAN DEFAULT FALSE COMMENT '是否为Web服务器',
    UNIQUE KEY uk_address (address) COMMENT '地址唯一约束',
    INDEX idx_prefix (prefix_id) COMMENT '前缀ID索引',
    INDEX idx_version (version) COMMENT 'IP版本索引',
    INDEX idx_iid_type (iid_type) COMMENT 'IID类型索引',
    INDEX idx_last_seen (last_seen) COMMENT '最后发现时间索引',
    CONSTRAINT fk_address_prefix FOREIGN KEY (prefix_id) REFERENCES ip_prefixes(prefix_id),
    CONSTRAINT fk_address_type FOREIGN KEY (iid_type) REFERENCES address_types(type_id)
) ENGINE=InnoDB COMMENT='活跃地址表';

-- 协议信息表 - 存储网络协议信息
CREATE TABLE IF NOT EXISTS protocols (
    protocol_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '协议ID',
    protocol_name VARCHAR(50) NOT NULL COMMENT '协议名称',
    protocol_number INT COMMENT '协议号',
    description VARCHAR(255) COMMENT '协议描述',
    is_common BOOLEAN DEFAULT FALSE COMMENT '是否为常见协议',
    risk_level ENUM('low', 'medium', 'high') DEFAULT 'low' COMMENT '风险等级'
) ENGINE=InnoDB COMMENT='协议信息表';

-- 漏洞信息表 - 存储常见漏洞信息
CREATE TABLE IF NOT EXISTS vulnerabilities (
    vulnerability_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '漏洞ID',
    cve_id VARCHAR(20) NOT NULL COMMENT 'CVE编号',
    name VARCHAR(255) NOT NULL COMMENT '漏洞名称',
    description TEXT COMMENT '漏洞描述',
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL COMMENT '严重程度',
    affected_protocols VARCHAR(255) COMMENT '影响的协议',
    detection_method VARCHAR(100) COMMENT '检测方法',
    published_date DATE COMMENT '发布日期',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    UNIQUE KEY uk_cve (cve_id) COMMENT 'CVE编号唯一约束',
    INDEX idx_severity (severity) COMMENT '严重程度索引'
) ENGINE=InnoDB COMMENT='漏洞信息表';

-- 地址协议关联表 - 记录地址与协议的关联
CREATE TABLE IF NOT EXISTS address_protocols (
    address_id BIGINT NOT NULL COMMENT '地址ID',
    protocol_id INT NOT NULL COMMENT '协议ID',
    port INT COMMENT '端口号',
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '首次发现时间',
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后发现时间',
    PRIMARY KEY (address_id, protocol_id, port) COMMENT '复合主键',
    INDEX idx_protocol (protocol_id) COMMENT '协议ID索引',
    CONSTRAINT fk_ap_address FOREIGN KEY (address_id) REFERENCES active_addresses(address_id),
    CONSTRAINT fk_ap_protocol FOREIGN KEY (protocol_id) REFERENCES protocols(protocol_id)
) ENGINE=InnoDB COMMENT='地址协议关联表';

-- 地址漏洞关联表 - 记录地址与漏洞的关联
CREATE TABLE IF NOT EXISTS address_vulnerabilities (
    av_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '关联ID',
    address_id BIGINT NOT NULL COMMENT '地址ID',
    vulnerability_id INT NOT NULL COMMENT '漏洞ID',
    detection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '检测日期',
    last_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后检测时间',
    is_fixed BOOLEAN DEFAULT FALSE COMMENT '是否已修复',
    INDEX idx_address (address_id) COMMENT '地址ID索引',
    INDEX idx_vulnerability (vulnerability_id) COMMENT '漏洞ID索引',
    CONSTRAINT fk_av_address FOREIGN KEY (address_id) REFERENCES active_addresses(address_id),
    CONSTRAINT fk_av_vulnerability FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(vulnerability_id)
) ENGINE=InnoDB COMMENT='地址漏洞关联表';

-- 国家协议统计表 - 记录国家级别的协议使用情况
CREATE TABLE IF NOT EXISTS country_protocol_stats (
    country_id CHAR(2) NOT NULL COMMENT '国家代码',
    protocol_id INT NOT NULL COMMENT '协议ID',
    address_count INT DEFAULT 0 COMMENT '地址数量',
    percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT '使用百分比',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (country_id, protocol_id) COMMENT '复合主键',
    CONSTRAINT fk_cps_country FOREIGN KEY (country_id) REFERENCES countries(country_id),
    CONSTRAINT fk_cps_protocol FOREIGN KEY (protocol_id) REFERENCES protocols(protocol_id)
) ENGINE=InnoDB COMMENT='国家协议统计表';

-- 国家漏洞统计表 - 记录国家级别的漏洞情况
CREATE TABLE IF NOT EXISTS country_vulnerability_stats (
    country_id CHAR(2) NOT NULL COMMENT '国家代码',
    vulnerability_id INT NOT NULL COMMENT '漏洞ID',
    affected_addresses INT DEFAULT 0 COMMENT '受影响地址数',
    percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT '影响百分比',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (country_id, vulnerability_id) COMMENT '复合主键',
    CONSTRAINT fk_cvs_country FOREIGN KEY (country_id) REFERENCES countries(country_id),
    CONSTRAINT fk_cvs_vulnerability FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(vulnerability_id)
) ENGINE=InnoDB COMMENT='国家漏洞统计表';

-- ASN协议统计表 - 记录ASN级别的协议使用情况
CREATE TABLE IF NOT EXISTS asn_protocol_stats (
    asn INT NOT NULL COMMENT 'ASN',
    protocol_id INT NOT NULL COMMENT '协议ID',
    address_count INT DEFAULT 0 COMMENT '地址数量',
    percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT '使用百分比',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (asn, protocol_id) COMMENT '复合主键',
    CONSTRAINT fk_aps_asn FOREIGN KEY (asn) REFERENCES asns(asn),
    CONSTRAINT fk_aps_protocol FOREIGN KEY (protocol_id) REFERENCES protocols(protocol_id)
) ENGINE=InnoDB COMMENT='ASN协议统计表';

-- 扫描任务表 - 存储扫描任务信息(与您现有的tasks表类似)
CREATE TABLE IF NOT EXISTS scan_tasks (
    task_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '任务ID',
    task_type ENUM('xmap', 'zgrab2', 'nmap', 'addr6', 'other') NOT NULL COMMENT '任务类型',
    target VARCHAR(255) COMMENT '扫描目标',
    command TEXT COMMENT '执行命令',
    status ENUM('pending', 'running', 'completed', 'failed', 'canceled') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    started_at TIMESTAMP NULL COMMENT '开始时间',
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    result_path VARCHAR(255) COMMENT '结果文件路径',
    log_path VARCHAR(255) COMMENT '日志文件路径',
    error_message TEXT COMMENT '错误信息',
    user_id INT COMMENT '用户ID',
    INDEX idx_status (status) COMMENT '状态索引',
    INDEX idx_created_at (created_at) COMMENT '创建时间索引',
    INDEX idx_task_type (task_type) COMMENT '任务类型索引'
) ENGINE=InnoDB COMMENT='扫描任务表';

-- 插入示例数据 - 国家信息
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude) VALUES
('US', 'United States', '美国', 'USA', 'Americas', 'Northern America', 37.09024, -95.712891),
('CN', 'China', '中国', 'CHN', 'Asia', 'Eastern Asia', 35.86166, 104.195397),
('JP', 'Japan', '日本', 'JPN', 'Asia', 'Eastern Asia', 36.204824, 138.252924),
('DE', 'Germany', '德国', 'DEU', 'Europe', 'Western Europe', 51.165691, 10.451526),
('GB', 'United Kingdom', '英国', 'GBR', 'Europe', 'Northern Europe', 55.378051, -3.435973);

-- 插入示例数据 - ASN信息
INSERT INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
(4134, 'CHINANET-BACKBONE', '中国电信骨干网', 'CN', 'China Telecom'),
(4808, 'CHINA169-BACKBONE', '中国联通骨干网', 'CN', 'China Unicom'),
(45102, 'ALIBABA-CN-NET', '阿里巴巴网络', 'CN', 'Alibaba (China) Technology Co., Ltd.'),
(15169, 'GOOGLE', '谷歌', 'US', 'Google LLC'),
(8075, 'MICROSOFT-CORP-MSN-AS-BLOCK', '微软', 'US', 'Microsoft Corporation');

-- 插入示例数据 - IP前缀
INSERT INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
('2400:3200::', 32, '6', 4134, 'CN', '2011-08-16', 'APNIC'),
('2408:4000::', 32, '6', 4808, 'CN', '2012-05-11', 'APNIC'),
('2600:1900::', 32, '6', 15169, 'US', '2018-03-02', 'ARIN'),
('2a03:2880::', 32, '6', 32934, 'US', '2014-11-14', 'RIPE'),
('2001:4860::', 32, '6', 15169, 'US', '2005-03-01', 'ARIN');

-- 插入示例数据 - 地址类型
INSERT INTO address_types (type_name, description, is_risky, example) VALUES
('EUI-64', '基于MAC地址生成的IID', FALSE, '::200:5eff:fe12:3456'),
('Random', '随机生成的IID', FALSE, '::1a2b:3c4d:5e6f'),
('Low-byte', '低字节IID，常见于路由器', TRUE, '::1'),
('Pattern', '可预测模式的IID', TRUE, '::1234:5678'),
('Service', '服务标识IID', FALSE, '::53 (DNS)');

-- 插入示例数据 - 协议信息
INSERT INTO protocols (protocol_name, protocol_number, description, is_common, risk_level) VALUES
('HTTP', 80, 'Hypertext Transfer Protocol', TRUE, 'low'),
('HTTPS', 443, 'HTTP Secure', TRUE, 'low'),
('SSH', 22, 'Secure Shell', TRUE, 'medium'),
('Telnet', 23, 'Telnet Protocol', FALSE, 'high'),
('DNS', 53, 'Domain Name System', TRUE, 'low'),
('ICMP', 1, 'Internet Control Message Protocol', TRUE, 'low'),
('SNMP', 161, 'Simple Network Management Protocol', FALSE, 'high');

-- 插入示例数据 - 漏洞信息
INSERT INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method) VALUES
('CVE-2021-44228', 'Log4Shell', 'Log4j remote code execution vulnerability', 'critical', 'HTTP,HTTPS,LDAP', 'Log4j version detection'),
('CVE-2021-34527', 'PrintNightmare', 'Windows Print Spooler RCE', 'critical', 'SMB,RPC', 'Service version detection'),
('CVE-2018-13379', 'Fortinet SSL VPN', 'Fortinet SSL VPN path traversal vulnerability', 'high', 'HTTPS', 'URL probing'),
('CVE-2017-0144', 'EternalBlue', 'SMB remote code execution vulnerability', 'critical', 'SMB', 'Version detection'),
('CVE-2014-0160', 'Heartbleed', 'OpenSSL TLS heartbeat read overrun', 'high', 'HTTPS', 'TLS handshake test');

-- 插入示例数据 - 活跃地址
INSERT INTO active_addresses (address, version, prefix_id, iid_type, is_router, is_dns_server, is_web_server) VALUES
('2400:3200::1', '6', 1, 3, TRUE, FALSE, FALSE),
('2408:4000::1234:5678', '6', 2, 2, FALSE, TRUE, FALSE),
('2600:1900::200:5eff:fe12:3456', '6', 3, 1, FALSE, FALSE, TRUE),
('2a03:2880::abcd:ef01', '6', 4, 2, FALSE, FALSE, TRUE),
('2001:4860::53', '6', 5, 5, FALSE, TRUE, FALSE);

-- 插入示例数据 - 地址协议关联
INSERT INTO address_protocols (address_id, protocol_id, port) VALUES
(1, 6, NULL),  -- ICMP
(2, 5, 53),    -- DNS
(3, 2, 443),   -- HTTPS
(4, 1, 80),    -- HTTP
(5, 5, 53);    -- DNS

-- 插入示例数据 - 地址漏洞关联
INSERT INTO address_vulnerabilities (address_id, vulnerability_id) VALUES
(3, 1),  -- Log4Shell
(4, 4);  -- EternalBlue

-- 更新统计信息
UPDATE countries SET 
    total_ipv6_prefixes = (SELECT COUNT(*) FROM ip_prefixes WHERE country_id = countries.country_id AND version = '6'),
    total_active_ipv6 = (SELECT COUNT(*) FROM active_addresses WHERE prefix_id IN (SELECT prefix_id FROM ip_prefixes WHERE country_id = countries.country_id) AND version = '6');

UPDATE asns SET 
    total_ipv6_prefixes = (SELECT COUNT(*) FROM ip_prefixes WHERE asn = asns.asn AND version = '6'),
    total_active_ipv6 = (SELECT COUNT(*) FROM active_addresses WHERE prefix_id IN (SELECT prefix_id FROM ip_prefixes WHERE asn = asns.asn) AND version = '6');