package cn.edu.training.novel.domain;

/** Availability for metrics whose source events are not all present in the current model. */
public record AuthorAnalyticsAvailability(
        AuthorAnalyticsMetricAvailability subscription,
        AuthorAnalyticsMetricAvailability favorite,
        AuthorAnalyticsMetricAvailability retention) {}
