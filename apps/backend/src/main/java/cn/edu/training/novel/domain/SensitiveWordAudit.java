package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable before/after record for a sensitive-word lifecycle action. */
public record SensitiveWordAudit(
        long id,
        String normalizedWord,
        String previousWord,
        String word,
        Boolean previousEnabled,
        Boolean enabled,
        String action,
        String reason,
        long operatorUserId,
        Instant createdAt) {}
