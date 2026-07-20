# 阅界小说平台

小说平台采用一个 Spring Boot 领域后端和一个基于 `xuanli520/douyin_dashboard_frontend` 指定提交的 Next.js 前端。用户端、作者端和运营端共享版本化 REST 契约；浏览器经 Next BFF 调用受保护 API，后端不接受浏览器伪造的身份头。

## 本地开发

```bash
mvn --batch-mode --no-transfer-progress test
cd apps/web && npm ci --ignore-scripts
JWT_SECRET=development-only-test-secret API_PROXY_TARGET=http://localhost:8080 NOVEL_INTERNAL_API_KEY=local-novel-internal-key npm run dev
```

在另一个终端启动 API：

```bash
NOVEL_INTERNAL_API_KEY=local-novel-internal-key mvn -pl apps/backend spring-boot:run
```

打开 `http://localhost:3000`。开发模式提供清晰标识的读者、作者、站长演示会话；生产模式默认禁用该入口，必须接入真实认证供应商。

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

`compose.yaml` 提供 Next.js、后端、MySQL 和 Redis 的目标拓扑。当前开发演示数据仍驻留内存；迁移至 MySQL/Flyway 是生产接入前的必要后续工作，详见 `docs/`。
