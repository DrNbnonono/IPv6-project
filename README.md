# ObserV6 - IPv6网络探测平台

一个功能完善的IPv6网络扫描和检测平台，支持XMap、ZGrab2探测，以及AI智能助手（Agent）功能。

## 功能特性

### 核心功能

- **XMap网络扫描** - IPv6地址活跃性检测
- **ZGrab2协议探测** - 端口和服务探测
- **检测平台** - 全球IPv6部署可视化分析
- **数据库管理** - 地址库管理和高级查询

### Agent智能助手

- **多LLM支持** - MiniMax、DeepSeek、OpenAI等多厂商适配
- **工具调用** - XMap、ZGrab2、知识问答、工作流生成
- **终端管理** - 集成Linux终端，支持命令执行
- **记忆系统** - 短期记忆（会话上下文）+ 长期记忆（用户偏好）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue.js 3, Vite, Pinia, Vue Router |
| 后端 | Node.js, Express.js |
| 数据库 | MySQL |
| 扫描工具 | XMap, ZGrab2 |
| AI | Agent系统（LLM抽象层） |

## 项目结构

```
IPv6_Project/
├── frontend/                    # 前端Vue.js应用
│   └── src/
│       ├── api/                # API接口封装
│       ├── components/          # Vue组件
│       │   ├── agent/          # Agent组件
│       │   ├── detection/       # 检测平台组件
│       │   └── ...
│       ├── router/             # 路由配置
│       ├── stores/              # Pinia状态管理
│       └── views/               # 页面视图
│
├── backend/                    # 后端Node.js应用
│   ├── controllers/            # 控制器
│   ├── services/               # 服务层
│   │   ├── agentService.js    # Agent核心
│   │   ├── llmService.js       # LLM服务
│   │   ├── memoryService.js    # 记忆服务
│   │   ├── toolService.js      # 工具服务
│   │   └── terminalService.js   # 终端服务
│   ├── routes/                 # API路由
│   └── ...
│
└── sql/                        # 数据库脚本
```

## 快速开始

### 环境要求

- Node.js >= 16
- MySQL >= 5.7
- Python >= 3.8 (用于数据处理脚本)

### 安装

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd frontend
npm install
```

### 配置

创建 `backend/.env` 文件：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ipv6_db

# JWT密钥
JWT_SECRET=your_jwt_secret

# AI配置 (MiniMax)
AI_PROVIDER=minimax
MINIMAX_API_KEY=your_api_key
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-Text-01
```

### 启动

```bash
# 启动后端 (端口3000)
cd backend
node app.js

# 启动前端 (端口5173)
cd frontend
npm run dev
```

访问 `http://localhost:5173/tools/agent` 使用Agent功能。

## Agent系统

### 工具列表

| 工具 | 描述 |
|------|------|
| XMap扫描 | IPv6地址活跃性检测 |
| ZGrab2探测 | 端口和服务探测 |
| 知识问答 | IPv6技术问题解答 |
| 工作流生成 | 自动生成探测工作流 |
| 终端命令 | 执行Linux系统命令 |

### API端点

```
Agent对话:
POST   /api/agent/chat              # 发送消息
GET    /api/agent/tools              # 工具列表
POST   /api/agent/tools/execute      # 执行工具

终端管理:
GET    /api/agent/terminals          # 终端列表
POST   /api/agent/terminal           # 创建终端
POST   /api/agent/terminal/execute   # 执行命令
DELETE /api/agent/terminal/:id        # 关闭终端

记忆管理:
GET    /api/agent/memory/summary     # 记忆摘要
DELETE /api/agent/memory              # 清空记忆
```

### 终端命令白名单

支持的命令包括：`nmap`, `ping`, `curl`, `wget`, `netstat`, `ss`, `traceroute`, `nslookup`, `dig`, `ifconfig`, `ip`, `ls`, `cat`, `grep`, `awk`, `sed` 等常用网络和系统命令。

## 前端路由

| 路径 | 页面 |
|------|------|
| `/detection-platform` | 检测平台主页 |
| `/detection/query` | IPv6高级查询 |
| `/tools/agent` | Agent助手 |
| `/tools/aichat` | AI探测助手 |
| `/tools/xmap` | XMap探测工具 |
| `/tools/zgrab2` | ZGrab2工具 |
| `/tools/workflows` | 工作流管理 |
| `/tools/database` | 数据库管理 |

## 数据库初始化

```bash
# 导入数据库表结构
mysql -u root -p ipv6_db < sql/init.sql
mysql -u root -p ipv6_db < sql/07-agent-memory.sql
```

## 开发指南

### 前端开发

```bash
cd frontend
npm run dev
```

组件使用PascalCase命名，状态管理使用Pinia。

### 后端开发

```bash
cd backend
node app.js
```

遵循MVC架构：路由 -> 控制器 -> 服务/数据库。

## License

MIT
