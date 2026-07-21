package cn.edu.training.novel.domain;

/** Public, durable aggregate counters for one published book. */
public record InteractionStats(
        long visibleCommentCount,
        long ratingCount,
        double averageRating,
        long recommendationVoteCount,
        long monthlyVoteCount) {}
