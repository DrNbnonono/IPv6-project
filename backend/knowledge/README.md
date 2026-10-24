# Agent 知识库

这个目录里的 `.md` / `.txt` 文档会被 `npm run knowledge:index`（`node scripts/indexKnowledge.js`）切块写入 `knowledge_chunks` 表（需先执行迁移 `sql/14-knowledge-chunks.sql`），Agent 的“知识问答”先检索这些资料再回答，并给出出处。

## 目录

| 目录 | 内容 |
|---|---|
| `ipv6/` | IPv6 协议与测量方面的知识摘要（RFC 编号在标题里，**摘要不是原文，细节以 RFC 为准**） |
| `platform/` | 本平台（ObserV6）的功能、使用方式和合规策略 |
| `findings/` | 项目自己的实验结论。把你的结论按模板写成 `.md` 放进来，重新索引即可被检索到 |

`README.md` 不会被索引。另外会索引 `docs/xmap`、`docs/zgrab2`（如果存在），`KNOWLEDGE_EXTRA_DIRS` 可以追加目录。

## 写文档的建议

- 一个文件一个主题，用 `#` / `##` 标题分节；每节自成一体（检索按节切块，一块约 800 字）。
- 检索是中文 2 字切分的全文检索，**不理解同义词**：常用的叫法都写进正文（如“邻居发现（NDP）”“无状态地址自动配置（SLAAC）”）。
- 写明数据来源和时间；没有验证过的结论要写“未验证”。
- 不要放密钥、内部地址、未公开的漏洞细节。
