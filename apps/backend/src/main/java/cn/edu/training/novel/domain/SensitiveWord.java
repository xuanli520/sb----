package cn.edu.training.novel.domain;

import java.time.Instant;

/** One operator-managed local moderation term and its current enforcement state. */
public record SensitiveWord(
        String normalizedWord,
        String word,
        boolean enabled,
        Long createdByUserId,
        Long updatedByUserId,
        Long disabledByUserId,
        Instant disabledAt,
        Instant createdAt,
        Instant updatedAt) {}
