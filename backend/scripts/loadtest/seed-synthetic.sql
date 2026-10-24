-- 压测用合成数据（只用于压测库，**不要在生产库执行**）。
-- 地址全部落在文档保留段 2001:db8::/32 内，不对应任何真实主机。
-- 依赖 MariaDB 的 seq 引擎（沙箱用）；MySQL 8 请用递归 CTE 改写或改用 mariadb 压测库。
-- 先删除统计触发器：灌 30 万行时逐行触发统计会慢几个数量级，统计表在本脚本末尾一次性聚合。
-- 规模写死在 seq_1_to_N 里：60 国家 / 800 ASN / 8000 前缀 / 30 万地址 / 约 39 万条协议记录。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0, UNIQUE_CHECKS = 0, AUTOCOMMIT = 0;

DROP TRIGGER IF EXISTS after_protocol_insert;
DROP TRIGGER IF EXISTS after_protocol_delete;
DROP TRIGGER IF EXISTS after_vulnerability_insert;
DROP TRIGGER IF EXISTS after_asn_protocol_stats_insert;
DROP TRIGGER IF EXISTS after_asn_protocol_stats_update;
DROP TRIGGER IF EXISTS after_asn_protocol_stats_delete;
DROP TRIGGER IF EXISTS after_asn_vulnerability_stats_insert;
DROP TRIGGER IF EXISTS after_asn_vulnerability_stats_update;
DROP TRIGGER IF EXISTS after_asn_vulnerability_stats_delete;

TRUNCATE address_vulnerabilities; TRUNCATE address_protocols; TRUNCATE active_addresses;
DELETE FROM ip_prefixes; DELETE FROM asns; DELETE FROM countries; DELETE FROM protocols; DELETE FROM vulnerabilities;

-- 国家：60 个（用 AA..；名称是合成的）
INSERT INTO countries (country_id, country_name, country_name_zh, iso3_code, region, subregion, latitude, longitude)
SELECT CONCAT(CHAR(65 + FLOOR((seq-1)/10)), CHAR(65 + MOD(seq-1, 10))), CONCAT('Country-', seq), CONCAT('国家', seq),
       CONCAT(CHAR(65 + FLOOR((seq-1)/10)), CHAR(65 + MOD(seq-1, 10)), 'X'),
       ELT(1 + MOD(seq, 5), 'Asia', 'Europe', 'Africa', 'Americas', 'Oceania'), 'Synthetic',
       -60 + MOD(CAST(seq AS SIGNED) * 7, 120), -170 + MOD(CAST(seq AS SIGNED) * 13, 340)
FROM seq_1_to_60;

-- ASN：800 个
INSERT INTO asns (asn, as_name, as_name_zh, country_id, organization)
SELECT 64512 + seq, CONCAT('SYN-AS', seq), CONCAT('合成AS', seq),
       CONCAT(CHAR(65 + FLOOR(MOD(seq * 11, 60) / 10)), CHAR(65 + MOD(MOD(seq * 11, 60), 10))), CONCAT('Org ', seq)
FROM seq_1_to_800;

-- 前缀：8000 个 /48
INSERT INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, registry)
SELECT CONCAT('2001:db8:', LOWER(HEX(seq)), '::'), 48, '6', 64512 + 1 + MOD(seq * 7, 800),
       (SELECT country_id FROM asns WHERE asn = 64512 + 1 + MOD(seq * 7, 800)), 'synthetic'
FROM seq_1_to_8000;

-- 地址：30 万个，均匀落到各前缀
INSERT INTO active_addresses (address, version, prefix_id, iid_type)
SELECT CONCAT('2001:db8:', LOWER(HEX(1 + MOD(seq, 8000))), '::', LOWER(HEX(seq))), '6',
       (SELECT MIN(prefix_id) FROM ip_prefixes) + MOD(seq, 8000), NULL
FROM seq_1_to_300000;

-- 协议 12 个、漏洞 8 个
INSERT INTO protocols (protocol_name, protocol_number, description, is_common, risk_level)
SELECT ELT(seq, 'HTTP','HTTPS','SSH','FTP','SMTP','DNS','NTP','SNMP','MQTT','RDP','Telnet','MySQL'), 0,
       'synthetic', IF(seq <= 6, 1, 0), ELT(1 + MOD(seq, 3), 'low', 'medium', 'high')
FROM seq_1_to_12;
INSERT INTO vulnerabilities (cve_id, name, description, severity)
SELECT CONCAT('SYN-', seq), CONCAT('合成漏洞', seq), 'synthetic', ELT(1 + MOD(seq, 4), 'low','medium','high','critical')
FROM seq_1_to_8;

-- 协议开放：约 1.3 个/地址
INSERT INTO address_protocols (address_id, protocol_id, port, first_seen, last_seen)
SELECT a.address_id, (SELECT MIN(protocol_id) FROM protocols) + MOD(a.address_id * 5, 12), 1000 + MOD(a.address_id * 5, 12),
       NOW() - INTERVAL MOD(a.address_id, 90) DAY, NOW() - INTERVAL MOD(a.address_id, 7) DAY
FROM active_addresses a;
INSERT IGNORE INTO address_protocols (address_id, protocol_id, port, first_seen, last_seen)
SELECT a.address_id, (SELECT MIN(protocol_id) FROM protocols) + MOD(a.address_id * 3 + 1, 12), 1000 + MOD(a.address_id * 3 + 1, 12),
       NOW() - INTERVAL MOD(a.address_id, 60) DAY, NOW()
FROM active_addresses a WHERE MOD(a.address_id, 10) < 3;

-- 漏洞：约 10% 的地址
INSERT INTO address_vulnerabilities (address_id, vulnerability_id)
SELECT a.address_id, (SELECT MIN(vulnerability_id) FROM vulnerabilities) + MOD(a.address_id, 8)
FROM active_addresses a WHERE MOD(a.address_id, 10) = 0;
COMMIT;

-- 汇总统计（替代被删掉的触发器）
UPDATE ip_prefixes p SET active_ipv6_count = (SELECT COUNT(*) FROM active_addresses a WHERE a.prefix_id = p.prefix_id);
UPDATE asns s SET total_ipv6_prefixes = (SELECT COUNT(*) FROM ip_prefixes p WHERE p.asn = s.asn),
                  total_active_ipv6 = (SELECT IFNULL(SUM(active_ipv6_count), 0) FROM ip_prefixes p WHERE p.asn = s.asn);
UPDATE countries c SET total_ipv6_prefixes = (SELECT COUNT(*) FROM ip_prefixes p WHERE p.country_id = c.country_id),
                       total_active_ipv6 = (SELECT IFNULL(SUM(active_ipv6_count), 0) FROM ip_prefixes p WHERE p.country_id = c.country_id);

DELETE FROM protocol_stats; DELETE FROM country_protocol_stats; DELETE FROM asn_protocol_stats; DELETE FROM region_protocol_stats;
INSERT INTO protocol_stats (protocol_id, affected_addresses, affected_asns, affected_countries)
SELECT ap.protocol_id, COUNT(DISTINCT ap.address_id), COUNT(DISTINCT p.asn), COUNT(DISTINCT p.country_id)
FROM address_protocols ap JOIN active_addresses a ON a.address_id = ap.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
GROUP BY ap.protocol_id;
INSERT INTO country_protocol_stats (country_id, protocol_id, affected_addresses, total_addresses, percentage)
SELECT p.country_id, ap.protocol_id, COUNT(DISTINCT ap.address_id), MAX(c.total_active_ipv6),
       ROUND(COUNT(DISTINCT ap.address_id) * 100 / MAX(c.total_active_ipv6), 2)
FROM address_protocols ap JOIN active_addresses a ON a.address_id = ap.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
JOIN countries c ON c.country_id = p.country_id GROUP BY p.country_id, ap.protocol_id;
INSERT INTO asn_protocol_stats (asn, protocol_id, affected_addresses, total_active_ipv6, affected_percentage)
SELECT p.asn, ap.protocol_id, COUNT(DISTINCT ap.address_id), MAX(s.total_active_ipv6),
       ROUND(COUNT(DISTINCT ap.address_id) * 100 / MAX(s.total_active_ipv6), 2)
FROM address_protocols ap JOIN active_addresses a ON a.address_id = ap.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
JOIN asns s ON s.asn = p.asn GROUP BY p.asn, ap.protocol_id;
INSERT INTO region_protocol_stats (region, protocol_id, affected_addresses, total_addresses, affected_percentage)
SELECT c.region, cps.protocol_id, SUM(cps.affected_addresses), SUM(cps.total_addresses),
       ROUND(SUM(cps.affected_addresses) * 100 / SUM(cps.total_addresses), 2)
FROM country_protocol_stats cps JOIN countries c ON c.country_id = cps.country_id GROUP BY c.region, cps.protocol_id;

DELETE FROM vulnerability_stats; DELETE FROM country_vulnerability_stats; DELETE FROM asn_vulnerability_stats;
INSERT INTO vulnerability_stats (vulnerability_id, affected_addresses, affected_asns, affected_countries)
SELECT av.vulnerability_id, COUNT(DISTINCT av.address_id), COUNT(DISTINCT p.asn), COUNT(DISTINCT p.country_id)
FROM address_vulnerabilities av JOIN active_addresses a ON a.address_id = av.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
GROUP BY av.vulnerability_id;
INSERT INTO country_vulnerability_stats (country_id, vulnerability_id, affected_addresses, total_addresses, percentage)
SELECT p.country_id, av.vulnerability_id, COUNT(DISTINCT av.address_id), MAX(c.total_active_ipv6),
       ROUND(COUNT(DISTINCT av.address_id) * 100 / MAX(c.total_active_ipv6), 2)
FROM address_vulnerabilities av JOIN active_addresses a ON a.address_id = av.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
JOIN countries c ON c.country_id = p.country_id GROUP BY p.country_id, av.vulnerability_id;
INSERT INTO asn_vulnerability_stats (asn, vulnerability_id, affected_addresses, total_active_ipv6, affected_percentage)
SELECT p.asn, av.vulnerability_id, COUNT(DISTINCT av.address_id), MAX(s.total_active_ipv6),
       ROUND(COUNT(DISTINCT av.address_id) * 100 / MAX(s.total_active_ipv6), 2)
FROM address_vulnerabilities av JOIN active_addresses a ON a.address_id = av.address_id JOIN ip_prefixes p ON p.prefix_id = a.prefix_id
JOIN asns s ON s.asn = p.asn GROUP BY p.asn, av.vulnerability_id;
COMMIT;
