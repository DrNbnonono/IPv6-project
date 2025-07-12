-- 协议统计视图
CREATE OR REPLACE VIEW protocol_stats_view AS
SELECT 
    ps.protocol_id,
    p.protocol_name,
    p.description,
    ps.affected_addresses,
    ps.affected_asns,
    ps.affected_countries,
    ps.last_updated
FROM 
    protocol_stats ps
JOIN 
    protocols p ON ps.protocol_id = p.protocol_id;

-- ASN协议统计视图
CREATE OR REPLACE VIEW asn_protocol_stats_view AS
SELECT 
    aps.asn,
    a.as_name,
    a.as_name_zh,
    a.country_id,
    c.country_name,
    c.country_name_zh,
    aps.protocol_id,
    p.protocol_name,
    aps.affected_addresses,
    aps.total_active_ipv6,
    aps.affected_percentage,
    aps.last_updated
FROM 
    asn_protocol_stats aps
JOIN 
    asns a ON aps.asn = a.asn
JOIN 
    protocols p ON aps.protocol_id = p.protocol_id
LEFT JOIN 
    countries c ON a.country_id = c.country_id;

-- 区域协议统计视图
CREATE OR REPLACE VIEW region_protocol_stats_view AS
SELECT 
    rps.region,
    rps.protocol_id,
    p.protocol_name,
    rps.affected_addresses,
    rps.total_addresses,
    rps.affected_percentage,
    rps.last_updated
FROM 
    region_protocol_stats rps
JOIN 
    protocols p ON rps.protocol_id = p.protocol_id;

-- 国家协议统计视图
CREATE OR REPLACE VIEW country_protocol_stats_view AS
SELECT 
    cps.country_id,
    c.country_name,
    c.country_name_zh,
    cps.protocol_id,
    p.protocol_name,
    cps.affected_addresses,
    cps.total_addresses,
    cps.percentage,
    cps.last_updated
FROM 
    country_protocol_stats cps
JOIN 
    countries c ON cps.country_id = c.country_id
JOIN 
    protocols p ON cps.protocol_id = p.protocol_id;

-- 漏洞统计视图
CREATE OR REPLACE VIEW vulnerability_stats_view AS
SELECT 
    vs.vulnerability_id,
    v.cve_id,
    v.name,
    v.description,
    v.severity,
    vs.affected_addresses,
    vs.affected_asns,
    vs.affected_countries,
    vs.last_updated
FROM 
    vulnerability_stats vs
JOIN 
    vulnerabilities v ON vs.vulnerability_id = v.vulnerability_id;

-- ASN漏洞统计视图
CREATE OR REPLACE VIEW asn_vulnerability_stats_view AS
SELECT 
    avs.asn,
    a.as_name,
    a.as_name_zh,
    a.country_id,
    c.country_name,
    c.country_name_zh,
    avs.vulnerability_id,
    v.cve_id,
    v.name,
    v.severity,
    avs.affected_addresses,
    avs.total_active_ipv6,
    avs.affected_percentage,
    avs.last_updated
FROM 
    asn_vulnerability_stats avs
JOIN 
    asns a ON avs.asn = a.asn
JOIN 
    vulnerabilities v ON avs.vulnerability_id = v.vulnerability_id
LEFT JOIN 
    countries c ON a.country_id = c.country_id;

-- 区域漏洞统计视图
CREATE OR REPLACE VIEW region_vulnerability_stats_view AS
SELECT 
    rvs.region,
    rvs.vulnerability_id,
    v.cve_id,
    v.name,
    v.severity,
    rvs.affected_addresses,
    rvs.total_addresses,
    rvs.affected_percentage,
    rvs.last_updated
FROM 
    region_vulnerability_stats rvs
JOIN 
    vulnerabilities v ON rvs.vulnerability_id = v.vulnerability_id;

-- 国家漏洞统计视图
CREATE OR REPLACE VIEW country_vulnerability_stats_view AS
SELECT 
    cvs.country_id,
    c.country_name,
    c.country_name_zh,
    cvs.vulnerability_id,
    v.cve_id,
    v.name,
    v.severity,
    v.description,
    cvs.total_addresses,
    cvs.affected_addresses,
    cvs.percentage,
    cvs.last_updated
FROM 
    country_vulnerability_stats cvs
JOIN 
    countries c ON cvs.country_id = c.country_id
JOIN 
    vulnerabilities v ON cvs.vulnerability_id = v.vulnerability_id;