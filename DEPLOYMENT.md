# 部署说明（Docker）

> 概览、配置项与本地开发见 [README](README.md)；此文件是容器化部署、升级、备份与扫描叠加层的详细说明。

## 组成

| 服务 | 镜像 | 说明 |
|---|---|---|
| `mysql` | `mysql:8.0` | 数据在命名卷 `mysql_data`；首次启动自动导入 `structure.sql` |
| `migrate` | 后端镜像 | 一次性任务：执行 `sql/NN-*.sql`（NN ≥ 08）增量迁移，成功后 `backend` 才启动 |
| `backend` | `backend/Dockerfile` | Node 22，**非 root** 运行；运行期数据在命名卷 `app_data`（挂载到 `/data`）；不对宿主机暴露端口 |
| `frontend` | `frontend/Dockerfile` | `vite build` 产物由 nginx 托管，`/api/` 反向代理到 `backend:3000`；对外端口 `FRONTEND_PORT`（默认 8080） |

明确**不做**：`privileged`、挂载 `docker.sock`、`NOPASSWD` sudo、把 `.env` 打进镜像、用 Vite 开发服务器跑生产。

## 首次部署

```bash
cp .env.docker.example .env      # 填写 MYSQL_ROOT_PASSWORD、DB_PASSWORD、JWT_SECRET（openssl rand -hex 32）
mkdir -p docs                    # 帮助文档目录（见下），可先留空
docker compose up -d --build
docker compose ps                # 等 backend / frontend 变为 healthy

# 创建第一个管理员（密码经环境变量传入，不会进 shell 历史以外的地方）
docker compose exec -e ADMIN_PASSWORD='至少8位的强密码' backend node scripts/createAdmin.js 13800000000 管理员
```

访问 `http://<服务器>:8080`。需要 HTTPS 时，在前面再放一层你自己的反向代理（Caddy/Traefik/nginx），后端已设置 `TRUST_PROXY=1`。

## 升级

```bash
git pull
docker compose up -d --build     # migrate 会自动执行新增的迁移，backend 随后重启
```

`structure.sql` 只在 MySQL 数据目录为空时执行一次，之后的结构变更全部走 `sql/NN-*.sql` 迁移（见 `sql/README.md`）。

## 数据与备份

- 数据库：`docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup.sql`
- 扫描结果、上传文件、日志：卷 `app_data`（`/data` 下的 `xmap_result/`、`zgrab2_results/`、`backend_logs/` 等）
- 帮助文档：从宿主机 `./docs`（`docs/xmap`、`docs/zgrab2`）只读挂载到 `/data/docs`。该目录此前被 `.gitignore` 忽略而不在仓库里，请在持有文档的机器上 `git add docs`。

## 扫描能力（可选，实验性）

默认部署**不包含** xmap / zgrab2：后端会正常运行，但创建扫描任务会因找不到程序而失败。需要扫描时叠加：

```bash
mkdir scanner-bin                # 放入你自己构建的 xmap 与 zgrab2（该目录被 .gitignore 忽略）
cp /path/to/xmap /path/to/zgrab2 scanner-bin/
docker compose -f docker-compose.yml -f docker-compose.scanner.yml up -d --build
```

实现方式是 Linux file capabilities：镜像里只给 `/opt/scanner/xmap` 设置 `cap_net_raw,cap_net_admin`，容器只额外放开 `NET_RAW`、`NET_ADMIN`，仍以非 root 运行，不需要 sudo（`XMAP_USE_SUDO=false`）。需要注意：

1. **这会让应用容器持有原始套接字权限。** 阶段 2 引入独立 worker 后会收敛为只有 worker 持有；在此之前请只在受控网络中使用。
2. xmap 依赖的共享库因构建方式而异；默认安装 `libpcap0.8 libgmp10 libjson-c5 libunistring2`，可用 `--build-arg SCANNER_APT_PACKAGES="..."` 调整。
3. xmap 需要收发 IPv6 原始报文：Docker 守护进程必须启用 IPv6（`/etc/docker/daemon.json` 中 `"ipv6": true`、`"fixed-cidr-v6"`、`"ip6tables": true`），叠加文件已为默认网络打开 `enable_ipv6`。容器网络的源地址/网关配置（xmap 的 `-S`、`-G`）与宿主机环境强相关，**该部分我无法在 CI 中验证**，首次使用请在测试网段里确认。
4. 开发阶段不要对外部网络发起扫描。

## 本地开发（不用容器）

```bash
cd backend  && cp .env.example .env && npm ci && npm run dev    # 默认 3000
cd frontend && npm ci && npm run dev                             # 默认 5173，/api 代理到 localhost:3000
```

## 清理旧方案

仓库里的 `docker`、`docker-main` 分支是旧的容器化尝试（挂载 `docker.sock`、`NOPASSWD:ALL`、提交了 `.env`）。本方案合并后建议给它们打 tag 归档再删除分支，避免两套方案并存。
