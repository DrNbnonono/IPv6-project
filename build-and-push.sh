#!/bin/bash

# IPv6项目镜像构建和推送脚本
# 使用方法: ./build-and-push.sh [registry] [tag]
# 示例: ./build-and-push.sh myregistry.com/myuser latest

set -e

# 默认配置
DEFAULT_REGISTRY="your-registry"
DEFAULT_TAG="latest"

# 获取参数
REGISTRY=${1:-$DEFAULT_REGISTRY}
TAG=${2:-$DEFAULT_TAG}

# 镜像名称
FRONTEND_IMAGE="${REGISTRY}/ipv6-frontend:${TAG}"
BACKEND_IMAGE="${REGISTRY}/ipv6-backend:${TAG}"

echo "🚀 开始构建IPv6项目Docker镜像"
echo "📦 前端镜像: ${FRONTEND_IMAGE}"
echo "📦 后端镜像: ${BACKEND_IMAGE}"
echo ""

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker未运行，请先启动Docker"
    exit 1
fi

# 构建前端镜像
echo "🔨 构建前端镜像..."
docker build -f Dockerfile.frontend -t ${FRONTEND_IMAGE} .
if [ $? -eq 0 ]; then
    echo "✅ 前端镜像构建成功"
else
    echo "❌ 前端镜像构建失败"
    exit 1
fi

# 构建后端镜像
echo "🔨 构建后端镜像..."
docker build -f Dockerfile.backend -t ${BACKEND_IMAGE} .
if [ $? -eq 0 ]; then
    echo "✅ 后端镜像构建成功"
else
    echo "❌ 后端镜像构建失败"
    exit 1
fi

echo ""
echo "📋 镜像构建完成，镜像列表:"
docker images | grep -E "(ipv6-frontend|ipv6-backend)" | head -2

# 询问是否推送
read -p "🤔 是否推送镜像到仓库? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 推送镜像到仓库..."
    
    # 推送前端镜像
    echo "📤 推送前端镜像..."
    docker push ${FRONTEND_IMAGE}
    if [ $? -eq 0 ]; then
        echo "✅ 前端镜像推送成功"
    else
        echo "❌ 前端镜像推送失败"
        exit 1
    fi
    
    # 推送后端镜像
    echo "📤 推送后端镜像..."
    docker push ${BACKEND_IMAGE}
    if [ $? -eq 0 ]; then
        echo "✅ 后端镜像推送成功"
    else
        echo "❌ 后端镜像推送失败"
        exit 1
    fi
    
    echo ""
    echo "🎉 所有镜像推送完成!"
    echo "📦 前端镜像: ${FRONTEND_IMAGE}"
    echo "📦 后端镜像: ${BACKEND_IMAGE}"
    echo ""
    echo "💡 在其他服务器上使用这些镜像:"
    echo "   1. 修改 docker-compose.prod.yml 中的镜像地址"
    echo "   2. 运行: docker-compose -f docker-compose.prod.yml up -d"
else
    echo "⏭️  跳过推送，镜像已在本地构建完成"
fi

echo ""
echo "🔧 有用的命令:"
echo "   查看镜像: docker images | grep ipv6"
echo "   删除镜像: docker rmi ${FRONTEND_IMAGE} ${BACKEND_IMAGE}"
echo "   运行容器: docker-compose up -d"
