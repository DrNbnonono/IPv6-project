# 🌐 IPv6项目 - 开箱即用版

一个功能完整的IPv6网络扫描和分析平台，支持XMap扫描、ZGrab2探测和数据分析。

## ✨ 特性

- 🔍 **IPv6网络扫描** - 基于XMap的高性能IPv6扫描，支持网关MAC地址自动获取
- 🔬 **服务探测** - 集成ZGrab2进行深度服务分析
- 📊 **数据分析** - 可视化扫描结果和统计分析
- 🐳 **容器化部署** - 完全Docker化，开箱即用
- 🌍 **Web界面** - 现代化的前端管理界面
- ⚡ **一键部署** - 从Docker Hub直接拉取镜像，无需构建

## 🏗️ 架构设计

### 服务架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端服务      │    │   后端服务      │    │   本地MySQL     │
│ drnonono/ipv6-  │    │ drnonono/ipv6-  │    │   数据库        │
│ frontend:latest │    │ backend:latest  │    │   端口: 3306    │
│   端口: 5173    │    │   端口: 3000    │    │   (本地安装)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   XMap容器      │
                    │   liii/xmap     │
                    │   (网络扫描)    │
                    └─────────────────┘
```

### 技术栈
- **前端**: Vue 3 + Vite + Element Plus
- **后端**: Node.js + Express
- **数据库**: MySQL 8.0
- **扫描工具**: XMap (Docker镜像) + ZGrab2 (二进制文件)
- **容器化**: Docker + Docker Compose

## 📋 部署要求

### 系统要求
- **操作系统**: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- **内存**: 最少4GB，推荐8GB+
- **存储**: 最少10GB可用空间
- **网络**: 能够访问Docker Hub

### 软件依赖
- **Docker 20.10+**: 容器运行环境
- **Docker Compose 2.0+**: 服务编排
- **MySQL 8.0**: 本地安装并运行

## 🚀 快速开始

### 前置条件

#### 1. 安装Docker和Docker Compose

```bash
# 安装 Docker
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker  # 或重新打开终端

# Windows(docker desktop)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo usermod -aG docker $USER
newgrp docker  # 或重新打开终端

# 安装 Docker Compose
sudo apt update && sudo apt install -y docker-compose
```

#### 2. 安装MySQL

```bash
# 安装 MySQL
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# 设置 root 密码（交互式操作）
sudo mysql_secure_installation # 一直回车即可
```

#### 3.克隆项目并配置环境变量

```bash
# 克隆项目（替换为实际仓库URL）
git clone -b docker-main https://github.com/DrNbnonono/IPv6-project.git # 直接克隆对应分支
cd IPv6-project
wsl --shutdown # 仅Windows
wsl # 仅Windows

# 配置环境变量
vim .env 

#----------------------------------------.env关键配置---------------------------------------------------
# 重要：根据您的环境调整DB_HOST
# - Linux Docker: 172.25.0.1 (网关IP)
# - Docker Desktop (Windows/Mac): host.docker.internal
# - 本地开发: localhost
# - 自定义网络: 使用网关IP或宿主机IP
DB_HOST=host.docker.internal
DB_USER=linux_db
DB_PASSWORD=root  # 与MySQL设置一致

# 根据ip -6 addr show | grep "inet6.*global" | head -1 | awk '{print $2}' | cut -d'/' -f1结果调整
HOST_IPV6_ADDRESS=xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx
# 根据ip neigh结果调整
# 输出类似{IPv6_addr} dev eth0 lladdr {MAC_addr} router REACHABLE
HOST_GATEWAY_MAC=xx:xx:xx:xx:xx:xx

JWT_SECRET=H+sVGeiZkW9ImgHEAbBvaUG/7XyjUmHXq1oLWPLaTyvk1yBoEcb64gDVOhFVcVd1 # 请用命令openssl rand -base64 48重新随机生成一个安全的随机字符串
#----------------------------------------.env关键配置---------------------------------------------------
```

### 一键部署

```bash
# 赋予脚本执行权限
sudo su
chmod +x *.sh
sudo apt-get install dos2unix
dos2unix *.sh
dos2unix .env

# 快速部署
./deploy.sh deploy-remote
```

就这么简单！🎉 系统会自动：
- 创建默认配置
- 从Docker Hub拉取镜像
- 启动所有服务
- 进行健康检查

### 访问应用

部署完成后，访问：
- **前端界面**: http://localhost:5173
- **后端API**: http://localhost:3000

**默认登录账号:**
- 手机号: `13011122222`
- 密码: `admin`

## 🔧 管理命令

### 服务管理
```bash
# 查看服务状态
./deploy.sh status

# 查看日志
./deploy.sh logs backend    # 后端日志
./deploy.sh logs frontend   # 前端日志
./deploy.sh logs xmap       # XMap日志

# 停止服务
./deploy.sh stop

# 重启服务
./deploy.sh restart
```

### 更新升级
```bash
# 拉取最新镜像并重新部署
./deploy.sh deploy-remote

# 手动拉取镜像
docker pull drnonono/ipv6-backend:latest
docker pull drnonono/ipv6-frontend:latest
```

### 数据管理
```bash
# 备份数据
tar -czf ipv6-backup-$(date +%Y%m%d).tar.gz data/

# 查看数据目录
ls -la data/
```

### 故障排除
```bash
# 检查容器状态
docker ps -a

# 查看详细日志
docker logs ipv6-backend -f --tail 100
docker logs ipv6-frontend -f --tail 100

# 重新创建容器
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

## 📊 使用指南

### 1. 登录系统
- 访问 http://localhost:5173
- 使用默认账号登录：手机号 `13011122222`，密码 `admin`

### 2. 创建扫描任务
- 选择"XMap扫描"
- 输入IPv6地址或地址段（如：`2001::/64`）
- 配置扫描参数
- 启动扫描

### 3. 查看结果
- 在"扫描结果"页面查看实时进度
- 下载扫描报告
- 进行数据分析

### 4. 高级功能
- **ZGrab2扫描**: 对发现的IPv6地址进行服务探测
- **JSON分析**: 分析扫描结果中的结构化数据
- **文件管理**: 上传和管理扫描相关文件

## 🔍 故障排除

### 常见问题

#### 1. 端口冲突
```bash
# 检查端口占用
sudo netstat -tlnp | grep :5173
sudo netstat -tlnp | grep :3000

# 解决方案：修改.env文件中的端口配置
FRONTEND_PORT=8080
BACKEND_PORT=8000
```

#### 2. 权限问题
```bash
# 确保用户在docker组中
sudo usermod -aG docker $USER
newgrp docker

# 检查文件权限
sudo chown -R $USER:$USER ./data/
```

#### 3. 镜像拉取失败
```bash
# 检查网络连接
docker pull hello-world

# 配置Docker镜像加速器（中国用户）
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.1panel.live/"
  ]
}
EOF
sudo systemctl restart docker
```

#### 4. MySQL连接失败
```bash
# 检查MySQL状态
sudo systemctl status mysql

# 重启MySQL
sudo systemctl restart mysql

# 测试连接
mysql -u linux_db -p -e "SELECT 1;"

# 如果依旧失败，可能是端口错误，检查端口
sudo netstat -tulnp | grep 3306

# 或使用 ss 命令
sudo ss -tulnp | grep mysql

#如果发现其他服务（如旧的 MySQL 实例、Docker 容器或其他应用）占用了 `3306`，先终止它们
sudo systemctl stop mysql  # 如果 MySQL 已部分安装但未正确启动
sudo apt purge mysql-server mysql-client mysql-common
sudo rm -rf /etc/mysql /var/lib/mysql
sudo apt update
sudo apt install mysql-server

#如果仍冲突：修改 MySQL 默认端口
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
#在 `[mysqld]` 部分添加或修改：
port = 3307  # 改为其他未被占用的端口

#然后重启 MySQL：
sudo systemctl restart mysql
```
### 环境变量配置

如需自定义配置，编辑 `.env` 文件：

```bash
# 数据库配置
DB_HOST=localhost
DB_USER=linux_db
DB_PASSWORD=your_secure_password
DB_NAME=ipv6_project

# 应用配置
JWT_SECRET=your_jwt_secret_key
PROJECT_ROOT=/app

# 端口配置（可选）
FRONTEND_PORT=5173
BACKEND_PORT=3000
```

## 🔄 更新和维护

### 获取最新版本
```bash
# 拉取最新镜像
docker pull drnonono/ipv6-backend:latest
docker pull drnonono/ipv6-frontend:latest

# 重新部署
./deploy.sh deploy-remote
```

### 数据备份
```bash
# 备份数据目录
tar -czf ipv6-backup-$(date +%Y%m%d).tar.gz data/

# 备份数据库
mysqldump -u linux_db -p ipv6_project > ipv6_db_backup.sql
```

## 📞 技术支持

### 获取帮助
```bash
# 查看帮助信息
./deploy.sh help

# 检查服务状态
./deploy.sh status
```

### 常用检查命令
```bash
# 检查容器状态
docker ps

# 检查网络连接
curl http://localhost:3000/api/test
curl http://localhost:5173

# 查看系统资源
docker stats
```

## ⚠️ 重要提醒

**本项目包含网络扫描功能，请确保：**
1. 在合法合规的环境中使用
2. 遵守相关法律法规
3. 仅扫描自己拥有或授权的网络
4. 不要用于恶意攻击或未授权的网络探测

---

**🎉 享受IPv6网络扫描的乐趣！**

如有问题，请查看日志文件或提交Issue。
