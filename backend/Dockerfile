# syntax=docker/dockerfile:1
# 构建上下文为仓库根目录：docker build -f backend/Dockerfile .
# （需要同时拷入 sql/ 与 structure.sql，迁移执行器 scripts/migrate.js 依赖它们）

FROM node:22-bookworm-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    PROJECT_ROOT=/data \
    TERMINAL_JAIL_ROOT=/data

# default-mysql-client：迁移执行器通过 mysql 命令行执行含 DELIMITER 的脚本
# procps：xmap 任务终止逻辑用到 ps / pkill；tini：正确转发信号、回收子进程
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client procps tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY sql/ /app/sql/
COPY structure.sql /app/structure.sql

# 运行期数据（扫描结果、上传文件、日志）放在命名卷 /data；以非 root 的 node 用户运行
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "app.js"]

# ---- 可选构建目标：带扫描工具（docker-compose.scanner.yml 使用）----
# 把你自己构建的 xmap、zgrab2 放到仓库根目录 scanner-bin/（该目录已被 .gitignore 忽略）。
# xmap 依赖的共享库因构建方式而异，可通过 --build-arg SCANNER_APT_PACKAGES="..." 调整。
FROM runtime AS scanner
ARG SCANNER_APT_PACKAGES="libpcap0.8 libgmp10 libjson-c5 libunistring2"
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcap2-bin ${SCANNER_APT_PACKAGES} \
    && rm -rf /var/lib/apt/lists/*
COPY scanner-bin/ /opt/scanner/
RUN chmod 0755 /opt/scanner/* \
    && setcap cap_net_raw,cap_net_admin+ep /opt/scanner/xmap
USER node
ENV XMAP_BIN=/opt/scanner/xmap \
    XMAP_USE_SUDO=false \
    ZGRAB2_BIN=/opt/scanner/zgrab2
