#!/bin/bash

# IPv6项目镜像构建和推送脚本
# 使用方法: ./build-and-push.sh [registry] [tag]
# 示例: ./build-and-push.sh limerencellll/observ6 frontend_v0.1

set -e

# 默认配置
DEFAULT_REGISTRY="limerencellll/observ6"
DEFAULT_FRONTEND_TAG="frontend_v0.1"
DEFAULT_BACKEND_TAG="backend_v0.1"

# 获取参数
REGISTRY=${1:-$DEFAULT_REGISTRY}
FRONTEND_TAG=${2:-$DEFAULT_FRONTEND_TAG}
BACKEND_TAG=${3:-$DEFAULT_BACKEND_TAG}

# 镜像名称
FRONTEND_IMAGE="${REGISTRY}:${FRONTEND_TAG}"
BACKEND_IMAGE="${REGISTRY}:${BACKEND_TAG}"

# 临时镜像名称（用于构建）
TEMP_FRONTEND_IMAGE="ipv6-frontend-temp"
TEMP_BACKEND_IMAGE="ipv6-backend-temp"

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
docker build -f docker/Dockerfile.frontend -t ${TEMP_FRONTEND_IMAGE} .
if [ $? -eq 0 ]; then
    echo "✅ 前端镜像构建成功"
    
    # 获取前端镜像ID
    FRONTEND_IMAGE_ID=$(docker images --format "{{.ID}}" ${TEMP_FRONTEND_IMAGE}:latest)
    echo "📋 前端镜像ID: ${FRONTEND_IMAGE_ID}"
    
    # 重新tag前端镜像
    echo "🏷️  为前端镜像添加正确的tag..."
    docker tag ${FRONTEND_IMAGE_ID} ${FRONTEND_IMAGE}
    echo "✅ 前端镜像tag添加成功: ${FRONTEND_IMAGE}"
else
    echo "❌ 前端镜像构建失败"
    exit 1
fi

# 构建后端镜像
echo "🔨 构建后端镜像..."
docker build -f docker/Dockerfile.backend -t ${TEMP_BACKEND_IMAGE} .
if [ $? -eq 0 ]; then
    echo "✅ 后端镜像构建成功"
    
    # 获取后端镜像ID
    BACKEND_IMAGE_ID=$(docker images --format "{{.ID}}" ${TEMP_BACKEND_IMAGE}:latest)
    echo "📋 后端镜像ID: ${BACKEND_IMAGE_ID}"
    
    # 重新tag后端镜像
    echo "🏷️  为后端镜像添加正确的tag..."
    docker tag ${BACKEND_IMAGE_ID} ${BACKEND_IMAGE}
    echo "✅ 后端镜像tag添加成功: ${BACKEND_IMAGE}"
else
    echo "❌ 后端镜像构建失败"
    exit 1
fi

echo ""
echo "📋 镜像构建完成，镜像列表:"
docker images | grep -E "(${REGISTRY}|${TEMP_FRONTEND_IMAGE}|${TEMP_BACKEND_IMAGE})" | head -4

# 清理临时镜像
echo "🧹 清理临时镜像..."
docker rmi ${TEMP_FRONTEND_IMAGE}:latest ${TEMP_BACKEND_IMAGE}:latest 2>/dev/null || true

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
echo "   查看镜像: docker images | grep ${REGISTRY}"
echo "   删除镜像: docker rmi ${FRONTEND_IMAGE} ${BACKEND_IMAGE}"
echo "   运行容器: docker-compose up -d"
echo ""
echo "📝 使用示例:"
echo "   默认构建: ./build-and-push.sh"
echo "   自定义仓库: ./build-and-push.sh limerencellll/observ6 frontend_v0.2 backend_v0.2"
echo "   只改tag: ./build-and-push.sh limerencellll/observ6 frontend_v1.0 backend_v1.0"
