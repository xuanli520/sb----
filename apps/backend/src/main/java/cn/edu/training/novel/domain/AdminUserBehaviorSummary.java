package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Credential-free aggregate used by a platform administrator to assess an account's activity.
 * Counts deliberately exclude balances, redemption secrets, private reader text, and sessions.
 */
public record AdminUserBehaviorSummary(
        AdminAccount account,
        long readingProgressCount,
        long bookshelfCount,
        long checkinCount,
        long bookmarkCount,
        long bookPurchaseCount,
        long redeemedCodeCount,
        long rewardCount,
        long commentCount,
        long annotationCount,
        long ratingCount,
        long voteCount,
        long readerActivityCount,
        Instant lastReaderActivityAt) {}
