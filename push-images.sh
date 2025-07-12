#!/bin/bash

# IPv6项目镜像推送脚本
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🚀 IPv6项目镜像推送脚本"
echo "========================"

# 检查镜像是否存在
check_images() {
    log_info "检查本地镜像..."
    
    if ! docker images | grep -q "ipv6-project-docker-backend"; then
        log_error "后端镜像不存在，请先构建镜像"
        log_info "运行: docker-compose build backend"
        exit 1
    fi
    
    if ! docker images | grep -q "ipv6-project-docker-frontend"; then
        log_error "前端镜像不存在，请先构建镜像"
        log_info "运行: docker-compose build frontend"
        exit 1
    fi
    
    log_success "本地镜像检查完成"
}

# 推送到阿里云（推荐，国内网络更稳定）
push_to_aliyun() {
    log_info "推送到阿里云容器镜像服务..."
    
    echo ""
    echo "请提供阿里云容器镜像服务信息："
    read -p "用户名: " aliyun_username
    read -p "命名空间: " aliyun_namespace
    read -p "地域 (如: cn-hangzhou, cn-beijing): " aliyun_region
    
    if [ -z "$aliyun_username" ] || [ -z "$aliyun_namespace" ] || [ -z "$aliyun_region" ]; then
        log_error "用户名、命名空间和地域不能为空"
        exit 1
    fi
    
    local registry_url="registry.${aliyun_region}.aliyuncs.com"
    
    # 登录阿里云
    log_info "登录阿里云容器镜像服务..."
    echo "请输入阿里云密码或访问令牌："
    if ! docker login --username="$aliyun_username" "$registry_url"; then
        log_error "阿里云登录失败"
        exit 1
    fi
    
    # 打标签并推送
    local backend_tag="${registry_url}/${aliyun_namespace}/ipv6-backend:latest"
    local frontend_tag="${registry_url}/${aliyun_namespace}/ipv6-frontend:latest"
    
    log_info "标记镜像..."
    docker tag ipv6-project-docker-backend:latest "$backend_tag"
    docker tag ipv6-project-docker-frontend:latest "$frontend_tag"
    
    log_info "推送后端镜像..."
    docker push "$backend_tag"
    
    log_info "推送前端镜像..."
    docker push "$frontend_tag"
    
    log_success "阿里云推送完成"
    
    # 创建生产环境配置
    create_prod_compose_aliyun "$aliyun_namespace" "$aliyun_region"
    
    echo ""
    echo "🎉 推送完成！"
    echo "============="
    echo ""
    echo "📦 推送的镜像："
    echo "  后端: $backend_tag"
    echo "  前端: $frontend_tag"
    echo ""
    echo "📄 生产环境配置文件已创建: docker-compose.prod.yml"
    echo ""
    echo "🚀 在生产环境部署："
    echo "  1. 复制以下文件到生产服务器："
    echo "     - docker-compose.prod.yml"
    echo "     - .env"
    echo "     - deploy.sh"
    echo "     - tools/ 目录"
    echo ""
    echo "  2. 在生产服务器运行："
    echo "     ./deploy.sh deploy-remote"
    echo ""
}

# 推送到Docker Hub
push_to_dockerhub() {
    log_info "推送到Docker Hub..."
    
    echo ""
    read -p "请输入Docker Hub用户名: " dockerhub_username
    
    if [ -z "$dockerhub_username" ]; then
        log_error "用户名不能为空"
        exit 1
    fi
    
    # 登录Docker Hub
    log_info "登录Docker Hub..."
    echo "请输入Docker Hub密码或访问令牌："
    if ! docker login; then
        log_error "Docker Hub登录失败"
        log_warning "如果网络连接有问题，建议使用阿里云镜像服务"
        exit 1
    fi
    
    # 打标签并推送
    local backend_tag="${dockerhub_username}/ipv6-backend:latest"
    local frontend_tag="${dockerhub_username}/ipv6-frontend:latest"
    
    log_info "标记镜像..."
    docker tag ipv6-project-docker-backend:latest "$backend_tag"
    docker tag ipv6-project-docker-frontend:latest "$frontend_tag"
    
    log_info "推送后端镜像..."
    docker push "$backend_tag"
    
    log_info "推送前端镜像..."
    docker push "$frontend_tag"
    
    log_success "Docker Hub推送完成"
    
    # 创建生产环境配置
    create_prod_compose_dockerhub "$dockerhub_username"
    
    echo ""
    echo "🎉 推送完成！"
    echo "============="
    echo ""
    echo "📦 推送的镜像："
    echo "  后端: $backend_tag"
    echo "  前端: $frontend_tag"
    echo ""
    echo "📄 生产环境配置文件已创建: docker-compose.prod.yml"
    echo ""
    echo "🚀 在生产环境部署："
    echo "  1. 复制以下文件到生产服务器："
    echo "     - docker-compose.prod.yml"
    echo "     - .env"
    echo "     - deploy.sh"
    echo "     - tools/ 目录"
    echo ""
    echo "  2. 在生产服务器运行："
    echo "     ./deploy.sh deploy-remote"
    echo ""
}

# 创建阿里云生产环境配置
create_prod_compose_aliyun() {
    local namespace="$1"
    local region="$2"
    local registry_url="registry.${region}.aliyuncs.com"
    
    log_info "创建阿里云生产环境配置..."
    
    cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  # XMap服务 (使用官方镜像)
  xmap:
    image: liii/xmap
    container_name: ipv6-xmap
    restart: unless-stopped
    volumes:
      - ./data/xmap_result:/data/results
      - ./data/xmap_log:/data/logs
      - ./data/whitelists:/data/whitelists
    # 使用host网络模式，确保XMap能够进行网络扫描
    network_mode: host
    privileged: true
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    # 保持容器运行
    command: ["tail", "-f", "/dev/null"]

  # 后端服务 (从阿里云拉取)
  backend:
    image: ${registry_url}/${namespace}/ipv6-backend:latest
    container_name: ipv6-backend
    user: root
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DB_HOST: \${DB_HOST}
      DB_USER: \${DB_USER}
      DB_PASSWORD: \${DB_PASSWORD}
      DB_NAME: \${DB_NAME}
      JWT_SECRET: \${JWT_SECRET}
      PROJECT_ROOT: \${PROJECT_ROOT}
      XMAP_CONTAINER: ipv6-xmap
    networks:
      - ipv6-network
    volumes:
      # 数据持久化目录
      - ./data/uploads:/app/uploads
      - ./data/xmap_result:/app/xmap_result
      - ./data/xmap_log:/app/xmap_log
      - ./data/zgrab2_results:/app/zgrab2_results
      - ./data/zgrab2_logs:/app/zgrab2_logs
      - ./data/zgrab2_inputs:/app/zgrab2_inputs
      - ./data/zgrab2_configs:/app/zgrab2_configs
      - ./data/whitelists:/app/whitelists
      - ./data/jsonanalysis:/app/jsonanalysis
      - ./data/temp_files:/app/temp_files
      - ./data/backend_logs:/app/backend_logs
      # ZGrab2二进制文件
      - ./tools/zgrab2:/usr/local/bin/zgrab2:ro
      # Docker socket for XMap container communication
      - /var/run/docker.sock:/var/run/docker.sock
    # ZGrab2需要网络权限
    privileged: true
    cap_add:
      - NET_ADMIN
      - NET_RAW

  # 前端服务 (从阿里云拉取)
  frontend:
    image: ${registry_url}/${namespace}/ipv6-frontend:latest
    container_name: ipv6-frontend
    restart: unless-stopped
    ports:
      - "5173:5173"
    depends_on:
      - backend
    networks:
      - ipv6-network
    environment:
      - NODE_ENV=development

networks:
  ipv6-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
EOF
    
    log_success "阿里云生产环境配置已创建: docker-compose.prod.yml"
}

# 创建Docker Hub生产环境配置
create_prod_compose_dockerhub() {
    local username="$1"
    
    log_info "创建Docker Hub生产环境配置..."
    
    cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  # XMap服务 (使用官方镜像)
  xmap:
    image: liii/xmap
    container_name: ipv6-xmap
    restart: unless-stopped
    volumes:
      - ./data/xmap_result:/data/results
      - ./data/xmap_log:/data/logs
      - ./data/whitelists:/data/whitelists
    # 使用host网络模式，确保XMap能够进行网络扫描
    network_mode: host
    privileged: true
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN
    # 保持容器运行
    command: ["tail", "-f", "/dev/null"]

  # 后端服务 (从Docker Hub拉取)
  backend:
    image: ${username}/ipv6-backend:latest
    container_name: ipv6-backend
    user: root
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DB_HOST: \${DB_HOST}
      DB_USER: \${DB_USER}
      DB_PASSWORD: \${DB_PASSWORD}
      DB_NAME: \${DB_NAME}
      JWT_SECRET: \${JWT_SECRET}
      PROJECT_ROOT: \${PROJECT_ROOT}
      XMAP_CONTAINER: ipv6-xmap
    networks:
      - ipv6-network
    volumes:
      # 数据持久化目录
      - ./data/uploads:/app/uploads
      - ./data/xmap_result:/app/xmap_result
      - ./data/xmap_log:/app/xmap_log
      - ./data/zgrab2_results:/app/zgrab2_results
      - ./data/zgrab2_logs:/app/zgrab2_logs
      - ./data/zgrab2_inputs:/app/zgrab2_inputs
      - ./data/zgrab2_configs:/app/zgrab2_configs
      - ./data/whitelists:/app/whitelists
      - ./data/jsonanalysis:/app/jsonanalysis
      - ./data/temp_files:/app/temp_files
      - ./data/backend_logs:/app/backend_logs
      # ZGrab2二进制文件
      - ./tools/zgrab2:/usr/local/bin/zgrab2:ro
      # Docker socket for XMap container communication
      - /var/run/docker.sock:/var/run/docker.sock
    # ZGrab2需要网络权限
    privileged: true
    cap_add:
      - NET_ADMIN
      - NET_RAW

  # 前端服务 (从Docker Hub拉取)
  frontend:
    image: ${username}/ipv6-frontend:latest
    container_name: ipv6-frontend
    restart: unless-stopped
    ports:
      - "5173:5173"
    depends_on:
      - backend
    networks:
      - ipv6-network
    environment:
      - NODE_ENV=development

networks:
  ipv6-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
EOF
    
    log_success "Docker Hub生产环境配置已创建: docker-compose.prod.yml"
}

# 主函数
main() {
    check_images
    
    echo ""
    echo "选择推送目标："
    echo "1) 阿里云容器镜像服务 (推荐，国内网络稳定)"
    echo "2) Docker Hub (国际通用)"
    echo ""
    read -p "请输入选择 (1/2): " choice
    
    case $choice in
        1)
            push_to_aliyun
            ;;
        2)
            push_to_dockerhub
            ;;
        *)
            log_error "无效选择"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
