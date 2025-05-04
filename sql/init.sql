use ipv6_project;

-- 禁用外键检查
SET FOREIGN_KEY_CHECKS = 0;

-- 清空表格
TRUNCATE TABLE asns;
TRUNCATE TABLE ip_prefixes;

-- 重新启用外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 亚洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 中国
(4134, 'CHINANET-BACKBONE', '中国电信骨干网', 'CN', 'China Telecom'),
(4808, 'CHINA169-BACKBONE', '中国联通骨干网', 'CN', 'China Unicom'),
(4837, 'CHINA169-BACKBONE', '中国联通骨干网', 'CN', 'China Unicom'),
(4538, 'ERX-CERNET-BKB', '中国教育和科研计算机网', 'CN', 'CERNET Center'),
(37963, 'ALIBABA-CN-NET', '阿里巴巴网络', 'CN', 'Alibaba (China) Technology Co., Ltd.'),
(45090, 'TENCENT-NET-AP', '腾讯云', 'CN', 'Tencent Cloud Computing'),
(56040, 'CMNET', '中国移动', 'CN', 'China Mobile Communications Corporation'),
(9808, 'CMNET', '中国移动', 'CN', 'China Mobile Communications Corporation'),

-- 日本
(2914, 'NTT-COMMUNICATIONS-2914', 'NTT通信', 'JP', 'NTT Communications Corporation'),
(4713, 'OCN-NTT', 'NTT OCN', 'JP', 'NTT Communications Corporation'),
(17676, 'SOFTBANK', '软银', 'JP', 'SoftBank Corp.'),
(2516, 'KDDI', 'KDDI', 'JP', 'KDDI CORPORATION'),
(2497, 'IIJ', 'Internet Initiative Japan', 'JP', 'Internet Initiative Japan Inc.'),

-- 韩国
(4760, 'KIXS-AS-KR', '韩国电信', 'KR', 'Korea Telecom'),
(9318, 'SKB-AS', 'SK宽带', 'KR', 'SK Broadband Co Ltd'),
(3786, 'LG-DACOM', 'LG U+', 'KR', 'LG DACOM Corporation'),

-- 印度
(9498, 'BHARTI-MOBILE', 'Bharti Airtel', 'IN', 'Bharti Airtel Ltd.'),
(45609, 'RELIANCEJIO-IN', 'Reliance Jio', 'IN', 'Reliance Jio Infocomm Limited'),
(558, 'RELIANCE-COMMUNICATIONS-IN', 'Reliance通信', 'IN', 'Reliance Communications Ltd.'),

-- 台湾地区(中国的省份)
(3462, 'HINET', '中华电信', 'TW', 'Chunghwa Telecom Co., Ltd.'),
(9924, 'TWNIC-TW', '台湾网络信息中心', 'TW', 'Taiwan Network Information Center'),
(18182, 'FETNET', '远传电信', 'TW', 'Far EasTone Telecommunications Co., Ltd.'),

-- 澳大利亚
(7545, 'TPG-TELECOM', 'TPG电信', 'AU', 'TPG Telecom Limited'),
(1221, 'TELSTRA', '澳洲电信', 'AU', 'Telstra Pty Ltd'),
(4766, 'SINGTEL', '新加坡电信', 'SG', 'SingTel Optus Pty Ltd');

-- 亚洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 中国电信
('2400:3200::', 32, '6', 4134, 'CN', '2011-08-16', 'APNIC'),
('2400:da00::', 32, '6', 4134, 'CN', '2011-08-16', 'APNIC'),
('240e::', 32, '6', 4134, 'CN', '2008-07-22', 'APNIC'),

-- 中国联通
('2408:4000::', 32, '6', 4808, 'CN', '2012-05-11', 'APNIC'),
('2408:8000::', 32, '6', 4837, 'CN', '2012-05-11', 'APNIC'),
('2408:8400::', 32, '6', 4837, 'CN', '2012-05-11', 'APNIC'),

-- 中国移动
('2409:8000::', 32, '6', 9808, 'CN', '2012-09-18', 'APNIC'),
('2409:8400::', 32, '6', 9808, 'CN', '2012-09-18', 'APNIC'),
('2409:8800::', 32, '6', 56040, 'CN', '2012-09-18', 'APNIC'),

-- 阿里巴巴
('2400:3200:2000::', 40, '6', 37963, 'CN', '2011-08-16', 'APNIC'),
('2400:3200:4000::', 40, '6', 37963, 'CN', '2011-08-16', 'APNIC'),

-- 腾讯
('2402:4e00::', 32, '6', 45090, 'CN', '2012-11-20', 'APNIC'),
('2402:8000::', 32, '6', 45090, 'CN', '2012-11-20', 'APNIC'),

-- 日本NTT
('2001:218::', 32, '6', 4713, 'JP', '2003-03-18', 'APNIC'),
('2001:218:2000::', 35, '6', 4713, 'JP', '2003-03-18', 'APNIC'),

-- 韩国电信
('2406:a000::', 32, '6', 4760, 'KR', '2011-08-16', 'APNIC'),
('2001:438:ffff::', 48, '6', 4760, 'KR', '2003-03-18', 'APNIC'),

-- 台湾中华电信
('2001:b000::', 32, '6', 3462, 'TW', '2003-03-18', 'APNIC'),
('2404:0::', 32, '6', 3462, 'TW', '2011-08-16', 'APNIC'),

-- 澳洲Telstra
('2401:8000::', 32, '6', 1221, 'AU', '2011-08-16', 'APNIC'),
('2001:388::', 32, '6', 1221, 'AU', '2003-03-18', 'APNIC');

-- 欧洲地区ASN和前缀 (整合两个文件的内容)
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 法国
(3215, 'ORANGE', 'Orange', 'FR', 'Orange S.A.'),
-- 德国
(3320, 'DTAG', '德国电信', 'DE', 'Deutsche Telekom AG'),
-- 英国
(2856, 'BT-UK-AS', '英国电信', 'GB', 'British Telecommunications PLC'),
(6830, 'LIBERTY-GLOBAL', 'Liberty Global', 'GB', 'Liberty Global B.V.'),
-- 瑞典
(1299, 'TELIANET', 'Telia', 'SE', 'Telia Company AB'),
-- 意大利
(39120, 'CONVERGENZE', 'Convergenze S.p.A.', 'IT', 'Convergenze S.p.A.'),
(51185, 'MAINSTREAMING', 'MainStreaming SpA', 'IT', 'MainStreaming SpA'),
(20993, 'FIBER-TELECOM', 'Fiber Telecom S.p.A.', 'IT', 'Fiber Telecom S.p.A.'),
(12779, 'IT-GATE', 'IT.Gate S.p.A.', 'IT', 'IT.Gate S.p.A.'),
(49605, 'DIGITAL-TELECOM', 'Digital Telecommunication Services S.r.I.', 'IT', 'Digital Telecommunication Services S.r.I.'),
(1267, 'WIND-TRE', 'WIND TRE S.P.A.', 'IT', 'WIND TRE S.P.A.'),
-- 拉脱维亚
(12578, 'LATTELECOM', 'Lattelecom', 'LV', 'Lattelecom'),
(2588, 'BITE-LATVIJA', 'Bite Latvija', 'LV', 'Bite Latvija'),
(12847, 'LMT', 'Latvijas Mobilais Telefons', 'LV', 'Latvijas Mobilais Telefons SIA'),
-- 立陶宛
(8764, 'TELIA-LIETUVA', 'Telia Lietuva', 'LT', 'Telia Lietuva, AB'),
(43811, 'TELIA-LIETUVA-2', 'Telia Lietuva', 'LT', 'Telia Lietuva, AB'),
(13194, 'BITE-LIETUVA', 'Bite Lietuva', 'LT', 'UAB Bite Lietuva'),
(56630, 'MELBIKOMAS', 'Melbikomas', 'LT', 'Melbikomas UAB'),
(8849, 'MELBIKOMAS-2', 'Melbikomas', 'LT', 'Melbikomas UAB'),
(21412, 'CGATES', 'Cgates', 'LT', 'UAB Cgates'),
-- 卢森堡
(199524, 'G-CORE-LABS', 'G-Core Labs', 'LU', 'G-Core Labs S.A.'),
(56665, 'PROXIMUS-LUX', 'Proximus Luxembourg', 'LU', 'Proximus Luxembourg S.A.'),
(6661, 'POST-LUX', 'POST Luxembourg', 'LU', 'POST Luxembourg'),
(8632, 'LUX-ONLINE', 'Luxembourg Online', 'LU', 'Luxembourg Online S.A.'),
(29467, 'LUXNETWORK', 'LUXNETWORK', 'LU', 'LUXNETWORK S.A.'),
-- 北马其顿
(6821, 'MAKEDONSKI-TELEKOM', 'Makedonski Telekom', 'MK', 'Makedonski Telekom AD Skopje'),
(43612, 'A1-MACEDONIA', 'A1 Macedonia', 'MK', 'A1 Makedonija DOOEL Skopje'),
(34772, 'NEOTEL', 'NEOTEL DOO', 'MK', 'NEOTEL DOO export-import Skopje'),
(34547, 'TELESMART', 'TELESMART TELEKOM DOO', 'MK', 'TELESMART TELEKOM DOO'),
-- 荷兰
(31477, 'T-MOBILE-NL', 'T-Mobile', 'NL', 'T-Mobile Netherlands'),
(50266, 'ODIDO', 'Odido', 'NL', 'Odido Netherlands B.V.'),
-- 挪威
(2119, 'TELENOR-NORGE', 'Telenor Norge', 'NO', 'Telenor Norge AS'),
(25400, 'TELIA-NORGE', 'Telia Norge', 'NO', 'Telia Norge AS'),
(29695, 'LYSE', 'Lyse Tele', 'NO', 'Lyse Tele AS'),
(8896, 'GLOBALCONNECT', 'GlobalConnect', 'NO', 'GlobalConnect AS'),
-- 波兰
(29535, 'ORANGE-POLSKA', 'Orange Polska', 'PL', 'Orange Polska Spolka Akcyjna'),
(12912, 'T-MOBILE-POLSKA', 'T-Mobile Polska', 'PL', 'T-Mobile Polska S.A.'),
(8374, 'POLKOMTEL', 'Polkomtel', 'PL', 'Polkomtel Sp.z o.o.'),
(12741, 'NETIA', 'Netia', 'PL', 'Netia SA'),
-- 葡萄牙
(8657, 'MEO', 'MEO', 'PT', 'MEO-Servicos de Comunicacoes e Multimédia S.A.'),
(2860, 'NOS', 'NOS', 'PT', 'NOS Comunicacoes, S.A.'),
(12353, 'VODAFONE-PT', 'Vodafone Portugal', 'PT', 'Vodafone Portugal-Comunicacoes Pessoais S.A.'),
-- 罗马尼亚
(8953, 'ORANGE-ROMANIA', 'Orange Romania', 'RO', 'Orange Romania S.A.'),
(12302, 'VODAFONE-RO', 'Vodafone Romania', 'RO', 'Vodafone Romania S.A.'),
(6663, 'EUROWEB-RO', 'Euroweb Romania', 'RO', 'Euroweb Romania S.R.L.'),
-- 塞尔维亚
(8400, 'TELEKOM-SRB', 'Telekom Srbija', 'RS', 'Telekom Srbija a.d.'),
(31042, 'TELENOR-SRB', 'Telenor Serbia', 'RS', 'Telenor d.o.o.'),
-- 斯洛伐克
(6855, 'SLOVAK-TELEKOM', 'Slovak Telekom', 'SK', 'Slovak Telekom, a.s.'),
(29405, 'O2-SLOVAKIA', 'O2 Slovakia', 'SK', 'VNET a.s.'),
(8778, 'SLOVANET', 'Slovanet', 'SK', 'Slovanet a.s.'),
-- 斯洛文尼亚
(5603, 'TELEKOM-SLOVENIJA', 'Telekom Slovenija', 'SI', 'Telekom Slovenije, d.d.'),
(3212, 'TELEMACH-SI', 'Telemach Slovenija', 'SI', 'Telemach Slovenija d.o.o.'),
(21283, 'A1-SLOVENIJA', 'A1 Slovenija', 'SI', 'A1 Slovenija telekomunikacijske storitve, d.d.'),
-- 西班牙
(3352, 'TELEFONICA-ES', 'Telefónica de España', 'ES', 'Telefónica de España S.A.U.'),
(12479, 'ORANGE-ES', 'Orange España', 'ES', 'Orange España SA'),
-- 瑞典
(1299, 'ARELION', 'Arelion Sweden', 'SE', 'Arelion Sweden AB'),
(3301, 'TELIA-SE', 'Telia Company', 'SE', 'Telia Company AB'),
(1257, 'TELE2-SE', 'Tele2 Sverige', 'SE', 'Tele2 Sverige AB'),
(8473, 'BAHNHOF', 'Bahnhof', 'SE', 'Bahnhof AB'),
-- 瑞士
(3303, 'SWISSCOM', 'Swisscom', 'CH', 'Swisscom (Schweiz) AG'),
(6730, 'SUNRISE', 'Sunrise', 'CH', 'Sunrise GmbH'),
(15796, 'SALT', 'Salt Mobile', 'CH', 'Salt Mobile SA'),
(25091, 'IP-MAX', 'IP-Max', 'CH', 'IP-Max SA'),
(15547, 'NETPLUS', 'netplus.ch', 'CH', 'netplus.ch SA'),
-- 土耳其
(9121, 'TURK-TELEKOM', 'Turk Telekom', 'TR', 'Turk Telekommunikation Anonim Sirketi'),
(208972, 'TURKCELL', 'Turkcell', 'TR', 'Turkcell Iletisim Hizmetleri A.S.'),
(12735, 'TURKNET', 'TurkNet', 'TR', 'TurkNet Iletisim Hizmetleri A.S.'),
(34984, 'SUPERONLINE', 'Superonline', 'TR', 'Superonline Iletisim Hizmetleri A.S.'),
-- 乌克兰
(15895, 'KYIVSTAR', 'Kyivstar', 'UA', 'Kyivstar PJSC'),
(21497, 'VODAFONE-UA', 'Vodafone Ukraine', 'UA', 'Vodafone Ukraine'),
(3326, 'DATAGROUP', 'Datagroup', 'UA', 'PRIVATE JOINT STOCK COMPANY DATAGROUP'),
-- 英国
(2856, 'BT-GROUP', 'BT Group', 'GB', 'BT Group plc'),
(1273, 'VODAFONE-UK', 'Vodafone Group', 'GB', 'Vodafone Group PLC'),
(12576, 'EE', 'EE Limited', 'GB', 'EE Limited'),
(8683, 'VIRGIN-MEDIA', 'Virgin Media', 'GB', 'Virgin Media O2'),
(8282, 'THREE-UK', 'Three UK', 'GB', 'Three UK (Hutchison 3G UK Ltd)'),
-- 俄罗斯
(8359, 'MTS', 'MTS PJSC', 'RU', 'MTS PJSC'),
(31133, 'MEGAFON', 'MegaFon', 'RU', 'PJSC MegaFon'),
(48858, 'ER-TELECOM', 'ER-Telecom', 'RU', 'JSC ER-Telecom Holding');

-- 欧洲地区IPv6前缀 (整合两个文件的内容)
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 德国电信
('2001:908::', 32, '6', 3320, 'DE', '2003-03-18', 'RIPE'),
('2003:80::', 32, '6', 3320, 'DE', '2005-03-01', 'RIPE'),
-- 英国电信
('2a00:1a40::', 32, '6', 2856, 'GB', '2010-06-07', 'RIPE'),
('2001:8f8::', 32, '6', 2856, 'GB', '2003-03-18', 'RIPE'),
-- 俄罗斯MTS
('2a00:15f8::', 32, '6', 8359, 'RU', '2010-06-07', 'RIPE'),
('2001:67c:258::', 48, '6', 8359, 'RU', '2003-03-18', 'RIPE'),
-- 意大利Convergenze
('2a01:9a80::', 32, '6', 39120, 'IT', '2014-11-14', 'RIPE'),
-- 法国Orange
('2001:cb8::', 32, '6', 3215, 'FR', '2003-03-18', 'RIPE'),
-- 意大利MainStreaming
('2a02:b000::', 23, '6', 51185, 'IT', '2014-11-14', 'RIPE'),
-- 意大利Fiber Telecom
('2a00:c260:8000::', 34, '6', 20993, 'IT', '2010-06-07', 'RIPE'),
-- 意大利IT.Gate
('2a02:c480::', 32, '6', 12779, 'IT', '2014-11-14', 'RIPE'),
-- 意大利Digital Telecommunication
('2a02:e50::', 32, '6', 49605, 'IT', '2014-11-14', 'RIPE'),
-- 意大利WIND TRE
('2a02:b000::', 23, '6', 1267, 'IT', '2014-11-14', 'RIPE'),
-- 拉脱维亚Lattelecom
('2a02:2330::', 29, '6', 12578, 'LV', '2014-11-14', 'RIPE'),
-- 拉脱维亚Bite Latvija
('2a02:610::', 32, '6', 2588, 'LV', '2014-11-14', 'RIPE'),
-- 拉脱维亚LMT
('2a03:ec00::', 32, '6', 12847, 'LV', '2014-11-14', 'RIPE'),
-- 立陶宛Telia Lietuva
('2a00:1eb8::', 35, '6', 8764, 'LT', '2010-06-07', 'RIPE'),
('2a02:118:2::', 48, '6', 8764, 'LT', '2014-11-14', 'RIPE'),
('2a00:1eb8:c004::', 48, '6', 8764, 'LT', '2010-06-07', 'RIPE'),
-- 立陶宛Bite Lietuva
('2a00:f500::', 29, '6', 13194, 'LT', '2010-06-07', 'RIPE'),
-- 立陶宛Melbikomas
('2a06:f900::', 36, '6', 56630, 'LT', '2010-06-07', 'RIPE'),
('2a0d:8400::', 32, '6', 56630, 'LT', '2014-11-14', 'RIPE'),
-- 立陶宛Cgates
('2a00:7600::', 32, '6', 21412, 'LT', '2010-06-07', 'RIPE'),
('2a04:ce00::', 29, '6', 21412, 'LT', '2014-11-14', 'RIPE'),
-- 卢森堡G-Core Labs
('2a03:90c0:10::', 44, '6', 199524, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡Proximus Luxembourg
('2a00:4180:1::', 48, '6', 56665, 'LU', '2010-06-07', 'RIPE'),
('2a04:81c0::', 29, '6', 56665, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡POST Luxembourg
('2001:7e8::', 32, '6', 6661, 'LU', '2003-03-18', 'RIPE'),
-- 卢森堡Luxembourg Online
('2a02:678::', 32, '6', 8632, 'LU', '2014-11-14', 'RIPE'),
-- 卢森堡LUXNETWORK
('2a02:70c0::', 32, '6', 29467, 'LU', '2014-11-14', 'RIPE'),
('2a03:2f00::', 32, '6', 29467, 'LU', '2014-11-14', 'RIPE'),
-- 北马其顿Makedonski Telekom
('2a00:5c40::', 29, '6', 6821, 'MK', '2010-06-07', 'RIPE'),
-- 北马其顿A1 Macedonia
('2a01:b780::', 32, '6', 43612, 'MK', '2014-11-14', 'RIPE'),
-- 北马其顿NEOTEL
('2a00:1218::', 32, '6', 34772, 'MK', '2010-06-07', 'RIPE'),
-- 北马其顿TELESMART
('2a02:5580::', 32, '6', 34547, 'MK', '2014-11-14', 'RIPE'),
-- 荷兰T-Mobile
('2a0b:6d80::', 29, '6', 31477, 'NL', '2014-11-14', 'RIPE'),
('2001:678:750::', 48, '6', 31477, 'NL', '2010-06-07', 'RIPE'),
-- 荷兰Odido
('2a02:4240::', 32, '6', 50266, 'NL', '2014-11-14', 'RIPE'),
-- 挪威Telenor Norge
('2001:678:9dc::', 48, '6', 2119, 'NO', '2010-06-07', 'RIPE'),
-- 挪威Telia Norge
('2a02:228::', 29, '6', 25400, 'NO', '2014-11-14', 'RIPE'),
('2001:678:69c::', 48, '6', 25400, 'NO', '2010-06-07', 'RIPE'),
-- 挪威Lyse Tele
('2a00:fd00::', 32, '6', 29695, 'NO', '2010-06-07', 'RIPE'),
('2a00:dec0::', 32, '6', 29695, 'NO', '2010-06-07', 'RIPE'),
-- 挪威GlobalConnect
('2a00:1e18::', 32, '6', 8896, 'NO', '2010-06-07', 'RIPE'),
('2a03:9a00::', 32, '6', 8896, 'NO', '2014-11-14', 'RIPE'),
-- 波兰Orange Polska
('2001:7f8:27::', 48, '6', 29535, 'PL', '2003-03-18', 'RIPE'),
('2a01:11f0::', 28, '6', 29535, 'PL', '2014-11-14', 'RIPE'),
-- 波兰T-Mobile Polska
('2001:4190::', 32, '6', 12912, 'PL', '2003-03-18', 'RIPE'),
('2001:1b80::', 29, '6', 12912, 'PL', '2003-03-18', 'RIPE'),
-- 波兰Polkomtel
('2a01:bb80::', 32, '6', 8374, 'PL', '2014-11-14', 'RIPE'),
('2a01:2e0::', 28, '6', 8374, 'PL', '2014-11-14', 'RIPE'),
-- 波兰Netia
('2001:16b0::', 32, '6', 12741, 'PL', '2003-03-18', 'RIPE'),
('2001:41b0::', 32, '6', 12741, 'PL', '2003-03-18', 'RIPE'),
-- 葡萄牙NOS
('2001:1588::', 29, '6', 2860, 'PT', '2003-03-18', 'RIPE'),
('2a01:8::', 29, '6', 2860, 'PT', '2014-11-14', 'RIPE'),
-- 葡萄牙Vodafone
('2001:818::', 32, '6', 12353, 'PT', '2003-03-18', 'RIPE'),
('2001:818::', 29, '6', 12353, 'PT', '2003-03-18', 'RIPE'),
-- 罗马尼亚Orange Romania
('2a02:a58::', 32, '6', 8953, 'RO', '2014-11-14', 'RIPE'),
-- 罗马尼亚Vodafone Romania
('2a04:2410::', 28, '6', 12302, 'RO', '2014-11-14', 'RIPE'),
('2a04:2400::', 27, '6', 12302, 'RO', '2014-11-14', 'RIPE'),
-- 罗马尼亚Euroweb Romania
('2a02:2720::', 32, '6', 6663, 'RO', '2014-11-14', 'RIPE'),
-- 塞尔维亚Telekom Srbija
('2a00:e90::', 32, '6', 8400, 'RS', '2010-06-07', 'RIPE'),
('2a06:5b00::', 29, '6', 8400, 'RS', '2010-06-07', 'RIPE'),
-- 塞尔维亚Telenor Serbia
('2a03:87c0::', 29, '6', 31042, 'RS', '2014-11-14', 'RIPE'),
-- 斯洛伐克Slovak Telekom
('2a01:5f7::', 32, '6', 6855, 'SK', '2014-11-14', 'RIPE'),
('2a00:12a8::', 29, '6', 6855, 'SK', '2010-06-07', 'RIPE'),
-- 斯洛伐克O2 Slovakia
('2a01:390::', 32, '6', 29405, 'SK', '2014-11-14', 'RIPE'),
('2a00:10d8::', 32, '6', 29405, 'SK', '2010-06-07', 'RIPE'),
-- 斯洛伐克Slovanet
('2a00:9060::', 32, '6', 8778, 'SK', '2010-06-07', 'RIPE'),
('2a02:dd8::', 29, '6', 8778, 'SK', '2014-11-14', 'RIPE'),
-- 斯洛文尼亚Telekom Slovenija
('2a02:e20::', 32, '6', 5603, 'SI', '2014-11-14', 'RIPE'),
('2a00:ee1::', 32, '6', 5603, 'SI', '2010-06-07', 'RIPE'),
-- 斯洛文尼亚Telemach Slovenija
('2a00:fc0::', 32, '6', 3212, 'SI', '2010-06-07', 'RIPE'),
('2001:1688::', 29, '6', 3212, 'SI', '2003-03-18', 'RIPE'),
-- 斯洛文尼亚A1 Slovenija
('2001:15c0::', 29, '6', 21283, 'SI', '2003-03-18', 'RIPE'),
('2a00:1a20::', 32, '6', 21283, 'SI', '2010-06-07', 'RIPE'),
-- 西班牙Telefónica
('2a06:f0c0::', 29, '6', 3352, 'ES', '2010-06-07', 'RIPE'),
('2a02:9155::', 32, '6', 3352, 'ES', '2014-11-14', 'RIPE'),
-- 西班牙Orange
('2a01:c508::', 29, '6', 12479, 'ES', '2014-11-14', 'RIPE'),
('2a01:c504::', 31, '6', 12479, 'ES', '2014-11-14', 'RIPE'),
-- 瑞典Arelion
('2001:2000:3000::', 40, '6', 1299, 'SE', '2003-03-18', 'RIPE'),
('2001:2030::', 28, '6', 1299, 'SE', '2003-03-18', 'RIPE'),
-- 瑞典Telia
('2001:678:784::', 48, '6', 3301, 'SE', '2010-06-07', 'RIPE'),
('2001:678:704::', 48, '6', 3301, 'SE', '2010-06-07', 'RIPE'),
-- 瑞典Tele2
('2001:67c:10c8::', 48, '6', 1257, 'SE', '2010-06-07', 'RIPE'),
('2001:67c:488::', 48, '6', 1257, 'SE', '2010-06-07', 'RIPE'),
-- 瑞典Bahnhof
('2a0c:c400::', 32, '6', 8473, 'SE', '2014-11-14', 'RIPE'),
('2001:9b2::', 34, '6', 8473, 'SE', '2003-03-18', 'RIPE'),
-- 瑞士Swisscom
('2001:8a8::', 32, '6', 3303, 'CH', '2003-03-18', 'RIPE'),
('2a02:a90::', 32, '6', 3303, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士Sunrise
('2001:918::', 32, '6', 6730, 'CH', '2003-03-18', 'RIPE'),
('2001:678:e0::', 48, '6', 6730, 'CH', '2010-06-07', 'RIPE'),
-- 瑞士Salt Mobile
('2a04:ee40::', 29, '6', 15796, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士IP-Max
('2a0c:4144:100::', 48, '6', 25091, 'CH', '2014-11-14', 'RIPE'),
('2a0d:cb80::', 29, '6', 25091, 'CH', '2014-11-14', 'RIPE'),
-- 瑞士netplus.ch
('2a03:4380::', 32, '6', 15547, 'CH', '2014-11-14', 'RIPE'),
('2a02:26a0::', 29, '6', 15547, 'CH', '2014-11-14', 'RIPE'),
-- 土耳其Turk Telekom
('2a01:358:1011::', 48, '6', 9121, 'TR', '2014-11-14', 'RIPE'),
('2a01:358:1000::', 36, '6', 9121, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其Turkcell
('2a0a:4944:2::', 48, '6', 208972, 'TR', '2014-11-14', 'RIPE'),
('2a0a:4940::', 48, '6', 208972, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其TurkNet
('2a02:ff0:200::', 40, '6', 12735, 'TR', '2014-11-14', 'RIPE'),
('2a02:ff0:4::', 48, '6', 12735, 'TR', '2014-11-14', 'RIPE'),
-- 土耳其Superonline
('2a02:e0::', 36, '6', 34984, 'TR', '2014-11-14', 'RIPE'),
('2a01:188::', 48, '6', 34984, 'TR', '2014-11-14', 'RIPE'),
-- 乌克兰Kyivstar
('2a02:2378::', 32, '6', 15895, 'UA', '2014-11-14', 'RIPE'),
('2a02:8a8::', 32, '6', 15895, 'UA', '2014-11-14', 'RIPE'),
-- 乌克兰Vodafone Ukraine
('2a00:f50::', 32, '6', 21497, 'UA', '2010-06-07', 'RIPE'),
-- 乌克兰Datagroup
('2a02:70::', 32, '6', 3326, 'UA', '2014-11-14', 'RIPE'),
('2a01:758:ffe0::', 48, '6', 3326, 'UA', '2014-11-14', 'RIPE'),
-- 英国BT Group
('2a01:4c8:f401::', 48, '6', 2856, 'GB', '2014-11-14', 'RIPE'),
('2a00:2380::', 25, '6', 2856, 'GB', '2010-06-07', 'RIPE'),
-- 英国Vodafone
('2001:5000::', 21, '6', 1273, 'GB', '2003-03-18', 'RIPE'),
-- 英国EE
('2a01:4c8::', 29, '6', 12576, 'GB', '2014-11-14', 'RIPE'),
-- 英国Virgin Media
('2a01:61c:1100::', 40, '6', 8683, 'GB', '2014-11-14', 'RIPE'),
('2a01:618:8000::', 40, '6', 8683, 'GB', '2014-11-14', 'RIPE'),
-- 英国Three UK
('2a01:2c0::', 32, '6', 8282, 'GB', '2014-11-14', 'RIPE'),
-- 俄罗斯MTS
('2a02:28::', 32, '6', 8359, 'RU', '2014-11-14', 'RIPE'),
('2a00:189c::', 32, '6', 8359, 'RU', '2010-06-07', 'RIPE'),
-- 俄罗斯MegaFon
('2a03:d002::', 40, '6', 31133, 'RU', '2014-11-14', 'RIPE'),
('2a03:d000:200::', 41, '6', 31133, 'RU', '2014-11-14', 'RIPE'),
-- 俄罗斯ER-Telecom
('2a0b:9fc0::', 48, '6', 48858, 'RU', '2014-11-14', 'RIPE');


-- 非洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 南非
(5713, 'SAIX-NET', 'SAIX', 'ZA', 'South African Internet Exchange'),
(3741, 'IS-AS', 'Internet Solutions', 'ZA', 'Internet Solutions'),
-- 埃及
(36992, 'TE-AS', 'Telecom Egypt', 'EG', 'Telecom Egypt'),
-- 尼日利亚
(29465, 'MTN-NG', 'MTN Nigeria', 'NG', 'MTN Nigeria Communications Limited'),
-- 肯尼亚
(33771, 'SAFARICOM-LTD', 'Safaricom', 'KE', 'Safaricom Limited'),
-- 摩洛哥
(36903, 'IAM', 'Maroc Telecom', 'MA', 'Itissalat Al-Maghrib'),
-- 阿尔及利亚
(327690, 'ALGTELECOM', 'Algérie Télécom', 'DZ', 'Algérie Télécom'),
-- 突尼斯
(37605, 'TUNISIANA', 'Tunisiana', 'TN', 'Tunisiana'),
-- 加纳
(30994, 'MTN-GH', 'MTN Ghana', 'GH', 'MTN Ghana'),
-- 科特迪瓦
(30980, 'MTN-CI', 'MTN Côte d\'Ivoire', 'CI', 'MTN Côte d\'Ivoire');

-- 非洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 南非Internet Solutions
('2001:43f8::', 32, '6', 3741, 'ZA', '2003-03-18', 'AFRINIC'),
-- 埃及Telecom Egypt
('2001:1308::', 32, '6', 36992, 'EG', '2003-03-18', 'AFRINIC'),
-- 尼日利亚MTN
('2c0f:f530::', 32, '6', 29465, 'NG', '2010-06-07', 'AFRINIC'),
-- 肯尼亚Safaricom
('2c0f:f7a8::', 32, '6', 33771, 'KE', '2010-06-07', 'AFRINIC'),
-- 摩洛哥Maroc Telecom
('2001:1470::', 32, '6', 36903, 'MA', '2003-03-18', 'AFRINIC'),
-- 阿尔及利亚Algérie Télécom
('2c0f:feb0::', 32, '6', 327690, 'DZ', '2010-06-07', 'AFRINIC'),
-- 突尼斯Tunisiana
('2001:1570::', 32, '6', 37605, 'TN', '2003-03-18', 'AFRINIC'),
-- 加纳MTN
('2c0f:f9c0::', 32, '6', 30994, 'GH', '2010-06-07', 'AFRINIC'),
-- 科特迪瓦MTN
('2c0f:f9f0::', 32, '6', 30980, 'CI', '2010-06-07', 'AFRINIC');


-- 美洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 美国
(15169, 'GOOGLE', '谷歌', 'US', 'Google LLC'),
(32934, 'FACEBOOK', '脸书', 'US', 'Facebook, Inc.'),
(8075, 'MICROSOFT-CORP-MSN-AS-BLOCK', '微软', 'US', 'Microsoft Corporation'),
(16509, 'AMAZON-02', '亚马逊', 'US', 'Amazon.com, Inc.'),
(14618, 'AMAZON-AES', '亚马逊', 'US', 'Amazon Data Services NoVa'),
(13335, 'CLOUDFLARENET', 'Cloudflare', 'US', 'Cloudflare, Inc.'),
(20940, 'AKAMAI-ASN1', 'Akamai', 'US', 'Akamai Technologies, Inc.'),
(7018, 'ATT-INTERNET4', 'AT&T', 'US', 'AT&T Services, Inc.'),
(7922, 'COMCAST-7922', 'Comcast', 'US', 'Comcast Cable Communications, LLC'),
(701, 'UUNET', 'Verizon', 'US', 'Verizon Business'),
(174, 'COGENT-174', 'Cogent', 'US', 'Cogent Communications'),
(3356, 'LEVEL3', 'Level 3', 'US', 'Level 3 Parent, LLC'),
(6453, 'TATA-COMMUNICATIONS', 'Tata Communications', 'US', 'Tata Communications (America) Inc.'),
(2914, 'NTT-AMERICA', 'NTT America', 'US', 'NTT America, Inc.'),
-- 加拿大
(577, 'BCE-INC', 'Bell Canada', 'CA', 'Bell Canada'),
(812, 'ROGERS-CABLE', 'Rogers Communications', 'CA', 'Rogers Communications Inc.'),
(852, 'TELUS', 'Telus', 'CA', 'Telus Communications Inc.'),
(6327, 'SHAW', 'Shaw Communications', 'CA', 'Shaw Communications Inc.'),
(11260, 'EASTLINK', 'Eastlink', 'CA', 'Eastlink'),
-- 墨西哥
(28548, 'CABLEVISION-MX', 'Cablevisión', 'MX', 'Cablevisión, S.A. de C.V.'),
(13999, 'MEGA-CABLE', 'Mega Cable', 'MX', 'Mega Cable, S.A. de C.V.'),
(8151, 'TELMEX', 'Telmex', 'MX', 'Telmex'),
(11172, 'ALESTRA', 'Alestra', 'MX', 'Alestra, S. de R.L. de C.V.'),
-- 巴西
(4230, 'CLARO-SA', 'Claro S.A.', 'BR', 'Claro S.A.'),
(10429, 'TELEFONICA-BR', 'Vivo', 'BR', 'Telefônica Brasil S.A.'),
(8167, 'OI', 'Oi', 'BR', 'V tal'),
(26615, 'TIM-BRASIL', 'TIM Brasil', 'BR', 'TIM S/A'),
-- 阿根廷
(22927, 'TELEFONICA-AR', 'Telefónica Argentina', 'AR', 'Telefónica de Argentina'),
(7303, 'TELECOM-AR', 'Telecom Argentina', 'AR', 'Telecom Argentina S.A.'),
-- 哥伦比亚
(13489, 'CLARO-CO', 'Claro Colombia', 'CO', 'UNE EPM Telecomunicaciones S.A.'),
(3816, 'COLOMBIA-TELECOM', 'ETB', 'CO', 'Colombia Telecomunicaciones S.A. ESP'),
-- 秘鲁
(12252, 'CLARO-PE', 'Claro Peru', 'PE', 'América Móvil Perú S.A.C.'),
(6147, 'TELEFONICA-PE', 'Telefónica del Perú', 'PE', 'Telefónica del Perú S.A.A.'),
(21575, 'ENTEL-PE', 'Entel Peru', 'PE', 'Entel Perú S.A.'),
-- 智利
(18822, 'MOVISTAR-CL', 'Movistar Chile', 'CL', 'Manquehuenet'),
(27651, 'ENTEL-CL', 'Entel Chile', 'CL', 'Entel Chile S.A.'),
-- 委内瑞拉
(8048, 'CANTV', 'CANTV', 'VE', 'CANTV'),
(10393, 'CANTV-2', 'CANTV', 'VE', 'CANTV'),
-- 古巴
(27725, 'ETECSA', 'ETECSA', 'CU', 'Empresa de Telecomunicaciones de Cuba, S.A.'),
-- 多米尼加共和国
(64126, 'DOMINICAN-CABLE', 'Dominican Cable Group', 'DO', 'Dominican Cable Group DCG, S.R.L.'),
(28118, 'ALTICE-DO', 'Altice Dominicana', 'DO', 'Altice Dominicana S.A.'),
(46198, 'TRILOGY-DO', 'Trilogy Dominicana', 'DO', 'Trilogy Dominicana, S.A.'),
-- 波多黎各
(11992, 'LIBERTY-PR', 'Liberty Mobile', 'PR', 'Liberty Mobile Puerto Rico Inc.'),
(399291, 'PR-FIBER', 'Puerto Rico Fiber', 'PR', 'Puerto Rico Fiber Network Inc'),
(5786, 'UNIVERSITY-PR', 'University of Puerto Rico', 'PR', 'University of Puerto Rico');

-- 美洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 美国Google
('2001:4860::', 32, '6', 15169, 'US', '2005-03-01', 'ARIN'),
('2607:f8b0::', 32, '6', 15169, 'US', '2007-10-17', 'ARIN'),
-- 美国Facebook
('2a03:2880::', 32, '6', 32934, 'US', '2014-11-14', 'RIPE'),
('2620:0:1c00::', 48, '6', 32934, 'US', '2010-06-07', 'ARIN'),
-- 美国Microsoft
('2603:1000::', 40, '6', 8075, 'US', '2007-10-17', 'ARIN'),
('2603:2000::', 40, '6', 8075, 'US', '2007-10-17', 'ARIN'),
-- 美国Amazon
('2600:1f00::', 40, '6', 16509, 'US', '2007-10-17', 'ARIN'),
('2a05:d000::', 32, '6', 16509, 'US', '2014-11-14', 'RIPE'),
-- 美国Cloudflare
('2606:4700::', 32, '6', 13335, 'US', '2007-10-17', 'ARIN'),
('2a06:98c0::', 29, '6', 13335, 'US', '2010-06-07', 'RIPE'),
-- 美国Akamai
('2600:1400::', 35, '6', 20940, 'US', '2007-10-17', 'ARIN'),
('2a02:26f0::', 29, '6', 20940, 'US', '2010-06-07', 'RIPE'),
-- 美国AT&T
('2600:300::', 24, '6', 7018, 'US', '2007-10-17', 'ARIN'),
-- 美国Comcast
('2601::', 20, '6', 7922, 'US', '2007-10-17', 'ARIN'),
('2001:558::', 29, '6', 7922, 'US', '2003-03-18', 'ARIN'),
-- 美国Verizon
('2001:4868::', 32, '6', 701, 'US', '2003-03-18', 'ARIN'),
('2600:800::', 27, '6', 701, 'US', '2007-10-17', 'ARIN'),
-- 美国Cogent
('2001:550::', 32, '6', 174, 'US', '2003-03-18', 'ARIN'),
('2a09:54c1::', 32, '6', 174, 'US', '2014-11-14', 'RIPE'),
-- 美国Level 3
('2001:1900::', 32, '6', 3356, 'US', '2003-03-18', 'ARIN'),
('2606:840::', 32, '6', 3356, 'US', '2007-10-17', 'ARIN'),
-- 美国Tata Communications
('2001:5a0::', 32, '6', 6453, 'US', '2003-03-18', 'ARIN'),
-- 美国NTT America
('2001:218::', 32, '6', 2914, 'US', '2003-03-18', 'ARIN'),
-- 加拿大Bell
('2001:4958::', 32, '6', 577, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Rogers
('2605:8d80::', 32, '6', 812, 'CA', '2007-10-17', 'ARIN'),
-- 加拿大Telus
('2001:569::', 33, '6', 852, 'CA', '2003-03-18', 'ARIN'),
('2001:56a::', 33, '6', 852, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Shaw
('2001:4e8::', 32, '6', 6327, 'CA', '2003-03-18', 'ARIN'),
-- 加拿大Eastlink
('2604:1ec0::', 36, '6', 11260, 'CA', '2007-10-17', 'ARIN'),
('2607:a000::', 32, '6', 11260, 'CA', '2007-10-17', 'ARIN'),
-- 墨西哥Cablevisión
('2806:250:a::', 48, '6', 28548, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Mega Cable
('2806:203::', 32, '6', 13999, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Telmex
('2001:1208::', 32, '6', 8151, 'MX', '2003-03-18', 'LACNIC'),
('2806:1070::', 32, '6', 8151, 'MX', '2011-08-16', 'LACNIC'),
-- 墨西哥Alestra
('2801:c4:2a1::', 48, '6', 11172, 'MX', '2011-08-16', 'LACNIC'),
-- 巴西Claro
('2804:a8::', 32, '6', 4230, 'BR', '2011-08-16', 'LACNIC'),
-- 巴西Vivo
('2001:12e0:200::', 40, '6', 10429, 'BR', '2003-03-18', 'LACNIC'),
-- 巴西Oi
('2804:d50::', 28, '6', 8167, 'BR', '2011-08-16', 'LACNIC'),
-- 巴西TIM
('2804:20::', 32, '6', 26615, 'BR', '2011-08-16', 'LACNIC'),
-- 阿根廷Telefónica
('2800:380::', 32, '6', 22927, 'AR', '2011-08-16', 'LACNIC'),
-- 阿根廷Telecom
('2001:13d0::', 32, '6', 7303, 'AR', '2003-03-18', 'LACNIC'),
-- 哥伦比亚Claro
('2800:580::', 32, '6', 13489, 'CO', '2011-08-16', 'LACNIC'),
-- 哥伦比亚ETB
('2800:680::', 32, '6', 3816, 'CO', '2011-08-16', 'LACNIC'),
-- 秘鲁Claro
('2800:200::', 32, '6', 12252, 'PE', '2011-08-16', 'LACNIC'),
-- 秘鲁Telefónica
('2001:1388::', 32, '6', 6147, 'PE', '2003-03-18', 'LACNIC'),
-- 秘鲁Entel
('2803:7180:6000::', 36, '6', 21575, 'PE', '2011-08-16', 'LACNIC'),
-- 智利Movistar
('2800:8e0::', 48, '6', 18822, 'CL', '2011-08-16', 'LACNIC'),
-- 智利Entel
('2800:300:6220::', 44, '6', 27651, 'CL', '2011-08-16', 'LACNIC'),
-- 委内瑞拉CANTV
('2801:10::', 32, '6', 8048, 'VE', '2011-08-16', 'LACNIC'),
-- 古巴ETECSA
('2001:1358::', 32, '6', 27725, 'CU', '2003-03-18', 'LACNIC'),
-- 多米尼加共和国Dominican Cable
('2803:6de0::', 32, '6', 64126, 'DO', '2011-08-16', 'LACNIC'),
-- 多米尼加共和国Altice
('2803:a180::', 32, '6', 28118, 'DO', '2011-08-16', 'LACNIC'),
('2001:13f0::', 32, '6', 28118, 'DO', '2003-03-18', 'LACNIC'),



-- 大洋洲地区ASN和前缀
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
-- 澳大利亚
(4632, 'TELSTRA-MNS', 'Telstra Managed Network', 'AU', 'Telstra Corporation Ltd'),
(7474, 'SINGTEL-OPTUS', 'SingTel Optus', 'AU', 'SingTel Optus Pty Ltd'),
(18291, 'VODAFONE-AU', 'Vodafone Australia', 'AU', 'Vodafone Australia Pty Ltd'),
(1221, 'TELSTRA', 'Telstra', 'AU', 'Telstra Pty Ltd'),
(4766, 'SINGTEL', 'SingTel', 'SG', 'SingTel Optus Pty Ltd'),
-- 新西兰
(9500, 'ONE-NZ', 'One New Zealand', 'NZ', 'One New Zealand Group Limited'),
(9790, '2DEGREES', '2degrees', 'NZ', 'Two Degrees Networks Limited'),
(23752, 'VODAFONE-NZ', 'Vodafone NZ', 'NZ', 'Vodafone New Zealand Limited'),
-- 斐济
(17974, 'FINTEL', 'Fintel', 'FJ', 'Fiji International Telecommunications Limited'),
-- 巴布亚新几内亚
(17977, 'DIGICEL-PNG', 'Digicel PNG', 'PG', 'Digicel (PNG) Limited'),
-- 萨摩亚
(17976, 'DIGICEL-WS', 'Digicel Samoa', 'WS', 'Digicel (Samoa) Limited');

-- 大洋洲地区IPv6前缀
INSERT IGNORE INTO ip_prefixes (prefix, prefix_length, version, asn, country_id, allocation_date, registry) VALUES
-- 澳大利亚Telstra
('2001:8000::', 20, '6', 4632, 'AU', '2003-03-18', 'APNIC'),
('2401:8000::', 32, '6', 1221, 'AU', '2011-08-16', 'APNIC'),
-- 澳大利亚Optus
('2405:9000::', 32, '6', 7474, 'AU', '2011-08-16', 'APNIC'),
('2405:9000:a::', 48, '6', 7474, 'AU', '2011-08-16', 'APNIC'),
-- 澳大利亚Vodafone
('2405:6e00:f800::', 48, '6', 18291, 'AU', '2011-08-16', 'APNIC'),
('2405:6e00:200::', 40, '6', 18291, 'AU', '2011-08-16', 'APNIC'),
-- 新西兰One NZ
('2001:4400::', 30, '6', 9500, 'NZ', '2003-03-18', 'APNIC'),
('2407:7000::', 32, '6', 9500, 'NZ', '2011-08-16', 'APNIC'),
-- 新西兰2degrees
('2400:4800::', 32, '6', 9790, 'NZ', '2011-08-16', 'APNIC'),
('2403:c200::', 32, '6', 9790, 'NZ', '2011-08-16', 'APNIC'),
-- 新西兰Vodafone
('2406:e000::', 32, '6', 23752, 'NZ', '2011-08-16', 'APNIC'),
-- 斐济Fintel
('2404:4e00::', 32, '6', 17974, 'FJ', '2011-08-16', 'APNIC'),
-- 巴布亚新几内亚Digicel
('2404:5e00::', 32, '6', 17977, 'PG', '2011-08-16', 'APNIC'),
-- 萨摩亚Digicel
('2404:7e00::', 32, '6', 17976, 'WS', '2011-08-16', 'APNIC');