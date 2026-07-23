package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** One Shanghai-calendar-day point for immutable reader engagement and purchase records. */
public record AuthorAnalyticsTrendPoint(
        LocalDate date,
        long favoriteAddCount,
        long favoriteRemoveCount,
        long subscriptionAddCount,
        long subscriptionRemoveCount,
        long purchaseCount,
        long purchaseTokenAmount) {}
