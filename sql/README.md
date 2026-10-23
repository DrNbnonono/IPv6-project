# 数据库脚本约定

本目录与根目录 `structure.sql` 共同描述 ObserV6 的数据库。**全新建库**请按下面的顺序；**已有数据库**只需执行第 3 步。

## 建库流程（全新环境）

```bash
# 1. 建库（字符集 utf8mb4）
mysql -u root -p -e "CREATE DATABASE ipv6_project CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 2. 导入最新全量表结构、触发器、存储过程、视图（含 agent_memory）
#    注意：文件里每张表前有 DROP TABLE IF EXISTS，只能用于新库
mysql -u root -p ipv6_project < structure.sql

# 3. 执行增量迁移（读取 .env 里的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME）
cd backend && node scripts/migrate.js

# 4. 创建第一个管理员（密码用环境变量或交互输入，不要写在命令行）
ADMIN_PASSWORD='至少8位的强密码' node scripts/createAdmin.js 13800000000 管理员

# 5. 自检
node scripts/checkDb.js
```

`structure.sql` 由 MySQL 8.0 的 `mysqldump --no-data --routines --triggers` 生成，表默认排序规则为 `utf8mb4_0900_ai_ci`，因此需要 **MySQL 8**（MariaDB 不认识该排序规则）。

## 文件分类

| 文件 | 性质 | 说明 |
|---|---|---|
| `../structure.sql` | 全量结构 | 当前最新的完整表结构；结构有变动后重新导出覆盖它，并保证与迁移文件一致 |
| `NN-*.sql`，NN ≥ 08 | **增量迁移** | 由 `scripts/migrate.js` 按文件名顺序执行，成功后记入表 `schema_migrations`（含 sha256） |
| `01`–`07` 开头的文件 | 历史脚本 | 已全部合入 `structure.sql`，仅作参考，**不要再执行**（`01-任务等表.sql` 与 `tools_whitelist.sql`、`user_create.sql` 还有重复建表） |
| `optional/*.sql` | 可选脚本 | **不会**被 `migrate.js` 执行，由维护者按需、在合适的时间手动运行（例如 `optional/12-address-history-indexes.sql`：给 7500 万行大表建索引，耗时长，需要低峰期） |
| `init.sql`、`insert_*.sql`、`map.sql` | 种子/演示数据 | 可选。`init.sql` 以 `TRUNCATE TABLE asns / ip_prefixes` 开头，**只能用于新库** |
| `user_create.sql`、`tools_whitelist.sql` | 历史脚本 | 账号请用 `scripts/createAdmin.js`；工具记录由迁移 `08-seed-tools.sql` 提供 |

## 编写迁移

1. 新建 `sql/NN-简短名称.sql`，NN 为比现有最大编号大的两位数；
2. 尽量写成可重复执行（`CREATE TABLE IF NOT EXISTS`、`INSERT IGNORE`、先判断再 `ALTER`）；
3. 含存储过程/触发器时可以直接写 `DELIMITER`，执行器调用 `mysql` 命令行；
4. **已经执行过的迁移文件不要再改**——内容变化会触发 checksum 校验失败，请新增一个迁移；
5. 同时更新 `structure.sql`（或在评审时说明新库会通过迁移补齐）。

## 执行器用法

```bash
node scripts/migrate.js            # 执行所有待应用迁移
node scripts/migrate.js --dry-run  # 只列出将要执行的迁移
node scripts/migrate.js --status   # 查看已应用 / 待应用
```

退出码：`0` 成功；`1` 迁移失败或 checksum 不一致；`2` 无法连接数据库。MySQL 不支持 DDL 回滚，
某个迁移中途失败时，已成功的语句不会撤销，修复后重新运行即可（迁移应写成可重复执行）。

## 大表变更的做法（`active_addresses` 约 7500 万行）

- 加列用 `ALGORITHM=INSTANT`（只改元数据，不拷贝数据、不长时间锁表）。数据库不支持时语句会直接报错，而不是悄悄重建整张表；
- 加索引放进 `sql/optional/`，用 `ALGORITHM=INPLACE, LOCK=NONE`，由维护者选低峰期执行，并先在副本上记录耗时；
- 迁移 12 之后，导入存储过程 `batch_import_ipv6_addresses` 把已存在的地址记为“再次观察”而不是整批失败；这个存储过程的最新定义以迁移文件为准（`structure.sql` 里是旧版本，新库跑完迁移后会被替换）。
