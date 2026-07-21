# 阅界小说平台前端

此应用基于 `xuanli520/douyin_dashboard_frontend` 的通用 Next.js、Tailwind 和
共享 UI 原语演进而来。原有抖音中控台的店铺、采集、数据源、看板、RBAC 和 JWT
代理业务均已移除；小说书城、阅读器、作者中心、运营中心和 Next BFF 是当前产品
边界。

## 本地运行

```bash
npm ci --ignore-scripts
API_PROXY_TARGET=http://localhost:8080 \
NOVEL_INTERNAL_API_KEY=local-novel-internal-key \
NOVEL_SESSION_STORE=memory \
NOVEL_DEV_LOGIN_ENABLED=true \
npm run dev
```

后端默认运行在 `http://localhost:8080`。本地开发通过显式
`NOVEL_SESSION_STORE=memory` 使用进程内会话，并可启用明确标识的读者、作者和站长
演示会话。生产环境固定使用 Redis，浏览器 Cookie 只保存随机 BFF ID，后端会话凭据
只存在 Redis 中；生产同时要求 HTTPS 的 `NOVEL_PUBLIC_ORIGIN` 与
`NOVEL_INTERNAL_API_KEY`。

`POST /api/novel/session` 的真实登录和注册在生产类运行时默认使用 Redis 固定窗口限流：
登录与注册各自独立，默认分别为每 15 分钟 10 次和 5 次。限流键只保存规范化提交用户名
和可选网络地址的哈希，绝不保存原始用户名、密码或 IP；它也不读写帐号状态，超限响应不会
说明帐号是否存在。Next 标准请求 API 没有可信的对端地址，默认忽略
`X-Forwarded-For` 等客户端可伪造的头；只有在入口代理**覆盖**每个请求的该头时，才可显式
设定 `NOVEL_AUTH_RATE_LIMIT_TRUSTED_PROXY_HEADERS=true` 以将网络地址加入哈希范围。

生产不可通过 `NOVEL_AUTH_RATE_LIMIT_ENABLED=false` 关闭此保护。`NOVEL_AUTH_RATE_LIMIT_REDIS_URL`
未设置时复用 `NOVEL_SESSION_REDIS_URL`，可通过 `NOVEL_AUTH_RATE_LIMIT_REDIS_PREFIX`、
`NOVEL_AUTH_RATE_LIMIT_LOGIN_LIMIT`、`NOVEL_AUTH_RATE_LIMIT_REGISTER_LIMIT` 和
`NOVEL_AUTH_RATE_LIMIT_WINDOW_SECONDS` 调整。配置错误或 Redis 不可用时，认证写入在到达
后端前以 `503` 失败关闭；超限响应始终是 `429 { code: 429, msg: "too many authentication attempts", data: null }`
并带有 `Retry-After`。本地 development/test 默认关闭限流以避免要求本地 Redis，设置
`NOVEL_AUTH_RATE_LIMIT_ENABLED=true` 可显式演练生产行为。

## 验证

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

容器运行时传入 `API_PROXY_TARGET`、`NOVEL_INTERNAL_API_KEY`、
`NOVEL_SESSION_REDIS_URL` 和 HTTPS `NOVEL_PUBLIC_ORIGIN`。可选
`NOVEL_SESSION_REDIS_PREFIX` 隔离部署，共享 Redis 使多个 Web 副本可读取同一浏览器
会话；认证限流使用独立前缀并同样在多个 Web 副本间共享。不要在镜像构建参数、
`NEXT_PUBLIC_` 变量或版本控制的环境文件中放入服务端密钥。
