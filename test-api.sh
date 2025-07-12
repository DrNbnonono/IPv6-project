#!/bin/bash

# API连接测试脚本
echo "🔗 API连接测试"
echo "=============="

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 测试后端API连接
test_backend_api() {
    log_info "测试后端API连接..."
    
    local api_url="http://localhost:3000/api"
    
    # 测试基础连接
    if curl -f -s "$api_url/test" > /dev/null 2>&1; then
        log_success "后端API连接正常: $api_url"
    else
        log_error "后端API连接失败: $api_url"
        
        # 检查后端容器状态
        if docker ps --format "{{.Names}}" | grep -q "ipv6-backend"; then
            log_info "后端容器正在运行"
            log_info "检查后端容器日志:"
            docker logs ipv6-backend --tail 10
        else
            log_error "后端容器未运行"
        fi
        return 1
    fi
    
    # 测试具体API端点
    local endpoints=(
        "/test"
        "/xmap/tasks"
        "/zgrab2/modules"
        "/database/stats"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$api_url$endpoint" > /dev/null 2>&1; then
            log_success "✓ $endpoint"
        else
            log_warning "✗ $endpoint (可能需要认证)"
        fi
    done
}

# 测试前端服务
test_frontend() {
    log_info "测试前端服务..."
    
    local frontend_url="http://localhost:5173"
    
    if curl -f -s "$frontend_url" > /dev/null 2>&1; then
        log_success "前端服务连接正常: $frontend_url"
        
        # 检查前端是否能正确加载
        local response=$(curl -s "$frontend_url")
        if echo "$response" | grep -q "IPv6" || echo "$response" | grep -q "vue"; then
            log_success "前端页面内容正常"
        else
            log_warning "前端页面内容可能异常"
        fi
    else
        log_error "前端服务连接失败: $frontend_url"
        
        # 检查前端容器状态
        if docker ps --format "{{.Names}}" | grep -q "ipv6-frontend"; then
            log_info "前端容器正在运行"
            log_info "检查前端容器日志:"
            docker logs ipv6-frontend --tail 10
        else
            log_error "前端容器未运行"
        fi
        return 1
    fi
}

# 测试数据库连接
test_database() {
    log_info "测试数据库连接..."
    
    # 从.env文件读取数据库配置
    if [ -f ".env" ]; then
        source .env
    else
        log_error ".env文件不存在"
        return 1
    fi
    
    if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SELECT 1;" &> /dev/null; then
        log_success "数据库连接正常"
        
        # 检查表数量
        local table_count=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SHOW TABLES;" | wc -l)
        log_info "数据库表数量: $((table_count - 1))"
        
        # 检查用户表
        local user_count=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SELECT COUNT(*) FROM users;" | tail -n 1)
        log_info "用户数量: $user_count"
    else
        log_error "数据库连接失败"
        return 1
    fi
}

# 测试容器状态
test_containers() {
    log_info "检查容器状态..."
    
    echo ""
    echo "📦 容器状态:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    echo "🌐 网络状态:"
    docker network ls | grep ipv6 || echo "  没有IPv6相关网络"
    
    echo ""
    echo "💾 卷状态:"
    docker volume ls | grep ipv6 || echo "  没有IPv6相关卷"
}

# 测试端口占用
test_ports() {
    log_info "检查端口状态..."
    
    local ports=("3000" "5173")
    
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            local process=$(lsof -ti:$port 2>/dev/null | head -1)
            if [ ! -z "$process" ]; then
                local process_info=$(ps -p $process -o comm= 2>/dev/null || echo "未知")
                log_success "端口 $port 被使用 - 进程: $process_info (PID: $process)"
            else
                log_success "端口 $port 被使用"
            fi
        else
            log_warning "端口 $port 未被使用"
        fi
    done
}

# 生成测试报告
generate_report() {
    echo ""
    echo "📊 测试报告"
    echo "==========="
    echo ""
    
    # 重新运行关键测试
    local backend_ok=false
    local frontend_ok=false
    local database_ok=false
    
    if curl -f -s "http://localhost:3000/api/test" > /dev/null 2>&1; then
        backend_ok=true
    fi
    
    if curl -f -s "http://localhost:5173" > /dev/null 2>&1; then
        frontend_ok=true
    fi
    
    if [ -f ".env" ]; then
        source .env
        if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "SELECT 1;" &> /dev/null; then
            database_ok=true
        fi
    fi
    
    echo "✅ 服务状态:"
    echo "  后端API: $([ "$backend_ok" = true ] && echo "正常" || echo "异常")"
    echo "  前端服务: $([ "$frontend_ok" = true ] && echo "正常" || echo "异常")"
    echo "  数据库: $([ "$database_ok" = true ] && echo "正常" || echo "异常")"
    echo ""
    
    if [ "$backend_ok" = true ] && [ "$frontend_ok" = true ] && [ "$database_ok" = true ]; then
        log_success "🎉 所有服务运行正常！"
        echo ""
        echo "🌐 访问地址:"
        echo "  前端: http://localhost:5173"
        echo "  后端: http://localhost:3000"
        echo ""
    else
        log_error "❌ 部分服务异常，请检查日志"
        echo ""
        echo "🔧 故障排除建议:"
        echo "  1. 检查容器日志: docker-compose logs"
        echo "  2. 重启服务: ./start.sh restart"
        echo "  3. 重新部署: ./deploy.sh"
        echo ""
    fi
}

# 主函数
case "${1:-all}" in
    "backend")
        test_backend_api
        ;;
    "frontend")
        test_frontend
        ;;
    "database")
        test_database
        ;;
    "containers")
        test_containers
        ;;
    "ports")
        test_ports
        ;;
    "all")
        test_backend_api
        echo ""
        test_frontend
        echo ""
        test_database
        echo ""
        test_containers
        echo ""
        test_ports
        echo ""
        generate_report
        ;;
    *)
        echo "API连接测试脚本"
        echo ""
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  backend    - 测试后端API"
        echo "  frontend   - 测试前端服务"
        echo "  database   - 测试数据库连接"
        echo "  containers - 检查容器状态"
        echo "  ports      - 检查端口状态"
        echo "  all        - 执行所有测试 (默认)"
        ;;
esac
