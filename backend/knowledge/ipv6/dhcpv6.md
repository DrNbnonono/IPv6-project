# DHCPv6

> 本文是摘要，不是 RFC 原文，细节以 RFC 8415（取代 RFC 3315、3633 等）为准。

## 作用
DHCPv6 为客户端分配 IPv6 地址（有状态）、委派前缀，或只提供其他配置（无状态，如 DNS 服务器、域名后缀）。与 DHCPv4 不同，它**不提供默认网关**——默认路由来自路由器通告（RA）。

## 要点
- 传输：UDP，客户端端口 546，服务器/中继端口 547。客户端发往组播地址 `ff02::1:2`（所有 DHCP 中继代理和服务器）。
- 消息：Solicit（寻找服务器）→ Advertise → Request → Reply（四步）；有快速两步模式（Rapid Commit）；Renew / Rebind / Release / Decline / Information-Request 等。
- 标识：客户端和服务器各有 DUID（DHCP Unique Identifier）；IA_NA 表示非临时地址的集合，IA_TA 表示临时地址，**IA_PD** 用于**前缀委派**（路由器向 ISP 请求一段前缀再分给下游，如家庭路由器获得 /56 或 /60）。
- 与 RA 配合：RA 里的 M 标志指示“地址用 DHCPv6 获取”，O 标志指示“其他配置用 DHCPv6 获取”；SLAAC 与 DHCPv6 可以同时使用。
- 无状态 DHCPv6：客户端用 SLAAC 生成地址，只用 Information-Request 取 DNS 等配置。

## 对地址模式的影响
DHCPv6 服务器常从池中顺序分配地址，导致低位连续编号（`::1000`、`::1001`…），这类地址在扫描中容易通过密度扩展发现。SLAAC + 隐私地址的终端则几乎无法枚举。
