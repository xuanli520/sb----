package cn.edu.training.novel.domain;

import java.time.Instant;

/** Append-only operator decision linked to one exact automated moderation record. */
public record ContentModerationReview(
        long id,
        long bookId,
        long moderationAuditId,
        long reviewerUserId,
        ModerationReviewDecision decision,
        String reason,
        Instant reviewedAt) {
}
