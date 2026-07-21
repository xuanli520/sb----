# 实施完成度审计

状态：持续更新。本文是当前工作树的证据矩阵，不以计划文本或通过部分测试替代交付证明。

## 审计方法

- 逐份读取 `01` 至 `06` 文档、原始 `requirment.md` 与已签入 OpenAPI 契约。
- 对照当前控制器、服务、Flyway 迁移、Next.js BFF、前端路由、Compose 和自动化测试。
- 仅在代码、测试或可重复运行时验证共同存在时标记为“已验证”。

## 已验证的核心能力

| 范围 | 当前证据 |
| --- | --- |
| 绿地 Schema 与版本化迁移 | `apps/backend/src/main/resources/db/migration/` 的 Flyway SQL；H2 和 MySQL Testcontainers 回归。 |
| 三端产品入口 | Next.js 书城、阅读器、账户、作者中心、运营中心和同源 BFF。 |
| 作者准入与资源归属 | 作者申请、站长决定、作者角色、作品/卷/章节归属校验及集成/E2E 测试。 |
| 阅读与互动 | 发现筛选、阅读偏好、进度、书架、书签、评论、段评、评分、票和打赏。 |
| 兑换码权益 | 一次性核销、代币账本、会员和整本权益、管理与审计。 |
| BFF 会话安全 | Redis 不透明会话、HttpOnly Cookie、Origin/CSRF、注销转发、认证限流与生产失败关闭。 |
| 内容运营 | 本地敏感词、人工整书审核、评论/段评审核、推荐位、热搜、分类标签、兑换码与账户控制。 |
| Qwen 基础边界 | Spring AI 2.0 OpenAI-compatible 客户端配置、严格 JSON 归一化、敏感信息清理、限流与未配置时失败关闭。 |
| 部署恢复 | 私网 Compose、Nginx 单入口、健康检查、MySQL 备份/替换恢复和 smoke 脚本。 |

| 全书审核与封面存储 | V21 不可变全书审核快照/分块聚合，人工审核版本门禁；私网 MinIO、真实图片校验、受限上传和 `/media/` 只读代理。 |
| 作者订阅与留存 | V22 作者归因会员账本、V23 不可变阅读活动；作者端显示作品归因订阅和读者-作品 D1/D7。 |
| 渠道与全站留存 | 首触注册渠道白名单、`DIRECT` 回退、隐私边界、管理员全站/渠道 D1/D7 API 和运营中心呈现。 |
| 原 Douyin 前端复用清理 | 原仓库的 App Router、测试/构建骨架和通用 UI 原子组件保留；259 个抖音中控业务路由、服务、数据模型和素材已从 `apps/web` 移除，小说页面直接复用 `Card`、`ToggleGroup`、`Select` 等上游组件。 |

## 本轮新增验证

| 需求 | 已实现证据 | 已执行的定向验证 |
| --- | --- | --- |
| D-07/D-08 全书机器审核 | `BookModerationSnapshotService`、V21、管理员安全状态 API 与人工审核哈希门禁。 | 快照集成测试、H2 全量回归和 MySQL Testcontainers 迁移已通过；最终全量回归见下方命令。 |
| 文件存储基线 | `CoverUploadService`、MinIO 最小权限初始化、Nginx GET-only `/media/`。 | 上传/伪造 MIME/禁用/补偿测试、前端/部署静态检查已通过；运行拓扑在镜像网络恢复后复验。 |
| FR-08/FR-10 指标 | V22/V23、`AuthorAnalyticsService`、`PlatformRetentionReportService`、作者和运营页面、OpenAPI。 | 作者归属/兑换账本/日去重/D1-D7/渠道/权限/API 契约定向集成测试，以及前端组件/BFF 定向测试已通过。 |

## 明确不作为本期阻塞项

| 范围 | 当前决策 |
| --- | --- |
| 官方 RuoYi-Vue 模块树 | 产品决定不采用 RuoYi。当前 Spring Boot 4 + JDBC 模块化单体与 Next.js 是批准的应用架构，RuoYi/MyBatis/PageHelper/`sys_user` 迁移不再属于交付范围。 |
| 手机/邮箱验证码、微信/QQ OAuth | 没有供应商凭据、回调域名或真实账号绑定流程；本期不以外部身份提供方验收为阻塞条件。 |
| 真实百炼 Qwen 运行验证 | 代码支持部署参数但当前无已授权工作空间/密钥；本期验证本地模拟、结构化失败关闭与人工复核边界，不声称真实供应商验收。 |

## 当前可重复验证

```bash
DEBUG=false mvn --batch-mode --no-transfer-progress -pl apps/backend test
mvn --batch-mode --no-transfer-progress -pl apps/backend -Pmysql-it -Dmysql.it.skip.unit.tests=true verify
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
scripts/verify-deployment-artifacts.sh --smoke
```

通过这些命令证明已实现范围的回归；外部身份提供方和真实百炼凭据仍需在具备授权环境时单独验收，但不属于本期关闭条件。
