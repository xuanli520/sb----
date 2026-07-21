# 部署与恢复

本文件描述可重复的 Compose 部署、健康检查和 MySQL 恢复操作。它不代替生产环境的
证书、密钥管理、备份保留或灾备责任人流程。

## 网络与入口

`compose.yaml` 中只有 `nginx` 映射宿主机端口。Web、后端、MySQL 和 Redis 都没有
宿主机端口映射，并按实际调用关系加入内部网络：

```text
Internet / TLS ingress -> nginx -> web -> backend
                                      -> redis
backend -> mysql
```

Nginx 的 HTTP 监听端口由 `HTTP_PORT` 控制，默认 `80`。它不提供仓库内置的虚假
证书或自签名 TLS。生产环境必须让受管理的 HTTPS 入口或已配置证书的 Nginx TLS
配置终止 TLS，再把请求转给这个 Compose Nginx 服务；`NOVEL_PUBLIC_ORIGIN` 必须是
用户实际访问的 HTTPS origin。例如：

```dotenv
HTTP_PORT=80
NOVEL_PUBLIC_ORIGIN=https://novel.example.com
```

不要把 `backend` 或 `web` 端口重新映射到公网，也不要把
`NOVEL_INTERNAL_API_KEY`、Redis URL 或数据库密码写入 `NEXT_PUBLIC_*` 变量。
`NOVEL_AUTH_RATE_LIMIT_TRUSTED_PROXY_HEADERS` 只有在入口代理会覆盖每个请求的
`X-Forwarded-For` 后才可启用。

## 启动与健康检查

```bash
cp .env.example .env
# 在 .env 中替换所有 replace-with-* 值，并设置真实 HTTPS origin。
docker compose up --build --detach
docker compose ps
curl --fail http://127.0.0.1:${HTTP_PORT:-80}/api/healthz
```

MySQL 和 Redis 使用各自的原生命令健康检查。后端通过
`/actuator/health`，Web 通过 `/api/healthz`，Nginx 通过 `/nginx-health` 检查；Web
会等待后端和 Redis 健康后启动，Nginx 会等待 Web 健康后启动。浏览器认证只能在真实
HTTPS origin 下验证，HTTP 健康检查不代表生产 Cookie/CSRF 配置已验收。

运行静态部署检查：

```bash
scripts/verify-deployment-artifacts.sh
```

该命令验证 shell 语法、Compose 配置和 Nginx 配置。加入 `--smoke` 会启动一个隔离的
临时 MySQL 8.4 容器，实际执行备份、写入变更、替换恢复和数据校验：

```bash
scripts/verify-deployment-artifacts.sh --smoke
```

## MySQL 备份

备份脚本通过 Compose 容器内的 `MYSQL_ROOT_PASSWORD` 访问 MySQL，密码不会出现在宿主
命令行或备份日志中。输出必须是新文件，脚本会创建 gzip 文件和同目录的 SHA-256 文件。

```bash
mkdir -p backups
scripts/backup-mysql.sh "backups/novel-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

备份目录已被 Git 忽略。生产环境还应把加密后的备份复制到独立存储并建立保留、访问和
恢复演练策略；本仓库不替代这些运行责任。

## MySQL 恢复

恢复会验证 gzip 文件，并在同目录 checksum 存在时验证 SHA-256。它会**删除并重建**
目标数据库，所以要求两个显式确认参数。为防止正在运行的 API 造成竞争写入，脚本会在
`backend` 服务运行时拒绝执行。

```bash
docker compose stop backend
scripts/restore-mysql.sh --replace --confirm-replace backups/novel-20260721T000000Z.sql.gz
# 先核对数据，再恢复 API。
docker compose start backend
```

默认数据库和服务名称分别是 `novel_platform`、`mysql` 和 `backend`。演练或不同部署可
通过 `MYSQL_DATABASE`、`MYSQL_SERVICE` 和 `BACKEND_SERVICE` 覆盖；数据库名只允许
字母、数字和下划线。恢复前应先保留当前数据库的独立备份，并在非生产副本上完成演练。

## 当前边界

当前项目没有对象存储或上传 API，作品封面字段仍是字符串值。不能仅添加空的 MinIO
服务就把文件存储标记为完成。后续加入封面/附件上传时，必须同时交付上传授权、大小和
类型校验、恶意文件扫描、对象生命周期、删除策略、备份和恢复测试。

OpenAPI/API 契约由独立交付维护；部署文档不把运行时接口文档暴露到公网作为替代。
