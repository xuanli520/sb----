package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable operator decision that changes a public work's availability. */
public record BookStatusAudit(
        long id,
        long bookId,
        String action,
        BookStatus previousStatus,
        BookStatus status,
        String reason,
        long operatorUserId,
        Instant createdAt) {
}
