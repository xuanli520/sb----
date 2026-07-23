package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable evidence for one administrator decision on a historical review record. */
public record LegacyReviewTriageAudit(
        long id,
        long bookId,
        LegacyReviewTriageAction action,
        BookStatus previousStatus,
        BookStatus status,
        String reason,
        long operatorUserId,
        Instant createdAt) {
}
