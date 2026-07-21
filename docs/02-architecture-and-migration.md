# 小说平台：目标架构与迁移方案

状态：0.3。产品已确认采用当前 Spring Boot + Next.js 架构，**不采用 RuoYi-Vue、RuoYi-Cloud 或 RuoYi-Vue-Plus**。

## 1. 已冻结决策

- 后端为 Spring Boot 4、Java 21、JDBC 和 Flyway 的模块化单体，运行于 MySQL；不引入 RuoYi 模块树、MyBatis/PageHelper、`sys_user` 或若依安全链。
- 前端基于已授权的 `xuanli520/douyin_dashboard_frontend` 受控 fork，固定保留其 Next.js App Router、TypeScript、Tailwind、通用 UI 原子组件、测试和容器工程能力。
- 抖音中控台的领域页面、路由、权限、服务、数据模型和素材必须删除。小说平台页面只能复用中性的 UI/工程组件，不能复用店铺、采集、数据源、任务、指标或抖音业务语义。
- 浏览器经同源 Next.js BFF 调用 Spring Boot API。浏览器只保存不透明 HttpOnly 会话标识；后端会话凭据仅保存在 Redis。
- MySQL 保存业务数据，Redis 保存 BFF 会话和认证限流，MinIO/S3 兼容存储保存封面；Qwen 仅由后端调用。

不因为用户端、作者端、运营端有三个体验就拆成微服务。账户、作品可见性、权益、审核和账本具有强一致需求，当前规模以模块化单体更可运维。消息队列、独立搜索和分布式事务只在可量化容量或延迟需求出现后引入。

## 2. 仓库与运行时

```text
.
├── apps/
│   ├── backend/                 # Spring Boot REST API、Flyway、H2/MySQL 测试
│   └── web/                     # Next.js 用户端、作者端、运营端和同源 BFF
├── infra/nginx/                 # 单入口反向代理与 /media 只读代理
├── docs/openapi/                # 版本化 API 契约
├── scripts/                     # 部署、备份、恢复与校验脚本
├── compose.yaml                 # Nginx、Web、Backend、MySQL、Redis、MinIO
└── requirment.md                # 原始功能清单，保留原始拼写
```

```text
Browser
  |
  v
Nginx single origin
  |-- Next.js Web + BFF -- Redis (opaque BFF sessions, auth rate limits)
  |                              |
  |                              v
  `---------------------- Spring Boot REST API -- MySQL (Flyway schema)
                                              |-- MinIO/S3 (covers only)
                                              `-- Qwen compatible endpoint (optional, backend only)
```

Nginx 是唯一对外端口。`backend`、`mysql`、`redis` 和 `minio` 均位于私网 Docker network；`/media/` 只允许 Nginx 对 MinIO 作匿名 GET 代理，浏览器永远不会收到对象存储端点或写入密钥。

## 3. 后端边界

后端以明确的领域服务和 JDBC repository 组织，而非框架通用表扩展：

| 领域 | 责任 |
| --- | --- |
| 身份与会话 | 账户密码、角色、后端登录会话、BFF 会话解析、启停账号与审计。 |
| 目录与创作 | 作品、卷、章节、作者申请、草稿、排期、发布和归属校验。 |
| 阅读与互动 | 书架、偏好、进度、书签、评论、段评、评分、票和打赏。 |
| 权益与账本 | 兑换码、代币、会员、整本权益、购买、打赏和幂等边界。 |
| 内容运营 | 敏感词、全书审核快照、人工审核、推荐、热搜、分类标签和账户控制。 |
| 指标 | 作者收藏/购书/打赏/归因订阅、不可变阅读活动、D1/D7、渠道和全站留存。 |

所有写入接口都应有：输入校验、后端身份解析、角色校验、资源归属校验、状态机校验和审计。前端路由显示及导航不是授权来源。

## 4. 数据与迁移

Flyway SQL 是唯一 Schema 演进路径。绿地初始化不迁移旧地球演示项目或 `novel-author.zip` 的代码/数据。

- `novel_account`、`novel_login_session` 和 BFF Redis 映射负责身份边界；不会引入若依 `sys_user`。
- 权益、代币和会员使用 append-only ledger；兑换码状态、权益写入和账本变更在同一事务完成。
- `novel_author_subscription_ledger` 在“会员 + 指定作品”组合兑换码核销时快照作者和作品归因。
- `novel_reader_activity_event` 是不可变阅读活动源；同一读者、作品、上海日仅保留一条 `READING_PROGRESS`，为作者和全站 D1/D7 提供稳定分母。
- `novel_channel_attribution` 只保存注册首触白名单分类。缺失归因在查询中按 `DIRECT` 处理，不保存 IP、原始 Referer、完整 UTM URL 或设备指纹。

所有新表应具备业务唯一键、索引、必要检查约束和数据库层面的归属过滤依据。H2 回归不能替代 MySQL 验证，因此变更同时运行 Testcontainers MySQL 验证。

## 5. 前端复用边界

从原前端保留并直接复用：

- App Router、TypeScript、Tailwind、Vitest、Playwright、standalone Docker 构建和质量脚本。
- `Button`、`Card`、`Select`、`ToggleGroup`、`Table`、`Dialog`、`Sheet`、`Tabs`、`Toast`、`Skeleton` 等无业务语义组件。
- Query 客户端、错误边界以及经过改造后的会话/BFF 基础设施。

已删除且不得恢复：抖音数据中心、店铺罗盘、采集规则、数据源、任务调度、代理工作台、原 RBAC、指标看板、系统设置及其 API/类型/状态/素材。小说页面应调用 `src/features/novel/api.ts`，经 `/api/novel/{public|account|author|admin}/...` 进入 BFF。

## 6. BFF 与安全

1. Next.js BFF 以固定后端目标和允许的根路径代理请求，浏览器不能指定上游地址或注入内部凭据。
2. 登录/注册得到的后端会话凭据只存 Redis；浏览器 cookie 是随机不透明 ID，带 `HttpOnly`、host-only、`SameSite=Lax`，生产要求 HTTPS。
3. 所有状态变更校验精确 Origin/Referer 和 CSRF token；认证端点另行使用 Redis 限流，依赖不可用时生产失败关闭。
4. BFF 在收到后端 `401` 时清理 Redis 映射；注销先撤销后端会话再删除本地映射和 cookie。
5. 封面上传只接受真实 PNG/JPEG 字节、尺寸和大小均受限；后端生成对象键，失败补偿删除孤儿对象。

## 7. 审核、统计与外部边界

全书审核把不可变作品版本切分为队列分块，模型调用在事务外，结果聚合为 `PASS`、`MANUAL_REVIEW` 或 `REJECT`。内容版本变更使旧快照失效，人工发布只能针对当前终态快照；模型永远不直接决定上线。

Qwen 兼容端点、模型、超时、配额和密钥均为后端部署参数。未配置或错误输出转人工复核，不把正文、密钥或推理链写入前端/日志。真实供应商联调需要单独授权的工作空间和密钥，不作为本期本地验收结论。

作者和全站指标的精确定义见 [05-author-analytics-metrics.md](05-author-analytics-metrics.md)。手机/邮箱验证码、微信/QQ OAuth 也需要供应商凭据和回调域名；未提供时不宣称真实集成完成。

## 8. 验收关口

- 后端：单元/集成测试、H2 与 MySQL Testcontainers、OpenAPI 路由覆盖、Flyway 迁移。
- 前端：lint、typecheck、Vitest、production build；关键路由的浏览器 E2E。
- 部署：Compose 配置、Nginx 语法、私网网络、MinIO 初始化/写入权限、健康检查和备份恢复 smoke。
- 安全：会话不泄露、CSRF/Origin、资源归属、账本幂等、上传欺骗、审核快照、限流、渠道白名单与隐私边界。

不应通过“已有页面”或“部分检查通过”声明交付；验收命令和当前证据矩阵见 [07-implementation-status.md](07-implementation-status.md)。
