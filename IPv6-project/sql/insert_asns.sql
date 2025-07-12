-- 插入ASN数据（来自全球主要网络运营商）
INSERT IGNORE INTO asns (asn, as_name, as_name_zh, country_id, organization) VALUES
(4134, 'CHINANET-BACKBONE', '中国电信骨干网', 'CN', 'China Telecom'),
(4808, 'CHINA169-BACKBONE', '中国联通骨干网', 'CN', 'China Unicom'),
(4837, 'CHINA169-BACKBONE', '中国联通骨干网', 'CN', 'China Unicom'),
(4538, 'ERX-CERNET-BKB', '中国教育和科研计算机网', 'CN', 'CERNET Center'),
(37963, 'ALIBABA-CN-NET', '阿里巴巴网络', 'CN', 'Alibaba (China) Technology Co., Ltd.'),
(45090, 'TENCENT-NET-AP', '腾讯云', 'CN', 'Tencent Cloud Computing'),
(56040, 'CMNET', '中国移动', 'CN', 'China Mobile Communications Corporation'),
(9808, 'CMNET', '中国移动', 'CN', 'China Mobile Communications Corporation'),

(15169, 'GOOGLE', '谷歌', 'US', 'Google LLC'),
(32934, 'FACEBOOK', '脸书', 'US', 'Facebook, Inc.'),
(8075, 'MICROSOFT-CORP-MSN-AS-BLOCK', '微软', 'US', 'Microsoft Corporation'),
(16509, 'AMAZON-02', '亚马逊', 'US', 'Amazon.com, Inc.'),
(14618, 'AMAZON-AES', '亚马逊', 'US', 'Amazon Data Services NoVa'),
(13335, 'CLOUDFLARENET', 'Cloudflare', 'US', 'Cloudflare, Inc.'),
(20940, 'AKAMAI-ASN1', 'Akamai', 'US', 'Akamai Technologies, Inc.'),

(2914, 'NTT-COMMUNICATIONS-2914', 'NTT通信', 'JP', 'NTT Communications Corporation'),
(4713, 'OCN-NTT', 'NTT OCN', 'JP', 'NTT Communications Corporation'),
(17676, 'SOFTBANK', '软银', 'JP', 'SoftBank Corp.'),

(3215, 'ORANGE', 'Orange', 'FR', 'Orange S.A.'),
(3320, 'DTAG', '德国电信', 'DE', 'Deutsche Telekom AG'),
(3356, 'LEVEL3', 'Level 3', 'US', 'Level 3 Parent, LLC'),
(1299, 'TELIANET', 'Telia', 'SE', 'Telia Company AB'),
(6830, 'LIBERTY-GLOBAL', 'Liberty Global', 'GB', 'Liberty Global B.V.'),
(2856, 'BT-UK-AS', '英国电信', 'GB', 'British Telecommunications PLC'),

(4760, 'KIXS-AS-KR', '韩国电信', 'KR', 'Korea Telecom'),
(9318, 'SKB-AS', 'SK宽带', 'KR', 'SK Broadband Co Ltd'),
(3786, 'LG-DACOM', 'LG U+', 'KR', 'LG DACOM Corporation'),

(9498, 'BHARTI-MOBILE', 'Bharti Airtel', 'IN', 'Bharti Airtel Ltd.'),
(45609, 'RELIANCEJIO-IN', 'Reliance Jio', 'IN', 'Reliance Jio Infocomm Limited'),
(558, 'RELIANCE-COMMUNICATIONS-IN', 'Reliance通信', 'IN', 'Reliance Communications Ltd.'),

(2516, 'KDDI', 'KDDI', 'JP', 'KDDI CORPORATION'),
(2497, 'IIJ', 'Internet Initiative Japan', 'JP', 'Internet Initiative Japan Inc.'),
(4713, 'OCN-NTT', 'NTT OCN', 'JP', 'NTT Communications Corporation'),

(3462, 'HINET', '中华电信', 'TW', 'Chunghwa Telecom Co., Ltd.'),
(9924, 'TWNIC-TW', '台湾网络信息中心', 'TW', 'Taiwan Network Information Center'),
(18182, 'FETNET', '远传电信', 'TW', 'Far EasTone Telecommunications Co., Ltd.'),

(7545, 'TPG-TELECOM', 'TPG电信', 'AU', 'TPG Telecom Limited'),
(1221, 'TELSTRA', '澳洲电信', 'AU', 'Telstra Pty Ltd'),
(4766, 'SINGTEL', '新加坡电信', 'SG', 'SingTel Optus Pty Ltd');