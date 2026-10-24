# syntax=docker/dockerfile:1
# 构建上下文为 frontend/：docker build -f frontend/Dockerfile frontend

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 生产构建使用 .env.production（VITE_API_BASE_URL=/api，由 nginx 反向代理到后端）
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
