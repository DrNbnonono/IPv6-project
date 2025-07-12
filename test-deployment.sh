#!/bin/bash

# IPv6项目部署测试脚本

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

echo "🧪 IPv6项目部署测试"
echo "==================="

# 测试Docker
log_info "检查Docker..."
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        log_success "Docker运行正常"
    else
        log_error "Docker未运行或权限不足"
        exit 1
    fi
else
    log_error "Docker未安装"
    exit 1
fi

# 测试MySQL
log_info "检查MySQL..."
if command -v mysql &> /dev/null; then
    if systemctl is-active --quiet mysql; then
        log_success "MySQL运行正常"
    else
        log_warning "MySQL服务未运行"
        echo "请运行: sudo systemctl start mysql"
    fi
else
    log_error "MySQL未安装"
    echo "请运行: sudo apt install mysql-server"
fi

# 测试端口
log_info "检查端口占用..."
if netstat -tlnp 2>/dev/null | grep -q ":5173 "; then
    log_warning "端口5173已被占用"
else
    log_success "端口5173可用"
fi

if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
    log_warning "端口3000已被占用"
else
    log_success "端口3000可用"
fi

# 测试容器状态
log_info "检查容器状态..."
if docker ps | grep -q "ipv6-backend"; then
    log_success "后端容器运行中"
else
    log_warning "后端容器未运行"
fi

if docker ps | grep -q "ipv6-frontend"; then
    log_success "前端容器运行中"
else
    log_warning "前端容器未运行"
fi

if docker ps | grep -q "ipv6-xmap"; then
    log_success "XMap容器运行中"
else
    log_warning "XMap容器未运行"
fi

# 测试服务连接
log_info "测试服务连接..."

if curl -f http://localhost:3000/api/test &> /dev/null; then
    log_success "后端API连接正常"
else
    log_warning "后端API连接失败"
fi

if curl -f http://localhost:5173 &> /dev/null; then
    log_success "前端服务连接正常"
else
    log_warning "前端服务连接失败"
fi

echo ""
echo "🌐 访问地址："
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3000"
echo ""
echo "👤 默认账号："
echo "  手机号: 13011122222"
echo "  密码: admin"
echo ""

# 建议
echo "💡 建议："
echo "  1. 如有警告，请按提示解决"
echo "  2. 运行 './deploy.sh status' 查看详细状态"
echo "  3. 运行 './deploy.sh logs backend' 查看后端日志"
echo ""
