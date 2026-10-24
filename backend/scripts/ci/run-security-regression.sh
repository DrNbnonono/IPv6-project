#!/usr/bin/env bash
# 在已建好库、已迁移、已有管理员账号的数据库上启动后端并跑安全回归（CI 与本地共用）。
# 需要环境变量：DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME JWT_SECRET；用 mysql 命令行读写 users 表（密码走 MYSQL_PWD）。
# 会在库里创建一个测试用的普通用户 ci-user（幂等），并用 JWT_SECRET 给管理员与 ci-user 签发临时令牌。
set -euo pipefail

PORT="${SEC_PORT:-3000}"
export MYSQL_PWD="$DB_PASSWORD"
sql() { mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -N "$DB_NAME" -e "$1"; }

admin_id=$(sql "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
sql "INSERT INTO users (phone, username, password_hash, role) VALUES ('13900000002', 'ci-user', 'not-a-real-hash', 'user') ON DUPLICATE KEY UPDATE role='user'"
user_id=$(sql "SELECT id FROM users WHERE phone='13900000002'")
other_id=$(sql "SELECT COALESCE(MAX(id), 0) + 1000 FROM users")
[ -n "$admin_id" ] || { echo "库里没有管理员账号，先运行 scripts/createAdmin.js"; exit 1; }

mint() { node -e "console.log(require('jsonwebtoken').sign({ id: Number(process.argv[1]) }, process.env.JWT_SECRET, { expiresIn: '10m' }))" "$1"; }
admin_token=$(mint "$admin_id")
user_token=$(mint "$user_id")

log="${RUNNER_TEMP:-/tmp}/observ6-backend-secreg.log"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}" API_RATE_MAX="${API_RATE_MAX:-100000}" PORT="$PORT" LOG_LEVEL=warn \
  node app.js > "$log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" > /dev/null || { echo "后端没有起来："; tail -20 "$log"; exit 1; }

node scripts/securityRegression.js --base "http://127.0.0.1:$PORT" \
  --user-token "$user_token" --admin-token "$admin_token" --other-user-id "$other_id" --strict ${SEC_EXTRA_ARGS:-}
