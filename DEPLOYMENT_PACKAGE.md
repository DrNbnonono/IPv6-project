# 📦 IPv6项目部署包

## 🎯 开箱即用特性

- ✅ **预构建镜像**: 从Docker Hub直接拉取，无需本地构建
- ✅ **一键部署**: 单个命令完成所有配置
- ✅ **自动配置**: 智能检测环境并创建默认配置
- ✅ **健康检查**: 自动验证服务状态
- ✅ **完整文档**: 详细的使用和故障排除指南

## 📋 部署包内容

### 核心文件
```
IPv6-project-docker/
├── deploy.sh              # 主部署脚本
├── docker-compose.yml     # 开发环境配置
├── .env.example           # 环境变量模板
├── structure.sql          # 数据库结构
└── tools/
    └── zgrab2            # ZGrab2二进制文件
```

### 文档文件
```
├── README.md              # 完整使用指南
├── QUICKSTART.md          # 5分钟快速开始
├── DEPLOYMENT_PACKAGE.md  # 本文件
└── test-deployment.sh     # 部署测试脚本
```

### 自动生成文件
```
├── docker-compose.prod.yml # 生产环境配置（自动生成）
├── .env                   # 环境变量（从模板复制）
└── data/                  # 数据目录（自动创建）
    ├── uploads/
    ├── xmap_result/
    ├── xmap_log/
    ├── zgrab2_results/
    └── backend_logs/
```

## 🚀 使用的Docker镜像

### 所需docker镜像
- `drnonono/ipv6-backend:latest` - 后端服务
- `drnonono/ipv6-frontend:latest` - 前端服务
- `liii/xmap` - XMap扫描工具

### 镜像特点
- **轻量化**: 基于优化的基础镜像
- **安全性**: 包含必要的安全配置
- **兼容性**: 支持多种Linux发行版
- **更新**: 定期更新和维护

## 🔧 部署选项

### 选项1: 快速部署
```bash
./deploy.sh quick
```
- 自动创建默认配置
- 从Docker Hub拉取镜像
- 一键启动所有服务

### 选项2: 自定义部署
```bash
cp .env.example .env
# 编辑.env文件
./deploy.sh deploy-remote
```
- 自定义环境变量
- 灵活的配置选项

### 选项3: 开发者模式
```bash
./deploy.sh
```
- 本地构建镜像
- 适合开发和调试

## 📊 系统要求

### 最低要求
- **CPU**: 2核心
- **内存**: 4GB
- **存储**: 10GB可用空间
- **网络**: 能访问Docker Hub

### 推荐配置
- **CPU**: 4核心+
- **内存**: 8GB+
- **存储**: 20GB+可用空间
- **网络**: 稳定的互联网连接

## 🌐 支持的环境

### 操作系统
- ✅ Ubuntu 20.04+
- ✅ CentOS 7+
- ✅ Debian 10+
- ✅ RHEL 8+
- ✅ Amazon Linux 2

### 容器平台
- ✅ Docker CE 20.10+
- ✅ Docker Desktop
- ✅ Podman (实验性支持)

## 🔍 质量保证

### 测试覆盖
- ✅ 多环境兼容性测试
- ✅ 网络连接测试
- ✅ 服务健康检查
- ✅ 性能基准测试

### 监控指标
- 📊 容器资源使用
- 📊 服务响应时间
- 📊 扫描任务成功率
- 📊 系统稳定性

## 📞 技术支持

### 自助诊断
```bash
./test-deployment.sh    # 运行诊断测试
./deploy.sh status      # 检查服务状态
./deploy.sh help        # 查看帮助信息
```

### 常见问题
1. **镜像拉取失败** → 检查网络连接或配置镜像加速器
2. **端口冲突** → 修改.env文件中的端口配置
3. **权限问题** → 确保用户在docker组中
4. **MySQL连接失败** → 检查MySQL服务状态和用户权限

### 获取支持
- 📖 查看完整文档: README.md
- 🚀 快速开始: QUICKSTART.md
- 🧪 运行测试: ./test-deployment.sh
- 📝 提交Issue: GitHub仓库

---

**🎉 享受IPv6网络扫描的强大功能！**
