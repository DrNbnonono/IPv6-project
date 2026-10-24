# ObserV6 的 MCP 接口

ObserV6 通过 Model Context Protocol（MCP）向外部 Agent / 客户端（Claude Desktop、Claude Code、自己写的 Agent 等）提供**只读**的统计查询能力。

## 设计原则

- **只读**：所有工具都标注 `readOnlyHint`，不能发起扫描、写库或修改配置。平台内部有副作用的工具靠“用户在界面里确认”兜底，MCP 调用方没有这一步，所以不开放。
- **认证与权限复用开放 API 的密钥**：密钥由管理员在“管理 → API 密钥”创建，权限范围 `stats` / `addresses` 的含义不变。没有权限的工具不会出现在工具列表里。
- **限流与开放 API 共用计数**：每把密钥每分钟的请求数上限（默认 60，`OPEN_API_RATE_PER_MIN`，密钥上可单独设置）；MCP 的每个 HTTP 请求算一次。
- **审计**：每次工具调用写一条审计（`mcp.tool`，资源为密钥 ID，记录工具名与参数，不记录返回内容），管理员可在审计日志里按“mcp”查看。

## 接入方式

### 远程（HTTP）

地址 `https://<host>/api/mcp`，无状态 Streamable HTTP，只接受 `POST`。密钥放在请求头（不能放在 URL 里）：

```
Authorization: Bearer ov6_xxxxxxxx      或      X-API-Key: ov6_xxxxxxxx
```

Claude Code 示例：

```
claude mcp add --transport http observ6 https://<host>/api/mcp --header "Authorization: Bearer ov6_xxxxxxxx"
```

其他客户端按各自的“远程 MCP / Streamable HTTP”配置填写地址与请求头即可。

### 本机（stdio）

在部署后端的机器上，让客户端启动 `node backend/scripts/mcpStdio.js`，直接读取该机 `.env` 里配置的数据库。Claude Desktop 的 `claude_desktop_config.json` 示例：

```json
{
  "mcpServers": {
    "observ6": {
      "command": "node",
      "args": ["/path/to/IPv6-project/backend/scripts/mcpStdio.js"]
    }
  }
}
```

stdio 没有密钥，权限范围由环境变量 `MCP_STDIO_SCOPES` 决定（逗号分隔，默认只有 `stats`；要读取完整地址需显式设为 `stats,addresses`）。日志只写 stderr，不会污染协议输出。

## 工具

| 工具 | 权限 | 说明 |
|---|---|---|
| `get_global_stats` | stats | 国家数、ASN 数、前缀数、活跃地址数与更新时间 |
| `list_countries` | stats | 国家排行（`limit` 1–300，`sort` = `addresses` / `prefixes`） |
| `get_country` | stats | 单个国家及其前 10 个 ASN（`code` 两位国家代码） |
| `get_asn` | stats | 单个 ASN（`4134` 或 `AS4134`） |
| `get_trends` | stats | 每日快照趋势（`scope` = `global` / `country` / `asn`，`id`，`days`） |
| `list_prefixes` | stats | 分页列出 IPv6 前缀，可按 `asn`、`country` 过滤 |
| `search_knowledge` | stats | 在平台知识库里全文检索（需迁移 14 与 `npm run knowledge:index`） |
| `get_probe_info` | stats | 运营方公开的探测来源地址、联系邮箱与退出渠道 |
| `list_addresses` | addresses | 某个前缀下的完整活跃地址，游标分页，单次最多 200 条 |

参数的取值范围与 `/api/open/v1` 完全一致（同一套校验代码）；出错时工具返回 `isError`，并给出原因（如“国家不存在”）。

## 数据说明

- 数据来自平台数据库的汇总计数和每日快照，不是实时扫描结果。
- 与开放 API 一样，密钥拥有者不应转发或公开完整地址；对公网开放前，管理员应再确认一次数据范围。
