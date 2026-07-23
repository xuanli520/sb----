package cn.edu.training.novel.domain;

/**
 * Legacy commercial attribution kept separate from free reader subscriptions. These values come
 * only from membership-redemption grants that carried an explicit work attribution.
 */
public record AuthorAnalyticsMembershipAttributionMetrics(
        long attributedGrantCount, long attributedReaderCount, long membershipDayCount) {}
