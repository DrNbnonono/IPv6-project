# IPv6项目Docker部署指南

## 🚀 一键部署方案

### 方案1: Docker Hub发布（推荐）
```bash
# 1. 构建镜像
docker build -t your-username/ipv6-project:latest .

# 2. 推送到Docker Hub
docker login
docker push your-username/ipv6-project:latest

# 3. 用户一键部署
curl -sSL https://raw.githubusercontent.com/your-repo/IPv6-project/main/quick-deploy.sh | bash
```

### 方案2: 私有仓库发布
```bash
# 1. 搭建私有仓库
docker run -d -p 5000:5000 --name registry registry:2

# 2. 构建并推送
docker build -t localhost:5000/ipv6-project:latest .
docker push localhost:5000/ipv6-project:latest

# 3. 用户部署
docker pull your-registry.com/ipv6-project:latest
```

### 方案3: GitHub Container Registry
```bash
# 1. 登录GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin

# 2. 构建并推送
docker build -t ghcr.io/your-username/ipv6-project:latest .
docker push ghcr.io/your-username/ipv6-project:latest
```

## 📦 一键部署脚本

### quick-deploy.sh
```bash
#!/bin/bash
set -e

echo "🚀 IPv6项目一键部署脚本"
echo "=========================="

# 检查Docker环境
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，正在安装..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "✅ Docker安装完成，请重新登录后再次运行此脚本"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose未安装，正在安装..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 创建项目目录
PROJECT_DIR="ipv6-project-deploy"
if [ -d "$PROJECT_DIR" ]; then
    echo "📁 项目目录已存在，正在更新..."
    cd $PROJECT_DIR
    git pull
else
    echo "📁 克隆项目..."
    git clone https://github.com/your-repo/IPv6-project.git $PROJECT_DIR
    cd $PROJECT_DIR
fi

# 创建环境变量文件
if [ ! -f .env ]; then
    echo "📝 创建环境变量文件..."
    cat > .env << EOF
# 数据库配置
DB_HOST=mysql
DB_USER=ipv6_user
DB_PASSWORD=ipv6_secure_password_$(date +%s)
DB_NAME=ipv6_project

# 应用配置
NODE_ENV=production
FRONTEND_PORT=5173
BACKEND_PORT=3000

# 安全配置
JWT_SECRET=jwt_secret_$(openssl rand -hex 32)
EOF
    echo "⚠️  环境变量文件已创建，密码已随机生成"
fi

# 启动服务
echo "🚀 启动IPv6项目..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 健康检查
echo "🔍 检查服务状态..."
if curl -f http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ 前端服务正常"
else
    echo "❌ 前端服务异常"
fi

if curl -f http://localhost:3000/api/test > /dev/null 2>&1; then
    echo "✅ 后端服务正常"
else
    echo "❌ 后端服务异常"
fi

echo ""
echo "🎉 部署完成！"
echo "🌐 前端访问地址: http://localhost:5173"
echo "🔧 后端API地址: http://localhost:3000"
echo "📊 数据库端口: 3306"
echo ""
echo "📋 管理命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
EOF
```

## 🐳 Docker镜像发布流程

### 1. 准备发布
```bash
# 创建发布目录
mkdir -p ../ipv6-project-docker
cd ../ipv6-project-docker

# 复制必要文件
cp -r ../IPv6-project/* .
```

### 2. 构建多架构镜像
```bash
# 启用buildx
docker buildx create --use

# 构建多架构镜像
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-username/ipv6-project:latest \
  -t your-username/ipv6-project:v1.0.0 \
  --push .
```

### 3. 发布到不同仓库
```bash
# Docker Hub
docker tag ipv6-project:latest your-username/ipv6-project:latest
docker push your-username/ipv6-project:latest

# GitHub Container Registry
docker tag ipv6-project:latest ghcr.io/your-username/ipv6-project:latest
docker push ghcr.io/your-username/ipv6-project:latest

# 阿里云容器镜像服务
docker tag ipv6-project:latest registry.cn-hangzhou.aliyuncs.com/your-namespace/ipv6-project:latest
docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/ipv6-project:latest
```
