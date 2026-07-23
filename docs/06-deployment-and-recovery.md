# 部署与恢复

本文件描述可重复的 Compose 部署、健康检查和 MySQL 恢复操作。它不代替生产环境的
证书、密钥管理、备份保留或灾备责任人流程。

## 网络与入口

`compose.yaml` 中只有 `nginx` 映射宿主机端口。Web、后端、MySQL、Redis 和 MinIO 都没有
宿主机端口映射，并按实际调用关系加入内部网络：

```text
Internet / Caddy TLS ingress -> nginx (loopback HTTP) -> web -> backend
                                      -> redis
backend -> mysql
backend -> SMTP provider (outbound only)
nginx -> MinIO private object-storage network -> novel-covers bucket
backend -> MinIO private object-storage network
```

为保持数据库、Redis 和 MinIO 的隔离，后端默认只接入内部 Docker 网络；但 SMTP 验证邮件
需要后端主动连接公网邮件服务。因此 `smtp-egress` 是仅连接 `backend` 的非内部出站网络，
不发布任何宿主机端口，也不会让公网直接访问后端。云安全组、防火墙或企业网络策略仍须允许
该服务器出站访问 SMTP 服务商的 DNS 和 SMTP 端口（通常为 TCP `465` 或 `587`）；请按服务商
要求最小化放行目标地址与端口。不要通过暴露后端端口来解决 SMTP 连通性。

Nginx 的 HTTP 监听端口由 `HTTP_PORT` 控制，默认 `8080`，并且 Compose 仅绑定到
`127.0.0.1`。云服务器上的 Caddy 是唯一的 HTTPS 入口和证书管理者，必须将站点反代到
该本地端口；`NOVEL_PUBLIC_ORIGIN` 必须是用户实际访问的 HTTPS origin。例如：

```dotenv
HTTP_PORT=8080
NOVEL_PUBLIC_ORIGIN=https://novel.example.com
```

对应的 Caddyfile 保持最小化即可：

```caddyfile
novel.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

仓库同时提供 [Caddyfile.example](../infra/caddy/Caddyfile.example) 作为同一拓扑的模板；替换域名后由
宿主机 Caddy 加载，不要把证书或私钥挂载进 Compose。

不要把 Compose 的 Nginx、`backend`、`web` 或 MinIO 端口公开到公网。Nginx 会保留 Caddy
写入的 `X-Forwarded-Proto=https`，避免内部 HTTP hop 影响 Secure Cookie、跳转或 Origin 校验。

不要把 `backend`、`web`、MinIO `9000` 或 MinIO console 端口重新映射到公网，也不要把
`NOVEL_INTERNAL_API_KEY`、Redis URL、对象存储凭据或数据库密码写入 `NEXT_PUBLIC_*` 变量。
`NOVEL_AUTH_RATE_LIMIT_TRUSTED_PROXY_HEADERS` 只有在入口代理会覆盖每个请求的
`X-Forwarded-For` 后才可启用。

## 邮箱验证码 SMTP

邮箱注册只能通过后端真实 SMTP 发送的一次性验证码完成，不提供本地邮件箱、明文验证码 API
或开发降级。Compose 会把 `NOVEL_SMTP_*` 和 `NOVEL_EMAIL_VERIFICATION_*` 仅传入 `backend`；
它们不得出现在 `web`、`NEXT_PUBLIC_*`、浏览器请求或日志中。缺少主机、端口、用户名、密码、
发件人地址或 HMAC 密钥时，发送和邮箱注册都会以 `503` 失败关闭。

以 QQ 邮箱为例，先在 QQ 邮箱中开启 SMTP 并生成独立的 SMTP 授权码，然后在 `.env` 中设置：

```dotenv
NOVEL_SMTP_HOST=smtp.qq.com
NOVEL_SMTP_PORT=465
NOVEL_SMTP_USERNAME=your-qq-mailbox@qq.com
NOVEL_SMTP_PASSWORD=qq-smtp-authorization-code
NOVEL_SMTP_SSL_ENABLE=true
NOVEL_EMAIL_VERIFICATION_FROM=your-qq-mailbox@qq.com
NOVEL_EMAIL_VERIFICATION_HASH_SECRET=replace-with-a-separate-long-random-secret
```

`NOVEL_EMAIL_VERIFICATION_HASH_SECRET` 不是 SMTP 密码；它用于以 HMAC-SHA-256 保存验证码摘要，
避免六位验证码在数据库泄漏后被离线枚举。部署更换该密钥会使尚未使用的验证码立即失效，属于
预期的安全行为。发送冷却、小时窗口和验证失败次数可用同名前缀的其余环境变量调整。手机号
登录未实现，也不应把手机号提交到邮箱验证码接口。

站长可在运营端保存一套替代部署变量的 SMTP 配置，但该能力仅向唯一的站长角色 `ADMIN` 开放；
读者和作者不能读取、修改或发送 SMTP 验证邮件。持久化的 SMTP 密码和验证码 HMAC 密钥以
`NOVEL_EMAIL_SETTINGS_ENCRYPTION_KEY` 加密后存储。API 只返回“是否已配置”的布尔状态，绝不
返回 SMTP 密码、HMAC 密钥或加密密钥，也不得将这些值写入日志。

## 封面对象存储

封面上传默认关闭：`NOVEL_COVER_STORAGE_ENABLED=false`。打开前，`.env` 必须包含
`MINIO_ROOT_USER`、`MINIO_ROOT_PASSWORD`、`MINIO_COVER_ACCESS_KEY` 和
`MINIO_COVER_SECRET_KEY`。根凭据仅由 Compose 的一次性 `minio-init` 服务使用；后端拿到
的是只允许 `novel-covers/staging/*`、`covers/*`、`banners/*` 写入和删除的独立服务账户，Web 容器不接收任何 MinIO
变量。

`minio-init` 幂等创建 `novel-covers` 桶，并仅允许 `covers/*` 与 `banners/*` 匿名下载；草稿
素材保留在私有 `staging/*`。写入账户绑定最小策略。
它只将“写入账户已存在”视为可重试状态；随后会用部署中提供的账户和密钥实际写入并删除
受限前缀下的探针对象。因此，错误的根凭据、已有账户的错误密钥或策略绑定失败都会让初始化
失败，而不会让后端带着不可用的写入凭据启动。这并不将 MinIO 公开：服务只在
`object-storage` 内部网络，Nginx 是唯一的公开入口，且只允许
`GET /media/covers/<uuid>.png|jpg` 或 `GET /media/banners/<uuid>.png|jpg`，会移除浏览器携带的
`Authorization`、Cookie 和转发身份头。
所有其他 `/media` 路径及非 GET 方法都会被 Nginx 拒绝；不要把 MinIO endpoint 或桶名改写进
`Book.cover`。

后端端点只允许作者上传封面、站长上传首页横幅；它不会
信任 filename 或请求 MIME，而是以 ImageIO 解码验证 PNG/JPEG、5 MiB 字节上限、4096x4096
尺寸和像素上限。Nginx 以 `client_max_body_size 6m` 为 multipart 边界留出余量，后端仍将实际
图片限制为 5 MiB。
配置关闭、不完整或存储不可用时会返回明确的 `503`，不会降级为本地磁盘。
每次上传使用随机对象键；替换会建立新资产绑定，旧对象只有零引用且经过回收宽限期后才会删除。
旧的 CSS 颜色封面保持兼容。

## 启动与健康检查

```bash
cp .env.example .env
# 在 .env 中替换所有 replace-with-* 值，并设置真实 HTTPS origin。
docker compose up --build --detach
docker compose ps
curl --fail http://127.0.0.1:${HTTP_PORT:-8080}/api/healthz
```

首次站长初始化：在 `.env` 中同时设置 `NOVEL_BOOTSTRAP_ADMIN_USERNAME` 与
`NOVEL_BOOTSTRAP_ADMIN_DISPLAY_NAME`。密码留空时，后端仅在首次创建管理员时输出
`BOOTSTRAP_ADMIN_INITIAL_PASSWORD`；该账号登录后只能修改密码，改密后需使用新密码重新登录。
容器日志包含该首密，应限制读取权限和保留周期，且不得复制到工单或聊天记录。

若首密在修改前遗失，拥有部署主机权限的操作者可执行以下命令。它会生成新首密、启用该管理员、
撤销全部会话并只向执行终端输出密码：

```bash
docker compose exec backend java -jar /app/app.jar \
  --spring.main.web-application-type=none \
  --novel.bootstrap-admin.reset-password=true
```

MySQL、Redis 和 MinIO 使用各自的原生命令健康检查，并以 `unless-stopped` 重启策略维持持久化
服务。MinIO 初始化完成后后端才启动；后端通过 `/actuator/health`，Web 通过 `/api/healthz`，
Nginx 通过 `/nginx-health` 检查；Web 会等待后端和 Redis 健康后启动，Nginx 会等待 Web
健康后启动。Web 运行镜像以无特权 `novel` 用户执行。浏览器认证只能在真实
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
