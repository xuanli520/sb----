package cn.edu.training.novel.domain;

import java.util.List;

/** Bounded, author-scoped dashboard data for the FR-08 analytics slice. */
public record AuthorAnalyticsReport(
        AuthorAnalyticsSummary summary,
        List<AuthorAnalyticsTrendPoint> dailyTrend,
        List<AuthorAnalyticsBookMetric> bookMetrics,
        AuthorAnalyticsSubscriptionMetrics subscriptionMetrics,
        AuthorAnalyticsRetentionMetrics retentionMetrics,
        AuthorAnalyticsAvailability availability,
        AuthorAnalyticsMetadata meta) {
    public AuthorAnalyticsReport {
        dailyTrend = List.copyOf(dailyTrend);
        bookMetrics = List.copyOf(bookMetrics);
    }
}
