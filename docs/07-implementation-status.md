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

## 本轮补齐中

| 需求 | 当前缺口 | 正在交付的证据 |
| --- | --- | --- |
| D-07/D-08 全书机器审核 | 原实现只对章节同步筛查，缺少不可变全书快照、分块异步聚合和“快照未完成不得人工放行”约束。 | `book_moderation_snapshot` 实现和集成测试。 |
| 文件存储基线 | 原实现没有对象存储或上传 API，封面仅是字符串字段。 | `cover_object_storage` 实现私网 MinIO、受限封面上传、Nginx `/media/` 和前后端测试。 |

## 尚未可宣称完成的范围

| 范围 | 原因 | 需要的完成证据 |
| --- | --- | --- |
| 官方 RuoYi-Vue 模块树 | 当前是 Spring Boot 4 + JDBC 的模块化单体，不包含 RuoYi 的 `ruoyi-system`、Spring Security 过滤链、MyBatis/PageHelper 或 `sys_user` 基线。 | 经批准的 RuoYi 版本迁移、领域模块适配与完整回归。 |
| 手机/邮箱验证码、微信/QQ OAuth | 当前没有供应商凭据、回调域名或真实账号绑定流程。 | 供应商契约测试、回调 `state`/一次性兑换、失败降级、审计与真实环境验证。 |
| 真实百炼 Qwen 运行验证 | 代码支持部署参数，但没有工作空间、地域、模型或密钥，不能向真实服务发起验收调用。 | 已授权凭据下的兼容性 PoC、超时/429/无效 JSON 演练和审计记录。 |
| 作者订阅与留存指标 | 现有会员没有作者归因，阅读进度是覆盖式状态而非不可变回访事件流。 | 已批准的事件定义、归因模型、迁移、聚合任务、作者/运营接口与测试。 |
| 渠道归因和全站留存报表 | 没有来源采集或不可变会话事件模型。 | 已批准渠道规则、隐私策略、事件摄取与指标验证。 |

## 当前可重复验证

```bash
DEBUG=false mvn --batch-mode --no-transfer-progress -pl apps/backend test
mvn --batch-mode --no-transfer-progress -pl apps/backend -Pmysql-it -Dmysql.it.skip.unit.tests=true verify
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
scripts/verify-deployment-artifacts.sh --smoke
```

通过这些命令只能证明已实现范围的回归；不会把外部凭据、RuoYi 迁移或未定义指标自动标记为完成。
