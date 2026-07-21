# 作者、渠道与留存指标口径

本文是已实现报表的计算契约。所有自然日使用 `Asia/Shanghai`，所有日期范围均为闭区间。

## 作者数据

`GET /api/v1/author/analytics` 只能读取当前认证作者当前拥有的作品。传入其他作者的 `bookId` 返回 `403`。`from` 和 `to` 要么同时提供，要么同时省略；默认最近 28 天，最多 90 天。

| 指标 | 计算口径 |
| --- | --- |
| 当前收藏 | `novel_reader_bookshelf` 中当前仍存在的作者作品行数。取消收藏会删除行，因此不作为历史事件保留。 |
| 收藏趋势 | 所选窗口内当前书架行的 `added_at`，按上海自然日分组。 |
| 付费购书与代币 | 仅统计 `PURCHASE` 整本权益且存在同读者、同作品、同额度 `BOOK_PURCHASE` 代币扣减账本的记录。单位固定为 `TOKEN`，不是人民币、结算额或可提现余额。 |
| 当前阅读完成度 | 对所选窗口内更新、且仍指向已发布章节的当前进度，按 `(已完成章节数 + 当前章节偏移比例) / 当前已发布章节数` 求平均。 |
| 作品归因订阅 | `subscriptionMetrics` 仅统计“会员天数 + 指定作品”组合兑换码核销时写入的 `novel_author_subscription_ledger`。账本同时固化作品、作者、读者、会员天数、来源和发生时间；无作品归因的全站会员不计入作者订阅。 |
| D1/D7 追读 | `retentionMetrics` 的队列单位为读者-作品。首个 `READING_PROGRESS` 不可变活动的上海日期为 cohort；同一读者同一作品在 `cohort + 1` 或 `cohort + 7` 有任意活动即分别计为 D1/D7 回访。只有在 `observedThrough` 已到达对应日期时才进入分母，未成熟队列的比例为 `null`，不是 `0%`。 |

阅读进度表仍只保存当前位置，但每次成功保存进度后，应用会在同一事务中向 `novel_reader_activity_event` 写入事件。唯一键 `(user_id, book_id, event_type, activity_date)` 保证同一读者、同一作品、同一上海日只保留一条活动，不会被高频翻页请求放大。

## 全站与渠道

`GET /api/v1/admin/analytics/retention` 仅允许 `ADMIN`。`from`/`to` 选择首读 cohort 日期，默认最近 28 天，最长 90 天；`asOf` 默认当前上海日期，用于重放历史报表时固定 D1/D7 的成熟边界，不能晚于当前日期。

响应包含：

- `summary`：窗口活跃读者，以及全站 cohort 的 D1/D7 分子、分母和比例。
- `dailyCohorts`：按首读日期和渠道拆分的 cohort。
- `channels`：按渠道聚合的窗口活跃读者、首读 cohort 与 D1/D7。
- `meta`：时区、cohort、D1/D7、渠道和隐私口径。

渠道是首次注册时的受控分类，允许值为 `DIRECT`、`ORGANIC`、`SEARCH`、`WECHAT`、`QQ`、`DOUYIN`、`XIAOHONGSHU`、`INVITE`。注册页只从 `utm_source` 或 `channel` 查询参数中提取上述值；BFF 可转发该分类，但后端再次做白名单校验。缺失归因和历史账号在查询时均归为 `DIRECT`。

系统不保存原始 IP、Referer、完整 UTM URL、设备指纹、浏览器标识或任何可用于跨站跟踪的值。渠道分类不可在注册后覆盖，因此一个用户只有一个首触归因。

## 可重复验证

```bash
DEBUG=false mvn --batch-mode --no-transfer-progress -pl apps/backend \
  -Dtest=AuthorAnalyticsIntegrationTest,AuthorSubscriptionAttributionIntegrationTest,PlatformRetentionAnalyticsIntegrationTest,ReaderActivityAndChannelAttributionIntegrationTest test

cd apps/web && npm run typecheck && npm test -- --run \
  src/app/author/page.test.tsx \
  src/app/novel-admin/page.test.tsx \
  src/app/api/novel/session/route.test.ts
```

测试覆盖作者归属隔离、组合兑换码的作者快照、无归因会员排除、重复核销、活动日去重、上海日边界、D1/D7 成熟分母、渠道分组、无归因 `DIRECT` 回退、未知渠道拒绝、管理员授权和 BFF 转发。
