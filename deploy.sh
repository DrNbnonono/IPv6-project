#!/bin/bash

# IPv6项目简化部署脚本
set -e

echo "🚀 IPv6项目部署脚本"
echo "=================="

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

# 配置MySQL以支持Docker网络访问
configure_mysql_for_docker() {
    log_info "配置MySQL以支持Docker网络访问..."

    local mysql_config="/etc/mysql/mysql.conf.d/mysqld.cnf"
    local backup_config="/etc/mysql/mysql.conf.d/mysqld.cnf.backup.$(date +%Y%m%d_%H%M%S)"

    # 备份原始配置
    if [ -f "$mysql_config" ]; then
        sudo cp "$mysql_config" "$backup_config"
        log_info "已备份MySQL配置到: $backup_config"
    fi

    # 检查当前bind-address配置
    local current_bind=$(grep "^bind-address" "$mysql_config" 2>/dev/null || echo "")

    if [[ "$current_bind" == *"127.0.0.1"* ]]; then
        log_info "检测到MySQL绑定到127.0.0.1，添加Docker网络支持..."

        # 创建临时配置文件
        local temp_config=$(mktemp)

        # 复制原配置并修改bind-address
        sed 's/^bind-address.*=.*127\.0\.0\.1.*/bind-address = 0.0.0.0/' "$mysql_config" > "$temp_config"

        # 应用新配置
        sudo cp "$temp_config" "$mysql_config"
        rm "$temp_config"

        log_info "已修改MySQL配置以支持Docker网络访问"
        log_warning "需要重启MySQL服务以应用配置"

        # 重启MySQL服务
        sudo systemctl restart mysql
        sleep 3

        if systemctl is-active --quiet mysql; then
            log_success "MySQL服务重启成功"
        else
            log_error "MySQL服务重启失败，恢复备份配置"
            sudo cp "$backup_config" "$mysql_config"
            sudo systemctl restart mysql
            exit 1
        fi
    else
        log_success "MySQL已配置为支持网络访问"
    fi
}

# 检查MySQL数据库
check_mysql() {
    log_info "检查MySQL数据库..."

    # 检查MySQL是否安装
    if ! command -v mysql &> /dev/null; then
        log_error "MySQL未安装，请先安装MySQL"
        exit 1
    fi

    # 从.env文件读取数据库配置
    if [ -f ".env" ]; then
        source .env
    else
        log_error ".env文件不存在"
        exit 1
    fi

    # 配置MySQL以支持Docker网络
    configure_mysql_for_docker

    # 使用sudo连接MySQL (Ubuntu默认方式)
    log_info "检查MySQL服务状态..."

    if sudo mysql -e "SELECT 1;" &> /dev/null; then
        log_success "MySQL服务正常 (sudo认证)"

        # 为root用户设置网络访问权限
        log_info "配置root用户网络访问权限..."
        sudo mysql -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '$DB_ROOT_PASSWORD';" 2>/dev/null || true
        sudo mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;" 2>/dev/null || true
        sudo mysql -e "FLUSH PRIVILEGES;" 2>/dev/null || true
        return 0
    fi

    log_error "无法连接到MySQL数据库"
    log_info "请检查以下项目："
    log_info "1. MySQL服务是否正在运行: systemctl status mysql"
    log_info "2. 当前用户是否有sudo权限"
    log_info "3. 或者手动运行: sudo mysql"
    exit 1
}

# 执行MySQL命令的辅助函数
execute_mysql() {
    local command="$1"
    local database="${2:-}"

    # 使用sudo mysql连接（Ubuntu默认方式）
    if [ -n "$database" ]; then
        if sudo mysql -D"$database" -e "$command" &> /dev/null; then
            return 0
        fi
    else
        if sudo mysql -e "$command" &> /dev/null; then
            return 0
        fi
    fi

    return 1
}

# 获取MySQL命令结果的辅助函数
get_mysql_result() {
    local command="$1"
    local database="${2:-}"

    # 使用sudo mysql连接
    if [ -n "$database" ]; then
        result=$(sudo mysql -D"$database" -e "$command" 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "$result"
            return 0
        fi
    else
        result=$(sudo mysql -e "$command" 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "$result"
            return 0
        fi
    fi

    return 1
}

# 检查并创建数据库
setup_database() {
    log_info "设置数据库..."

    # 使用root用户创建数据库和用户
    log_info "创建数据库和用户..."

    # 检查数据库是否存在
    if ! execute_mysql "USE $DB_NAME;"; then
        log_info "数据库 $DB_NAME 不存在，正在创建..."
        if execute_mysql "CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"; then
            log_success "数据库创建完成"
        else
            log_error "数据库创建失败"
            exit 1
        fi
    else
        log_success "数据库已存在"
    fi

    # 检查表是否存在
    table_count_result=$(get_mysql_result "SHOW TABLES;" "$DB_NAME")
    table_count=$(echo "$table_count_result" | wc -l)

    if [ "$table_count" -le 1 ]; then
        log_info "数据库表不完整，正在执行structure.sql..."

        # 查找structure.sql文件
        local sql_file=""
        if [ -f "IPv6-project/structure.sql" ]; then
            sql_file="IPv6-project/structure.sql"
        elif [ -f "structure.sql" ]; then
            sql_file="structure.sql"
        else
            log_error "未找到structure.sql文件"
            log_info "请确保IPv6-project/structure.sql文件存在"
            exit 1
        fi

        log_info "使用SQL文件: $sql_file"
        log_info "预期创建24张表..."

        # 创建临时日志文件
        local temp_log="/tmp/mysql_import_$(date +%Y%m%d_%H%M%S).log"
        
        # 使用sudo mysql执行SQL文件，显示详细输出
        log_info "开始执行SQL导入..."
        if sudo mysql -D"$DB_NAME" --force < "$sql_file" 2>&1 | tee "$temp_log"; then
            # 验证表创建结果
            table_count_after_result=$(get_mysql_result "SHOW TABLES;" "$DB_NAME")
            table_count_after=$(echo "$table_count_after_result" | wc -l)
            actual_tables=$((table_count_after-1))
            
            if [ "$actual_tables" -ge 24 ]; then
                log_success "数据库表创建完成，成功创建 $actual_tables 张表"
            else
                log_warning "数据库表创建不完整，只创建了 $actual_tables 张表，预期24张表"
                log_info "请检查日志文件: $temp_log"
                log_info "已创建的表："
                echo "$table_count_after_result"
            fi
        else
            log_error "数据库表创建失败"
            log_info "错误日志保存在: $temp_log"
            log_info "请检查SQL文件格式和权限"
            exit 1
        fi
    else
        actual_tables=$((table_count-1))
        if [ "$actual_tables" -ge 24 ]; then
            log_success "数据库表已存在，共 $actual_tables 张表"
        else
            log_warning "数据库表不完整，只有 $actual_tables 张表，预期24张表"
            log_info "建议重新执行数据库初始化"
        fi
    fi
}

# 检查Docker环境
check_docker() {
    log_info "检查Docker环境..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi

    log_success "Docker环境检查完成"
}

# 准备ZGrab2工具
prepare_zgrab2() {
    log_info "准备ZGrab2工具..."

    mkdir -p tools

    local ZGRAB2_TARGET="./tools/zgrab2"
    local ZGRAB2_SOURCE="/home/ipv6/go/bin/src/zmap/zgrab2/zgrab2"

    # 检查目标文件是否已存在
    if [ -f "$ZGRAB2_TARGET" ]; then
        log_success "ZGrab2工具已存在"
        return 0
    fi

    # 尝试从默认路径复制
    if [ -f "$ZGRAB2_SOURCE" ]; then
        cp "$ZGRAB2_SOURCE" "$ZGRAB2_TARGET"
        chmod +x "$ZGRAB2_TARGET"
        log_success "ZGrab2工具准备完成"
        return 0
    fi

    # 默认路径不存在，询问用户
    log_warning "默认路径未找到ZGrab2: $ZGRAB2_SOURCE"
    echo ""
    echo "请选择操作："
    echo "1) 输入ZGrab2的绝对路径"
    echo "2) 自动编译ZGrab2 (需要Go环境)"
    echo "3) 跳过ZGrab2配置 (后续手动配置)"
    echo ""
    read -p "请输入选择 (1/2/3): " choice

    case $choice in
        1)
            echo ""
            read -p "请输入ZGrab2二进制文件的完整路径: " user_path
            if [ -f "$user_path" ]; then
                cp "$user_path" "$ZGRAB2_TARGET"
                chmod +x "$ZGRAB2_TARGET"
                log_success "ZGrab2工具准备完成"
            else
                log_error "指定的文件不存在: $user_path"
                return 1
            fi
            ;;
        2)
            compile_zgrab2
            ;;
        3)
            log_warning "跳过ZGrab2配置，请后续手动配置"
            # 创建一个占位文件
            echo '#!/bin/bash' > "$ZGRAB2_TARGET"
            echo 'echo "ZGrab2未配置，请手动安装"' >> "$ZGRAB2_TARGET"
            echo 'exit 1' >> "$ZGRAB2_TARGET"
            chmod +x "$ZGRAB2_TARGET"
            ;;
        *)
            log_error "无效选择"
            return 1
            ;;
    esac
}

# 编译ZGrab2
compile_zgrab2() {
    log_info "开始编译ZGrab2..."

    # 检查Go环境
    if ! command -v go &> /dev/null; then
        log_error "Go未安装，无法编译ZGrab2"
        log_info "请安装Go或提供ZGrab2二进制文件"
        return 1
    fi

    # 创建临时目录
    local TEMP_DIR=$(mktemp -d)
    local ZGRAB2_TARGET="./tools/zgrab2"

    log_info "在临时目录编译: $TEMP_DIR"

    cd "$TEMP_DIR"

    # 克隆ZGrab2源码
    if git clone https://github.com/zmap/zgrab2.git; then
        cd zgrab2

        # 编译
        if go build; then
            # 复制到目标位置
            cp zgrab2 "$OLDPWD/$ZGRAB2_TARGET"
            chmod +x "$OLDPWD/$ZGRAB2_TARGET"

            # 清理临时目录
            cd "$OLDPWD"
            rm -rf "$TEMP_DIR"

            log_success "ZGrab2编译完成"
            return 0
        else
            log_error "ZGrab2编译失败"
            cd "$OLDPWD"
            rm -rf "$TEMP_DIR"
            return 1
        fi
    else
        log_error "无法克隆ZGrab2源码"
        cd "$OLDPWD"
        rm -rf "$TEMP_DIR"
        return 1
    fi
}

# 创建数据目录
create_directories() {
    log_info "创建数据目录..."

    mkdir -p data/{uploads,xmap_result,xmap_log,zgrab2_results,zgrab2_logs,zgrab2_inputs,zgrab2_configs,whitelists,jsonanalysis,temp_files,backend_logs}
    chmod -R 755 data/

    log_success "数据目录创建完成"
}

# 检查和修复前端问题
check_frontend_issues() {
    log_info "检查前端常见问题..."

    # 检查前端容器是否在重启循环
    local frontend_status=$(docker inspect ipv6-frontend --format='{{.State.Status}}' 2>/dev/null || echo "not_found")

    if [ "$frontend_status" = "restarting" ]; then
        log_warning "检测到前端容器在重启循环中"
        log_info "这通常是由于vite或esbuild权限问题导致的"

        # 停止前端容器
        docker stop ipv6-frontend 2>/dev/null || true

        # 重新构建前端镜像（包含修复）
        log_info "重新构建前端镜像以修复权限问题..."
        docker-compose build frontend

        # 重新启动前端
        log_info "重新启动前端服务..."
        docker-compose up -d frontend

        log_success "前端问题修复尝试完成"
    elif [ "$frontend_status" = "exited" ]; then
        log_warning "前端容器已退出，查看日志..."
        docker logs ipv6-frontend --tail 10

        log_info "尝试重新启动前端..."
        docker-compose up -d frontend
    fi
}

# 检查现有镜像
check_existing_images() {
    log_info "检查现有Docker镜像..."

    local backend_image="ipv6-project-docker_backend"
    local frontend_image="ipv6-project-docker_frontend"
    local rebuild_needed=false

    # 检查后端镜像
    if docker images --format "{{.Repository}}" | grep -q "^${backend_image}$"; then
        log_warning "发现现有后端镜像: $backend_image"
        rebuild_needed=true
    fi

    # 检查前端镜像
    if docker images --format "{{.Repository}}" | grep -q "^${frontend_image}$"; then
        log_warning "发现现有前端镜像: $frontend_image"
        rebuild_needed=true
    fi

    if [ "$rebuild_needed" = true ]; then
        echo ""
        echo "发现现有镜像，请选择操作："
        echo "1) 跳过构建，使用现有镜像"
        echo "2) 删除现有镜像并重新构建"
        echo ""
        read -p "请输入选择 (1/2): " choice

        case $choice in
            1)
                log_info "跳过镜像构建，使用现有镜像"
                return 0
                ;;
            2)
                log_info "删除现有镜像..."
                docker rmi $backend_image 2>/dev/null || true
                docker rmi $frontend_image 2>/dev/null || true
                log_success "现有镜像已删除"
                return 1
                ;;
            *)
                log_warning "无效选择，默认重新构建"
                docker rmi $backend_image 2>/dev/null || true
                docker rmi $frontend_image 2>/dev/null || true
                return 1
                ;;
        esac
    fi

    return 1
}

# 构建和启动服务
deploy_services() {
    log_info "准备Docker服务..."

    # 停止现有服务
    docker-compose down 2>/dev/null || true

    # 检查现有镜像
    if ! check_existing_images; then
        # 构建镜像
        log_info "构建Docker镜像..."

        # 先构建后端
        log_info "构建后端镜像..."
        docker-compose build backend

        # 再构建前端（包含vite和esbuild修复）
        log_info "构建前端镜像..."
        docker-compose build frontend

        log_success "镜像构建完成"
    fi

    # 分步启动服务以确保稳定性
    log_info "启动后端和xmap服务..."
    docker-compose up -d backend xmap

    # 等待后端启动
    log_info "等待后端服务启动..."
    sleep 10

    # 启动前端
    log_info "启动前端服务..."
    docker-compose up -d frontend

    log_success "服务启动完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."

    # 等待服务启动
    log_info "等待服务启动..."
    sleep 15

    # 检查容器状态
    log_info "检查容器状态..."
    docker-compose ps

    # 检查后端服务
    log_info "检查后端服务..."
    local backend_attempts=0
    local backend_max_attempts=6

    while [ $backend_attempts -lt $backend_max_attempts ]; do
        if curl -f http://localhost:3000/api/test > /dev/null 2>&1; then
            log_success "后端API服务正常"
            break
        else
            backend_attempts=$((backend_attempts + 1))
            if [ $backend_attempts -lt $backend_max_attempts ]; then
                log_info "后端服务尚未就绪，等待中... ($backend_attempts/$backend_max_attempts)"
                sleep 5
            else
                log_error "后端服务启动失败"
                log_info "查看后端日志："
                docker logs ipv6-backend --tail 20
                return 1
            fi
        fi
    done

    # 检查前端服务
    log_info "检查前端服务..."
    local frontend_attempts=0
    local frontend_max_attempts=6

    while [ $frontend_attempts -lt $frontend_max_attempts ]; do
        if curl -f http://localhost:5173 > /dev/null 2>&1; then
            log_success "前端服务正常"
            break
        else
            frontend_attempts=$((frontend_attempts + 1))
            if [ $frontend_attempts -lt $frontend_max_attempts ]; then
                log_info "前端服务尚未就绪，等待中... ($frontend_attempts/$frontend_max_attempts)"
                sleep 5
            else
                log_error "前端服务启动失败"
                log_info "查看前端日志："
                docker logs ipv6-frontend --tail 20
                return 1
            fi
        fi
    done

    # 运行详细的API测试
    if [ -f "./test-api.sh" ]; then
        log_info "运行API连接测试..."
        ./test-api.sh all
    fi
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "🎉 IPv6项目部署完成！"
    echo "==================="
    echo ""
    echo "📱 访问地址:"
    echo "  前端界面: http://localhost:5173"
    echo "  后端API:  http://localhost:3000"
    echo "  API测试:  http://localhost:3000/api/test"
    echo "  健康检查: http://localhost:3000/api/health"
    echo "  数据库:   localhost:3306"
    echo ""
    echo "📊 默认登录信息:"
    echo "  手机号: 13011122222"
    echo "  密码: admin"
    echo "  角色: 管理员"
    echo ""
    echo "🔧 管理命令:"
    echo "  查看所有日志: docker-compose logs -f"
    echo "  查看后端日志: docker logs ipv6-backend -f"
    echo "  查看前端日志: docker logs ipv6-frontend -f"
    echo "  停止所有服务: docker-compose down"
    echo "  重启所有服务: docker-compose restart"
    echo "  重启单个服务: docker-compose restart [backend|frontend|xmap]"
    echo "  查看容器状态: docker-compose ps"
    echo ""
    echo "🔍 故障排除:"
    echo "  如果前端无法访问，检查: docker logs ipv6-frontend"
    echo "  如果后端API异常，检查: docker logs ipv6-backend"
    echo "  如果数据库连接失败，检查MySQL服务状态"
    echo "  重新部署: ./deploy.sh"
    echo ""
    echo "💡 提示:"
    echo "  - 前端使用Vite开发服务器，支持热重载"
    echo "  - 后端API在生产模式下运行"
    echo "  - 数据库已配置支持Docker网络访问"
    echo ""
}

# 主函数
main() {
    check_docker
    check_mysql
    setup_database
    create_directories
    prepare_zgrab2
    deploy_services

    # 等待一下再检查前端问题
    sleep 5
    check_frontend_issues

    health_check
    show_deployment_info
}

# 错误处理
trap 'log_error "部署过程中发生错误，请检查日志"; exit 1' ERR

# 推送镜像到仓库
push_images() {
    log_info "推送镜像到Docker仓库..."

    # 检查镜像是否存在
    if ! docker images | grep -q "ipv6-project-docker-backend"; then
        log_error "后端镜像不存在，请先构建镜像"
        exit 1
    fi

    if ! docker images | grep -q "ipv6-project-docker-frontend"; then
        log_error "前端镜像不存在，请先构建镜像"
        exit 1
    fi

    echo ""
    echo "选择推送目标："
    echo "1) Docker Hub (docker.io)"
    echo "2) 阿里云容器镜像服务"
    echo "3) 同时推送到两个仓库"
    echo ""
    read -p "请输入选择 (1/2/3): " registry_choice

    case $registry_choice in
        1)
            push_to_dockerhub
            ;;
        2)
            push_to_aliyun
            ;;
        3)
            push_to_dockerhub
            push_to_aliyun
            ;;
        *)
            log_error "无效选择"
            exit 1
            ;;
    esac
}

# 推送到Docker Hub
push_to_dockerhub() {
    log_info "推送到Docker Hub..."

    read -p "请输入Docker Hub用户名: " dockerhub_username

    if [ -z "$dockerhub_username" ]; then
        log_error "用户名不能为空"
        exit 1
    fi

    # 登录Docker Hub
    log_info "登录Docker Hub..."
    if ! docker login; then
        log_error "Docker Hub登录失败"
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
}

# 推送到阿里云
push_to_aliyun() {
    log_info "推送到阿里云容器镜像服务..."

    read -p "请输入阿里云用户名: " aliyun_username
    read -p "请输入阿里云命名空间: " aliyun_namespace
    read -p "请输入阿里云地域 (如: cn-hangzhou): " aliyun_region

    if [ -z "$aliyun_username" ] || [ -z "$aliyun_namespace" ] || [ -z "$aliyun_region" ]; then
        log_error "用户名、命名空间和地域不能为空"
        exit 1
    fi

    local registry_url="registry.${aliyun_region}.aliyuncs.com"

    # 登录阿里云
    log_info "登录阿里云容器镜像服务..."
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

# 从远程仓库部署
deploy_from_remote() {
    log_info "从远程仓库部署..."

    # 执行与本地部署相同的基础检查
    check_docker
    check_mysql
    setup_database
    create_directories
    prepare_zgrab2

    # 检查是否存在生产环境配置，如果不存在则创建默认配置
    if [ ! -f "docker-compose.prod.yml" ]; then
        log_info "创建默认生产环境配置..."
        create_default_prod_compose
    fi

    # 停止现有服务
    docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

    # 拉取最新镜像
    log_info "拉取最新镜像..."
    docker-compose -f docker-compose.prod.yml pull backend frontend
    
    # 单独拉取xmap镜像（如果需要）
    docker pull liii/xmap 2>/dev/null || log_warning "XMap镜像拉取失败，将使用本地镜像"

    # 分步启动服务以确保稳定性
    log_info "启动后端和xmap服务..."
    docker-compose -f docker-compose.prod.yml up -d backend xmap

    # 等待后端启动
    log_info "等待后端服务启动..."
    sleep 10

    # 启动前端
    log_info "启动前端服务..."
    docker-compose -f docker-compose.prod.yml up -d frontend

    # 等待服务启动
    log_info "等待服务启动..."
    sleep 15

    # 检查和修复前端问题
    check_frontend_issues_prod

    # 检查服务状态
    check_services_health

    log_success "从远程仓库部署完成"
    show_deployment_info_prod
}

# 创建默认生产环境配置（使用drnonono的镜像）
create_default_prod_compose() {
    log_info "创建默认Docker Hub生产环境配置..."

    cat > docker-compose.prod.yml << 'EOF'
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
    image: drnonono/ipv6-backend:latest
    container_name: ipv6-backend
    user: root
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DB_HOST: ${DB_HOST}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      JWT_SECRET: ${JWT_SECRET}
      PROJECT_ROOT: ${PROJECT_ROOT}
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
    image: drnonono/ipv6-frontend:latest
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

    log_success "默认生产环境配置已创建: docker-compose.prod.yml"
}

# 检查和修复前端问题（生产环境版本）
check_frontend_issues_prod() {
    log_info "检查前端常见问题..."

    # 检查前端容器是否在重启循环
    local frontend_status=$(docker inspect ipv6-frontend --format='{{.State.Status}}' 2>/dev/null || echo "not_found")

    if [ "$frontend_status" = "restarting" ]; then
        log_warning "检测到前端容器在重启循环中"
        log_info "这通常是由于vite或esbuild权限问题导致的"

        # 停止前端容器
        docker stop ipv6-frontend 2>/dev/null || true

        # 重新拉取前端镜像
        log_info "重新拉取前端镜像..."
        docker-compose -f docker-compose.prod.yml pull frontend

        # 重新启动前端
        log_info "重新启动前端服务..."
        docker-compose -f docker-compose.prod.yml up -d frontend

        log_success "前端问题修复尝试完成"
    elif [ "$frontend_status" = "exited" ]; then
        log_warning "前端容器已退出，查看日志..."
        docker logs ipv6-frontend --tail 10

        log_info "尝试重新启动前端..."
        docker-compose -f docker-compose.prod.yml up -d frontend
    fi
}

# 检查服务健康状态（更新版本）
check_services_health() {
    log_info "检查服务健康状态..."

    # 检查容器状态
    echo ""
    echo "容器状态："
    docker-compose -f docker-compose.prod.yml ps

    echo ""
    echo "服务健康检查："

    # 等待后端启动
    local backend_ready=false
    local backend_attempts=0
    local backend_max_attempts=30
    
    while [ $backend_attempts -lt $backend_max_attempts ]; do
        if curl -f http://localhost:3000/api/test > /dev/null 2>&1; then
            backend_ready=true
            break
        else
            backend_attempts=$((backend_attempts + 1))
            if [ $backend_attempts -lt $backend_max_attempts ]; then
                log_info "后端服务尚未就绪，等待中... ($backend_attempts/$backend_max_attempts)"
                sleep 2
            fi
        fi
    done

    if [ "$backend_ready" = true ]; then
        log_success "后端API正常 (http://localhost:3000)"
    else
        log_warning "后端API异常，请检查日志: docker logs ipv6-backend"
        log_info "查看后端日志："
        docker logs ipv6-backend --tail 20
    fi

    # 检查前端（保持5173端口）
    local frontend_attempts=0
    local frontend_max_attempts=6
    local frontend_ready=false

    while [ $frontend_attempts -lt $frontend_max_attempts ]; do
        if curl -f http://localhost:5173 > /dev/null 2>&1; then
            frontend_ready=true
            break
        else
            frontend_attempts=$((frontend_attempts + 1))
            if [ $frontend_attempts -lt $frontend_max_attempts ]; then
                log_info "前端服务尚未就绪，等待中... ($frontend_attempts/$frontend_max_attempts)"
                sleep 5
            fi
        fi
    done

    if [ "$frontend_ready" = true ]; then
        log_success "前端服务正常 (http://localhost:5173)"
    else
        log_warning "前端服务异常，请检查日志: docker logs ipv6-frontend"
        log_info "查看前端日志："
        docker logs ipv6-frontend --tail 20
    fi

    # 检查XMap容器
    if docker ps --format "{{.Names}}" | grep -q "ipv6-xmap"; then
        log_success "XMap容器正常运行"
    else
        log_warning "XMap容器异常，请检查日志: docker logs ipv6-xmap"
        log_info "查看XMap日志："
        docker logs ipv6-xmap --tail 10
    fi

    # 运行详细的API测试
    if [ -f "./test-api.sh" ]; then
        log_info "运行API连接测试..."
        ./test-api.sh all
    fi

    echo ""
    log_info "访问地址："
    echo "  前端: http://localhost:5173"
    echo "  后端API: http://localhost:3000"
    echo ""
    log_info "默认登录账号："
    echo "  手机号: 13011122222"
    echo "  密码: admin"
}

# 显示生产环境部署信息
show_deployment_info_prod() {
    echo ""
    echo "🎉 IPv6项目远程部署完成！"
    echo "========================"
    echo ""
    echo "📱 访问地址:"
    echo "  前端界面: http://localhost:5173"
    echo "  后端API:  http://localhost:3000"
    echo "  API测试:  http://localhost:3000/api/test"
    echo "  健康检查: http://localhost:3000/api/health"
    echo "  数据库:   localhost:3306"
    echo ""
    echo "📊 默认登录信息:"
    echo "  手机号: 13011122222"
    echo "  密码: admin"
    echo "  角色: 管理员"
    echo ""
    echo "🔧 管理命令:"
    echo "  查看所有日志: docker-compose -f docker-compose.prod.yml logs -f"
    echo "  查看后端日志: docker logs ipv6-backend -f"
    echo "  查看前端日志: docker logs ipv6-frontend -f"
    echo "  停止所有服务: docker-compose -f docker-compose.prod.yml down"
    echo "  重启所有服务: docker-compose -f docker-compose.prod.yml restart"
    echo "  重启单个服务: docker-compose -f docker-compose.prod.yml restart [backend|frontend|xmap]"
    echo "  查看容器状态: docker-compose -f docker-compose.prod.yml ps"
    echo ""
    echo "🔍 故障排除:"
    echo "  如果前端无法访问，检查: docker logs ipv6-frontend"
    echo "  如果后端API异常，检查: docker logs ipv6-backend"
    echo "  如果数据库连接失败，检查MySQL服务状态"
    echo "  重新部署: ./deploy.sh deploy-remote"
    echo ""
    echo "💡 提示:"
    echo "  - 生产环境使用预构建的Docker镜像"
    echo "  - 前端运行在5173端口，后端运行在3000端口"
    echo "  - 数据库已配置支持Docker网络访问"
    echo "  - XMap服务已配置网络扫描权限"
    echo ""
}

# 命令行参数处理
case "${1:-}" in
    "stop")
        log_info "停止所有服务..."
        docker-compose down
        log_success "服务已停止"
        ;;
    "restart")
        log_info "重启所有服务..."
        docker-compose down
        main
        ;;
    "logs")
        if [ -n "${2:-}" ]; then
            docker logs "ipv6-$2" -f
        else
            docker-compose logs -f
        fi
        ;;
    "status")
        echo "容器状态："
        docker-compose ps
        echo ""
        echo "服务检查："
        if curl -f http://localhost:3000/api/test > /dev/null 2>&1; then
            log_success "后端API正常"
        else
            log_error "后端API异常"
        fi
        if curl -f http://localhost:5173 > /dev/null 2>&1; then
            log_success "前端服务正常"
        else
            log_error "前端服务异常"
        fi
        ;;
    "fix-frontend")
        log_info "修复前端问题..."
        check_frontend_issues
        ;;
    "rebuild")
        log_info "重新构建镜像..."
        docker-compose down
        docker-compose build
        docker-compose up -d
        log_success "重新构建完成"
        ;;
    "push")
        push_images
        ;;
    "deploy-remote"|"remote")
        deploy_from_remote
        ;;
    "quick"|"q")
        log_info "快速部署模式 - 从Docker Hub拉取镜像..."
        deploy_from_remote
        ;;
    "help"|"-h"|"--help")
        echo "🚀 IPv6项目部署脚本"
        echo "==================="
        echo ""
        echo "用法: $0 [命令]"
        echo ""
        echo "📦 部署命令:"
        echo "  quick, q         - 🚀 快速部署 (推荐新用户)"
        echo "  deploy-remote    - 从远程仓库部署"
        echo "  (无参数)         - 本地构建部署"
        echo ""
        echo "🔧 管理命令:"
        echo "  stop             - 停止所有服务"
        echo "  restart          - 重启所有服务"
        echo "  status           - 查看服务状态"
        echo "  logs [服务]      - 查看日志 (backend/frontend/xmap)"
        echo ""
        echo "🛠️ 开发命令:"
        echo "  rebuild          - 重新构建镜像"
        echo "  push             - 推送镜像到远程仓库"
        echo "  fix-frontend     - 修复前端问题"
        echo ""
        echo "📋 使用示例:"
        echo "  ./deploy.sh quick           # 新用户快速开始"
        echo "  ./deploy.sh status          # 检查服务状态"
        echo "  ./deploy.sh logs backend    # 查看后端日志"
        echo "  ./deploy.sh stop            # 停止所有服务"
        echo ""
        echo "🌐 访问地址:"
        echo "  前端: http://localhost:5173"
        echo "  后端: http://localhost:3000"
        echo ""
        echo "👤 默认账号:"
        echo "  手机号: 13011122222"
        echo "  密码: admin"
        echo ""
        ;;
    *)
        # 执行主函数
        main "$@"
        ;;
esac
