# ObserV6 开放只读 API

ObserV6 提供一组只读的 HTTP 接口，供合作方或展示页读取统计数据。接口前缀是 `/api/open/v1`，只支持 `GET`。

## 获取密钥

密钥由管理员在“管理 → API 密钥”页面创建（或调用 `POST /api/admin/api-keys`）。创建时选择权限范围：

- `stats`：国家 / ASN / 前缀级统计和趋势。默认只给这一项。
- `addresses`：另外允许按前缀读取完整的活跃地址。需要管理员明确勾选。

明文密钥形如 `ov6_…`，只在创建时显示一次；服务器只保存它的 SHA-256，丢失后只能吊销重发。可以给密钥设置每分钟请求上限和过期时间。

## 使用方式

在请求头里带上密钥，二选一（不支持放在 URL 里，URL 会进入访问日志）：

```
Authorization: Bearer ov6_xxxxxxxx
X-API-Key: ov6_xxxxxxxx
```

```
curl -H "Authorization: Bearer $KEY" https://<host>/api/open/v1/stats/global
```

响应统一为 `{ "success": true, "data": … }`；出错时 `{ "success": false, "message": … }`，状态码 400（参数错误）、401（密钥缺失/无效/过期/吊销）、403（缺少权限）、404、429（超过限流）、503（尚未启用）。

## 限流

每把密钥每分钟的请求数有上限，默认 60（环境变量 `OPEN_API_RATE_PER_MIN`，密钥上可单独设置）。响应头 `X-RateLimit-Limit` / `X-RateLimit-Remaining` 给出上限和剩余次数；超限时返回 429 和 `Retry-After`（秒）。

## 接口

| 接口 | 权限 | 说明 |
|---|---|---|
| `GET /` | 任意有效密钥 | 返回版本、当前密钥的名称和权限、接口清单 |
| `GET /stats/global` | stats | 国家数、ASN 数、前缀总数、活跃地址总数 |
| `GET /stats/countries?limit=&sort=` | stats | 国家排名；`limit` 1–300（默认 50），`sort` 取 `addresses`（默认）或 `prefixes` |
| `GET /stats/countries/:code` | stats | 单个国家（两位代码，如 `CN`）及其前 10 个 ASN |
| `GET /stats/asns/:asn` | stats | 单个 ASN（`4134` 或 `AS4134`） |
| `GET /trends?scope=&id=&days=` | stats | 每日快照趋势；`scope` 取 `global`（默认）、`country`（`id` 为国家代码）、`asn`（`id` 为 AS 号）；`days` 1–730（默认 30） |
| `GET /prefixes?asn=&country=&page=&pageSize=` | stats | IPv6 前缀列表（含 `prefixId`），`pageSize` 最大 200 |
| `GET /addresses?prefixId=&limit=&after=` | addresses | 某个前缀下的完整地址；`limit` 最大 1000；用响应里的 `nextAfter` 作为下一页的 `after`，`nextAfter` 为 `null` 表示读完 |

## 数据说明

- 统计数字来自平台已有的汇总计数，趋势来自每天一次的快照；刚启用时趋势没有数据点，要隔几天才有曲线。
- 地址列表是按前缀的游标分页，没有全局“导出全部地址”的接口。
- 密钥拥有者不应转发或公开完整地址；对公网开放前，管理员应再确认一次数据范围。
