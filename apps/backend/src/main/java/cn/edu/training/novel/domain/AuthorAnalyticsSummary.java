package cn.edu.training.novel.domain;

/** Aggregate values over the report's selected author-owned work and calendar window. */
public record AuthorAnalyticsSummary(
        long currentFavoriteCount,
        long currentSubscriptionCount,
        long currentSubscriberCount,
        long ratingCount,
        double averageRating,
        long purchaseCount,
        long purchaseTokenAmount,
        long activeReaderBookCount,
        long activeReaderCount,
        long currentReaderBookCount,
        long currentReaderCount,
        long completedReaderBookCount,
        double averageReadThroughPercent,
        String amountUnit) {
    public static final String TOKEN = "TOKEN";
}
