-- 创建数据库
CREATE DATABASE IF NOT EXISTS IPv6_address;
USE IPv6_address;

-- 国家表：存储国家的基本信息
CREATE TABLE country (
    country_code CHAR(2) PRIMARY KEY,  -- ISO 3166-1二位国家代码（主键）
    country_name VARCHAR(50) NOT NULL, -- 国家名称
    INDEX idx_country_name (country_name)  -- 为国家名称添加索引，方便按名称查询
);

-- ASN表：存储自治系统（ISP）的基本信息
CREATE TABLE asn (
    as_number INT UNSIGNED PRIMARY KEY,  -- 自治系统编号（ASN，主键）
    as_name VARCHAR(100) NOT NULL,       -- ISP名称
    country_code CHAR(2) NOT NULL,       -- 所属国家代码（外键，指向country表）
    INDEX idx_as_name (as_name),         -- 为ISP名称添加索引，方便按名称查询
    FOREIGN KEY (country_code) REFERENCES country(country_code)  -- 外键约束，确保国家代码有效
);

-- 前缀表：存储IPv6前缀的分配信息
CREATE TABLE prefix (
    prefix_id INT AUTO_INCREMENT PRIMARY KEY,  -- 前缀ID（自增主键）
    prefix VARCHAR(43) NOT NULL,               -- IPv6前缀（含长度，如2000:0000::/32）
    as_number INT UNSIGNED NOT NULL,           -- 所属ASN（外键，指向asn表）
    country_code CHAR(2) NOT NULL,             -- 所属国家代码（外键，指向country表）
    UNIQUE KEY uniq_prefix (prefix),           -- 前缀唯一约束，确保每个前缀唯一
    INDEX idx_as_number (as_number),           -- 为ASN添加索引，方便按ASN查询前缀
    INDEX idx_country (country_code),          -- 为国家代码添加索引，方便按国家查询前缀
    FOREIGN KEY (as_number) REFERENCES asn(as_number),  -- 外键约束，确保ASN有效
    FOREIGN KEY (country_code) REFERENCES country(country_code)  -- 外键约束，确保国家代码有效
);

-- IID类型表：存储IPv6地址接口标识符（IID）的类型信息
CREATE TABLE iid_type (
    type_id TINYINT UNSIGNED PRIMARY KEY,  -- 类型ID（主键）
    type_name VARCHAR(20) NOT NULL,        -- 类型名称（如EUI-64、Random等）
    description VARCHAR(100) NOT NULL,     -- 类型描述
    INDEX idx_type_name (type_name)        -- 为类型名称添加索引，方便按名称查询
);

-- 活跃地址表：存储活跃的IPv6地址信息
CREATE TABLE active_address (
    address_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,  -- 地址ID（自增主键）
    address VARCHAR(39) NOT NULL,                          -- 完整的IPv6地址
    prefix_id INT NOT NULL,                                 -- 所属前缀ID（外键，指向prefix表）
    type_id TINYINT UNSIGNED NOT NULL,                      -- IID类型ID（外键，指向iid_type表）
    UNIQUE KEY uniq_address (address),                      -- 地址唯一约束，确保每个地址唯一
    INDEX idx_prefix (prefix_id),                           -- 为前缀ID添加索引，方便按前缀查询地址
    FOREIGN KEY (prefix_id) REFERENCES prefix(prefix_id),    -- 外键约束，确保前缀ID有效
    FOREIGN KEY (type_id) REFERENCES iid_type(type_id)       -- 外键约束，确保类型ID有效
);

-- 插入国家数据
INSERT INTO country (country_code, country_name) VALUES
('CN', 'China'),
('US', 'United States');

-- 插入ASN数据
INSERT INTO asn (as_number, as_name, country_code) VALUES
(4538, 'China Education and Research Network Center', 'CN'),
(1280, 'Internet Systems Consortium, Inc.', 'US');

-- 插入前缀数据
INSERT INTO prefix (prefix, as_number, country_code) VALUES
('2001:250:401::/48', 4538, 'CN'),
('2001:250::/32', 4538, 'CN'),
('2001:4f8:b::/48', 1280, 'US'),
('2001:4f8:11::/48', 1280, 'US');

-- 插入IID类型数据
INSERT INTO iid_type (type_id, type_name, description) VALUES
(1, 'EUI-64', '基于MAC地址生成'),
(2, 'Random', '随机生成标识符');

-- 插入活跃地址数据
INSERT INTO active_address (address, prefix_id, type_id) VALUES
('2001:250:401:6601:d805:50aa:66f:10bd', 1, 1),
('2001:4f8:b::1', 3, 2),
('2001:4f8:11::1', 4, 2);