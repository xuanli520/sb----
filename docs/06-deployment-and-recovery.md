# 部署与恢复

本文件描述可重复的 Compose 部署、健康检查和 MySQL 恢复操作。它不代替生产环境的
证书、密钥管理、备份保留或灾备责任人流程。

## 网络与入口

`compose.yaml` 中只有 `nginx` 映射宿主机端口。Web、后端、MySQL、Redis 和 MinIO 都没有
宿主机端口映射，并按实际调用关系加入内部网络：

```text
Internet / TLS ingress -> nginx -> web -> backend
                                      -> redis
backend -> mysql
nginx -> MinIO private object-storage network -> novel-covers bucket
backend -> MinIO private object-storage network
```

Nginx 的 HTTP 监听端口由 `HTTP_PORT` 控制，默认 `80`。它不提供仓库内置的虚假
证书或自签名 TLS。生产环境必须让受管理的 HTTPS 入口或已配置证书的 Nginx TLS
配置终止 TLS，再把请求转给这个 Compose Nginx 服务；`NOVEL_PUBLIC_ORIGIN` 必须是
用户实际访问的 HTTPS origin。例如：

```dotenv
HTTP_PORT=80
NOVEL_PUBLIC_ORIGIN=https://novel.example.com
```

不要把 `backend`、`web`、MinIO `9000` 或 MinIO console 端口重新映射到公网，也不要把
`NOVEL_INTERNAL_API_KEY`、Redis URL、对象存储凭据或数据库密码写入 `NEXT_PUBLIC_*` 变量。
`NOVEL_AUTH_RATE_LIMIT_TRUSTED_PROXY_HEADERS` 只有在入口代理会覆盖每个请求的
`X-Forwarded-For` 后才可启用。

## 封面对象存储

封面上传默认关闭：`NOVEL_COVER_STORAGE_ENABLED=false`。打开前，`.env` 必须包含
`MINIO_ROOT_USER`、`MINIO_ROOT_PASSWORD`、`MINIO_COVER_ACCESS_KEY` 和
`MINIO_COVER_SECRET_KEY`。根凭据仅由 Compose 的一次性 `minio-init` 服务使用；后端拿到
的是只允许 `novel-covers/covers/*` 写入和删除的独立服务账户，Web 容器不接收任何 MinIO
变量。

`minio-init` 幂等创建 `novel-covers` 桶、设置该桶匿名下载，并绑定写入账户的最小策略。
这并不将 MinIO 公开：服务只在 `object-storage` 内部网络，Nginx 是唯一的公开入口，且
只允许 `GET /media/...`，会移除浏览器携带的 `Authorization`、Cookie 和转发身份头。
Nginx 将 `/media/covers/<uuid>.png|jpg` 映射到该固定桶；不要把 MinIO endpoint 或桶名
改写进 `Book.cover`。

后端端点只允许作者上传自己处于草稿或驳回状态作品的单个 `file` multipart 字段。它不会
信任 filename 或请求 MIME，而是以 ImageIO 解码验证 PNG/JPEG、5 MiB 字节上限、4096x4096
尺寸和像素上限。配置关闭、不完整或存储不可用时会返回明确的 `503`，不会降级为本地磁盘。
每次上传使用随机对象键；数据库更新回滚会补偿删除新对象，旧对象只在事务提交后删除，且
只会删除本系统生成的 `/media/covers/<uuid>` URL。旧的 CSS 颜色封面保持兼容。

## 启动与健康检查

```bash
cp .env.example .env
# 在 .env 中替换所有 replace-with-* 值，并设置真实 HTTPS origin。
docker compose up --build --detach
docker compose ps
curl --fail http://127.0.0.1:${HTTP_PORT:-80}/api/healthz
```

MySQL、Redis 和 MinIO 使用各自的原生命令健康检查。MinIO 初始化完成后后端才启动；后端通过
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

## 对象恢复边界

MySQL 备份不包含 `minio-data`。恢复数据库前后必须从同一时间点的受控对象存储备份或
版本化副本恢复 `novel-covers`，否则 `Book.cover` 可能引用不存在的对象。生产环境应使用
受管理对象存储的版本化、跨区域复制或加密快照，并定期演练“数据库 + 桶”一致性恢复；本
仓库的 MySQL smoke 演练不替代对象存储灾备。

当前实现只支持静态 PNG/JPEG 封面，不是通用附件服务。病毒扫描、内容安全扫描、对象保留
策略、孤儿对象巡检和跨区域恢复自动化仍需在生产云供应商与安全流程确定后补齐。`/media/`
对象键不可变并允许缓存，作者替换和事务补偿会处理正常更新路径的对象删除。

OpenAPI/API 契约由独立交付维护；部署文档不把运行时接口文档暴露到公网作为替代。
