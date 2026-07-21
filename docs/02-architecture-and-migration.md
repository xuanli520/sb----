# 小说平台改造：目标架构与迁移方案

状态：草案 0.2，核心决策已冻结，部署与供应商参数在实施前配置。
本文提出技术路线，不执行应用代码改造。

## 1. 推荐的总体决策

建议采用模块化单体，而不是微服务：

- **后端基线（建议）：** 官方 `RuoYi-Vue v3.9.2`，固定其 Spring Boot `4.0.6`、Java `17+`、Spring Security、Redis、MyBatis/PageHelper 技术基线。
- **前端基线（建议）：** 获得授权后，基于 `xuanli520/douyin_dashboard_frontend` 的已审查版本 `3de3320ffa46e3abdbaf5aca66588122110ed115` 建立受控 fork。
- **部署基线（建议）：** 一个反向代理域名、一个 Next.js 服务、一个若依服务、MySQL、Redis；启用文件上传时加入对象存储。
- **模型审核基线（已确认）：** 若依后端通过 Spring AI `2.0.x` 的 OpenAI 兼容客户端调用百炼 Qwen；不在浏览器、Next.js BFF 或若依前端暴露百炼密钥。

不建议本期使用 RuoYi-Cloud。虽然有用户端、作者端和运营端三种入口，但账户、权益、内容审核和发布是强一致的业务；三个入口不等于必须拆为多个服务。Cloud 会提前引入网关、认证服务、注册发现、分布式事务和额外运维复杂度。

也不建议默认采用 RuoYi-Vue-Plus。它是与官方若依不兼容的不同技术/安全栈：稳定的 5.X 基线为 Boot 3.5.15 与 Sa-Token；匹配 Boot 4.1/JDK 21 的 6.X 仍是 Beta。仅当团队明确接受这些差异和 Beta 风险，并确实需要 Sa-Token、短信、JustAuth 或多租户能力时，再单独进行 PoC。

### 为什么不能在当前项目上直接叠加若依

当前已提交项目是单 POM 的 Thymeleaf/SSE 演示，而若依是拥有自身 Maven 多模块、BOM、安全过滤链、Redis 会话、MyBatis 与 SQL 基表约定的应用骨架。通过给当前 `pom.xml` 临时添加依赖会形成难以维护的混合体。正确方式是建立新的若依模块树和独立 Next.js 应用，旧项目仅保留为 Git 历史。

JDK 21 可以作为后续运行时验证目标，但实施初期应保留上游 Java 17 编译基线并先完成构建/回归验证，不能直接假定 Boot 4.0.6 升级到 4.1 后仍完全兼容。

## 2. 建议的仓库布局

以下为最终布局建议，不表示本阶段已创建这些目录。

```text
.
├── apps/
│   ├── backend/                 # RuoYi-Vue 模块树与小说领域模块
│   └── web/                     # 已授权的指定 Next.js 基础工程
├── infra/
│   ├── compose/                 # 本地/开发环境服务拓扑
│   ├── nginx/                   # 单域名反向代理
│   └── env/                     # 只提交示例，不提交密钥
├── db/
│   ├── migrations/              # 有序、可审查的数据库迁移
│   └── seed/                    # 非生产演示数据
├── docs/
└── requirment.md                # 原始功能清单，保留其原始拼写
```

根目录的旧 `src/`、`pom.xml`、单服务 Dockerfile 和 Compose 文件均是后续替换对象，不应成为新运行时的依赖。实施时还需扩展 `.gitignore`，覆盖 `node_modules/`、`.next/`、`.turbo/`、测试覆盖率、`.env*` 和本地数据库数据。

## 3. 运行时拓扑

```text
浏览器
  |
  v
单域名反向代理
  |-------------------------------> Next.js Web（用户端 / 作者端 / 运营端）
  |                                      |
  |                                      v
  |                                同源 BFF/接口适配层
  |                                      |
  +-------------------------------> RuoYi-Vue 单体 REST API
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
                  MySQL                  Redis                对象存储
                业务主数据       令牌/缓存/BFF会话        封面和上传文件
                                           |
                                           v
                              百炼 Qwen OpenAI 兼容接口（仅后端调用）
```

单域名方案可避免宽泛 CORS 配置。若以后必须拆分前后端域名，必须使用精确的允许来源、带凭据的安全 Cookie、CSRF/Origin 防护，且禁止 `*` 通配来源。

初期不强制引入消息队列或独立搜索集群；只有确认的访问量、异步任务量或搜索质量需求证明必要性后再加入。

## 4. 后端边界

### 4.1 若依负责的能力

复用若依的下列能力：

- Spring Security 鉴权、用户、角色、菜单和权限字符串。
- 所选版本提供的 Redis 令牌/会话模型。
- 合适范围内的字典和系统配置。
- 登录/操作审计日志、文件管理约定、定时任务和代码生成支持。

小说平台规则应放入新建的 `ruoyi-novel` 领域模块。读者内容、消费权益和作者工作流不能被塞进通用 `ruoyi-system` 表。

建议模块职责如下：

```text
RuoYi-Vue 单体 API
├── ruoyi-system       用户、角色、菜单、字典、审计
├── ruoyi-framework    安全、Redis 与基础设施
└── ruoyi-novel        账户/作者、作品章节、阅读、互动、审核、交易、统计
```

若依默认 Vue 管理端 `ruoyi-ui` 不作为最终部署前端；若依生成的 Vue 页面也不应成为 Next.js 页面实现来源。

### 4.2 建议的领域数据分组

| 分组 | 主要数据概念 |
| --- | --- |
| 身份 | `sys_user`、角色/权限、读者资料、作者资料/申请、第三方账号绑定、账号状态。 |
| 内容目录 | 分类、标签、作品、封面、卷、章节、发布状态、推荐位。 |
| 阅读 | 书架、阅读进度、书签、阅读偏好、段评/划线、章评。 |
| 互动 | 评分、推荐票、月票、打赏、互动审核状态。 |
| 兑换码权益 | 兑换码批次、权益类型、钱包/代币账本、会员有效期、整本权益、核销和审计记录。 |
| 审核 | 敏感词词库、Qwen 审核结果、完整作品人工审核决定、违规、申诉、证据与审计链。 |
| 运营与统计 | 事件日志、聚合指标、渠道归因、热搜/热榜计算、兑换码与配置变更。 |

`sys_user` 是唯一身份来源。作者应建模为“作者角色 + 作者资料”，从而允许同一用户既是读者又是作者。不要把作者映射为 `sys_dept`，也不要把若依的部门数据范围当成作品归属控制。

每一个业务接口必须同时校验：

1. 若依权限，例如 `novel:chapter:audit`。
2. 业务归属，例如 `book.author_id == currentUserId`。
3. 当前状态是否允许该动作。

前端路由守卫和菜单显示只改善体验，绝不是授权裁决。

### 4.3 遗留原型的迁移映射

| 原型概念 | 目标处理方式 |
| --- | --- |
| `User` | 仅在已批准数据迁移后映射必要资料字段；身份和凭证改用若依用户/安全约定。 |
| `Novel`、`Chapter` | 重建为作品/卷/章节，具备明确审核和发布状态、审计字段、索引及 DTO。 |
| `Comment`、`Bookshelf` | 重建为包含归属约束、审核状态、分页、唯一约束与索引的业务表。 |
| `AuthorService` | 在领域服务、事务、权限校验和 API DTO 中重新表达其流程。 |
| 硬编码敏感词工具 | 改为运营可维护的词库和审核记录；规则检查仅作为可选机器审核信号。 |

未发现数据库导出或生产数据。D-01/D-02 已确认采用**仅初始化新 Schema**的绿地方案。

## 5. 前端边界

指定前端仓库适合作为工程脚手架和通用组件基础，而不是可直接交付的小说产品。可保留：

- App Router、TypeScript、Tailwind 和通用 UI 原子组件。
- TanStack Query、Zustand、表单校验、错误处理、Toast、表格/筛选/弹窗能力。
- 测试、静态检查、Docker standalone 和 CI 结构。

必须替换：抖音领域页面、导航、数据源/采集/店铺/任务类型和服务、演示接口状态配置、权限字符串及视图模型。

建议使用一个 Next.js 代码库，并通过路由组提供三个入口：

```text
src/app/
├── (public)/                    # 发现、书籍详情、阅读器、账号
├── (author)/                    # 作者看板和写作工作流
└── (admin)/                     # 运营与若依管理能力
```

“作者端独立入口”可由独立路由组或子域名实现，不要求独立后端。阅读器需要独立的响应式体验；管理台视觉风格主要适合作者端和运营端，不应使读者端看起来像运营仪表盘。

### 5.1 接口与 DTO 适配层

审查的前端约定 `{ code, msg, data }`，分页为 `{ items, meta }`；若依列表通常返回 `rows`/`total`，分页参数也不同。必须建立唯一的前端适配层：

1. 调用版本化小说 API。
2. 将若依/小说 DTO 映射为前端 ViewModel。
3. 统一分页和错误表现。
4. 使用 `novel:book:list`、`novel:chapter:audit` 等新权限，绝不复用原模板的店铺/数据源权限。

页面不应直接依赖若依系统 DTO，也不应直接依赖原前端模板的接口契约。

### 5.2 已确认的认证与会话方案（D-12）

原前端采用 Cookie 双 Token，并在 `src/proxy.ts` 用共享 HMAC 密钥校验 JWT。官方 RuoYi-Vue 常见模型是 `/login` 返回后端令牌，调用时经 `Authorization` 请求头进入安全过滤链；Redis 保存 `LoginUser` 会话，JWT 只携带 UUID/用户名关联信息。二者不能仅通过修改 API 地址接通，且不得将若依签名密钥交给 Next.js。

若依默认安全链是无 Session 的 Authorization 模型，因此其关闭 CSRF 的前提不适用于新的 Cookie 会话设计。

**D-12 已确认：** 采用同源 BFF/会话适配。Next.js Route Handler/BFF 是浏览器唯一的受保护 API 入口；浏览器仅保存 host-only、`HttpOnly`、`Secure`、`SameSite=Lax` 的 BFF 会话标识，不能读取若依 Token。

具体契约如下：

1. 登录 BFF 调用若依 `/login`，将若依 Token 保存到 Redis 中的 BFF 会话记录；浏览器只收到随机会话标识 Cookie。
2. BFF 按固定后端目标和路径白名单读取会话，再向若依转发 `Authorization`。浏览器不能指定任意代理目标，也不能自行注入后端 Token。
3. 注销 BFF 必须先调用若依注销接口清理其 Redis Token，再删除 BFF 会话和 Cookie。
4. 所有改变状态的 BFF 请求都校验 `Origin`/`Referer`，并使用 CSRF Token 或等价的双提交防护；不能因同源 Cookie 而跳过 CSRF 防护。
5. BFF 路由守卫只改善导航体验。若依 `@PreAuthorize`、登录用户和业务归属校验仍是唯一授权裁决。

### 5.3 已确认的 Qwen 内容审核方案（D-08）

审核调用仅在 `ruoyi-novel` 后端服务发起，流程为：

```text
作品或章节提交
  -> 本地敏感词筛查
  -> 异步 Qwen 风险评估
  -> 结构化结果校验和审计落库
  -> 自动通过 / 拦截并标记整书复核
  -> 站长对完整作品作最终人工审核
```

- 在 `ruoyi-novel` 中固定使用 `org.springframework.ai:spring-ai-bom:2.0.0` 与 `org.springframework.ai:spring-ai-starter-model-openai`，通过 Spring AI 的 OpenAI 兼容模型客户端调用百炼 Qwen Chat API；不选用直接 OpenAI Java SDK，避免维护第二套模型抽象。Spring AI 2.0.x 与本项目的 Spring Boot 4.0.6 基线兼容。
- Qwen 的 `base URL`、模型名、超时、重试和配额由后端环境变量控制。配置契约为 `spring.ai.openai.chat.base-url=${QWEN_AUDIT_BASE_URL}`、`spring.ai.openai.chat.api-key=${DASHSCOPE_API_KEY}`、`spring.ai.openai.chat.model=${QWEN_AUDIT_MODEL}`。中国（北京）地域的兼容地址格式为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`；密钥绝不发送到浏览器或写入仓库。
- 模型由 `QWEN_AUDIT_MODEL` 部署参数指定，不在业务代码中硬编码；工作空间、地域和模型均在实施时按百炼账号授权做契约 PoC。
- “全书审核”不是把整部小说一次塞入单个提示词：提交的不可变作品版本为审核单位，后端按章节/Token 块遍历内容快照，聚合为作品级结论。小说正文被视为非可信数据，提示词明确禁止将正文当作指令，且不启用工具调用或外部动作。
- 模型归一化输出固定为 `PASS`、`MANUAL_REVIEW` 或 `REJECT`，并包含风险类别、风险级别、证据偏移/受控片段、模型版本和提示词版本；不保存或展示模型思维链。优先使用 JSON Schema 结构化输出，但百炼 OpenAI 兼容页未保证 `response_format`/严格 Schema 支持，必须以目标模型/地域 PoC 验证。若不支持，则使用仅 JSON 提示词、Spring AI `BeanOutputConverter`/Jackson 严格反序列化和服务端 JSON Schema 校验。
- 本地敏感词命中、模型 `MANUAL_REVIEW`/`REJECT`、结构化输出无效、超时、限流或调用失败，均不得自动上线；记录失败原因并把作品标记为“需站长复核”。仅对网络错误、408、429、500、503 进行有限指数退避和抖动重试；401、403、400 和 Schema 错误直接告警并转人工，不能盲目使用框架默认重试策略。
- 不把模型概率或文本解释直接用于处罚。站长是完整作品上线、下线和违规处理的唯一人工决策者。
- 审计记录保存内容版本/哈希、策略版本、调用时间、模型、提示词版本、输入 Token 统计、请求标识、原始受控响应、归一化结论和最终人工决定；日志不得泄露正文或 API Key。

手机、邮箱、微信和 QQ 登录不是官方 RuoYi-Vue 的默认能力。需单独建设认证扩展，明确短信/邮箱供应商、OAuth 回调、账号绑定和合并、注销/解绑及风控规则。OAuth 回调采用 `state` 和一次性兑换码，禁止在 URL 中传递访问令牌。

## 6. API、状态和数据约定

- 公共 API：`/api/v1/public/...`
- 读者账号 API：`/api/v1/account/...`
- 作者 API：`/api/v1/author/...`
- 运营 API：`/api/v1/admin/...`
- 若依系统 API 保持内部/管理用途，经过明确适配后才暴露给 Next.js，而不是前端实现细节。
- Qwen 审核 API 不向浏览器暴露；前端只读取本系统归一化后的审核状态和允许展示的原因。
- 所有写接口均需输入校验、授权、追踪/审计字段；涉及金额、票和状态迁移的操作还需幂等策略。
- 只使用显式的请求/响应 DTO，禁止直接返回持久化实体。
- 数据库变化使用顺序化、可审查的迁移脚本；基础阶段确认 Flyway 或等价版本化 SQL 方案。
- 每个领域组的前端实现前都要维护 OpenAPI/API 契约。

## 7. 基础设施与安全基线

| 组件 | 建议基线 | 待确认事项 |
| --- | --- | --- |
| 数据库 | MySQL + 版本化建表/迁移脚本。 | 版本、数据保留、备份和数据迁移。 |
| 缓存/令牌 | Redis，满足所选若依基线。 | 容量、持久化和部署模式。 |
| 文件 | 封面上传已采用可选的 MinIO/S3 兼容对象存储：后端仅在完整配置时启用，浏览器只接收 Nginx 的相对 `/media/` URL。 | 生产云服务商、跨区域副本/保留、接入病毒扫描。 |
| 搜索 | 确认可接受时初期用数据库搜索；排序/高亮/容量不满足后引入专用服务。 | 搜索质量和规模目标。 |
| 密钥 | 环境变量或密钥管理系统；可提交 `.env.example`，绝不提交真实密钥。 | 部署环境的密钥管理方式。 |
| 兑换码 | 站长生成/导入/禁用、一次性核销、权益账本和审计。 | 类型、批次、过期和额度策略。 |
| Qwen 审核 | Spring AI OpenAI 兼容客户端、异步任务、结构化结果校验和审计。 | 百炼工作空间、模型、地域、密钥、配额和超时。 |
| 可观测性 | 健康检查、结构化日志、审计日志、指标/错误上报。 | 日志保留周期和告警目标。 |

匿名白名单只开放登录、注册、验证码和明确的公共发现/阅读 API；兑换码核销、作者端、运营端和所有写接口默认要求认证。

## 8. 架构风险与关口

| 风险 | 后果 | 开发前关口 |
| --- | --- | --- |
| 未取得前端授权 | 法律或发布阻塞。 | 确认授权/许可证并固定源码版本。 |
| 未明确若依发行版/版本 | 安全和依赖设计不兼容。 | 批准 RuoYi-Vue 基线或指定替代发行版。 |
| BFF 会话配置错误 | 登录、保护页失效或会话泄露。 | 以 HTTPS、host-only Cookie、Redis 前缀、注销转发和 CSRF 测试为部署关口。 |
| Qwen 配置或结构化输出不兼容 | 审核结果不可靠或无法解析。 | 对目标模型/地域执行契约 PoC；失败时 JSON 校验并转人工复核。 |
| 兑换码规则未冻结 | 权益错误或账本不可追溯。 | 使用本文定义的最小权益模型并将数值配置化。 |
| 统计口径未配置 | 运营数据不可比较或被误读。 | 在首个运营报表前冻结事件和计算窗口。 |

## 9. 审查来源

版本与机制信息在 2026-07-20 从上游仓库只读审查；实施开始时仍应锁定具体 commit 并完成本地兼容性验证。

- [RuoYi-Vue](https://github.com/yangzongzhuan/RuoYi-Vue) 的 README 和 POM，作为建议的 `v3.9.2` 后端基线。
- [RuoYi-Vue SecurityConfig](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-framework/src/main/java/com/ruoyi/framework/config/SecurityConfig.java) 与 [TokenService](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-framework/src/main/java/com/ruoyi/framework/web/service/TokenService.java)，用于核对安全链和 Redis 令牌模型。
- [RuoYi-Cloud](https://github.com/yangzongzhuan/RuoYi-Cloud)，仅用于论证不以微服务作为本项目默认方案。
- [RuoYi-Vue-Plus 5.X](https://github.com/dromara/RuoYi-Vue-Plus/tree/5.X) 与 [6.X POM](https://github.com/dromara/RuoYi-Vue-Plus/blob/6.X/pom.xml)，作为替代方案参考。
- [douyin_dashboard_frontend](https://github.com/xuanli520/douyin_dashboard_frontend)，审查版本 `3de3320ffa46e3abdbaf5aca66588122110ed115`。
- [百炼 Qwen OpenAI Chat 兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)，用于核对兼容地址、密钥和模型调用方式。
- [Spring AI OpenAI Chat](https://docs.spring.io/spring-ai/reference/api/chat/openai-chat.html) 与 [Spring AI 入门/兼容性](https://docs.spring.io/spring-ai/reference/getting-started.html)，用于核对 Spring AI `2.0.x` 与 Spring Boot 4 的兼容性和结构化输出能力。
- [Spring AI Structured Output Converter](https://docs.spring.io/spring-ai/reference/api/structured-output-converter.html)，用于 JSON Schema 不被百炼兼容端点支持时的受控降级方案。
