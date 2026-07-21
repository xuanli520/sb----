package cn.edu.training.novel.domain;

/** Per-book metrics for a bounded subset of the current author's works. */
public record AuthorAnalyticsBookMetric(
        long bookId,
        String bookTitle,
        long currentFavoriteCount,
        long purchaseCount,
        long purchaseTokenAmount,
        long activeReaderBookCount,
        double averageReadThroughPercent) {}
