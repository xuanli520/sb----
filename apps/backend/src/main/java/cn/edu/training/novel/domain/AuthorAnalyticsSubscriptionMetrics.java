package cn.edu.training.novel.domain;

/** Current free work follows plus immutable subscription changes in the selected report window. */
public record AuthorAnalyticsSubscriptionMetrics(
        long currentSubscriptionCount,
        long currentSubscriberCount,
        long subscriptionAddCount,
        long subscriptionRemoveCount) {}
