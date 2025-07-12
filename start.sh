#!/bin/bash

# IPv6项目快速启动脚本
echo "⚡ IPv6项目快速启动"
echo "=================="

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# 检查端口占用
check_ports() {
    log_info "检查端口占用情况..."

    local ports_in_use=()
    local port_processes=()

    # 检查3000端口 (后端)
    if netstat -tuln | grep -q ":3000 "; then
        ports_in_use+=("3000")
        local process=$(lsof -ti:3000 2>/dev/null | head -1)
        if [ ! -z "$process" ]; then
            local process_info=$(ps -p $process -o comm= 2>/dev/null || echo "未知进程")
            port_processes+=("端口3000被占用 - 进程: $process_info (PID: $process)")
        else
            port_processes+=("端口3000被占用 - 无法获取进程信息")
        fi
    fi

    # 检查5173端口 (前端)
    if netstat -tuln | grep -q ":5173 "; then
        ports_in_use+=("5173")
        local process=$(lsof -ti:5173 2>/dev/null | head -1)
        if [ ! -z "$process" ]; then
            local process_info=$(ps -p $process -o comm= 2>/dev/null || echo "未知进程")
            port_processes+=("端口5173被占用 - 进程: $process_info (PID: $process)")
        else
            port_processes+=("端口5173被占用 - 无法获取进程信息")
        fi
    fi

    # 如果有端口被占用，显示错误信息并退出
    if [ ${#ports_in_use[@]} -gt 0 ]; then
        log_error "发现端口冲突，无法启动服务！"
        echo ""
        echo "🚫 端口占用详情："
        for info in "${port_processes[@]}"; do
            echo "  - $info"
        done
        echo ""
        echo "💡 解决方案："
        echo "  1. 停止占用端口的进程"
        echo "  2. 或者修改docker-compose.yml中的端口映射"
        echo ""
        echo "🔧 停止进程命令示例："
        for port in "${ports_in_use[@]}"; do
            echo "  sudo kill \$(lsof -ti:$port)"
        done
        echo ""
        exit 1
    fi

    log_success "端口检查通过"
}

# 启动服务
start_services() {
    log_info "启动Docker服务..."

    # 检查端口占用
    check_ports

    # 停止现有服务
    sudo docker-compose down 2>/dev/null || true

    # 启动服务
    sudo docker-compose up -d

    # 等待容器启动
    sleep 3

    # 检查XMap容器状态
    log_info "检查XMap容器状态..."
    if sudo docker ps --format "{{.Names}}" | grep -q "^ipv6-xmap$"; then
        log_success "XMap容器启动成功"
    else
        log_error "XMap容器启动失败，尝试重新启动..."
        sudo docker-compose restart xmap 2>/dev/null || true
        sleep 2
        if sudo docker ps --format "{{.Names}}" | grep -q "^ipv6-xmap$"; then
            log_success "XMap容器重启成功"
        else
            log_error "XMap容器启动失败，请检查配置"
        fi
    fi

    log_success "服务启动完成"
}

# 显示状态
show_status() {
    echo ""
    echo "📊 服务状态:"

    # 检查docker-compose是否有运行的服务
    local compose_output=$(sudo docker-compose ps 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$compose_output" ]; then
        echo "$compose_output"
    else
        echo "  ❌ 没有运行的Docker Compose服务"
        echo ""
        echo "🔍 IPv6项目相关容器:"
        local ipv6_containers=$(sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "ipv6-")
        if [ -n "$ipv6_containers" ]; then
            echo "$ipv6_containers"
        else
            echo "  ❌ 没有运行的IPv6项目容器"
        fi
    fi

    echo ""
    echo "🔍 各容器详细状态:"

    # 检查后端容器
    if sudo docker ps --format "{{.Names}}" | grep -q "^ipv6-backend$"; then
        echo "  ✅ 后端容器运行正常"
    else
        echo "  ❌ 后端容器未运行"
    fi

    # 检查前端容器
    if sudo docker ps --format "{{.Names}}" | grep -q "^ipv6-frontend$"; then
        echo "  ✅ 前端容器运行正常"
    else
        echo "  ❌ 前端容器未运行"
    fi

    # 检查XMap容器
    if sudo docker ps --format "{{.Names}}" | grep -q "^ipv6-xmap$"; then
        echo "  ✅ XMap容器运行正常"
    else
        echo "  ❌ XMap容器未运行"
    fi

    echo ""
    echo "🌐 访问地址:"
    echo "  前端: http://localhost:5173"
    echo "  后端: http://localhost:3000"

    echo ""
    echo "🔧 管理命令:"
    echo "  查看日志: docker-compose logs -f"
    echo "  停止服务: docker-compose down"
    echo "  重启XMap: docker-compose restart xmap"
}

# 主函数
case "${1:-start}" in
    "start")
        start_services
        show_status
        ;;
    "stop")
        log_info "停止服务..."
        # 使用sudo确保有权限停止容器
        sudo docker-compose down 2>/dev/null || true

        # 强制停止可能残留的容器，包括xmap容器
        log_info "清理残留容器..."
        sudo docker stop ipv6-backend ipv6-frontend ipv6-xmap 2>/dev/null || true
        sudo docker rm ipv6-backend ipv6-frontend ipv6-xmap 2>/dev/null || true

        # 等待端口释放
        sleep 2

        log_success "服务已停止"
        ;;
    "restart")
        log_info "重启服务..."
        sudo docker-compose restart
        log_success "服务已重启"
        ;;
    "logs")
        sudo docker-compose logs -f
        ;;
    "status")
        show_status
        ;;
    *)
        echo "用法: $0 [start|stop|restart|logs|status]"
        ;;
esac
