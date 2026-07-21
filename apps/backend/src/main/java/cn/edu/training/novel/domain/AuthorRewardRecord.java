package cn.edu.training.novel.domain;

import java.time.Instant;

/** One author-visible reward that has a matching committed token debit. */
public record AuthorRewardRecord(
        long id,
        long bookId,
        String bookTitle,
        long rewarderUserId,
        long tokenAmount,
        Instant rewardedAt) {}
