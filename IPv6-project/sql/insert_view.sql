use ipv6_project;

-- 先删除已存在的视图（如果存在）
DROP VIEW IF EXISTS protocol_stats;
DROP VIEW IF EXISTS asn_protocol_stats;
DROP VIEW IF EXISTS region_protocol_stats;
DROP VIEW IF EXISTS vulnerability_stats;
DROP VIEW IF EXISTS asn_vulnerability_stats;
DROP VIEW IF EXISTS region_vulnerability_stats;

-- 协议统计视图（移除不存在的protocol_description列）
CREATE VIEW protocol_stats AS
SELECT 
    p.protocol_id,
    p.protocol_name,
    COUNT(DISTINCT ap.address_id) AS affected_addresses,
    COUNT(DISTINCT ip.asn) AS affected_asns,
    COUNT(DISTINCT ip.country_id) AS affected_countries
FROM 
    protocols p
LEFT JOIN 
    address_protocols ap ON p.protocol_id = ap.protocol_id
LEFT JOIN 
    active_addresses aa ON ap.address_id = aa.address_id
LEFT JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
GROUP BY 
    p.protocol_id;

-- ASN协议统计视图
CREATE VIEW asn_protocol_stats AS
SELECT 
    a.asn,
    a.as_name,
    a.as_name_zh,
    a.country_id,
    c.country_name,
    c.country_name_zh,
    p.protocol_id,
    p.protocol_name,
    COUNT(DISTINCT ap.address_id) AS affected_addresses,
    a.total_active_ipv6,
    (COUNT(DISTINCT ap.address_id) / a.total_active_ipv6 * 100) AS affected_percentage
FROM 
    asns a
JOIN 
    ip_prefixes ip ON a.asn = ip.asn
JOIN 
    active_addresses aa ON ip.prefix_id = aa.prefix_id
JOIN 
    address_protocols ap ON aa.address_id = ap.address_id
JOIN 
    protocols p ON ap.protocol_id = p.protocol_id
JOIN
    countries c ON a.country_id = c.country_id
GROUP BY 
    a.asn, p.protocol_id;

-- 区域协议统计视图
CREATE VIEW region_protocol_stats AS
SELECT 
    c.region,
    p.protocol_id,
    p.protocol_name,
    COUNT(DISTINCT ap.address_id) AS affected_addresses,
    SUM(c.total_active_ipv6) AS total_addresses,
    (COUNT(DISTINCT ap.address_id) / SUM(c.total_active_ipv6) * 100) AS affected_percentage
FROM 
    countries c
JOIN 
    ip_prefixes ip ON c.country_id = ip.country_id
JOIN 
    active_addresses aa ON ip.prefix_id = aa.prefix_id
JOIN 
    address_protocols ap ON aa.address_id = ap.address_id
JOIN 
    protocols p ON ap.protocol_id = p.protocol_id
GROUP BY 
    c.region, p.protocol_id;

-- 漏洞统计视图（移除不存在的title列）
CREATE VIEW vulnerability_stats AS
SELECT 
    v.vulnerability_id,
    v.cve_id,
    v.description,
    v.severity,
    COUNT(DISTINCT av.address_id) AS affected_addresses,
    COUNT(DISTINCT ip.asn) AS affected_asns,
    COUNT(DISTINCT ip.country_id) AS affected_countries
FROM 
    vulnerabilities v
LEFT JOIN 
    address_vulnerabilities av ON v.vulnerability_id = av.vulnerability_id
LEFT JOIN 
    active_addresses aa ON av.address_id = aa.address_id
LEFT JOIN 
    ip_prefixes ip ON aa.prefix_id = ip.prefix_id
GROUP BY 
    v.vulnerability_id;

-- ASN漏洞统计视图（移除不存在的title列）
CREATE VIEW asn_vulnerability_stats AS
SELECT 
    a.asn,
    a.as_name,
    a.as_name_zh,
    a.country_id,
    c.country_name,
    c.country_name_zh,
    v.vulnerability_id,
    v.cve_id,
    COUNT(DISTINCT av.address_id) AS affected_addresses,
    a.total_active_ipv6,
    (COUNT(DISTINCT av.address_id) / a.total_active_ipv6 * 100) AS affected_percentage
FROM 
    asns a
JOIN 
    ip_prefixes ip ON a.asn = ip.asn
JOIN 
    active_addresses aa ON ip.prefix_id = aa.prefix_id
JOIN 
    address_vulnerabilities av ON aa.address_id = av.address_id
JOIN 
    vulnerabilities v ON av.vulnerability_id = v.vulnerability_id
JOIN
    countries c ON a.country_id = c.country_id
GROUP BY 
    a.asn, v.vulnerability_id;

-- 区域漏洞统计视图（移除不存在的title列）
CREATE VIEW region_vulnerability_stats AS
SELECT 
    c.region,
    v.vulnerability_id,
    v.cve_id,
    COUNT(DISTINCT av.address_id) AS affected_addresses,
    SUM(c.total_active_ipv6) AS total_addresses,
    (COUNT(DISTINCT av.address_id) / SUM(c.total_active_ipv6) * 100) AS affected_percentage
FROM 
    countries c
JOIN 
    ip_prefixes ip ON c.country_id = ip.country_id
JOIN 
    active_addresses aa ON ip.prefix_id = aa.prefix_id
JOIN 
    address_vulnerabilities av ON aa.address_id = av.address_id
JOIN 
    vulnerabilities v ON av.vulnerability_id = v.vulnerability_id
GROUP BY 
    c.region, v.vulnerability_id;