package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** One Shanghai-calendar-day point for durable shelf and purchase records. */
public record AuthorAnalyticsTrendPoint(
        LocalDate date,
        long favoriteAddCount,
        long purchaseCount,
        long purchaseTokenAmount) {}
