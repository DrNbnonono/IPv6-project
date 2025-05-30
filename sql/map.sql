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

ALTER TABLE ip_prefixes 
ADD COLUMN active_ipv6_count INT DEFAULT 0 COMMENT '活跃IPv6地址数量';

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


