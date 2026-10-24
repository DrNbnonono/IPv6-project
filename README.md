# ObserV6 — IPv6 网络探测与观测平台

ObserV6 把 IPv6 的**主动探测**（XMap 活跃性扫描、ZGrab2 服务探测）、**数据沉淀**（国家 / ASN / 前缀 / 地址库）、**可视化分析**（全球部署与协议/漏洞分布）和 **AI Agent**（自然语言驱动的工具编排）放在同一个平台里。

> **合规声明**：本平台包含主动扫描能力。只能对**你拥有或获得书面授权**的网络和地址使用。开发与测试阶段不对外部网络发起扫描；Agent 发起的扫描、终端命令一律需要用户在界面上显式确认。

## 功能

| 模块 | 说明 | 页面 |
|---|---|---|
| 检测平台 | 全球 IPv6 地址分布地图、国家 / ASN 排名、协议与漏洞统计（公开浏览） | `/detection-platform` |
| 高级查询 | 按条件组合查询地址库（经 SQL 守卫与查询构建器，参数化） | `/detection/query` |
| XMap 扫描 | 创建 / 取消 / 查看扫描任务，白名单管理，日志与结果下载 | `/tools/xmap` |
| ZGrab2 探测 | 多模块服务探测，支持地址列表或已上传输入文件 | `/tools/zgrab2` |
| 工作流 | 可视化编排 XMap → ZGrab2 的探测流程，执行 / 暂停 / 恢复 / 取消 | `/tools/workflows` |
| 数据库管理 | 国家、ASN、前缀、协议、漏洞的增删改与批量导入（管理员） | `/tools/database` |
| 文件与 JSON 分析 | 上传扫描输出，解析并提取字段 | `/tools/files`、`/tools/jsonanalysis` |
| Agent | 多厂商 LLM + 工具调用 + 受限终端 + 记忆 | `/tools/agent` |
| AI 问答 | 检测平台内的 IPv6 专家问答 | 检测平台页内 |

## 架构

```
浏览器 ──► nginx（容器）/ Vite 代理（开发）
              │  /api/*
              ▼
        Express 后端 ── routes → controllers → services → mysql2 ──► MySQL 8
              │
              ├── xmap / zgrab2（子进程，execFile，无 shell 拼接）
              ├── 文件数据目录（PROJECT_ROOT 下：扫描结果、日志、白名单、上传）
              └── LLM 提供商（MiniMax / DeepSeek / OpenAI / 硅基流动 / 自定义）
```

- **分层**：路由只做鉴权与分发；控制器处理请求与响应（统一 `{ success, message, data }`）；服务层放业务逻辑；所有 SQL 走 `database/db.js` 的连接池。
- **前端**：Vue 3 + Pinia + Element Plus + Vite；所有 HTTP 请求统一经 `src/api/index.js`（`VITE_API_BASE_URL`，默认 `/api`，自动附带 Bearer token，401 自动登出）。
- **任务**：扫描任务先写入 `tasks` 表（`pending`），由 `schedulerService` 按并发上限拉起进程；`taskService` 负责状态流转（终态不可覆盖）和服务重启后的对账。
- **Agent**：`agentService` 做意图识别与编排，`llmService` 屏蔽厂商差异，`toolService` 注册工具，`memoryService` 管理短期 / 长期记忆，`terminalService` + `terminalPolicyService` 提供受限终端。

## 目录结构

```
.
├── backend/
│   ├── app.js                  入口：中间件、路由挂载、/api/health
│   ├── routes/ controllers/    按模块一一对应（xmap、zgrab2、agent、database …）
│   ├── services/               业务与基础设施（见下表）
│   ├── middleware/             auth（authenticate / requireAdmin）、rateLimit
│   ├── database/db.js          mysql2 连接池
│   ├── scripts/                migrate、createAdmin、checkDb、migratePasswords、rebaseStoredPaths
│   ├── tests/                  jest + supertest
│   └── Dockerfile
├── frontend/
│   ├── src/api/                统一 HTTP 客户端
│   ├── src/stores/             Pinia（auth、xmap …）
│   ├── src/views/ components/  页面与组件
│   ├── Dockerfile  nginx.conf
├── sql/                        增量迁移与历史脚本（约定见 sql/README.md）
├── structure.sql               最新全量表结构（仅用于新库）
├── docker-compose.yml          mysql → migrate → backend → frontend
├── docker-compose.scanner.yml  可选：带 xmap / zgrab2 的叠加层
└── .github/workflows/ci.yml
```

`backend/services/` 里的关键文件：

| 文件 | 作用 |
|---|---|
| `storageService.js` | 数据目录根（`PROJECT_ROOT`）、各子目录常量、`safeJoin` 防路径穿越 |
| `xmapCommandService.js` / `zgrab2CommandService.js` | 构造扫描命令行（参数白名单，`execFile` 调用） |
| `sqlGuardService.js` / `queryBuilderService.js` | 高级查询的 SQL 守卫与参数化构建 |
| `terminalPolicyService.js` / `terminalService.js` | 终端命令白名单、参数规则、目录范围（`TERMINAL_JAIL_ROOT`）、会话 |
| `agentService.js` / `llmService.js` / `toolService.js` / `memoryService.js` | Agent 编排、LLM 抽象、工具注册、记忆 |
| `taskService.js` / `schedulerService.js` | 任务记录与状态流转、启动对账；按并发上限调度 pending 任务 |
| `workflowEngine.js` | 工作流执行引擎 |
| `loggerService.js` | 统一日志（winston），自动脱敏 token / 密码 / Authorization / API Key |

## 快速开始

### 方式一：Docker（推荐用于部署）

```bash
cp .env.docker.example .env      # 填写 MYSQL_ROOT_PASSWORD、DB_PASSWORD、JWT_SECRET（openssl rand -hex 32）
mkdir -p docs                    # 帮助文档目录，可先留空
docker compose up -d --build
docker compose ps                # 等 backend / frontend 变为 healthy

# 创建第一个管理员（密码经环境变量传入，不要写在命令行参数里）
docker compose exec -e ADMIN_PASSWORD='至少8位的强密码' backend node scripts/createAdmin.js 13800000000 管理员
```

访问 `http://<服务器>:8080`。升级、备份、扫描叠加层、HTTPS 等见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。

### 方式二：本地开发

要求：Node.js 22、MySQL 8（`structure.sql` 使用 `utf8mb4_0900_ai_ci`，MariaDB 不兼容）。

```bash
# 1. 后端配置
cd backend
cp .env.example .env             # 至少填 DB_PASSWORD、JWT_SECRET
npm ci

# 2. 建库（顺序很重要，详见 sql/README.md）
mysql -u root -p -e "CREATE DATABASE ipv6_project CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root -p ipv6_project < ../structure.sql      # 只能用于新库
npm run db:migrate                                    # 增量迁移（sql/NN-*.sql，NN ≥ 08）
ADMIN_PASSWORD='至少8位的强密码' node scripts/createAdmin.js 13800000000 管理员
npm run db:check                                      # 自检

# 3. 启动
npm run dev                      # 后端，默认 3000
cd ../frontend && npm ci && npm run dev    # 前端，默认 5173，/api 代理到 localhost:3000
```

已有数据库不需要重建，只需 `npm run db:migrate`。

## 配置

后端读取 `backend/.env`（模板：`backend/.env.example`）；Docker 读取仓库根目录 `.env`（模板：`.env.docker.example`）。

| 变量 | 默认 | 说明 |
|---|---|---|
| `JWT_SECRET` | — | **必填**，未配置时服务无法启动，没有默认值 |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `localhost` `3306` — — `ipv6_project` | 数据库连接 |
| `PORT` `LISTEN_HOST` | `3000` `::` | 监听端口与地址（不支持 IPv6 的环境自动回退 `0.0.0.0`） |
| `CORS_ORIGINS` | 放行全部 | 允许的前端来源，逗号分隔；**生产务必设置** |
| `TRUST_PROXY` | 不信任 | 位于反向代理之后时设为代理层数，使限流按真实 IP 统计 |
| `BODY_LIMIT` `LARGE_BODY_LIMIT` | `2mb` `50mb` | 请求体上限（后者用于 `/api/jsonanalysis`） |
| `LOGIN_RATE_MAX` `LOGIN_RATE_WINDOW_MIN` `API_RATE_MAX` | `10` `15` `600` | 登录失败 / 全局限流 |
| `AI_RATE_MAX` `AI_MESSAGE_MAX_CHARS` | `20` `2000` | 公开 AI 问答的每 IP 每分钟次数与问题长度 |
| `PROJECT_ROOT` | 仓库根目录 | 数据目录根（`xmap_result`、`zgrab2_*`、`whitelists`、`backend_logs` 等都在其下） |
| `TERMINAL_JAIL_ROOT` | 仓库根目录 | 终端可访问的目录范围 |
| `MAX_CONCURRENT_XMAP` `MAX_CONCURRENT_ZGRAB2` `MAX_CONCURRENT_PER_USER` | `2` `4` `3` | 任务并发上限：创建任务只是入队，调度器按上限启动，超出的排队（`pending`） |
| `XMAP_BIN` `XMAP_USE_SUDO` `ZGRAB2_BIN` | `xmap` `true` — | 扫描工具位置；容器内用 file capabilities 时 `XMAP_USE_SUDO=false` |
| `AI_PROVIDER` 及各厂商 `*_API_KEY` `*_MODEL` `*_BASE_URL` | `minimax` | LLM 提供商与密钥，详见 `.env.example` |
| `LOG_LEVEL` | `info` | `error / warn / info / debug`；调试输出为 debug 级别 |
| `BCRYPT_ROUNDS` `ALLOW_LEGACY_PASSWORDS` | `10` `true` | 密码哈希强度；执行 `scripts/migratePasswords.js` 后请设为 `false` |

## 接口概览

统一前缀 `/api`，响应格式 `{ success, message, data }`。除下面标注为公开的，均需 `Authorization: Bearer <token>`（`POST /api/auth/login` 获取）；写操作类的管理接口需要管理员。

| 前缀 | 内容 | 访问 |
|---|---|---|
| `/health` | 健康检查（含数据库连通） | 公开 |
| `/auth` | 登录 | 公开（失败限流） |
| `/addresses` | 地图、国家 / ASN 排名、协议与漏洞统计、地址检索 | 统计公开，地址详情需登录 |
| `/ai` | 检测平台 AI 问答 | 公开（专用限流 + 长度上限） |
| `/xmap` | 扫描任务、白名单、日志、结果 | 登录 |
| `/zgrab2` | 探测任务、模块、日志、结果 | 登录 |
| `/workflows` | 工作流 CRUD、执行与控制 | 登录 |
| `/agent` | 对话、工具、终端、记忆 | `status` / `welcome` 公开，其余登录；有副作用的工具需 `confirmed: true` |
| `/database` | 统计、高级查询、国家 / ASN / 前缀 / 协议 / 漏洞管理、导入 | 查询登录；增删改与批量更新需管理员 |
| `/files` `/jsonanalysis` | 文件、JSON 解析 | 登录 |
| `/docs` | 帮助文档 | 读取公开，编辑需管理员 |

## 安全设计

- **鉴权**：JWT + bcrypt；`authenticate` / `requireAdmin` 在路由层声明；`tests/routeGuards.test.js` 校验数据库管理与文档编辑的写接口都挂有 `requireAdmin`。
- **输入**：SQL 经 `sqlGuardService` 与 `queryBuilderService`（参数化）；文件路径经 `safeJoin`，不接受穿越；扫描参数走白名单，子进程用 `execFile`，不经过 shell。
- **Agent**：大模型发起的工具调用**永远**以未确认状态执行，只有用户在界面上点击确认（`/agent/tools/execute`，严格 `confirmed === true`）才会真正运行扫描或终端命令。
- **终端**：命令白名单 + 每个命令的参数规则 + 目录范围（`TERMINAL_JAIL_ROOT`）；不含 `rm`、`mv`、`sed`、`awk`、`find`、`wget` 等；超时上限 5 分钟，输出有缓冲上限。
- **传输与限流**：helmet、`CORS_ORIGINS`、请求体限制、登录 / 全局 / AI 三级限流。
- **日志**：统一经 `loggerService`，自动遮蔽 token、密码、Authorization、Cookie、API Key；数据库连接失败只记录 `user@host:port/db`，不记录密码。
- **容器**：后端非 root 运行；不使用 `privileged`、不挂载 `docker.sock`、不使用 `NOPASSWD` sudo、不把 `.env` 打进镜像；扫描能力仅通过 file capabilities 授予 xmap 一个可执行文件。

## 测试与 CI

```bash
cd backend && npm test               # jest + supertest
cd backend && npm run test:coverage  # 附覆盖率；services/ 按文件设有下限门槛
cd frontend && npm run build
```

GitHub Actions（`.github/workflows/ci.yml`）每次推送运行四项检查：

1. 后端测试（含覆盖率门槛）
2. **建库与迁移（MySQL 8.0）**：`structure.sql` → `migrate.js` ×2（验证幂等）→ `createAdmin.js` → `checkDb.js`
3. 前端构建
4. **容器构建与启动**：构建全部镜像与扫描叠加层、`compose up --wait`、冒烟（健康检查、首页、未登录 401、后端非 root）

## 开发约定

- 后端 CommonJS；控制器写作 `exports.xxx = async (req, res) => {}`；日志用 `createModuleLogger('模块名')`，不要直接 `console.log`。
- 新增数据库变更：写 `sql/NN-名称.sql`（NN 递增、可重复执行），**不要修改已执行过的迁移**（checksum 会拦截）；同时更新 `structure.sql`。
- 前端所有请求走 `src/api/index.js` 里的 `api.*`，不要在组件里直接 `axios`（也不要把 token 发给第三方域名）。
- 运行期数据（`xmap_result`、`zgrab2_*`、`whitelists`、`backend_logs` 等）已在 `.gitignore`，不要提交。
- 每个独立改动一个提交，提交信息说明动机与验证方式。

## 路线图

升级计划分阶段推进：基础整顿（日志、路径、请求层、建库、容器、测试，已完成）→ 任务服务与调度 → 扫描策略（默认拒绝的授权范围）→ 数据管线与观测 → Agent 深化。细节见项目中的《ObserV6 升级计划》。

## 许可证

原 README 声明为 MIT，但仓库中目前没有 `LICENSE` 文件，待项目负责人确认后补上。
