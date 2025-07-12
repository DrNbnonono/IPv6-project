-- 插入特定协议相关的漏洞
INSERT IGNORE INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method, published_date) VALUES
('CVE-2022-22965', 'Spring4Shell漏洞', 'Spring Framework中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2022-03-31'),
('CVE-2021-34527', 'PrintNightmare漏洞', 'Windows Print Spooler服务中的远程代码执行漏洞', 'critical', 'SMB', '网络扫描', '2021-07-01'),
('CVE-2021-26855', 'Exchange Server漏洞', 'Microsoft Exchange Server中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2021-03-02'),
('CVE-2020-1350', 'SIGRed漏洞', 'Windows DNS服务器中的远程代码执行漏洞', 'critical', 'DNS', '网络扫描', '2020-07-14'),
('CVE-2019-19781', 'Citrix ADC漏洞', 'Citrix ADC和Gateway中的远程代码执行漏洞', 'critical', 'HTTP,HTTPS', '应用扫描', '2019-12-17'),
('CVE-2019-0708', 'BlueKeep漏洞', 'Windows远程桌面服务中的远程代码执行漏洞', 'critical', 'RDP', '网络扫描', '2019-05-14'),
('CVE-2018-13379', 'Fortinet VPN漏洞', 'Fortinet VPN中的路径遍历漏洞', 'high', 'HTTPS', '应用扫描', '2018-07-30'),
('CVE-2017-0144', 'EternalBlue漏洞', 'Windows SMB服务器中的远程代码执行漏洞', 'critical', 'SMB', '网络扫描', '2017-03-14'),
('CVE-2016-6277', 'OpenSSH漏洞', 'OpenSSH服务器中的拒绝服务漏洞', 'high', 'SSH', '网络扫描', '2016-08-01'),
('CVE-2015-7547', 'glibc DNS漏洞', 'glibc库中的DNS解析漏洞', 'high', 'DNS', '应用扫描', '2015-02-16');

-- 插入漏洞数据
INSERT IGNORE INTO vulnerabilities (cve_id, name, description, severity, affected_protocols, detection_method, published_date) VALUES
('CVE-2022-23093', 'IPv6 路由头处理漏洞', 'IPv6路由头处理中的缓冲区溢出漏洞，可能导致远程代码执行', 'critical', 'IPv6', '网络扫描', '2022-01-15'),
('CVE-2021-44228', 'Log4Shell漏洞', '影响Java Log4j库的远程代码执行漏洞，可通过IPv6地址触发', 'critical', 'HTTP,HTTPS', '应用扫描', '2021-12-10'),
('CVE-2020-16898', 'IPv6 ICMPv6 NDP漏洞', 'Windows TCP/IP实现中的远程代码执行漏洞，通过ICMPv6路由器广告触发', 'high', 'ICMPv6', '网络扫描', '2020-10-13'),
('CVE-2020-13112', 'IPv6分片处理漏洞', 'Linux内核IPv6实现中的分片处理漏洞，可能导致拒绝服务', 'medium', 'IPv6', '网络扫描', '2020-05-20'),
('CVE-2019-5597', 'IPv6 DHCPv6客户端漏洞', 'DHCPv6客户端中的缓冲区溢出漏洞，可能导致远程代码执行', 'high', 'DHCPv6', '网络扫描', '2019-07-17'),
('CVE-2018-5391', 'IPv6分段重组漏洞', '操作系统IPv6实现中的分段重组漏洞，可能导致拒绝服务攻击', 'medium', 'IPv6', '网络扫描', '2018-08-06'),
('CVE-2018-17463', 'IPv6隧道实现漏洞', 'IPv6隧道实现中的安全漏洞，可能导致信息泄露', 'medium', 'IPv6', '网络扫描', '2018-09-25'),
('CVE-2017-9022', 'IPv6扩展头处理漏洞', '网络设备中IPv6扩展头处理漏洞，可能导致拒绝服务', 'high', 'IPv6', '网络扫描', '2017-05-18'),
('CVE-2016-1409', 'IPv6邻居发现协议漏洞', 'IPv6邻居发现协议实现中的漏洞，可能导致拒绝服务', 'high', 'ICMPv6', '网络扫描', '2016-03-23'),
('CVE-2015-8631', 'IPv6地址解析漏洞', 'IPv6地址解析中的漏洞，可能导致信息泄露', 'medium', 'IPv6', '应用扫描', '2015-12-15');