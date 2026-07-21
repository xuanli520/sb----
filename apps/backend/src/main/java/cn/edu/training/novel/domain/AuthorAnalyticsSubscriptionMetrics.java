package cn.edu.training.novel.domain;

/** Immutable, explicitly work-attributed membership grants in the selected report window. */
public record AuthorAnalyticsSubscriptionMetrics(
        long attributedGrantCount,
        long attributedReaderCount,
        long membershipDayCount) {}
