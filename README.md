# 阅界小说平台

小说平台采用一个 Spring Boot 领域后端和一个基于 `xuanli520/douyin_dashboard_frontend` 指定提交的 Next.js 前端。用户端、作者端和运营端共享版本化 REST 契约；浏览器经 Next BFF 调用受保护 API，后端不接受浏览器伪造的身份头。

接口契约见 [`docs/openapi/novel-platform.openapi.json`](docs/openapi/novel-platform.openapi.json)，BFF 路径、认证边界和验证命令见 [`docs/openapi/README.md`](docs/openapi/README.md)。

## 本地开发

```bash
mvn --batch-mode --no-transfer-progress test
cd apps/web && npm ci --ignore-scripts
API_PROXY_TARGET=http://localhost:8080 NOVEL_INTERNAL_API_KEY=local-novel-internal-key \
NOVEL_SESSION_STORE=memory npm run dev
```

在另一个终端启动 API：

```bash
NOVEL_INTERNAL_API_KEY=local-novel-internal-key mvn -pl apps/backend spring-boot:run
```

打开 `http://localhost:3000`。开发模式使用显式 `NOVEL_SESSION_STORE=memory` 回退并提供清晰标识的读者、作者、站长演示会话；生产模式必须使用 Redis，禁用该入口，并要求真实认证供应商。

## 验证

```bash
mvn --batch-mode --no-transfer-progress test
cd apps/web && npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e
```

## 容器

复制 `.env.example` 到本地 `.env` 并替换全部秘密值，然后运行：

```bash
docker compose up --build
```

`compose.yaml` 提供 Next.js、后端、MySQL 和 Redis 的目标拓扑。生产 BFF 要求 `NOVEL_PUBLIC_ORIGIN` 为 HTTPS 浏览器源，Redis 保存仅服务端可见的 BFF 到后端会话映射；核心目录、账户、权益、阅读状态和章节发布生命周期通过 Flyway 持久化；详见 `docs/`。

生产 BFF 的登录、注册还使用 Redis 原子固定窗口限流，默认分别为每 15 分钟 10 次和 5 次。
该保护按动作和提交用户名哈希分区，不保存原始用户名或密码，默认不信任可伪造的转发 IP 头。
Redis 或限流配置失效时认证写入会在调用后端前以 `503` 拒绝，超限统一返回 `429` 和 `Retry-After`。完整的
部署变量与受信任代理要求见 `apps/web/README.md`。

部署拓扑、Nginx 单入口、健康检查及 MySQL 备份恢复流程见
[`docs/06-deployment-and-recovery.md`](docs/06-deployment-and-recovery.md)。
